"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
// Een proefopdracht kost geld, net als het scherm eromheen al aangaf.
import { requireOwner } from "@/lib/access";
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
    totalTokens: number;
    costEur: number;
    costKnown: boolean;
    durationMs: number;
    runId: string;
    timestamp: string;
    /// Of deze aanroep ook echt terugkomt in het maandtotaal op AI Finance.
    registeredInFinance: boolean;
  };
};

/// Eén proefopdracht.
///
/// Standaard mag de agent uitsluitend denken en antwoorden: geen gereedschap,
/// dus hij kan niets aanmaken en niets vastleggen. Bedoeld om te zien of de
/// keten werkt en wat het kost.
///
/// Met `gereedschap: true` krijgt hij zijn eigen gereedschapskist erbij. Dan
/// kan hij taken aanmaken, bevindingen vastleggen, een collega bevragen en
/// goedkeuring vragen — allemaal binnen het dashboard. Naar buiten gaat er ook
/// dan niets: dat kan geen enkel stuk gereedschap.
export async function runTestTask(
  agentId: string,
  instruction: string,
  gereedschap = false,
): Promise<TestRunResult> {
  await requireOwner();

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
    gereedschap: gereedschap ? "standaard" : "geen",
  });

  if (wasPaused) await db.agent.update({ where: { id: agentId }, data: { paused: true } });

  revalidatePath("/financien");
  revalidatePath("/proefdraaien");

  if (!result.ok || !result.runId) {
    return { ok: false, error: result.error ?? "De agent gaf geen antwoord." };
  }

  const run = await db.agentRun.findUnique({ where: { id: result.runId } });

  const promptTokens = run?.promptTokens ?? 0;
  const completionTokens = run?.completionTokens ?? 0;

  return {
    ok: true,
    answer: result.text,
    meta: {
      agent: agent.name,
      provider: run?.provider ?? config.provider,
      model: run?.model ?? config.defaultModel,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costEur: run?.costEur ?? 0,
      costKnown: run?.costKnown ?? false,
      durationMs: run?.durationMs ?? 0,
      runId: result.runId,
      timestamp: (run?.createdAt ?? new Date()).toISOString(),
      // De run staat in AgentRun en telt daarmee mee op /financien, mits het
      // bedrag bekend is.
      registeredInFinance: Boolean(run) && (run?.costKnown ?? false),
    },
  };
}
