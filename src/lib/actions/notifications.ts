"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { markAllRead } from "@/lib/notifications";
import { db } from "@/lib/db";
import { randomToken } from "@/lib/crypto";

export async function markNotificationsRead() {
  await requireUser();
  await markAllRead();
  revalidatePath("/meldingen");
  revalidatePath("/hq");
}

/// Maakt (of vernieuwt) het token waarmee een agent kan terugpraten.
export async function rotateInboundToken(agentId: string) {
  await requireUser();
  await db.agent.update({ where: { id: agentId }, data: { inboundToken: `at_${randomToken(24)}` } });
  revalidatePath(`/agents/${agentId}`);
}
