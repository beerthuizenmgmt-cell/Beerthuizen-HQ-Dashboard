"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { runAgent } from "@/lib/ai/run";
import { getAiConfig } from "@/lib/ai/provider";

export type TestRunResult = {
  ok: boolean;
  error?: string;
  answer?: string;
  meta?: {
    agent: string;
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    costEur: number;
    costKnown: boolean;
    durationMs: number;
  };
};

/// Eén proefopdracht. De agent mag uitsluitend denken en antwoorden: geen
/// gereedschap, dus hij kan niets aanmaken, niets vastleggen en niets naar
/// buiten sturen. Bedoeld om te zien of de keten werkt en wat het kost.
export async function runTestTask(agentId: string, instruction: string): Promise<TestRunResult> {
  await requireUser();

  const text = instruction.trim();
  if (!text) return { ok: false, error: "Geef een opdracht mee." };

  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent) return { ok: false, error: "Die agent bestaat niet." };
  if (agent.adapterType !== "builtin") {
    return { ok: false, error: `${agent.name} draait niet als ingebouwde AI-agent.` };
  }

  const config = await getAiConfig();
  if (!config.apiKey) {
    return {
      ok: false,
      error:
        "Er is nog geen API-sleutel ingesteld. Vul er een in bij Instellingen → Taalmodel; zolang die ontbreekt is er niets om te testen.",
    };
  }

  // De proef moet ook werken als de agent nog op pauze staat.
  const wasPaused = agent.paused;
  if (wasPaused) await db.agent.update({ where: { id: agentId }, data: { paused: false } });

  const result = await runAgent({
    agentId,
    input: text,
    trigger: "manual",
    gereedschap: "geen",
  });

  if (wasPaused) await db.agent.update({ where: { id: agentId }, data: { paused: true } });

  revalidatePath("/financien");
  revalidatePath("/proefdraaien");

  if (!result.ok || !result.runId) {
    return { ok: false, error: result.error ?? "De agent gaf geen antwoord." };
  }

  const run = await db.agentRun.findUnique({ where: { id: result.runId } });

  return {
    ok: true,
    answer: result.text,
    meta: {
      agent: agent.name,
      provider: run?.provider ?? config.provider,
      model: run?.model ?? config.defaultModel,
      promptTokens: run?.promptTokens ?? 0,
      completionTokens: run?.completionTokens ?? 0,
      costEur: run?.costEur ?? 0,
      costKnown: run?.costKnown ?? false,
      durationMs: run?.durationMs ?? 0,
    },
  };
}
