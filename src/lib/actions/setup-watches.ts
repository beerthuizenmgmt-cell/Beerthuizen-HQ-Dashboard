"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
// Bepaalt waar agents vanzelf wakker van worden — agentinrichting.
import { requireOwner } from "@/lib/access";
import { DEFAULT_WATCHES } from "@/lib/ai/watch";

/// Zet de standaard bewaakte onderwerpen klaar. Idempotent: opnieuw draaien
/// laat bestaande vingerafdrukken en instellingen met rust.
export async function installDefaultWatches(): Promise<{ created: number; total: number }> {
  await requireOwner();

  let created = 0;

  for (const watch of DEFAULT_WATCHES) {
    const agent = await db.agent.findUnique({ where: { key: watch.agentKey } });
    if (!agent) continue;

    const existing = await db.agentWatch.findUnique({ where: { key: watch.key } });
    if (existing) continue;

    await db.agentWatch.create({
      data: {
        agentId: agent.id,
        key: watch.key,
        label: watch.label,
        probe: watch.probe,
        minIntervalMinutes: watch.minIntervalMinutes,
      },
    });
    created += 1;
  }

  const total = await db.agentWatch.count();
  revalidatePath("/monitoring");
  return { created, total };
}
