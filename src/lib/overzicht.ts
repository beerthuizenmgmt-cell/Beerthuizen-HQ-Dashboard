import "server-only";

import { db } from "./db";

// De cijfers achter het overzicht op HQ.
//
// Alles hier komt uit de gewone tabellen; er wordt niets geschat of
// geëxtrapoleerd. Staat er niets, dan komt er een leeg lijstje terug en zegt het
// scherm dat er nog niets te tonen is. Een grafiek die een verloop suggereert
// dat er niet is, is erger dan geen grafiek.

const DAGNAMEN = ["zo", "ma", "di", "wo", "do", "vr", "za"];

/// De laatste zeven dagen, oudste eerst, met nul voor dagen zonder iets.
function laatsteZevenDagen(): { sleutel: string; dag: string }[] {
  const dagen: { sleutel: string; dag: string }[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dagen.push({ sleutel: d.toISOString().slice(0, 10), dag: DAGNAMEN[d.getDay()] });
  }
  return dagen;
}

export type Overzicht = {
  taken: {
    perStatus: { label: string; waarde: number; kleur: string }[];
    afgerondPerDag: { dag: string; waarde: number }[];
    perAgent: { label: string; waarde: number }[];
  };
  agents: {
    runsPerAgent: { label: string; waarde: number }[];
    kostenPerAgent: { label: string; waarde: number }[];
    tijdPerAgent: { label: string; waarde: number }[];
  };
  advertenties: { gekoppeld: boolean; campagnes: number };
  campagnes: { aantal: number };
};

// Kleur per status, met betekenis. Alle balken in dezelfde kleur maakt de
// grootste grafiek op HQ onleesbaar: je ziet dan wel hoeveel, maar niet of dat
// goed of slecht nieuws is. Rood voor vastgelopen, groen voor klaar — dat lees
// je zonder de labels erbij.
const STATUSLABEL: Record<string, { label: string; kleur: string }> = {
  inbox: { label: "Inbox", kleur: "var(--text-faint)" },
  assigned: { label: "Toegewezen", kleur: "var(--info)" },
  in_progress: { label: "Bezig", kleur: "var(--warn)" },
  blocked: { label: "Vastgelopen", kleur: "var(--danger)" },
  review: { label: "Ter controle", kleur: "var(--accent)" },
  done: { label: "Klaar", kleur: "var(--ok)" },
};

export async function haalOverzicht(): Promise<Overzicht> {
  const dagen = laatsteZevenDagen();
  const sinds = new Date(`${dagen[0].sleutel}T00:00:00.000Z`);

  const [perStatus, afgerond, takenPerAgent, runs, adCampagnes, projecten, agents] =
    await Promise.all([
      db.task.groupBy({ by: ["status"], _count: { _all: true } }),
      db.task.findMany({
        where: { completedAt: { gte: sinds } },
        select: { completedAt: true },
      }),
      db.task.groupBy({
        by: ["agentId"],
        where: { agentId: { not: null }, status: { not: "done" } },
        _count: { _all: true },
      }),
      db.agentRun.groupBy({
        by: ["agentId"],
        where: { createdAt: { gte: sinds } },
        _count: { _all: true },
        _sum: { costEur: true },
        _avg: { durationMs: true },
      }),
      db.adCampaign.count(),
      db.project.count(),
      db.agent.findMany({ select: { id: true, name: true } }),
    ]);

  const naam = new Map(agents.map((a) => [a.id, a.name]));

  const afgerondPerDag = dagen.map(({ sleutel, dag }) => ({
    dag,
    waarde: afgerond.filter((t) => t.completedAt?.toISOString().slice(0, 10) === sleutel).length,
  }));

  // Aflopend sorteren: je wilt zien wie het drukst is, niet wie toevallig
  // vooraan in het alfabet staat.
  const opWaarde = (a: { waarde: number }, b: { waarde: number }) => b.waarde - a.waarde;

  return {
    taken: {
      perStatus: Object.entries(STATUSLABEL)
        .map(([status, { label, kleur }]) => ({
          label,
          kleur,
          waarde: perStatus.find((r) => r.status === status)?._count._all ?? 0,
        }))
        .filter((r) => r.waarde > 0),
      afgerondPerDag,
      perAgent: takenPerAgent
        .map((r) => ({ label: naam.get(r.agentId!) ?? "onbekend", waarde: r._count._all }))
        .sort(opWaarde),
    },
    agents: {
      runsPerAgent: runs
        .map((r) => ({ label: naam.get(r.agentId) ?? "onbekend", waarde: r._count._all }))
        .sort(opWaarde),
      kostenPerAgent: runs
        .map((r) => ({
          label: naam.get(r.agentId) ?? "onbekend",
          waarde: Math.round((r._sum.costEur ?? 0) * 100) / 100,
        }))
        .filter((r) => r.waarde > 0)
        .sort(opWaarde),
      tijdPerAgent: runs
        .map((r) => ({
          label: naam.get(r.agentId) ?? "onbekend",
          waarde: Math.round((r._avg.durationMs ?? 0) / 1000),
        }))
        .filter((r) => r.waarde > 0)
        .sort(opWaarde),
    },
    advertenties: { gekoppeld: adCampagnes > 0, campagnes: adCampagnes },
    campagnes: { aantal: projecten },
  };
}
