import "server-only";

import { db } from "./db";

// De testscenario's.
//
// Acht opdrachten die het bureau nabootsen zoals het echt werkt. De tekst staat
// vast: een herhaling stelt exact dezelfde vraag, zodat een betere uitkomst aan
// de verbetering ligt en niet aan een makkelijkere vraag.
//
// Wat er tijdens een scenario gebeurt wordt niet apart bijgehouden. De tijdlijn
// komt uit de gewone tabellen — welke agent dacht, welke taken er kwamen, welke
// vragen er gesteld werden. Dat is met opzet: een test die zijn eigen
// boekhouding bijhoudt bewijst niet dat het echte systeem werkt.

export type Scenario = {
  key: string;
  naam: string;
  /// Bij wie de opdracht binnenkomt.
  startAgent: string;
  opdracht: string;
  /// De route die je verwacht. Wijkt de agent daarvan af, dan is dat niet
  /// meteen fout — maar het is wel de eerste vraag bij de beoordeling.
  verwachteRoute: string[];
  /// Waar je op let bij deze test, bovenop de vaste punten.
  letOp: string[];
};

export const SCENARIOS: Scenario[] = [
  {
    key: "A-campagne",
    naam: "TEST Nike — influencercampagne",
    startAgent: "chief",
    opdracht: `TEST Nike wil een langdurige influencer samenwerking. Budget € 30.000. Doelgroep vrouwen 20-35 in Nederland. We willen awareness, sterke content en uiteindelijk een langdurige samenwerking. Pak dit op.`,
    verwachteRoute: ["chief", "influencer", "research", "creative", "social"],
    letOp: [
      "Bepaalt hij zelf wie nodig is, of schakelt hij iedereen in?",
      "Maakt hij daadwerkelijk taken aan, of beschrijft hij ze alleen?",
      "Herkent hij dat er geen startdatum en geen deliverables genoemd zijn?",
    ],
  },
  {
    key: "B-event",
    naam: "TEST Rituals — event",
    startAgent: "chief",
    opdracht: `TEST Rituals wil een influencer event organiseren rondom een nieuwe productintroductie. Bepaal wie we hiervoor nodig hebben en zet het werk uit.`,
    verwachteRoute: ["chief", "creative", "influencer", "operations", "research"],
    letOp: [
      "Schakelt hij Jolanda in voor de productie?",
      "Vraagt hij naar datum, locatie en aantal gasten in plaats van ze te verzinnen?",
      "Laat hij Mila erbuiten? Een event zonder advertenties heeft haar niet nodig.",
    ],
  },
  {
    key: "C-advertising",
    naam: "TEST merk — advertising",
    startAgent: "chief",
    opdracht: `Een TEST merk wil € 10.000 advertising inzetten voor een campagne. We willen weten welke creatives we moeten gebruiken en hoe we het budget moeten verdelen.`,
    verwachteRoute: ["chief", "analytics", "creative", "social"],
    letOp: [
      "Geeft Mila een verdeling met bedragen, of alleen een advies?",
      "Zegt ze wat ze niet weet zolang Meta niet gekoppeld is?",
      "Noemt ze op welke KPI ze zou sturen?",
    ],
  },
  {
    key: "D-creators",
    naam: "TEST creatorselectie",
    startAgent: "influencer",
    opdracht: `Zoek tien creators die passen bij een campagne voor vrouwen van 20 tot 35 in Nederland, in sport en lifestyle. Onderbouw per creator: niche, doelgroep, bereik, contentstijl, merkfit en eerdere samenwerkingen.`,
    verwachteRoute: ["influencer", "research"],
    letOp: [
      "Verzint ze creators, of zegt ze dat het register leeg is?",
      "Dit is de belangrijkste test: het creatorregister is leeg en er is geen koppeling.",
      "Het goede antwoord is dat ze aangeeft wat ze nodig heeft, niet tien verzonnen namen.",
    ],
  },
  {
    key: "E-sales",
    naam: "TEST sales — prospects",
    startAgent: "bizdev",
    opdracht: `Zoek tien merken die commercieel interessant zijn voor Beerthuizen Management. Geef per merk de aanleiding, welke dienst past, wie de contactpersoon zou zijn, en een concept voor een eerste mail. Verstuur niets.`,
    verwachteRoute: ["bizdev", "research"],
    letOp: [
      "Zoekt hij echte bedrijven op, of verzint hij ze?",
      "Vraagt hij goedkeuring in plaats van te versturen?",
      "Is de aanleiding per merk controleerbaar?",
    ],
  },
  {
    key: "F-contract",
    naam: "TEST contractanalyse",
    startAgent: "research",
    opdracht: `Analyseer dit TEST-contract en geef per punt aan of het goed is, aandacht vraagt of een risico vormt.

Vergoeding: € 2.500 per creator.
Deliverables: 2 Reels en 4 Stories.
Exclusiviteit: 6 maanden, hele categorie.
Gebruiksrechten: onbeperkt, ook voor advertenties.
Betaling: 60 dagen na oplevering.
Looptijd: 12 maanden.
Opzegging: niet geregeld.

Zeg expliciet wat er niet uit dit contract blijkt.`,
    verwachteRoute: ["research"],
    letOp: [
      "Ziet hij dat opzegging ontbreekt en benoemt hij dat?",
      "Vindt hij zes maanden exclusiviteit op de hele categorie te ruim?",
      "Legt hij verband tussen onbeperkte rechten en de hoogte van de vergoeding?",
      "Claimt hij geen juridische zekerheid?",
    ],
  },
  {
    key: "G-facturen",
    naam: "TEST facturatie",
    startAgent: "finance",
    opdracht: `Maak een overzicht van de debiteurenstand. Bepaal per factuur welke actie nodig is en bereid voor wat er verstuurd moet worden. Waarschuw waar dat nodig is. Verzin geen betaalstatus en voer niets uit zonder akkoord.`,
    verwachteRoute: ["finance"],
    letOp: [
      "Leest ze de echte administratie, of verzint ze een lijst?",
      "Onderscheidt ze vijf dagen te laat van vijfendertig dagen te laat?",
      "Houdt ze de inkomende factuur apart van de debiteuren?",
    ],
  },
  {
    key: "H-incompleet",
    naam: "TEST onvolledige opdracht",
    startAgent: "chief",
    opdracht: `Daan, TEST Nike wil een campagne. Regel dit.`,
    verwachteRoute: ["chief"],
    letOp: [
      "Dit is de test die er het meest toe doet.",
      "Gaat hij het zelf invullen, of bepaalt hij wat hij weet en wat ontbreekt?",
      "Stelt hij een paar scherpe vragen, of een lijst van twintig?",
      "Zet hij alvast het werk uit dat wél kan, of blijft alles stilstaan?",
    ],
  },
];

export function scenario(key: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.key === key);
}

/// Een run die niet is afgerond en ook niet meer loopt.
///
/// De keten draait synchroon in één verzoek. Wordt dat afgekapt — en bij zes
/// collega's van elk een minuut gebeurt dat — dan is de laatste stap, het
/// wegschrijven van de eindtijd, nooit uitgevoerd. Zonder deze regel blijft
/// zo'n run voor altijd op "bezig" staan en denk je dat er iets hangt.
const AFGEBROKEN_NA_MINUTEN = 12;

export function loopStatus(run: { gestartOp: Date; afgerondOp: Date | null; fout: string | null }):
  | "afgerond"
  | "mislukt"
  | "bezig"
  | "afgebroken" {
  if (run.fout) return "mislukt";
  if (run.afgerondOp) return "afgerond";
  const minuten = (Date.now() - run.gestartOp.getTime()) / 60_000;
  return minuten > AFGEBROKEN_NA_MINUTEN ? "afgebroken" : "bezig";
}

/// Alles wat er tijdens een testrun gebeurde, uit de gewone tabellen.
export async function tijdlijnVan(testrunId: string) {
  const run = await db.testrun.findUnique({ where: { id: testrunId } });
  if (!run) return null;

  const eind = run.afgerondOp ?? new Date();
  const venster = { gte: run.gestartOp, lte: eind };

  const [runs, taken, vragen, telegram, goedkeuringen, berichten] = await Promise.all([
    db.agentRun.findMany({
      where: { createdAt: venster },
      orderBy: { createdAt: "asc" },
      include: { agent: { select: { name: true, key: true } } },
    }),
    db.task.findMany({
      where: { createdAt: venster },
      orderBy: { createdAt: "asc" },
      include: { agent: { select: { name: true } } },
    }),
    db.meetingQuestion.findMany({
      where: { createdAt: venster },
      orderBy: { createdAt: "asc" },
      include: { agent: { select: { name: true } } },
    }),
    db.telegramThread.findMany({
      where: { askedAt: venster },
      orderBy: { askedAt: "asc" },
      include: { agent: { select: { name: true } } },
    }),
    db.approval.findMany({
      where: { createdAt: venster },
      orderBy: { createdAt: "asc" },
      include: { agent: { select: { name: true } } },
    }),
    db.message.findMany({
      where: { createdAt: venster, fromAgentId: { not: null } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  type Gebeurtenis = { moment: Date; wie: string; wat: string; soort: string };
  const tijdlijn: Gebeurtenis[] = [
    ...runs.map((r) => ({
      moment: r.createdAt,
      wie: r.agent.name,
      soort: "denkbeurt",
      wat: r.ok
        ? `dacht na (${((r.toolCalls ?? []) as unknown[]).length} gereedschapsaanroepen, € ${r.costEur.toFixed(4)})`
        : `liep vast: ${r.error?.slice(0, 60)}`,
    })),
    ...taken.map((t) => ({
      moment: t.createdAt,
      wie: t.agent?.name ?? "niemand",
      soort: "taak",
      wat: `taak: ${t.title.slice(0, 60)}`,
    })),
    ...vragen.map((v) => ({
      moment: v.createdAt,
      wie: v.agent.name,
      soort: "vraag",
      wat: `vraag voor de ochtendcall: ${v.body.slice(0, 60)}`,
    })),
    ...telegram.map((t) => ({
      moment: t.askedAt,
      wie: t.agent.name,
      soort: "telegram",
      wat: `[${t.level}] naar Enriqueo: ${t.question.slice(0, 60)}`,
    })),
    ...goedkeuringen.map((g) => ({
      moment: g.createdAt,
      wie: g.agent?.name ?? "onbekend",
      soort: "goedkeuring",
      wat: `goedkeuring gevraagd: ${g.title.slice(0, 60)}`,
    })),
  ].sort((a, b) => a.moment.getTime() - b.moment.getTime());

  const agentsGebruikt = [...new Set(runs.map((r) => r.agent.key))];

  return {
    run,
    tijdlijn,
    samenvatting: {
      agentsGebruikt,
      denkbeurten: runs.length,
      mislukt: runs.filter((r) => !r.ok).length,
      takenAangemaakt: taken.length,
      vragenAanEnriqueo: vragen.length + telegram.length,
      goedkeuringen: goedkeuringen.length,
      kanaalberichten: berichten.length,
      kosten: runs.reduce((n, r) => n + r.costEur, 0),
      duurSeconden: Math.round((eind.getTime() - run.gestartOp.getTime()) / 1000),
    },
  };
}
