"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/access";
import { scenario } from "@/lib/scenarios";
import { runAgent } from "@/lib/ai/run";

/// Voert een testscenario uit met de echte agents en het echte gereedschap.
///
/// Bewust niet in een aparte testmodus: een test die langs de werkelijkheid
/// heen draait bewijst niets. De agents maken dus echt taken aan en stellen
/// echt vragen — alleen alles wat naar buiten zou gaan blijft hangen in de
/// goedkeuringen, precies zoals in het echte werk.
export async function draaiScenario(key: string): Promise<{ error?: string; testrunId?: string }> {
  await requireOwner();

  const spec = scenario(key);
  if (!spec) return { error: "Onbekend scenario." };

  const agent = await db.agent.findUnique({ where: { key: spec.startAgent } });
  if (!agent) return { error: `De agent "${spec.startAgent}" bestaat niet.` };
  if (agent.paused) return { error: `${agent.name} staat op pauze.` };

  const testrun = await db.testrun.create({
    data: { scenario: spec.key, naam: spec.naam, opdracht: spec.opdracht },
  });

  const uitkomst = await runAgent({
    agentId: agent.id,
    input: spec.opdracht,
    trigger: "manual",
    reason: `Testscenario ${spec.key}`,
  });

  await db.testrun.update({
    where: { id: testrun.id },
    data: {
      afgerondOp: new Date(),
      antwoord: uitkomst.ok ? uitkomst.text : null,
      fout: uitkomst.ok ? null : (uitkomst.error ?? "onbekende fout"),
    },
  });

  revalidatePath("/proefdraaien");
  return { testrunId: testrun.id };
}

/// De beoordeling achteraf. Handmatig, want of een antwoord goed genoeg is voor
/// Beerthuizen kan alleen Enriqueo bepalen.
export async function beoordeelTestrun(
  testrunId: string,
  scores: Record<string, number>,
  notities: string,
): Promise<void> {
  await requireOwner();

  const waarden = Object.values(scores).filter((n) => Number.isFinite(n));
  const gemiddelde =
    waarden.length > 0 ? Math.round((waarden.reduce((a, b) => a + b, 0) / waarden.length) * 10) / 10 : null;

  await db.testrun.update({
    where: { id: testrunId },
    data: { scores, eindscore: gemiddelde, notities: notities.trim() || null },
  });

  revalidatePath("/proefdraaien");
}
