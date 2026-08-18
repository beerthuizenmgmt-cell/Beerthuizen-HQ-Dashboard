import "server-only";

import { db } from "./db";
import type { VoorstelSoort } from "@/generated/prisma/enums";

// Het voorstel.
//
// Twee dingen bepalen de opzet.
//
// Ten eerste: **wat al in het dossier staat wordt niet opnieuw gevraagd.** De
// klant vulde zijn briefing in; die antwoorden zijn de aanleiding, de
// doelstelling en de doelgroep. Een agent die dat overtypt maakt er alleen maar
// fouten in.
//
// Ten tweede: **een agent die iets niet weet, schrijft het niet.** Hij meldt
// het als gat. Een voorstel met een verzonnen budget is erger dan een voorstel
// met een lege regel, want de lege regel zie je.
//
// Niet elke sectie hoort bij elk voorstel: een studio-opdracht heeft geen
// creators en een event geen advertentiebudget. De coördinator bepaalt per
// aanvraag wie er nodig is, en de secties volgen daaruit.

export type SectieSleutel =
  | "aanleiding"
  | "doelstelling"
  | "doelgroep"
  | "strategie"
  | "concept"
  | "creators"
  | "deliverables"
  | "planning"
  | "investering"
  | "advertentiebudget"
  | "voorwaarden"
  | "vervolgstappen";

export type SectieDefinitie = {
  sleutel: SectieSleutel;
  label: string;
  /// Wie dit onderdeel schrijft. Null = uit het dossier, niemand hoeft het te
  /// bedenken.
  agentKey: string | null;
  /// Wat er van dit onderdeel verwacht wordt.
  verwachting: string;
};

const SECTIES: Record<SectieSleutel, Omit<SectieDefinitie, "agentKey">> = {
  aanleiding: { sleutel: "aanleiding", label: "Aanleiding", verwachting: "Waarom vraagt deze klant dit, nu" },
  doelstelling: { sleutel: "doelstelling", label: "Doelstelling", verwachting: "Wat de klant wil bereiken, concreet" },
  doelgroep: { sleutel: "doelgroep", label: "Doelgroep", verwachting: "Wie we willen bereiken en waaraan je ze herkent" },
  strategie: { sleutel: "strategie", label: "Strategie", verwachting: "Hoe we dat doel bereiken, en waarom zo" },
  concept: { sleutel: "concept", label: "Concept", verwachting: "Het creatieve idee, uitvoerbaar binnen budget" },
  creators: { sleutel: "creators", label: "Creators", verwachting: "Wie, met onderbouwing per creator" },
  deliverables: { sleutel: "deliverables", label: "Deliverables", verwachting: "Wat we opleveren, telbaar" },
  planning: { sleutel: "planning", label: "Planning", verwachting: "Wanneer wat klaar is" },
  investering: { sleutel: "investering", label: "Investering", verwachting: "Wat het kost, uitgesplitst" },
  advertentiebudget: { sleutel: "advertentiebudget", label: "Advertentiebudget", verwachting: "Mediabudget en verwacht bereik" },
  voorwaarden: { sleutel: "voorwaarden", label: "Voorwaarden", verwachting: "Betaaltermijn, rechten, annulering" },
  vervolgstappen: { sleutel: "vervolgstappen", label: "Vervolgstappen", verwachting: "Wat er gebeurt na akkoord" },
};

/// Wie werkt aan welk soort voorstel. Dit is de routering die de coördinator
/// volgt; hij mag ervan afwijken als een aanvraag daarom vraagt, maar dit is
/// het vertrekpunt.
export const ROUTERING: Record<VoorstelSoort, { sleutel: SectieSleutel; agentKey: string | null }[]> = {
  influencer: [
    { sleutel: "aanleiding", agentKey: null },
    { sleutel: "doelstelling", agentKey: null },
    { sleutel: "doelgroep", agentKey: null },
    { sleutel: "strategie", agentKey: "influencer" },
    { sleutel: "creators", agentKey: "influencer" },
    { sleutel: "concept", agentKey: "creative" },
    { sleutel: "deliverables", agentKey: "influencer" },
    { sleutel: "planning", agentKey: "operations" },
    { sleutel: "investering", agentKey: "finance" },
    { sleutel: "voorwaarden", agentKey: "finance" },
    { sleutel: "vervolgstappen", agentKey: "chief" },
  ],
  event: [
    { sleutel: "aanleiding", agentKey: null },
    { sleutel: "doelstelling", agentKey: null },
    { sleutel: "doelgroep", agentKey: null },
    { sleutel: "concept", agentKey: "creative" },
    { sleutel: "creators", agentKey: "influencer" },
    { sleutel: "strategie", agentKey: "social" },
    { sleutel: "deliverables", agentKey: "creative" },
    { sleutel: "planning", agentKey: "operations" },
    { sleutel: "investering", agentKey: "finance" },
    { sleutel: "voorwaarden", agentKey: "finance" },
    { sleutel: "vervolgstappen", agentKey: "chief" },
  ],
  advertising: [
    { sleutel: "aanleiding", agentKey: null },
    { sleutel: "doelstelling", agentKey: null },
    { sleutel: "doelgroep", agentKey: null },
    { sleutel: "strategie", agentKey: "analytics" },
    { sleutel: "concept", agentKey: "creative" },
    { sleutel: "deliverables", agentKey: "social" },
    { sleutel: "advertentiebudget", agentKey: "analytics" },
    { sleutel: "planning", agentKey: "operations" },
    { sleutel: "investering", agentKey: "finance" },
    { sleutel: "voorwaarden", agentKey: "finance" },
    { sleutel: "vervolgstappen", agentKey: "chief" },
  ],
  studio: [
    { sleutel: "aanleiding", agentKey: null },
    { sleutel: "doelstelling", agentKey: null },
    { sleutel: "concept", agentKey: "creative" },
    { sleutel: "deliverables", agentKey: "operations" },
    { sleutel: "planning", agentKey: "operations" },
    { sleutel: "investering", agentKey: "finance" },
    { sleutel: "voorwaarden", agentKey: "finance" },
    { sleutel: "vervolgstappen", agentKey: "chief" },
  ],
  overig: [
    { sleutel: "aanleiding", agentKey: null },
    { sleutel: "doelstelling", agentKey: null },
    // Deliverables horen bij elk voorstel: een klant wil weten wát hij krijgt.
    // Ze ontbraken hier en bij een event, en vier agents probeerden ze alsnog
    // in te vullen — terecht, want zonder is een voorstel niet af.
    { sleutel: "deliverables", agentKey: "operations" },
    { sleutel: "planning", agentKey: "operations" },
    { sleutel: "investering", agentKey: "finance" },
    { sleutel: "vervolgstappen", agentKey: "chief" },
  ],
};

export function sectiesVoor(soort: VoorstelSoort): SectieDefinitie[] {
  return ROUTERING[soort].map((rij) => ({ ...SECTIES[rij.sleutel], agentKey: rij.agentKey }));
}

/// Welke agents er aan dit soort voorstel werken.
export function agentsVoor(soort: VoorstelSoort): string[] {
  return [...new Set(ROUTERING[soort].map((r) => r.agentKey).filter((k): k is string => Boolean(k)))];
}

/// Maakt het voorstel aan en vult meteen wat al bekend is.
///
/// Dit is het punt van de hele opzet: de klant heeft zijn briefing ingevuld, en
/// die antwoorden zijn de aanleiding, het doel en de doelgroep. Niemand hoeft
/// ze over te typen en niemand kan er dus iets anders van maken.
export async function maakVoorstel(input: {
  naam: string;
  soort: VoorstelSoort;
  clientId?: string | null;
  projectId?: string | null;
}): Promise<{ voorstelId: string; overgenomen: string[]; ontbreekt: string[] }> {
  const project = input.projectId
    ? await db.project.findUnique({
        where: { id: input.projectId },
        include: { request: { select: { submission: true } }, client: { select: { id: true, name: true } } },
      })
    : null;

  const briefing = (project?.request?.submission as Record<string, string> | null) ?? null;

  const voorstel = await db.voorstel.create({
    data: {
      naam: input.naam,
      soort: input.soort,
      clientId: input.clientId ?? project?.client?.id ?? null,
      projectId: input.projectId ?? null,
    },
  });

  // Wat uit de briefing rechtstreeks een sectie vult.
  const uitDossier: Partial<Record<SectieSleutel, string | undefined>> = {
    aanleiding: briefing?.aanleiding ?? briefing?.doelToelichting,
    doelstelling: briefing?.doel,
    doelgroep: briefing?.doelgroep,
  };

  const agents = await db.agent.findMany({ select: { id: true, key: true } });
  const overgenomen: string[] = [];
  const ontbreekt: string[] = [];

  const definities = sectiesVoor(input.soort);
  for (const [index, definitie] of definities.entries()) {
    const waarde = uitDossier[definitie.sleutel]?.trim();
    const agentId = definitie.agentKey
      ? (agents.find((a) => a.key === definitie.agentKey)?.id ?? null)
      : null;

    if (waarde) overgenomen.push(definitie.label);
    else if (!definitie.agentKey) {
      // Niemand gaat dit schrijven en het staat niet in het dossier. Dat is een
      // gat, geen opdracht: het moet bij de klant vandaan komen.
      ontbreekt.push(`${definitie.label} — staat niet in de briefing, opvragen bij de klant`);
    }

    await db.voorstelSectie.create({
      data: {
        voorstelId: voorstel.id,
        sleutel: definitie.sleutel,
        agentId,
        inhoud: waarde || null,
        bron: waarde ? "uit de briefing van de klant" : null,
        status: waarde ? "ingevuld" : "open",
        sortOrder: index,
      },
    });
  }

  if (ontbreekt.length) {
    await db.voorstel.update({ where: { id: voorstel.id }, data: { ontbreekt } });
  }

  return { voorstelId: voorstel.id, overgenomen, ontbreekt };
}

export type Controlepunt = { sectie: string; wat: string };

/// De controle die de coördinator uitvoert voordat een voorstel naar Enriqueo
/// gaat. Wat een mens kan zien en wat een machine kan zien, gescheiden: dit
/// doet het tweede, en laat het eerste over aan het oordeel van de agent.
export async function controleerVoorstel(voorstelId: string): Promise<Controlepunt[]> {
  const voorstel = await db.voorstel.findUnique({
    where: { id: voorstelId },
    include: {
      secties: { orderBy: { sortOrder: "asc" } },
      client: { select: { name: true } },
      project: { select: { deadline: true } },
    },
  });
  if (!voorstel) return [{ sectie: "voorstel", wat: "Dit voorstel bestaat niet." }];

  const punten: Controlepunt[] = [];

  for (const sectie of voorstel.secties) {
    const inhoud = sectie.inhoud?.trim() ?? "";

    if (!inhoud) {
      punten.push({ sectie: sectie.sleutel, wat: "Nog niet ingevuld" });
      continue;
    }
    if (inhoud.length < 20) {
      punten.push({ sectie: sectie.sleutel, wat: `Wel erg kort (${inhoud.length} tekens)` });
    }
    // Restanten van een half afgemaakte tekst. Die komen anders bij de klant
    // terecht, en dan is één woord genoeg om een voorstel ongeloofwaardig te
    // maken.
    if (/\b(tbd|t\.b\.d|nader te bepalen|xxx|lorem|placeholder|\[.*?\])/i.test(inhoud)) {
      punten.push({ sectie: sectie.sleutel, wat: "Bevat een open plek die nog ingevuld moet worden" });
    }
    if (/\b(nvt|n\.v\.t|onbekend|weet ik niet)\b/i.test(inhoud)) {
      punten.push({ sectie: sectie.sleutel, wat: "Zegt dat iets onbekend is; dat hoort niet in een voorstel" });
    }
  }

  // Bedragen: staat er in de investering überhaupt een bedrag?
  const investering = voorstel.secties.find((s) => s.sleutel === "investering");
  if (investering?.inhoud && !/(€|eur|\d{3,})/i.test(investering.inhoud)) {
    punten.push({ sectie: "investering", wat: "Geen bedrag te vinden" });
  }

  // De klant moet ergens genoemd worden. Niet op de letter: een dossier met
  // "Nike Nederland B.V." en een voorstel dat over "Nike" gaat is in orde. Wat
  // we zoeken is of de klant herkenbaar voorkomt — een voorstel waarin de naam
  // van de klant helemaal niet valt, is meestal van een ander voorstel
  // overgenomen.
  if (voorstel.client?.name) {
    const kern = voorstel.client.name
      .replace(/\b(b\.?v\.?|n\.?v\.?|v\.?o\.?f\.?|holding|group|nederland)\b/gi, " ")
      .split(/[\s.-]+/)
      .map((woord) => woord.trim())
      .filter((woord) => woord.length >= 3);

    const alleTekst = voorstel.secties.map((s) => s.inhoud ?? "").join(" ").toLowerCase();
    const genoemd = kern.length === 0 || kern.some((woord) => alleTekst.includes(woord.toLowerCase()));

    if (!genoemd) {
      punten.push({
        sectie: "voorstel",
        wat: `De klant (${voorstel.client.name}) wordt nergens genoemd`,
      });
    }
  }

  // Een planning die al begonnen is.
  //
  // Hier stond eerst een controle op datums ná de projectdeadline. Dat was fout
  // gedacht: die deadline is wanneer het vóórstel klaar moet zijn, en een
  // campagne die daarná live gaat is juist normaal. Wat wél mis is, is een
  // voorstel dat de klant een planning voorlegt die al voorbij is.
  const planning = voorstel.secties.find((s) => s.sleutel === "planning");
  if (planning?.inhoud) {
    const vandaag = new Date();
    vandaag.setHours(0, 0, 0, 0);
    const datums = planning.inhoud.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
    const verleden = datums.filter((d) => new Date(d) < vandaag);
    if (verleden.length) {
      punten.push({
        sectie: "planning",
        wat: `Bevat ${verleden.length} datum(s) in het verleden: ${verleden.join(", ")}`,
      });
    }
  }

  return punten;
}

/// Zet het voorstel klaar voor Enriqueo, met de samenvatting die hij vraagt.
/// Lukt de controle niet, dan gaat het terug — dat is precies waarvoor de
/// controlestap bestaat.
export async function zetKlaarVoorAkkoord(voorstelId: string): Promise<{
  ok: boolean;
  punten: Controlepunt[];
}> {
  const punten = await controleerVoorstel(voorstelId);

  await db.voorstel.update({
    where: { id: voorstelId },
    data: {
      controlepunten: punten.map((p) => `${p.sectie}: ${p.wat}`),
      gecontroleerdOp: new Date(),
      status: punten.length === 0 ? "klaar_voor_akkoord" : "opbouw",
    },
  });

  return { ok: punten.length === 0, punten };
}
