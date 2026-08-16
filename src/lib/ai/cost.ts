import "server-only";

import { db } from "@/lib/db";
import { notify } from "@/lib/notifications";
import type { ChatResult, Provider } from "./provider";

// Kostenberekening, model- en provideronafhankelijk. Volgorde van betrouwbaar
// naar minder betrouwbaar:
//   1. de aanbieder rapporteert de werkelijke kosten van die aanroep
//   2. we rekenen met tarieven die we bij de aanbieder hebben opgehaald
//   3. we weten het niet — dan blijft het bedrag leeg in plaats van geraden
//
// Regel drie is belangrijk: een geschat bedrag dat als feit in je maandtotaal
// belandt is erger dan een gat waarvan je weet dat het er is.

export type FinanceSettings = {
  monthlyBudgetEur: number | null;
  usdToEur: number;
  /// Wat een uur werk van je team kost. Zonder dit getal rekenen we bespaarde
  /// uren niet om naar euro's.
  hourlyRateEur: number | null;
};

const FINANCE_KEY = "finance";

export async function getFinanceSettings(): Promise<FinanceSettings> {
  const setting = await db.setting.findUnique({ where: { key: FINANCE_KEY } });
  const stored = (setting?.value ?? {}) as Partial<FinanceSettings>;
  return {
    monthlyBudgetEur: stored.monthlyBudgetEur ?? null,
    usdToEur: stored.usdToEur ?? 0.92,
    hourlyRateEur: stored.hourlyRateEur ?? null,
  };
}

export async function resolveCost(
  result: ChatResult,
  provider: Provider,
): Promise<{ costEur: number; costKnown: boolean }> {
  const finance = await getFinanceSettings();

  if (result.cost) {
    const rate = result.cost.currency === "USD" ? finance.usdToEur : 1;
    return { costEur: result.cost.amount * rate, costKnown: true };
  }

  const price = await db.modelPrice.findUnique({
    where: { provider_modelId: { provider, modelId: result.model } },
  });
  if (!price) return { costEur: 0, costKnown: false };

  const costEur =
    (result.usage.promptTokens / 1_000_000) * price.promptPerMillion +
    (result.usage.completionTokens / 1_000_000) * price.completionPerMillion;

  return { costEur, costKnown: true };
}

/// Haalt de tarieven bij de aanbieder op en bewaart ze. Nieuwe aanbieder erbij?
/// Dan komen zijn tarieven hier binnen en telt alles vanzelf mee.
export async function refreshModelPrices(): Promise<number> {
  const { listModels, getAiConfig } = await import("./provider");
  const config = await getAiConfig();
  const finance = await getFinanceSettings();

  const models = await listModels();
  let stored = 0;

  for (const model of models) {
    if (!model.pricePerMillion) continue;
    // listModels geeft de prompt-prijs in dollar per miljoen tokens terug.
    const promptEur = model.pricePerMillion * finance.usdToEur;

    await db.modelPrice.upsert({
      where: { provider_modelId: { provider: config.provider, modelId: model.id } },
      update: { promptPerMillion: promptEur, completionPerMillion: promptEur },
      create: {
        provider: config.provider,
        modelId: model.id,
        promptPerMillion: promptEur,
        completionPerMillion: promptEur,
      },
    });
    stored += 1;
  }

  return stored;
}

// ============================================================
// Budgetbewaking
// ============================================================

const THRESHOLDS = [50, 75, 90, 100] as const;

export function monthRange(now = new Date()): { start: Date; end: Date; label: string } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1)),
    end: new Date(Date.UTC(year, month + 1, 1)),
    label: new Date(Date.UTC(year, month, 1)).toLocaleDateString("nl-NL", {
      timeZone: "UTC",
      month: "long",
      year: "numeric",
    }),
  };
}

export async function monthSpend(now = new Date()): Promise<number> {
  const { start, end } = monthRange(now);
  const result = await db.agentRun.aggregate({
    where: { createdAt: { gte: start, lt: end }, costKnown: true },
    _sum: { costEur: true },
  });
  return result._sum.costEur ?? 0;
}

export type BudgetState = {
  budget: number | null;
  spent: number;
  percentage: number | null;
  /// Boven het budget: automatische runs worden geblokkeerd. Alleen wat jij
  /// zelf start blijft mogelijk, zodat je nooit klemzit in je eigen dashboard.
  blocked: boolean;
};

export async function getBudgetState(): Promise<BudgetState> {
  const finance = await getFinanceSettings();
  const spent = await monthSpend();

  if (!finance.monthlyBudgetEur || finance.monthlyBudgetEur <= 0) {
    return { budget: null, spent, percentage: null, blocked: false };
  }

  const percentage = (spent / finance.monthlyBudgetEur) * 100;
  return { budget: finance.monthlyBudgetEur, spent, percentage, blocked: percentage >= 100 };
}

/// De rem. Bewust alleen remmen: bij overschrijding gebeurt er niets naar
/// buiten, er wordt niets afgesloten en niemand krijgt automatisch bericht
/// behalve de melding die al bij 90 procent is verstuurd.
export async function assertWithinBudget(trigger: string): Promise<void> {
  // Wat jij zelf aanzet blijft altijd mogelijk — anders kun je niet eens meer
  // controleren waarom je budget op is.
  if (trigger === "manual") return;

  const state = await getBudgetState();
  if (!state.blocked) return;

  throw new Error(
    `Het maandbudget van €${state.budget?.toFixed(2)} is bereikt (€${state.spent.toFixed(2)} uitgegeven). ` +
      `Automatische analyses zijn gepauzeerd. Verhoog het budget bij Instellingen, of start een run zelf ` +
      `vanaf Proefdraaien — die blijft wel werken.`,
  );
}

/// Waarschuwt bij 50, 75, 90 en 100 procent van het maandbudget — elke drempel
/// één keer per maand, anders word je bij elke aanroep opnieuw gewaarschuwd.
export async function checkBudget(): Promise<void> {
  const finance = await getFinanceSettings();
  if (!finance.monthlyBudgetEur || finance.monthlyBudgetEur <= 0) return;

  const { label } = monthRange();
  const spent = await monthSpend();
  const percentage = (spent / finance.monthlyBudgetEur) * 100;

  const key = `budget_alerts_${label}`;
  const setting = await db.setting.findUnique({ where: { key } });
  const alerted = new Set((setting?.value as number[] | undefined) ?? []);

  const reached = THRESHOLDS.filter((threshold) => percentage >= threshold && !alerted.has(threshold));
  if (reached.length === 0) return;

  const highest = reached[reached.length - 1];
  for (const threshold of reached) alerted.add(threshold);

  await db.setting.upsert({
    where: { key },
    update: { value: [...alerted] },
    create: { key, value: [...alerted] },
  });

  await notify({
    level: highest >= 100 ? "error" : highest >= 90 ? "warn" : "info",
    title:
      highest >= 100
        ? `AI-budget van ${label} is overschreden`
        : `${highest}% van het AI-budget gebruikt`,
    body:
      `€${spent.toFixed(2)} van €${finance.monthlyBudgetEur.toFixed(2)} in ${label}.` +
      (highest >= 100
        ? " Automatische analyses zijn gepauzeerd. Er gebeurt verder niets — geen externe acties, niets afgesloten. Verhoog het budget om ze te hervatten."
        : ""),
    link: "/financien",
    // Vanaf 90 procent wil je het weten zonder het dashboard open te hebben.
    push: highest >= 90,
  });
}

/// Saldo bij de aanbieder. Nu je met echt geld draait wil je dit zien vóórdat
/// een agent midden in een analyse tegen een lege rekening loopt.
export async function providerBalance(): Promise<{
  supported: boolean;
  credits?: number;
  used?: number;
  remaining?: number;
  error?: string;
}> {
  const { getAiConfig } = await import("./provider");
  const config = await getAiConfig();

  if (config.provider !== "openrouter" || !config.apiKey) return { supported: false };

  try {
    const response = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { supported: true, error: `saldo opvragen gaf ${response.status}` };

    const data = (await response.json()) as { data?: { total_credits?: number; total_usage?: number } };
    const credits = data.data?.total_credits ?? 0;
    const used = data.data?.total_usage ?? 0;

    return { supported: true, credits, used, remaining: credits - used };
  } catch (error) {
    return { supported: true, error: error instanceof Error ? error.message : "onbekend" };
  }
}
