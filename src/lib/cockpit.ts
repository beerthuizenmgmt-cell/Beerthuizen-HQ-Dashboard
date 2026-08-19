import "server-only";

import { db } from "./db";
import { debiteurenstand } from "./facturen";
import { meetingDate } from "./standup";

// Wat er op het hoofdscherm moet staan.
//
// Het uitgangspunt: binnen tien seconden weten hoe Beerthuizen ervoor staat,
// binnen dertig seconden weten wat je moet doen, en vanaf daar met één klik de
// details in. Alles wat dat niet dient hoort hier niet.
//
// De tweede regel is even belangrijk: **een cijfer dat nergens vandaan komt
// wordt niet getoond.** Een blok dat "€0 spend" laat zien terwijl Meta niet
// gekoppeld is, liegt — en een cockpit waarvan je de meters niet vertrouwt is
// erger dan geen cockpit. Zo'n blok zegt daarom wat het mist en waar je dat
// regelt.

export type Niveau = "rood" | "oranje" | "groen";

export type Prioriteit = {
  niveau: Niveau;
  titel: string;
  /// Eén regel: wat is er aan de hand en wat wordt er van jou verwacht.
  uitleg: string;
  link: string;
  linkLabel: string;
  /// Waar dit vandaan komt, zodat je weet wie het signaleerde.
  bron?: string;
};

export type Kengetal = { label: string; waarde: string; toon?: Niveau };

export type Blok = {
  titel: string;
  link: string;
  /// Gevuld wanneer er echte cijfers zijn.
  cijfers: Kengetal[];
  /// Gevuld wanneer die er niet zijn. Dan staat hier wat eraan ontbreekt.
  ontbreekt: { wat: string; actie: string; link: string } | null;
};

export type TeamRegel = {
  id: string;
  naam: string;
  emoji: string | null;
  color: string | null;
  avatarUrl: string | null;
  niveau: Niveau;
  /// Wat hij nú doet, in een handvol woorden.
  stand: string;
};

export type Cockpit = {
  vandaag: {
    aandacht: number;
    deadlinesDezeWeek: number;
    lopendeTaken: number;
    vragen: number;
  };
  blokken: Blok[];
  prioriteiten: Prioriteit[];
  team: TeamRegel[];
  briefing: { tekst: string; wanneer: Date; link: string; gerapporteerd: number } | null;
};

const DAG = 864e5;

function overDagen(dagen: number): Date {
  return new Date(Date.now() + dagen * DAG);
}

export async function bouwCockpit(): Promise<Cockpit> {
  const nu = new Date();

  const [
    goedkeuringen,
    telegramVragen,
    callVragen,
    teLateTaken,
    komendeTaken,
    lopendeTaken,
    projecten,
    agents,
    stand,
    overleg,
    campagnes,
  ] = await Promise.all([
    db.approval.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      include: { agent: { select: { name: true } } },
    }),
    db.telegramThread.findMany({
      where: { answeredAt: null },
      orderBy: { askedAt: "asc" },
      include: { agent: { select: { name: true } } },
    }),
    db.meetingQuestion.count({ where: { answer: null, skippedAt: null } }),
    db.task.findMany({
      where: { dueAt: { lt: nu }, status: { notIn: ["done", "cancelled"] } },
      orderBy: { dueAt: "asc" },
      include: { agent: { select: { name: true } } },
    }),
    db.task.count({
      where: { dueAt: { gte: nu, lt: overDagen(7) }, status: { notIn: ["done", "cancelled"] } },
    }),
    db.task.count({ where: { status: { notIn: ["done", "cancelled"] } } }),
    db.project.findMany({
      where: { status: { notIn: ["afgerond", "afgewezen"] } },
      orderBy: { deadline: "asc" },
      include: { client: { select: { name: true } }, _count: { select: { tasks: true } } },
    }),
    db.agent.findMany({
      where: { adapterType: { not: "reader_ingest" } },
      orderBy: [{ isChief: "desc" }, { sortOrder: "asc" }],
      include: {
        _count: { select: { tasks: { where: { status: { notIn: ["done", "cancelled"] } } } } },
      },
    }),
    debiteurenstand(),
    db.meeting.findUnique({
      where: { date: meetingDate() },
      include: { _count: { select: { entries: { where: { receivedAt: { not: null } } } } } },
    }),
    db.adCampaign.count(),
  ]);

  // ── Prioriteiten ─────────────────────────────────────────────────────────
  //
  // Volgorde is niet willekeurig: bovenaan staat wat alleen jij kunt oplossen
  // en wat vandaag vastloopt als je het niet doet.
  const prioriteiten: Prioriteit[] = [];

  for (const vraag of telegramVragen) {
    prioriteiten.push({
      niveau: vraag.level === "waarschuwing" || vraag.level === "akkoord" ? "rood" : "oranje",
      titel: vraag.question.split("\n")[0].slice(0, 80),
      uitleg: `${vraag.agent.name} wacht op je antwoord sinds ${uren(vraag.askedAt)}.`,
      link: vraag.taskId ? `/taken/${vraag.taskId}` : "/meldingen",
      linkLabel: vraag.taskId ? "Open taak" : "Bekijken",
      bron: vraag.agent.name,
    });
  }

  for (const app of goedkeuringen) {
    prioriteiten.push({
      niveau: "rood",
      titel: app.title.slice(0, 80),
      uitleg: `${app.agent?.name ?? "Een agent"} heeft dit klaargezet en wacht op je akkoord.`,
      link: "/goedkeuringen",
      linkLabel: "Beoordelen",
      bron: app.agent?.name,
    });
  }

  for (const project of projecten) {
    const dagenTot = project.deadline
      ? Math.ceil((project.deadline.getTime() - nu.getTime()) / DAG)
      : null;

    if (project.missingInfo.length > 0) {
      prioriteiten.push({
        niveau: dagenTot !== null && dagenTot <= 3 ? "rood" : "oranje",
        titel: project.name.slice(0, 80),
        uitleg:
          `${project.missingInfo.length} ${project.missingInfo.length === 1 ? "punt ontbreekt" : "punten ontbreken"}` +
          (dagenTot !== null ? ` · ${dagenTot <= 0 ? "deadline verstreken" : `nog ${dagenTot} dagen`}` : ""),
        link: "/projecten",
        linkLabel: "Open project",
        bron: project.client?.name ?? undefined,
      });
    } else if (dagenTot !== null && dagenTot <= 2) {
      prioriteiten.push({
        niveau: dagenTot <= 0 ? "rood" : "oranje",
        titel: project.name.slice(0, 80),
        uitleg: dagenTot <= 0 ? "Deadline is verstreken." : `Deadline over ${dagenTot} dagen.`,
        link: "/projecten",
        linkLabel: "Open project",
        bron: project.client?.name ?? undefined,
      });
    }
  }

  if (stand.aantalTeLaat > 0) {
    prioriteiten.push({
      niveau: stand.teLaatEur > 5000 ? "rood" : "oranje",
      titel: `${stand.aantalTeLaat} ${stand.aantalTeLaat === 1 ? "factuur staat" : "facturen staan"} te lang open`,
      uitleg: `${euro(stand.teLaatEur)} over de vervaldatum. Maud heeft de opvolging klaarstaan.`,
      link: "/facturen",
      linkLabel: "Bekijk administratie",
      bron: "Maud",
    });
  }

  const zonderEigenaar = teLateTaken.filter((t) => !t.agentId);
  if (zonderEigenaar.length > 0) {
    prioriteiten.push({
      niveau: "oranje",
      titel: `${zonderEigenaar.length} ${zonderEigenaar.length === 1 ? "taak wacht" : "taken wachten"} op jou`,
      uitleg: "Over de deadline en aan niemand toegewezen.",
      link: "/taken",
      linkLabel: "Takenbord",
    });
  }

  const kapotteAgents = agents.filter((a) => a.lastError && !a.paused);
  for (const agent of kapotteAgents) {
    prioriteiten.push({
      niveau: "oranje",
      titel: `${agent.name} liep vast`,
      uitleg: agent.lastError!.slice(0, 100),
      link: `/agents/${agent.id}`,
      linkLabel: "Bekijk agent",
      bron: agent.name,
    });
  }

  // ── Bedrijf in één oogopslag ─────────────────────────────────────────────
  const blokken: Blok[] = [
    {
      titel: "Finance",
      link: "/facturen",
      cijfers:
        stand.teOntvangenEur > 0 || stand.teBetalenEur > 0
          ? [
              { label: "te ontvangen", waarde: euro(stand.teOntvangenEur) },
              { label: "te betalen", waarde: euro(stand.teBetalenEur) },
              {
                label: stand.aantalTeLaat === 1 ? "factuur te laat" : "facturen te laat",
                waarde: String(stand.aantalTeLaat),
                toon: stand.aantalTeLaat > 0 ? "rood" : "groen",
              },
            ]
          : [],
      ontbreekt:
        stand.teOntvangenEur > 0 || stand.teBetalenEur > 0
          ? null
          : {
              wat: "Nog geen facturen",
              actie: "Koppel je facturatiesysteem, of voer er handmatig een in",
              link: "/facturen",
            },
    },
    {
      titel: "Projecten",
      link: "/projecten",
      cijfers:
        projecten.length > 0
          ? [
              { label: "actief", waarde: String(projecten.length) },
              {
                label: "met een gat",
                waarde: String(projecten.filter((p) => p.missingInfo.length > 0).length),
                toon: projecten.some((p) => p.missingInfo.length > 0) ? "oranje" : "groen",
              },
              { label: "taken eronder", waarde: String(projecten.reduce((n, p) => n + p._count.tasks, 0)) },
            ]
          : [],
      ontbreekt:
        projecten.length > 0
          ? null
          : {
              wat: "Nog geen lopende projecten",
              actie: "Stuur een klant een campagnebriefing; de aanvraag wordt hier een project",
              link: "/klanten",
            },
    },
    {
      titel: "Advertenties",
      link: "/campagnes",
      cijfers: [],
      ontbreekt: {
        wat: campagnes === 0 ? "Meta is nog niet gekoppeld" : "Nog geen cijfers binnen",
        actie: "Koppel Meta Ads, dan vult Mila dit blok met spend, CPL en ROAS",
        link: "/tools",
      },
    },
    {
      titel: "Sales",
      link: "/taken",
      cijfers: [],
      ontbreekt: {
        wat: "Nog geen pipeline",
        actie: "Koppel HubSpot of LinkedIn, dan houdt Lars je prospects hier bij",
        link: "/tools",
      },
    },
  ];

  // ── Het team ─────────────────────────────────────────────────────────────
  const team: TeamRegel[] = agents.map((agent) => {
    const taken = agent._count.tasks;
    const eigenVragen = telegramVragen.filter((v) => v.agentId === agent.id).length;

    let niveau: Niveau = "groen";
    let stand = taken === 0 ? "niets openstaand" : `${taken} ${taken === 1 ? "taak" : "taken"}`;

    if (agent.paused) {
      niveau = "oranje";
      stand = "op pauze";
    } else if (agent.lastError) {
      niveau = "rood";
      stand = "liep vast";
    } else if (eigenVragen > 0) {
      niveau = "oranje";
      stand = `wacht op jouw antwoord`;
    }

    return {
      id: agent.id,
      naam: agent.name,
      emoji: agent.emoji,
      color: agent.color,
      avatarUrl: agent.avatarUrl,
      niveau,
      stand,
    };
  });

  return {
    vandaag: {
      aandacht: prioriteiten.filter((p) => p.niveau === "rood").length,
      deadlinesDezeWeek: komendeTaken + teLateTaken.length,
      lopendeTaken,
      vragen: telegramVragen.length + callVragen,
    },
    blokken,
    prioriteiten: prioriteiten.slice(0, 6),
    team,
    // Alleen tonen als er ook echt iemand gerapporteerd heeft. Een briefing die
    // "0 van 0 agents hebben gerapporteerd" zegt is geen briefing; die neemt
    // ruimte in bovenaan je scherm zonder je iets te vertellen.
    briefing:
      overleg?.summaryMd && overleg._count.entries > 0
        ? {
            // Alleen de kern bovenaan. De hele samenvatting was achthonderd
            // tekens proza op de plek waar je in één oogopslag wilt zien wat er
            // speelt; dan lees je hem niet en staat de rest van je scherm eronder.
            tekst: eersteZinnen(overleg.summaryMd, 2),
            wanneer: overleg.createdAt,
            link: "/overleg",
            gerapporteerd: overleg._count.entries,
          }
        : null,
  };
}

/// De eerste zinnen van een samenvatting, zonder opmaaktekens.
///
/// Genoeg om te weten of je moet doorklikken, niet zoveel dat je het overslaat.
function eersteZinnen(tekst: string, hoeveel: number): string {
  const plat = tekst
    .replace(/[*_#`]/g, "")
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean)
    .join(" ");

  const zinnen = plat.match(/[^.!?]+[.!?]+/g) ?? [plat];
  const kort = zinnen.slice(0, hoeveel).join(" ").trim();

  // Eén hele lange zin knippen we alsnog af; anders staat er via deze weg
  // opnieuw een lap tekst.
  return kort.length > 240 ? `${kort.slice(0, 237).trimEnd()}…` : kort;
}

function euro(bedrag: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(bedrag);
}

function uren(moment: Date): string {
  const minuten = Math.round((Date.now() - moment.getTime()) / 60_000);
  if (minuten < 60) return `${minuten} minuten`;
  const uur = Math.round(minuten / 60);
  if (uur < 24) return `${uur} uur`;
  const dagen = Math.round(uur / 24);
  return `${dagen} ${dagen === 1 ? "dag" : "dagen"}`;
}
