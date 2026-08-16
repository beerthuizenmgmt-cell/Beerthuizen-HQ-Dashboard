import "server-only";

import { db } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { formatEuro } from "@/lib/format";

// Binnengekomen betalingen koppelen aan facturen.
//
// De hele functie draait om één afweging: koppelen of vragen. Een verkeerde
// koppeling zet een factuur op betaald terwijl het geld ergens anders vandaan
// kwam, en dat merk je pas als de klant belt. Daarom koppelt dit alleen bij
// een match die je zou kunnen uitleggen, en vraagt het in alle andere gevallen.

export type MatchUitkomst = {
  zekerheid: "zeker" | "onzeker" | "geen";
  reden: string;
  invoiceId: string | null;
};

/// Een cent verschil is een cent verschil, maar afronding in een bankexport is
/// geen ander bedrag.
function zelfdeBedrag(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

function normaliseer(tekst: string): string {
  return tekst.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/// Zoekt de factuur die bij deze betaling hoort.
///
/// Zeker is het alleen als het factuurnummer letterlijk in de omschrijving
/// staat én het bedrag klopt. Alles daaronder is een vermoeden, en een
/// vermoeden koppelen we niet.
export async function zoekFactuur(betaling: {
  amountEur: number;
  reference?: string | null;
  counterparty?: string | null;
}): Promise<MatchUitkomst> {
  const openstaand = await db.invoice.findMany({
    where: {
      direction: "uitgaand",
      status: { in: ["verzonden", "deels_betaald", "goedgekeurd"] },
    },
    select: { id: true, number: true, clientName: true, amountEur: true, paidAmountEur: true },
  });

  if (openstaand.length === 0) {
    return { zekerheid: "geen", reden: "er staat geen enkele factuur open", invoiceId: null };
  }

  const omschrijving = normaliseer(`${betaling.reference ?? ""} ${betaling.counterparty ?? ""}`);

  // 1. Factuurnummer in de omschrijving.
  const opNummer = openstaand.filter((factuur) => omschrijving.includes(normaliseer(factuur.number)));

  if (opNummer.length === 1) {
    const factuur = opNummer[0];
    const openBedrag = factuur.amountEur - (factuur.paidAmountEur ?? 0);

    if (zelfdeBedrag(openBedrag, betaling.amountEur)) {
      return {
        zekerheid: "zeker",
        reden: `factuurnummer ${factuur.number} staat in de omschrijving en het bedrag klopt precies`,
        invoiceId: factuur.id,
      };
    }

    return {
      zekerheid: "onzeker",
      reden:
        `factuurnummer ${factuur.number} staat in de omschrijving, maar er staat ${formatEuro(openBedrag)} open ` +
        `en er kwam ${formatEuro(betaling.amountEur)} binnen`,
      invoiceId: factuur.id,
    };
  }

  if (opNummer.length > 1) {
    return {
      zekerheid: "onzeker",
      reden: `de omschrijving past bij ${opNummer.length} facturen tegelijk`,
      invoiceId: null,
    };
  }

  // 2. Geen nummer, wel een uniek bedrag bij een klant die in de omschrijving staat.
  const opBedrag = openstaand.filter((factuur) =>
    zelfdeBedrag(factuur.amountEur - (factuur.paidAmountEur ?? 0), betaling.amountEur),
  );

  if (opBedrag.length === 1) {
    const factuur = opBedrag[0];
    const klantHerkend = omschrijving.includes(normaliseer(factuur.clientName));

    return {
      zekerheid: "onzeker",
      reden: klantHerkend
        ? `bedrag en klantnaam komen overeen met ${factuur.number}, maar het factuurnummer staat er niet bij`
        : `het bedrag komt overeen met ${factuur.number}, maar verder is er geen aanknopingspunt`,
      invoiceId: factuur.id,
    };
  }

  if (opBedrag.length > 1) {
    return {
      zekerheid: "onzeker",
      reden: `${opBedrag.length} openstaande facturen hebben dit bedrag`,
      invoiceId: null,
    };
  }

  return {
    zekerheid: "geen",
    reden: "geen openstaande factuur met dit bedrag of dit factuurnummer",
    invoiceId: null,
  };
}

/// Verwerkt een binnengekomen betaling.
///
/// Bij een zekere match wordt de factuur betaald gemeld en verdwijnt hij uit
/// het openstaande saldo. In alle andere gevallen blijft de betaling wachten op
/// bevestiging — automatisch koppelen bij twijfel doen we nooit.
export async function verwerkBetaling(betaling: {
  amountEur: number;
  receivedOn: Date;
  reference?: string | null;
  counterparty?: string | null;
  source?: string;
  externalId?: string | null;
}): Promise<{ gekoppeld: boolean; bericht: string }> {
  const match = await zoekFactuur(betaling);

  const rij = await db.incomingPayment.create({
    data: {
      amountEur: betaling.amountEur,
      receivedOn: betaling.receivedOn,
      reference: betaling.reference ?? null,
      counterparty: betaling.counterparty ?? null,
      source: betaling.source ?? "handmatig",
      externalId: betaling.externalId ?? null,
      invoiceId: match.zekerheid === "zeker" ? match.invoiceId : null,
      matchConfidence: match.zekerheid,
      matchReason: match.reden,
      confirmedAt: match.zekerheid === "zeker" ? new Date() : null,
    },
  });

  if (match.zekerheid === "zeker" && match.invoiceId) {
    return await boekBetaald(match.invoiceId, betaling.amountEur, betaling.receivedOn);
  }

  // Twijfel: laten staan en vragen. Nooit gokken met geld.
  await notify({
    level: "warn",
    title: "Betaling kan niet zeker gekoppeld worden",
    body: `${formatEuro(betaling.amountEur)} ontvangen${betaling.counterparty ? ` van ${betaling.counterparty}` : ""} — ${match.reden}. Wil je hem zelf koppelen?`,
    link: "/facturen",
    push: true,
  });

  return {
    gekoppeld: false,
    bericht: `Betaling van ${formatEuro(betaling.amountEur)} vastgelegd maar niet gekoppeld: ${match.reden}. (${rij.id})`,
  };
}

/// Zet een factuur op betaald en meldt het. Eén plek, zodat een handmatige
/// afboeking dezelfde melding oplevert als een betaling uit de bank.
export async function boekBetaald(
  invoiceId: string,
  bedragEur: number,
  ontvangenOp: Date,
): Promise<{ gekoppeld: boolean; bericht: string }> {
  const factuur = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!factuur) return { gekoppeld: false, bericht: "Die factuur bestaat niet." };

  const reedsBetaald = factuur.paidAmountEur ?? 0;
  const totaalBetaald = reedsBetaald + bedragEur;
  const volledig = totaalBetaald >= factuur.amountEur - 0.01;

  await db.invoice.update({
    where: { id: invoiceId },
    data: {
      paidAmountEur: totaalBetaald,
      status: volledig ? "betaald" : "deels_betaald",
      paidAt: volledig ? ontvangenOp : factuur.paidAt,
      followUp: volledig ? "afgehandeld" : factuur.followUp,
    },
  });

  // Kort en feitelijk, zoals afgesproken: nummer, klant, bedrag.
  await notify({
    level: "success",
    title: volledig ? "Factuur betaald" : "Deelbetaling ontvangen",
    body: volledig
      ? `Factuur ${factuur.number} van ${factuur.clientName} ter waarde van ${formatEuro(factuur.amountEur)} is betaald.`
      : `${formatEuro(bedragEur)} ontvangen op factuur ${factuur.number} van ${factuur.clientName}. Nog open: ${formatEuro(factuur.amountEur - totaalBetaald)}.`,
    link: "/facturen",
    push: true,
  });

  return {
    gekoppeld: true,
    bericht: volledig
      ? `Factuur ${factuur.number} staat op betaald en is uit het openstaande saldo.`
      : `Deelbetaling vastgelegd op ${factuur.number}.`,
  };
}

/// Betalingen die nog op jouw oordeel wachten.
export async function openstaandeBetalingen() {
  return db.incomingPayment.findMany({
    where: { confirmedAt: null, dismissedAt: null },
    orderBy: { receivedOn: "desc" },
    include: { invoice: { select: { number: true, clientName: true, amountEur: true } } },
  });
}
