"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner, audit } from "@/lib/access";
import { notify } from "@/lib/notifications";
import { logActivity } from "@/lib/agents";
import { FORMULIEREN, maakToken, vervaldatum, zoekBestaandeKlant } from "@/lib/portaal";
import type { PortalFormType } from "@/generated/prisma/enums";

export type PortaalState = { error?: string; ok?: string; link?: string };

/// Een nieuwe klantlink aanmaken.
export async function maakKlantlink(
  _prev: PortaalState,
  formData: FormData,
): Promise<PortaalState> {
  const user = await requireOwner();

  const label = String(formData.get("label") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim() || null;
  const type = String(formData.get("type") ?? "klantgegevens") as PortalFormType;

  if (!FORMULIEREN[type]) return { error: "Onbekend formulier." };
  if (!label && !clientId) return { error: "Vul de naam van de klant in." };

  const aanvraag = await db.portalRequest.create({
    data: {
      token: maakToken(),
      type,
      clientId,
      label: label || null,
      expiresAt: vervaldatum(),
      createdByUserId: user.id,
    },
  });

  await audit(user, "portaal_link", `${FORMULIEREN[type].titel} voor ${label || clientId}`);
  revalidatePath("/klanten");

  const basis = (process.env.APP_URL ?? "https://beerthuizen-hq.vercel.app").replace(/\/$/, "");
  return { ok: "Link aangemaakt.", link: `${basis}/portaal/${aanvraag.token}` };
}

/// Vastleggen dat je de link daadwerkelijk hebt verstuurd.
export async function markeerVerstuurd(id: string): Promise<void> {
  const user = await requireOwner();
  await db.portalRequest.updateMany({
    where: { id, status: "aangemaakt" },
    data: { status: "verstuurd" },
  });
  await audit(user, "portaal_verstuurd", id);
  revalidatePath("/klanten");
}

export async function verwijderAanvraag(id: string): Promise<void> {
  const user = await requireOwner();
  await db.portalRequest.delete({ where: { id } });
  await audit(user, "portaal_ingetrokken", id);
  revalidatePath("/klanten");
}

/// Het formulier van de klant verwerken.
///
/// Draait zonder ingelogde gebruiker: de klant heeft geen account. Het token is
/// de enige sleutel, en die is al gecontroleerd voordat het formulier getoond
/// werd. Hier controleren we hem nog een keer — een formulier kan altijd later
/// opnieuw verstuurd worden.
export async function verwerkFormulier(
  token: string,
  _prev: PortaalState,
  formData: FormData,
): Promise<PortaalState> {
  const aanvraag = await db.portalRequest.findUnique({ where: { token } });
  if (!aanvraag) return { error: "Deze link is niet geldig." };
  if (aanvraag.expiresAt < new Date()) return { error: "Deze link is verlopen." };
  if (aanvraag.status === "ingevuld" || aanvraag.status === "verwerkt") {
    return { error: "Deze gegevens zijn al ontvangen." };
  }

  const formulier = FORMULIEREN[aanvraag.type];
  const velden = formulier.secties.flatMap((sectie) => sectie.velden);

  const ingevuld: Record<string, string> = {};
  const ontbreekt: string[] = [];

  for (const veld of velden) {
    const waarde = String(formData.get(veld.naam) ?? "").trim();
    if (waarde) ingevuld[veld.naam] = waarde;
    else if (veld.verplicht) ontbreekt.push(veld.label);
  }

  if (ontbreekt.length > 0) {
    return { error: `Vul nog in: ${ontbreekt.join(", ")}.` };
  }

  // Klant herkennen of aanmaken. Bij twijfel koppelen we niet automatisch.
  let clientId = aanvraag.clientId;
  let dubbelReden: string | null = null;

  if (!clientId && aanvraag.type === "klantgegevens") {
    const match = await zoekBestaandeKlant({
      bedrijfsnaam: ingevuld.bedrijfsnaam,
      kvk: ingevuld.kvk,
      btw: ingevuld.btw,
      email: ingevuld.email,
    });

    if (match.zekerheid === "zeker" && match.clientId) clientId = match.clientId;
    else if (match.zekerheid === "mogelijk") dubbelReden = match.reden;
  }

  const klantVelden: Record<string, string> = {};
  for (const veld of velden) {
    if (veld.doel && ingevuld[veld.naam]) klantVelden[veld.doel] = ingevuld[veld.naam];
  }

  if (aanvraag.type === "klantgegevens") {
    if (clientId) {
      await db.client.update({
        where: { id: clientId },
        data: { ...klantVelden, detailsConfirmedAt: new Date() },
      });
    } else {
      const nieuw = await db.client.create({
        data: {
          name: ingevuld.bedrijfsnaam ?? aanvraag.label ?? "Onbekend",
          ...klantVelden,
          detailsConfirmedAt: new Date(),
        },
      });
      clientId = nieuw.id;
    }
  }

  await db.portalRequest.update({
    where: { id: aanvraag.id },
    data: {
      status: "ingevuld",
      submission: ingevuld,
      missingFields: [],
      submittedAt: new Date(),
      clientId,
    },
  });

  // Naar de juiste agents. De klant merkt hier niets van.
  const naam = ingevuld.bedrijfsnaam ?? aanvraag.label ?? "een klant";
  for (const agentKey of formulier.naarAgents) {
    const agent = await db.agent.findUnique({ where: { key: agentKey } });
    if (!agent) continue;
    await logActivity({
      agentId: agent.id,
      kind: "klantgegevens",
      level: "success",
      message: `${naam} heeft ${formulier.titel.toLowerCase()} aangeleverd.`,
    });
  }

  await notify({
    level: dubbelReden ? "warn" : "success",
    title: dubbelReden ? "Klantgegevens ontvangen — mogelijk dubbel" : "Klantgegevens ontvangen",
    body: dubbelReden
      ? `${naam} heeft zijn gegevens ingevuld, maar ${dubbelReden}. Controleer of dit dezelfde klant is.`
      : `${naam} heeft alle gevraagde gegevens ingevuld. Maud kan hiermee factureren.`,
    link: "/klanten",
    push: true,
  });

  revalidatePath("/klanten");
  return { ok: "ontvangen" };
}

/// Nagekeken en akkoord. Pas dan geldt de aanvraag als afgehandeld.
export async function markeerVerwerkt(id: string): Promise<void> {
  const user = await requireOwner();
  await db.portalRequest.update({
    where: { id },
    data: { status: "verwerkt", processedAt: new Date() },
  });
  await audit(user, "portaal_verwerkt", id);
  revalidatePath("/klanten");
}
