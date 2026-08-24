import "server-only";

import { db } from "./db";
import { BRIEFINGVELDEN } from "./ai/briefing";

// Wat er opvalt zonder dat iemand ernaar vraagt.
//
// Alles hier wordt in gewone code uitgerekend en niet aan een model gevraagd.
// Een deadline over drie dagen is een som, geen inschatting — en een agent die
// zelf mag bepalen wat dringend is, vindt de ene dag iets anders dringend dan de
// andere.
//
// Het model komt pas daarna aan bod: het krijgt deze lijst en bepaalt wat eraan
// te doen valt. Vinden doet de code, oordelen doet de agent.

export type Signaal = {
  /// Waar het over gaat, in één zin.
  wat: string;
  /// Hoe erg het is. "hoog" betekent: hier gaat vandaag iets mis als niemand
  /// iets doet.
  urgentie: "hoog" | "midden";
  /// Waar het speelt, zodat een agent er direct heen kan.
  link?: string;
};

const DAG = 864e5;

export async function haalSignalen(): Promise<Signaal[]> {
  const nu = Date.now();
  const signalen: Signaal[] = [];

  // ── Campagnes met een deadline en een onvolledige briefing ───────────────
  //
  // Dit is het geval waar Enriqueo op doelde: een campagne die over drie dagen
  // moet lopen terwijl er nog niet eens een budget bekend is. Dat hoort op te
  // vallen zonder dat hij ernaar vraagt.
  const campagnes = await db.project.findMany({
    where: {
      status: { notIn: ["afgerond", "afgewezen"] },
      deadline: { not: null, lte: new Date(nu + 14 * DAG) },
    },
    include: { briefing: true, client: { select: { name: true } } },
  });

  const hardeVelden = BRIEFINGVELDEN.filter((v) => v.hard);

  for (const campagne of campagnes) {
    const beantwoord = new Set(
      campagne.briefing.filter((b) => b.antwoord).map((b) => b.veld),
    );
    const ontbreekt = hardeVelden.filter((v) => !beantwoord.has(v.sleutel));
    if (ontbreekt.length === 0) continue;

    const dagen = Math.ceil((campagne.deadline!.getTime() - nu) / DAG);
    signalen.push({
      wat:
        `${campagne.name}${campagne.client ? ` (${campagne.client.name})` : ""} loopt over ${dagen} dag(en) af, ` +
        `maar ${ontbreekt.length} onmisbaar briefingveld ontbreekt nog: ${ontbreekt.map((v) => v.sleutel).join(", ")}.`,
      urgentie: dagen <= 5 ? "hoog" : "midden",
      link: `/projecten/${campagne.id}`,
    });
  }

  // ── Werk dat vastligt ────────────────────────────────────────────────────
  const vastgelopen = await db.task.findMany({
    where: { status: "blocked", updatedAt: { lte: new Date(nu - 2 * DAG) } },
    include: { agent: { select: { name: true } } },
    take: 10,
  });

  for (const taak of vastgelopen) {
    const dagen = Math.floor((nu - taak.updatedAt.getTime()) / DAG);
    signalen.push({
      wat: `"${taak.title}" ligt al ${dagen} dagen vast bij ${taak.agent?.name ?? "niemand"}.`,
      urgentie: dagen >= 5 ? "hoog" : "midden",
      link: `/taken/${taak.id}`,
    });
  }

  // ── Vragen waar geen antwoord op komt ────────────────────────────────────
  //
  // Een vraag die drie dagen open staat is geen vraag meer maar een blokkade;
  // dan hoort er iets anders te gebeuren dan nog een keer wachten.
  const openVragen = await db.briefingAntwoord.findMany({
    where: { antwoord: null, gevraagdOp: { not: null, lte: new Date(nu - 3 * DAG) } },
    include: { project: { select: { id: true, name: true } } },
    take: 10,
  });

  for (const vraag of openVragen) {
    const dagen = Math.floor((nu - vraag.gevraagdOp!.getTime()) / DAG);
    signalen.push({
      wat: `De vraag over "${vraag.veld}" voor ${vraag.project.name} staat al ${dagen} dagen open.`,
      urgentie: "midden",
      link: `/projecten/${vraag.project.id}`,
    });
  }

  // ── Facturen die over tijd zijn ──────────────────────────────────────────
  const teLaat = await db.invoice.findMany({
    where: {
      status: { notIn: ["betaald", "concept", "oninbaar", "vervallen_verklaard"] },
      // dueOn is verplicht op een factuur; er is dus geen null-geval.
      dueOn: { lt: new Date(nu) },
    },
    take: 10,
  });

  for (const factuur of teLaat) {
    const dagen = Math.floor((nu - factuur.dueOn.getTime()) / DAG);
    signalen.push({
      // clientName staat op de factuur zelf: die hoort te blijven staan zoals hij
      // gefactureerd is, ook als de klantnaam later verandert.
      wat: `Factuur ${factuur.number} aan ${factuur.clientName} is ${dagen} dagen over de vervaldatum (€${factuur.amountEur}).`,
      urgentie: dagen >= 30 ? "hoog" : "midden",
      link: "/facturen",
    });
  }

  // ── Goedkeuringen die blijven liggen ─────────────────────────────────────
  const wachtend = await db.approval.count({
    where: { status: "pending", createdAt: { lte: new Date(nu - 2 * DAG) } },
  });

  if (wachtend > 0) {
    signalen.push({
      wat: `${wachtend} goedkeuring(en) wachten al meer dan twee dagen op Enriqueo.`,
      urgentie: "midden",
      link: "/goedkeuringen",
    });
  }

  // Het dringendste eerst, zodat een agent die er maar een paar oppakt de goede
  // pakt.
  return signalen.sort((a, b) => (a.urgentie === b.urgentie ? 0 : a.urgentie === "hoog" ? -1 : 1));
}
