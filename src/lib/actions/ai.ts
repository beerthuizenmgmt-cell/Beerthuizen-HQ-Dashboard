"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { listModels, type ModelOption, type Provider } from "@/lib/ai/provider";
import { refreshModelPrices } from "@/lib/ai/cost";
import { setCompanyContext } from "@/lib/ai/run";

export type AiSettingsState = { error?: string; ok?: string };

const PROVIDERS: Provider[] = ["openrouter", "openai", "anthropic"];

/// De sleutel gaat versleuteld de database in en komt nooit meer naar buiten.
/// Alleen de providerlaag ontsleutelt hem, op het moment van bellen.
export async function saveAiSettings(
  _prev: AiSettingsState,
  formData: FormData,
): Promise<AiSettingsState> {
  await requireUser();

  const provider = String(formData.get("provider") ?? "openrouter");
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const defaultModel = String(formData.get("defaultModel") ?? "").trim();
  const fastModel = String(formData.get("fastModel") ?? "").trim();

  if (!(PROVIDERS as string[]).includes(provider)) return { error: "Onbekende aanbieder." };

  const existing = await db.setting.findUnique({ where: { key: "ai" } });
  const current = (existing?.value ?? {}) as {
    apiKey?: string;
    defaultModel?: string;
  };

  const value = {
    provider,
    defaultModel: defaultModel || current.defaultModel || "",
    fastModel: fastModel || null,
    // Leeg gelaten betekent: laat de bestaande sleutel staan.
    ...(apiKey ? { apiKey: encryptSecret(apiKey) } : current.apiKey ? { apiKey: current.apiKey } : {}),
  } satisfies Prisma.InputJsonObject;

  await db.setting.upsert({
    where: { key: "ai" },
    update: { value },
    create: { key: "ai", value },
  });

  revalidatePath("/instellingen");
  revalidatePath("/financien");
  return { ok: apiKey ? "Opgeslagen, inclusief nieuwe sleutel." : "Opgeslagen." };
}

export async function saveFinanceSettings(
  _prev: AiSettingsState,
  formData: FormData,
): Promise<AiSettingsState> {
  await requireUser();

  const number = (name: string): number | null => {
    const raw = String(formData.get(name) ?? "").replace(",", ".").trim();
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };

  const usdToEur = number("usdToEur");

  await db.setting.upsert({
    where: { key: "finance" },
    update: {
      value: {
        monthlyBudgetEur: number("monthlyBudgetEur"),
        usdToEur: usdToEur && usdToEur > 0 ? usdToEur : 0.92,
        hourlyRateEur: number("hourlyRateEur"),
      },
    },
    create: {
      key: "finance",
      value: {
        monthlyBudgetEur: number("monthlyBudgetEur"),
        usdToEur: usdToEur && usdToEur > 0 ? usdToEur : 0.92,
        hourlyRateEur: number("hourlyRateEur"),
      },
    },
  });

  revalidatePath("/financien");
  revalidatePath("/instellingen");
  return { ok: "Opgeslagen." };
}

export async function saveContext(_prev: AiSettingsState, formData: FormData): Promise<AiSettingsState> {
  await requireUser();

  const text = String(formData.get("context") ?? "").trim();
  if (text.length < 50) {
    return { error: "Dat is wel erg kort. De agents lezen dit bij élke opdracht — het bepaalt hun kwaliteit." };
  }

  await setCompanyContext(text);
  revalidatePath("/instellingen");
  return { ok: `Opgeslagen, ${Math.round(text.length / 3.6)} tokens per aanroep.` };
}

/// Haalt de actuele modellenlijst bij de aanbieder op, zodat je kunt kiezen uit
/// wat er echt bestaat.
export async function fetchModels(): Promise<{ ok: boolean; models?: ModelOption[]; error?: string }> {
  await requireUser();
  try {
    return { ok: true, models: await listModels() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Ophalen mislukt." };
  }
}

export async function refreshPrices(): Promise<{ ok: boolean; message: string }> {
  await requireUser();
  try {
    const stored = await refreshModelPrices();
    revalidatePath("/financien");
    return { ok: true, message: `Tarieven van ${stored} modellen bijgewerkt.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Ophalen mislukt." };
  }
}

export async function setAgentModel(agentId: string, modelId: string) {
  await requireUser();
  await db.agent.update({
    where: { id: agentId },
    data: { modelId: modelId.trim() || null },
  });
  revalidatePath(`/agents/${agentId}`);
  revalidatePath("/financien");
}

export async function setAgentPaused(agentId: string, paused: boolean) {
  await requireUser();
  await db.agent.update({ where: { id: agentId }, data: { paused } });
  revalidatePath("/agents");
  revalidatePath("/hq");
  revalidatePath("/proefdraaien");
}
