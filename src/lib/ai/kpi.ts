import "server-only";

import { db } from "@/lib/db";
import { charterFor, type KpiDefinitie } from "./charters";
import { formatEuro } from "@/lib/format";

// De KPI's van een agent, berekend uit wat er echt is gebeurd.
//
// Harde regel uit de afspraken met Enriqueo: nooit een getal verzinnen. Is er
// geen data, dan staat er "nog geen data" — geen nul, geen schatting, geen
// gemiddelde van niets. Een leeg vakje is informatie; een verzonnen getal is
// een leugen die je later niet meer terugvindt.

export type KpiWaarde = KpiDefinitie & {
  /// De waarde als leesbare tekst, of null als er niets te meten valt.
  waarde: string | null;
  /// Hoe het ervoor staat. "onbekend" zolang er geen data is.
  stand: "goed" | "aandacht" | "slecht" | "onbekend";
  /// Waarop dit getal gebaseerd is, zodat je het kunt narekenen.
  onderbouwing: string;
};

const DAG = 24 * 60 * 60_000;

/// Aantal werkdagen (ma–vr) in de laatste `dagen` dagen, vandaag meegeteld.
function werkdagenIn(dagen: number): number {
  let count = 0;
  for (let i = 0; i < dagen; i += 1) {
    const dag = new Date(Date.now() - i * DAG).getDay();
    if (dag >= 1 && dag <= 5) count += 1;
  }
  return count;
}

export async function kpisFor(agentId: string, agentKey: string): Promise<KpiWaarde[]> {
  const charter = charterFor(agentKey);
  if (!charter) return [];

  const uitkomsten: KpiWaarde[] = [];
  for (const kpi of charter.kpis) {
    uitkomsten.push(await bereken(kpi, agentId));
  }
  return uitkomsten;
}

async function bereken(kpi: KpiDefinitie, agentId: string): Promise<KpiWaarde> {
  const leeg = (reden: string): KpiWaarde => ({
    ...kpi,
    waarde: null,
    stand: "onbekend",
    onderbouwing: reden,
  });

  switch (kpi.key) {
    case "rapport_op_tijd": {
      const sinds = new Date(Date.now() - 14 * DAG);
      const runs = await db.agentRun.findMany({
        where: { agentId, trigger: "chief_cycle", ok: true, createdAt: { gte: sinds } },
        select: { createdAt: true },
      });
      const dagen = new Set(runs.map((run) => run.createdAt.toISOString().slice(0, 10)));
      const verwacht = werkdagenIn(14);
      if (verwacht === 0) return leeg("geen werkdagen in de meetperiode");
      if (runs.length === 0) {
        return {
          ...kpi,
          waarde: `0 van ${verwacht}`,
          stand: "onbekend",
          onderbouwing: "nog geen rapport gedraaid — hij is net ingericht",
        };
      }
      const ratio = dagen.size / verwacht;
      return {
        ...kpi,
        waarde: `${dagen.size} van ${verwacht} werkdagen`,
        stand: ratio >= 0.9 ? "goed" : ratio >= 0.6 ? "aandacht" : "slecht",
        onderbouwing: `${runs.length} rapportruns over ${dagen.size} verschillende dagen, laatste 14 dagen`,
      };
    }

    case "goedkeuring_doorlooptijd": {
      const beslist = await db.approval.findMany({
        where: { agentId, decidedAt: { not: null } },
        select: { createdAt: true, decidedAt: true },
        orderBy: { decidedAt: "desc" },
        take: 30,
      });
      if (beslist.length === 0) return leeg("nog geen beslist verzoek van deze agent");

      const uren = beslist.map((a) => (a.decidedAt!.getTime() - a.createdAt.getTime()) / 3_600_000);
      const gemiddeld = uren.reduce((som, uur) => som + uur, 0) / uren.length;
      return {
        ...kpi,
        waarde: gemiddeld < 1 ? `${Math.round(gemiddeld * 60)} minuten` : `${gemiddeld.toFixed(1)} uur`,
        stand: gemiddeld <= 24 ? "goed" : gemiddeld <= 48 ? "aandacht" : "slecht",
        onderbouwing: `gemiddelde over ${beslist.length} beslist${beslist.length === 1 ? " verzoek" : "e verzoeken"}`,
      };
    }

    case "taken_zonder_eigenaar": {
      const aantal = await db.task.count({
        where: { agentId: null, status: { notIn: ["done", "cancelled"] } },
      });
      return {
        ...kpi,
        waarde: `${aantal}`,
        stand: aantal === 0 ? "goed" : aantal <= 2 ? "aandacht" : "slecht",
        onderbouwing: "openstaande taken zonder toegewezen agent, nu geteld",
      };
    }

    case "stille_agents": {
      const grens = new Date(Date.now() - 2 * DAG);
      const stil = await db.agent.findMany({
        where: {
          paused: false,
          adapterType: "builtin",
          OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: grens } }, { status: "error" }],
        },
        select: { name: true, lastActiveAt: true, status: true },
      });
      const namen = stil.map((agent) => agent.name).join(", ");
      return {
        ...kpi,
        waarde: `${stil.length}`,
        stand: stil.length === 0 ? "goed" : stil.length <= 2 ? "aandacht" : "slecht",
        onderbouwing: stil.length
          ? `zonder activiteit sinds twee dagen of met een fout: ${namen}`
          : "alle ingebouwde agents waren de laatste twee dagen actief",
      };
    }

    case "kosten_per_rapport": {
      const runs = await db.agentRun.findMany({
        where: { agentId, trigger: "chief_cycle", costKnown: true },
        select: { costEur: true },
      });
      if (runs.length === 0) return leeg("nog geen rapportrun met bekende kosten");
      const totaal = runs.reduce((som, run) => som + run.costEur, 0);
      return {
        ...kpi,
        waarde: formatEuro(totaal / runs.length),
        stand: "goed",
        onderbouwing: `${formatEuro(totaal)} over ${runs.length} rapport${runs.length === 1 ? "" : "en"}`,
      };
    }

    case "overgeslagen_analyses": {
      const watches = await db.agentWatch.findMany({
        where: { agentId },
        select: { dataHash: true, analyzedHash: true },
      });
      if (watches.length === 0) return leeg("nog geen signalen ingericht");
      const rustig = watches.filter((w) => w.dataHash !== null && w.dataHash === w.analyzedHash).length;
      return {
        ...kpi,
        waarde: `${rustig} van ${watches.length} signalen rustig`,
        stand: "goed",
        onderbouwing:
          "een signaal is rustig als de data niet veranderd is sinds de laatste analyse — dan draait er niets en kost het niets",
      };
    }

    case "openstaande_verzoeken": {
      const aantal = await db.approval.count({ where: { agentId, status: "pending" } });
      return {
        ...kpi,
        waarde: `${aantal}`,
        stand: aantal === 0 ? "goed" : aantal <= 3 ? "aandacht" : "slecht",
        onderbouwing: "goedkeuringsverzoeken van deze agent die nog op een besluit wachten",
      };
    }

    case "signalen_gemeld": {
      const sinds = new Date(Date.now() - 14 * DAG);
      const [gemeld, totaal] = await Promise.all([
        db.agentInsight.count({ where: { agentId, reportedAt: { not: null }, createdAt: { gte: sinds } } }),
        db.agentInsight.count({ where: { agentId, createdAt: { gte: sinds } } }),
      ]);
      if (totaal === 0) return leeg("nog geen bevindingen vastgelegd");
      return {
        ...kpi,
        waarde: `${gemeld} van ${totaal}`,
        stand: "goed",
        onderbouwing: "bevindingen van de laatste 14 dagen die in een rapport zijn verwerkt",
      };
    }

    default:
      return leeg(kpi.bron.startsWith("Nog geen bron") ? kpi.bron : "deze maatstaf is nog niet berekenbaar");
  }
}
