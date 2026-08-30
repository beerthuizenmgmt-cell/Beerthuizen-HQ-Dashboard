import "server-only";

import { db } from "@/lib/db";
import { TOOL_CATALOG, CATEGORIE_LABELS, decryptToolConfig, type ToolCategory } from "./toolkit";
import type { ToolPermission } from "@/generated/prisma/enums";

// Het overzicht van alle koppelingen: welke tools er zijn, wie erbij mag, wat
// ze kosten en of ze het doen.
//
// De catalogus staat in code (dat is de lijst met wat er kán), de koppelingen
// en kosten in de database (dat is wat er ís). Hier komen ze samen.

export const PERMISSION_LABELS: Record<ToolPermission, { label: string; uitleg: string }> = {
  lezen: {
    label: "Lezen",
    uitleg: "Ophalen en bekijken. Verandert niets.",
  },
  voorstellen: {
    label: "Voorstellen",
    uitleg: "Mag iets klaarzetten, maar het gebeurt pas na jouw akkoord.",
  },
  schrijven: {
    label: "Schrijven",
    uitleg: "Mag zelfstandig wijzigen binnen deze tool. Extern verkeer blijft approval.",
  },
};

export type IntegratieRij = {
  toolKey: string;
  naam: string;
  categorie: ToolCategory;
  categorieLabel: string;
  omschrijving: string;
  /// Is de koppeling gebouwd? Zo niet, dan kun je hem wel toewijzen maar doet
  /// hij niets — en dat staat er ook zo bij.
  gebouwd: boolean;
  /// Staat de tool bedrijfsbreed aan.
  actief: boolean;
  agents: {
    agentId: string;
    naam: string;
    avatarUrl: string | null;
    emoji: string | null;
    color: string | null;
    permission: ToolPermission;
    ingeschakeld: boolean;
    fout: string | null;
    laatstGebruikt: Date | null;
    gebruikAantal: number;
    /// Welke instelvelden zijn ingevuld. Alleen de namen — de waarden komen
    /// nooit naar de browser; een wachtwoordveld met de echte sleutel erin is
    /// met één klik in de broncode te lezen.
    ingevuld: string[];
    /// Verplichte velden die nog leeg zijn. Zolang hier iets in staat werkt de
    /// koppeling niet, hoe groen het rijtje er verder ook uitziet.
    ontbreekt: string[];
  }[];
  /// Voor hoeveel agents het functieprofiel deze tool vraagt maar er nog geen
  /// koppeling ligt.
  gevraagdMaarNietGekoppeld: string[];
  verbinding: "gekoppeld" | "deels" | "niet gekoppeld" | "niet gebouwd";
  apiStatus: "werkt" | "fout" | "niet getest" | "geen api";
  maandkostenEur: number | null;
  laatsteTest: { at: Date; ok: boolean; error: string | null } | null;
  laatstGebruikt: Date | null;
  notities: string | null;
};

export async function alleIntegraties(): Promise<IntegratieRij[]> {
  const [koppelingen, integraties, agents] = await Promise.all([
    db.agentTool.findMany({
      include: {
        agent: { select: { id: true, name: true, avatarUrl: true, emoji: true, color: true } },
      },
    }),
    db.toolIntegration.findMany(),
    db.agent.findMany({ select: { key: true, name: true } }),
  ]);

  const { CHARTERS } = await import("./charters");
  const naamVanSleutel = new Map(agents.map((agent) => [agent.key, agent.name]));

  return TOOL_CATALOG.map((entry) => {
    const rijen = koppelingen.filter((row) => row.toolKey === entry.key);
    const integratie = integraties.find((row) => row.toolKey === entry.key);

    // Welke functieprofielen deze tool vragen zonder dat hij gekoppeld is.
    const gevraagd = CHARTERS.filter((charter) => charter.gereedschap.includes(entry.key)).map(
      (charter) => naamVanSleutel.get(charter.agentKey) ?? charter.agentKey,
    );
    const gekoppeldeNamen = new Set(rijen.map((row) => row.agent.name));
    const ontbreekt = gevraagd.filter((naam) => !gekoppeldeNamen.has(naam));

    const laatstGebruikt = rijen
      .map((row) => row.lastUsedAt)
      .filter((datum): datum is Date => datum !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    const verbinding: IntegratieRij["verbinding"] = !entry.implemented
      ? "niet gebouwd"
      : rijen.length === 0
        ? "niet gekoppeld"
        : rijen.every((row) => row.enabled && !row.lastError)
          ? "gekoppeld"
          : "deels";

    const apiStatus: IntegratieRij["apiStatus"] = !entry.implemented
      ? "geen api"
      : integratie?.lastTestOk === true
        ? "werkt"
        : integratie?.lastTestOk === false || rijen.some((row) => row.lastError)
          ? "fout"
          : "niet getest";

    return {
      toolKey: entry.key,
      naam: entry.name,
      categorie: entry.category,
      categorieLabel: CATEGORIE_LABELS[entry.category],
      omschrijving: entry.description,
      gebouwd: entry.implemented,
      actief: integratie?.enabled ?? true,
      agents: rijen.map((row) => ({
        agentId: row.agent.id,
        naam: row.agent.name,
        avatarUrl: row.agent.avatarUrl,
        emoji: row.agent.emoji,
        color: row.agent.color,
        permission: row.permission,
        ingeschakeld: row.enabled,
        fout: row.lastError,
        laatstGebruikt: row.lastUsedAt,
        gebruikAantal: row.useCount,
        ...(() => {
          const config = decryptToolConfig(row.config);
          const velden = entry.fields ?? [];
          return {
            ingevuld: velden.filter((veld) => config[veld.name]).map((veld) => veld.name),
            ontbreekt: velden
              .filter((veld) => veld.required && !config[veld.name])
              .map((veld) => veld.name),
          };
        })(),
      })),
      gevraagdMaarNietGekoppeld: ontbreekt,
      verbinding,
      apiStatus,
      maandkostenEur: integratie?.monthlyCostEur ?? null,
      laatsteTest: integratie?.lastTestAt
        ? { at: integratie.lastTestAt, ok: integratie.lastTestOk ?? false, error: integratie.lastTestError }
        : null,
      laatstGebruikt,
      notities: integratie?.notes ?? null,
    };
  });
}

/// Optellen wat de toolstack per maand kost. Alleen bedragen die jij hebt
/// ingevoerd tellen mee; de rest blijft expliciet onbekend.
export function maandtotaal(rijen: IntegratieRij[]): { bekend: number; onbekendAantal: number } {
  let bekend = 0;
  let onbekendAantal = 0;

  for (const rij of rijen) {
    const inGebruik = rij.agents.length > 0;
    if (!inGebruik) continue;
    if (rij.maandkostenEur === null) onbekendAantal += 1;
    else bekend += rij.maandkostenEur;
  }

  return { bekend, onbekendAantal };
}
