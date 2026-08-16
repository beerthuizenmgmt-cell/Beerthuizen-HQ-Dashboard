"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner, audit } from "@/lib/access";
import type { InvoiceStatus, FollowUpStatus } from "@/generated/prisma/enums";

export type FactuurState = { error?: string; ok?: string };

const STATUSSEN: InvoiceStatus[] = [
  "concept",
  "verzonden",
  "deels_betaald",
  "betaald",
  "oninbaar",
  "vervallen_verklaard",
];

function bedrag(waarde: FormDataEntryValue | null): number | null {
  const ruw = String(waarde ?? "").trim().replace(/\./g, "").replace(",", ".");
  if (!ruw) return null;
  const getal = Number(ruw);
  return Number.isFinite(getal) && getal >= 0 ? getal : null;
}

function datum(waarde: FormDataEntryValue | null): Date | null {
  const ruw = String(waarde ?? "").trim();
  if (!ruw) return null;
  const d = new Date(`${ruw}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/// Een factuur vastleggen. Alleen de eigenaar: dit is financiële administratie.
export async function bewaarFactuur(_prev: FactuurState, formData: FormData): Promise<FactuurState> {
  const user = await requireOwner();

  const id = String(formData.get("id") ?? "").trim();
  const nummer = String(formData.get("nummer") ?? "").trim();
  const klant = String(formData.get("klant") ?? "").trim();
  const bedragEur = bedrag(formData.get("bedrag"));
  const factuurdatum = datum(formData.get("factuurdatum"));
  const vervaldatum = datum(formData.get("vervaldatum"));

  if (!nummer) return { error: "Vul het factuurnummer in." };
  if (!klant) return { error: "Vul de klant in." };
  if (bedragEur === null) return { error: "Vul een geldig bedrag in." };
  if (!factuurdatum) return { error: "Vul de factuurdatum in." };
  if (!vervaldatum) return { error: "Vul de vervaldatum in." };
  if (vervaldatum < factuurdatum) return { error: "De vervaldatum ligt vóór de factuurdatum." };

  const rawStatus = String(formData.get("status") ?? "concept");
  const status = (STATUSSEN as string[]).includes(rawStatus) ? (rawStatus as InvoiceStatus) : "concept";

  const betaaldOp = datum(formData.get("betaaldatum"));
  const verzondenOp = datum(formData.get("verzonden"));
  const betaaldEur = bedrag(formData.get("betaald"));

  const data = {
    number: nummer,
    clientName: klant,
    clientEmail: String(formData.get("email") ?? "").trim() || null,
    issuedOn: factuurdatum,
    dueOn: vervaldatum,
    amountEur: bedragEur,
    paidAmountEur: betaaldEur,
    status,
    sentAt: verzondenOp,
    paidAt: betaaldOp,
    notes: String(formData.get("notities") ?? "").trim() || null,
  };

  try {
    if (id) {
      await db.invoice.update({ where: { id }, data });
      await audit(user, "factuur_bijwerken", `${nummer} · ${klant}`);
    } else {
      const gemaakt = await db.invoice.create({ data });
      await audit(user, "factuur_toevoegen", `${nummer} · ${klant} · €${bedragEur.toFixed(2)}`, {
        type: "invoice",
        id: gemaakt.id,
      });
    }
  } catch (error) {
    const melding = error instanceof Error ? error.message : "";
    if (melding.includes("Unique")) return { error: `Factuurnummer ${nummer} bestaat al.` };
    return { error: "Opslaan mislukt." };
  }

  revalidatePath("/facturen");
  return { ok: id ? "Bijgewerkt." : `Factuur ${nummer} toegevoegd.` };
}

/// Vastleggen dat er betaald is. Dit is administratie, geen externe actie.
///
/// Loopt via dezelfde route als een betaling uit de bank, zodat je hier
/// dezelfde Telegram-melding krijgt. Anders zou je alleen bericht krijgen van
/// betalingen die het systeem zelf zag, en niet van die je zelf afboekt.
export async function markeerBetaald(id: string): Promise<void> {
  const user = await requireOwner();
  const factuur = await db.invoice.findUnique({ where: { id } });
  if (!factuur) return;

  const { boekBetaald } = await import("@/lib/betalingen");
  const openstaand = factuur.amountEur - (factuur.paidAmountEur ?? 0);
  await boekBetaald(id, openstaand, new Date());

  await audit(user, "factuur_betaald", `${factuur.number} · ${factuur.clientName}`);
  revalidatePath("/facturen");
}

/// Een betaling die het systeem niet zeker kon koppelen, alsnog aan een factuur
/// hangen. Dit is jouw oordeel, niet dat van Maud.
export async function bevestigKoppeling(betalingId: string, invoiceId: string): Promise<void> {
  const user = await requireOwner();

  const betaling = await db.incomingPayment.findUnique({ where: { id: betalingId } });
  if (!betaling || betaling.confirmedAt) return;

  await db.incomingPayment.update({
    where: { id: betalingId },
    data: { invoiceId, confirmedAt: new Date(), matchConfidence: "zeker", matchReason: "door jou bevestigd" },
  });

  const { boekBetaald } = await import("@/lib/betalingen");
  await boekBetaald(invoiceId, betaling.amountEur, betaling.receivedOn);

  await audit(user, "betaling_gekoppeld", `${betaling.amountEur} → factuur ${invoiceId}`);
  revalidatePath("/facturen");
}

/// Een betaling die nergens bij hoort — bijvoorbeeld een terugbetaling of een
/// bedrag dat niets met facturen te maken heeft.
export async function negeerBetaling(betalingId: string): Promise<void> {
  const user = await requireOwner();
  await db.incomingPayment.update({ where: { id: betalingId }, data: { dismissedAt: new Date() } });
  await audit(user, "betaling_genegeerd", betalingId);
  revalidatePath("/facturen");
}

/// Handmatig een ontvangen bedrag invoeren, zolang er nog geen bankkoppeling is.
export async function registreerBetaling(
  _prev: FactuurState,
  formData: FormData,
): Promise<FactuurState> {
  await requireOwner();

  const bedragEur = bedrag(formData.get("bedrag"));
  const ontvangen = datum(formData.get("ontvangen"));
  if (bedragEur === null || bedragEur <= 0) return { error: "Vul een bedrag in." };
  if (!ontvangen) return { error: "Vul de ontvangstdatum in." };

  const { verwerkBetaling } = await import("@/lib/betalingen");
  const uitkomst = await verwerkBetaling({
    amountEur: bedragEur,
    receivedOn: ontvangen,
    reference: String(formData.get("omschrijving") ?? "").trim() || null,
    counterparty: String(formData.get("tegenpartij") ?? "").trim() || null,
    source: "handmatig",
  });

  revalidatePath("/facturen");
  return uitkomst.gekoppeld ? { ok: uitkomst.bericht } : { error: uitkomst.bericht };
}

/// Vastleggen dat een factuur of herinnering daadwerkelijk verstuurd is.
///
/// Dit legt alleen vast wat jij hebt gedaan — de app verstuurt zelf niets. Het
/// verschil tussen "voorbereid" en "verstuurd" is precies de grens waar een
/// agent stopt en jij begint.
export async function markeerVerstuurd(
  id: string,
  wat: "factuur" | "herinnering1" | "herinnering2",
): Promise<void> {
  const user = await requireOwner();
  const factuur = await db.invoice.findUnique({ where: { id } });
  if (!factuur) return;

  const nu = new Date();
  const data =
    wat === "factuur"
      ? { sentAt: nu, status: "verzonden" as InvoiceStatus }
      : wat === "herinnering1"
        ? { reminder1SentAt: nu, followUp: "herinnering1_verstuurd" as FollowUpStatus }
        : { reminder2SentAt: nu, followUp: "herinnering2_verstuurd" as FollowUpStatus };

  await db.invoice.update({ where: { id }, data });
  await audit(user, `factuur_${wat}_verstuurd`, `${factuur.number} · ${factuur.clientName}`);
  revalidatePath("/facturen");
}

export async function verwijderFactuur(id: string): Promise<void> {
  const user = await requireOwner();
  const factuur = await db.invoice.findUnique({ where: { id } });
  if (!factuur) return;

  await db.invoice.delete({ where: { id } });
  await audit(user, "factuur_verwijderen", `${factuur.number} · ${factuur.clientName}`);
  revalidatePath("/facturen");
}
