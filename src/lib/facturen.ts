import "server-only";

import { db } from "@/lib/db";
import type { InvoiceStatus, FollowUpStatus } from "@/generated/prisma/enums";

// De facturenadministratie.
//
// Bewust binnen het dashboard en niet meteen aan een boekhoudpakket geknoopt:
// dan kan Maud vandaag al werken, en verandert er straks niets aan haar als er
// wél een pakket komt. Elke factuur draagt `source` en `externalId`, zodat een
// import later precies weet welke regel bij welke factuur hoort.
//
// Wat een agent hier mag: lezen, analyseren, opvolging voorbereiden. Wat een
// agent hier nooit doet: iets versturen. Die grens zit in de statussen —
// "voorbereid" en "verstuurd" zijn twee verschillende dingen.

const DAG = 24 * 60 * 60_000;

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  concept: "Concept",
  verzonden: "Verzonden",
  deels_betaald: "Deels betaald",
  betaald: "Betaald",
  oninbaar: "Oninbaar",
  vervallen_verklaard: "Vervallen verklaard",
};

export const OPVOLGING_LABELS: Record<FollowUpStatus, string> = {
  geen: "Geen opvolging nodig",
  herinnering1_voorbereid: "Eerste herinnering klaar — wacht op jou",
  herinnering1_verstuurd: "Eerste herinnering verstuurd",
  herinnering2_voorbereid: "Tweede herinnering klaar — wacht op jou",
  herinnering2_verstuurd: "Tweede herinnering verstuurd",
  gemeld_aan_eigenaar: "Aan jou gemeld",
  vervolgstap_voorgesteld: "Vervolgstap voorgesteld — wacht op jou",
  afgehandeld: "Afgehandeld",
};

/// De volgorde waarin een factuur door de administratie loopt. Waar hij nu
/// staat bepaalt wat de volgende stap is; Maud slaat nooit een stap over.
export const WORKFLOW = [
  "aangemaakt",
  "verzonden",
  "vervaldatum",
  "betaalcontrole",
  "herinnering 1",
  "herinnering 2",
  "melding aan Enriqueo",
  "voorstel vervolgstap",
] as const;

export type FactuurRegel = {
  id: string;
  nummer: string;
  klant: string;
  klantEmail: string | null;
  factuurdatum: Date;
  vervaldatum: Date;
  bedragEur: number;
  betaaldEur: number | null;
  openstaandEur: number;
  status: InvoiceStatus;
  statusLabel: string;
  opvolging: FollowUpStatus;
  opvolgingLabel: string;
  verzondenOp: Date | null;
  betaaldOp: Date | null;
  herinnering1Op: Date | null;
  herinnering2Op: Date | null;
  notities: string | null;
  bron: string;
  /// Hoeveel dagen deze factuur openstaat. Bij een betaalde factuur: hoe lang
  /// het geduurd heeft. Negatief betekent: de vervaldatum moet nog komen.
  dagenOpenstaand: number;
  teLaat: boolean;
  /// Wat er volgens de workflow nu aan de beurt is.
  volgendeStap: string;
};

function dagenTussen(van: Date, tot: Date): number {
  return Math.floor((tot.getTime() - van.getTime()) / DAG);
}

/// Wat er nu aan de beurt is. Geen AI nodig — dit zijn regels, geen oordeel.
function volgendeStap(factuur: {
  status: InvoiceStatus;
  followUp: FollowUpStatus;
  dueOn: Date;
  sentAt: Date | null;
}): string {
  if (factuur.status === "betaald") return "niets — betaald";
  if (factuur.status === "oninbaar" || factuur.status === "vervallen_verklaard") return "niets — afgeboekt";
  if (factuur.status === "concept") return "versturen (jouw akkoord)";
  if (!factuur.sentAt) return "verzenddatum vastleggen";

  const overTijd = dagenTussen(factuur.dueOn, new Date());
  if (overTijd < 0) return `betaalcontrole over ${Math.abs(overTijd)} dagen`;

  switch (factuur.followUp) {
    case "geen":
      return "eerste herinnering voorbereiden";
    case "herinnering1_voorbereid":
    case "herinnering2_voorbereid":
    case "vervolgstap_voorgesteld":
      return "wacht op jouw akkoord";
    case "herinnering1_verstuurd":
      return overTijd >= 14 ? "tweede herinnering voorbereiden" : "betaling afwachten";
    case "herinnering2_verstuurd":
      return overTijd >= 30 ? "aan Enriqueo melden" : "betaling afwachten";
    case "gemeld_aan_eigenaar":
      return "vervolgstap voorstellen";
    default:
      return "niets";
  }
}

export function verrijk(factuur: {
  id: string;
  number: string;
  clientName: string;
  clientEmail: string | null;
  issuedOn: Date;
  dueOn: Date;
  amountEur: number;
  paidAmountEur: number | null;
  status: InvoiceStatus;
  followUp: FollowUpStatus;
  sentAt: Date | null;
  paidAt: Date | null;
  reminder1SentAt: Date | null;
  reminder2SentAt: Date | null;
  notes: string | null;
  source: string;
}): FactuurRegel {
  const betaald = factuur.paidAmountEur ?? (factuur.status === "betaald" ? factuur.amountEur : 0);
  const openstaand = Math.max(0, factuur.amountEur - betaald);

  // Bij een betaalde factuur meten we tot de betaaldatum; anders tot vandaag.
  const eind = factuur.paidAt ?? new Date();
  const dagen = dagenTussen(factuur.dueOn, eind);

  return {
    id: factuur.id,
    nummer: factuur.number,
    klant: factuur.clientName,
    klantEmail: factuur.clientEmail,
    factuurdatum: factuur.issuedOn,
    vervaldatum: factuur.dueOn,
    bedragEur: factuur.amountEur,
    betaaldEur: factuur.paidAmountEur,
    openstaandEur: openstaand,
    status: factuur.status,
    statusLabel: STATUS_LABELS[factuur.status],
    opvolging: factuur.followUp,
    opvolgingLabel: OPVOLGING_LABELS[factuur.followUp],
    verzondenOp: factuur.sentAt,
    betaaldOp: factuur.paidAt,
    herinnering1Op: factuur.reminder1SentAt,
    herinnering2Op: factuur.reminder2SentAt,
    notities: factuur.notes,
    bron: factuur.source,
    dagenOpenstaand: dagen,
    teLaat: dagen > 0 && openstaand > 0,
    volgendeStap: volgendeStap(factuur),
  };
}

export async function alleFacturen(): Promise<FactuurRegel[]> {
  const rijen = await db.invoice.findMany({ orderBy: [{ dueOn: "asc" }] });
  return rijen.map(verrijk);
}

export type Debiteurenstand = {
  openstaandEur: number;
  teLaatEur: number;
  aantalOpen: number;
  aantalTeLaat: number;
  wachtOpAkkoord: number;
  gemiddeldeBetaaltermijn: number | null;
};

/// De stand van zaken. Alles telt uit echte regels; is er niets, dan is er
/// niets — geen aannames.
export async function debiteurenstand(): Promise<Debiteurenstand> {
  const facturen = await alleFacturen();

  const open = facturen.filter((f) => f.openstaandEur > 0 && f.status !== "oninbaar" && f.status !== "vervallen_verklaard");
  const teLaat = open.filter((f) => f.teLaat);

  const betaald = facturen.filter((f) => f.betaaldOp !== null);
  const termijnen = betaald.map((f) => dagenTussen(f.factuurdatum, f.betaaldOp!));

  return {
    openstaandEur: open.reduce((som, f) => som + f.openstaandEur, 0),
    teLaatEur: teLaat.reduce((som, f) => som + f.openstaandEur, 0),
    aantalOpen: open.length,
    aantalTeLaat: teLaat.length,
    wachtOpAkkoord: facturen.filter((f) => f.opvolging.endsWith("voorbereid") || f.opvolging === "vervolgstap_voorgesteld").length,
    gemiddeldeBetaaltermijn: termijnen.length
      ? Math.round(termijnen.reduce((som, d) => som + d, 0) / termijnen.length)
      : null,
  };
}

/// De administratie als tekst voor Maud. Compact gehouden: het gaat om wat
/// aandacht vraagt, niet om een volledige uitdraai.
export async function factuurContext(): Promise<string> {
  const facturen = await alleFacturen();
  if (facturen.length === 0) {
    return "Er staan nog geen facturen in de administratie. Meld dat er niets te analyseren valt in plaats van iets aan te nemen.";
  }

  const stand = await debiteurenstand();
  const aandacht = facturen
    .filter((f) => f.openstaandEur > 0 && f.volgendeStap !== "niets")
    .slice(0, 25);

  const regels = aandacht.map(
    (f) =>
      `- ${f.nummer} · ${f.klant} · €${f.bedragEur.toFixed(2)} · vervalt ${f.vervaldatum.toISOString().slice(0, 10)} · ` +
      `${f.teLaat ? `${f.dagenOpenstaand} dagen te laat` : `nog ${Math.abs(f.dagenOpenstaand)} dagen`} · ` +
      `${f.statusLabel} · ${f.opvolgingLabel} · volgende stap: ${f.volgendeStap}`,
  );

  return [
    `## Debiteurenstand`,
    `Openstaand: €${stand.openstaandEur.toFixed(2)} over ${stand.aantalOpen} facturen.`,
    `Daarvan te laat: €${stand.teLaatEur.toFixed(2)} over ${stand.aantalTeLaat} facturen.`,
    stand.gemiddeldeBetaaltermijn !== null
      ? `Gemiddelde betaaltermijn tot nu toe: ${stand.gemiddeldeBetaaltermijn} dagen.`
      : `Gemiddelde betaaltermijn: nog niet te bepalen, er is nog niets betaald.`,
    ``,
    `## Facturen die aandacht vragen`,
    ...(regels.length ? regels : ["Geen."]),
  ].join("\n");
}
