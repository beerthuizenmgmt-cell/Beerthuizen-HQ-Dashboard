import "server-only";

import { db } from "@/lib/db";
import { charterFor, naamVoor, AUTONOMY_LABELS, type Charter } from "./charters";
import { kpisFor, type KpiWaarde } from "./kpi";
import { activeMemories } from "./memory";
import { getToolEntry } from "./toolkit";

// Het personeelsdossier van één agent: alles wat Enriqueo over een medewerker
// wil kunnen zien, op één plek verzameld.
//
// De negen vragen die het beantwoordt: wie is dit, wat doet hij, welke taken
// heeft hij, welke systemen gebruikt hij, wat mag hij daarmee, wat heeft hij
// vandaag gedaan, wat kostte hij, waar wacht hij op, en waar is akkoord voor
// nodig.

const DAG = 24 * 60 * 60_000;

export type Dossier = {
  charter: Charter | null;
  /// De communicatielijnen met de namen zoals ze nu in het dashboard staan.
  lijnen: { naam: string; richting: string; waarover: string; bestaat: boolean }[];
  autonomie: { niveau: number; label: string; uitleg: string } | null;
  kpis: KpiWaarde[];
  geheugen: {
    id: string;
    kind: string;
    title: string;
    body: string;
    source: string;
    pinned: boolean;
    createdAt: Date;
    lastUsedAt: Date | null;
  }[];
  gereedschap: {
    toolKey: string;
    naam: string;
    gekoppeld: boolean;
    werkend: boolean;
    ingeschakeld: boolean;
    fout: string | null;
    /// Ingebouwd gereedschap heeft geen koppeling nodig.
    ingebouwd: boolean;
    /// Wat deze agent hiermee mag. Leeg bij ingebouwd gereedschap: daarvoor
    /// gelden zijn algemene permissies uit het functieprofiel.
    permissie: string | null;
    laatstGebruikt: Date | null;
  }[];
  vandaag: {
    runs: number;
    taken: { titel: string; status: string }[];
    activiteit: { message: string; occurredAt: Date; level: string }[];
  };
  kosten: { vandaagEur: number; maandEur: number; totaalEur: number; onbekendeRuns: number };
  wachtOp: { omschrijving: string; sinds: Date | null }[];
  openGoedkeuringen: { id: string; titel: string; samenvatting: string; sinds: Date }[];
};

/// Het basisgereedschap dat elke agent heeft. Staat niet in de catalogus van
/// koppelbare systemen omdat het geen koppeling nodig heeft — het werkt binnen
/// het dashboard zelf.
const INGEBOUWD: { key: string; naam: string; chiefOnly?: boolean }[] = [
  { key: "maak_taak", naam: "Taken aanmaken en toewijzen" },
  { key: "werk_taak_bij", naam: "Taken bijwerken" },
  { key: "rapporteer_in_kanaal", naam: "Rapporteren in teamkanalen" },
  { key: "vraag_aan_enriqueo", naam: "Vraag klaarzetten voor de ochtendcall" },
  { key: "vraag_goedkeuring", naam: "Goedkeuring vragen" },
  { key: "noteer_bevinding", naam: "Bevinding vastleggen" },
  { key: "onthoud", naam: "Iets onthouden" },
  { key: "vraag_agent", naam: "Een collega bevragen", chiefOnly: true },
];

export async function buildDossier(agentId: string): Promise<Dossier> {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { id: true, key: true, isChief: true },
  });
  if (!agent) throw new Error("Agent bestaat niet.");

  const charter = charterFor(agent.key);
  const dagStart = new Date();
  dagStart.setHours(0, 0, 0, 0);
  const maandStart = new Date(dagStart.getFullYear(), dagStart.getMonth(), 1);

  const [roster, kpis, memories, gekoppeld, runsVandaag, takenVandaag, activiteit, kostenRuns, approvals, openTaken] =
    await Promise.all([
      db.agent.findMany({ select: { key: true, name: true } }),
      kpisFor(agent.id, agent.key),
      activeMemories(agent.id),
      db.agentTool.findMany({ where: { agentId: agent.id } }),
      db.agentRun.count({ where: { agentId: agent.id, createdAt: { gte: dagStart } } }),
      db.task.findMany({
        where: { agentId: agent.id, updatedAt: { gte: dagStart } },
        select: { title: true, status: true },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
      db.activityEvent.findMany({
        where: { agentId: agent.id, occurredAt: { gte: dagStart } },
        select: { message: true, occurredAt: true, level: true },
        orderBy: { occurredAt: "desc" },
        take: 10,
      }),
      db.agentRun.findMany({
        where: { agentId: agent.id },
        select: { costEur: true, costKnown: true, createdAt: true },
      }),
      db.approval.findMany({
        where: { agentId: agent.id, status: "pending" },
        select: { id: true, title: true, summary: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      db.task.findMany({
        where: { agentId: agent.id, status: { in: ["blocked", "review"] } },
        select: { title: true, status: true, updatedAt: true },
        orderBy: { updatedAt: "asc" },
      }),
    ]);

  // Gereedschap: eerst wat hij van huis uit heeft, dan de systemen die
  // specifiek aan hém gekoppeld zijn.
  const gereedschap: Dossier["gereedschap"] = INGEBOUWD.filter(
    (tool) => !tool.chiefOnly || agent.isChief,
  ).map((tool) => ({
    toolKey: tool.key,
    naam: tool.naam,
    gekoppeld: true,
    werkend: true,
    ingeschakeld: true,
    fout: null,
    ingebouwd: true,
    permissie: null,
    laatstGebruikt: null,
  }));

  // Wat het functieprofiel vraagt, ook als het nog niet gekoppeld is — anders
  // zie je niet dat er iets ontbreekt.
  const gevraagd = new Set(charter?.gereedschap ?? []);
  for (const row of gekoppeld) gevraagd.add(row.toolKey);

  for (const toolKey of gevraagd) {
    const entry = getToolEntry(toolKey);
    const koppeling = gekoppeld.find((row) => row.toolKey === toolKey);
    gereedschap.push({
      toolKey,
      naam: entry?.name ?? toolKey,
      gekoppeld: Boolean(koppeling),
      werkend: Boolean(entry?.implemented),
      ingeschakeld: koppeling?.enabled ?? false,
      fout: koppeling?.lastError ?? null,
      ingebouwd: false,
      permissie: koppeling?.permission ?? null,
      laatstGebruikt: koppeling?.lastUsedAt ?? null,
    });
  }

  const kostenVandaag = kostenRuns
    .filter((run) => run.costKnown && run.createdAt >= dagStart)
    .reduce((som, run) => som + run.costEur, 0);
  const kostenMaand = kostenRuns
    .filter((run) => run.costKnown && run.createdAt >= maandStart)
    .reduce((som, run) => som + run.costEur, 0);
  const kostenTotaal = kostenRuns
    .filter((run) => run.costKnown)
    .reduce((som, run) => som + run.costEur, 0);

  const wachtOp: Dossier["wachtOp"] = [];
  for (const approval of approvals) {
    wachtOp.push({
      omschrijving: `Jouw akkoord: ${approval.title}`,
      sinds: approval.createdAt,
    });
  }
  for (const task of openTaken) {
    wachtOp.push({
      omschrijving:
        task.status === "blocked"
          ? `Geblokkeerde taak: ${task.title}`
          : `Taak wacht op je beoordeling: ${task.title}`,
      sinds: task.updatedAt,
    });
  }

  const namen = Object.fromEntries(roster.map((member) => [member.key, member.name]));

  return {
    charter,
    // Een lijn naar een agent die niet (meer) bestaat is een echt probleem —
    // dan verwijst het profiel naar een collega die er niet is.
    lijnen: (charter?.communicatielijnen ?? []).map((lijn) => ({
      naam: naamVoor(lijn, namen),
      richting: lijn.richting,
      waarover: lijn.waarover,
      bestaat: lijn.agentKey === null || lijn.agentKey in namen,
    })),
    autonomie: charter
      ? {
          niveau: charter.autonomie,
          label: AUTONOMY_LABELS[charter.autonomie].label,
          uitleg: AUTONOMY_LABELS[charter.autonomie].uitleg,
        }
      : null,
    kpis,
    geheugen: memories.map((memory) => ({
      id: memory.id,
      kind: memory.kind,
      title: memory.title,
      body: memory.body,
      source: memory.source,
      pinned: memory.pinned,
      createdAt: memory.createdAt,
      lastUsedAt: memory.lastUsedAt,
    })),
    gereedschap,
    vandaag: {
      runs: runsVandaag,
      taken: takenVandaag.map((task) => ({ titel: task.title, status: task.status })),
      activiteit,
    },
    kosten: {
      vandaagEur: kostenVandaag,
      maandEur: kostenMaand,
      totaalEur: kostenTotaal,
      onbekendeRuns: kostenRuns.filter((run) => !run.costKnown).length,
    },
    wachtOp,
    openGoedkeuringen: approvals.map((approval) => ({
      id: approval.id,
      titel: approval.title,
      samenvatting: approval.summary,
      sinds: approval.createdAt,
    })),
  };
}

/// Handig voor het teamoverzicht: is deze agent al ingericht als medewerker?
export function isConfigured(agentKey: string): boolean {
  return charterFor(agentKey) !== null;
}

export { DAG };
