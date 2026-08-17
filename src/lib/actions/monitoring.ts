"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
// Signalen aan- en uitzetten is agentinrichting, en een detectieronde laten
// draaien kost geld. Het scherm eromheen was al van de eigenaar; de knoppen
// eronder waren dat nog niet.
import { requireOwner } from "@/lib/access";
import { detectAndActivate, type DetectionOutcome } from "@/lib/ai/watch";
import { buildMorningReport, type HeadReport } from "@/lib/ai/head";

export async function previewDetection(): Promise<DetectionOutcome[]> {
  await requireOwner();
  // Kijkt wat er zou gebeuren zonder ook maar één agent te laten denken.
  return detectAndActivate({ dryRun: true });
}

export async function runDetection(): Promise<DetectionOutcome[]> {
  await requireOwner();
  const outcomes = await detectAndActivate();
  revalidatePath("/monitoring");
  revalidatePath("/financien");
  return outcomes;
}

export async function runHeadReport(): Promise<HeadReport> {
  await requireOwner();
  const report = await buildMorningReport();
  revalidatePath("/monitoring");
  revalidatePath("/overleg");
  return report;
}

/// Een ontwikkeling melden die het systeem zelf niet kan zien. Dit is wat
/// Research wakker maakt zolang er nog geen monitor op externe bronnen zit —
/// gerichter dan hem elke dag ongericht laten zoeken.
export async function reportSignal(
  agentKey: string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireOwner();

  const text = message.trim();
  if (!text) return { ok: false, error: "Beschrijf wat je hebt gezien." };

  const agent = await db.agent.findUnique({ where: { key: agentKey } });
  if (!agent) return { ok: false, error: "Onbekende agent." };

  await db.activityEvent.create({
    data: {
      agentId: agent.id,
      kind: "signaal",
      level: "info",
      message: text.slice(0, 500),
      occurredAt: new Date(),
    },
  });

  revalidatePath("/monitoring");
  return { ok: true };
}

export async function setWatchActive(watchId: string, active: boolean) {
  await requireOwner();
  await db.agentWatch.update({ where: { id: watchId }, data: { active } });
  revalidatePath("/monitoring");
}
