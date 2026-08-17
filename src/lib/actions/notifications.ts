"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { requireOwner } from "@/lib/access";
import { markAllRead } from "@/lib/notifications";
import { db } from "@/lib/db";
import { randomToken } from "@/lib/crypto";

export async function markNotificationsRead() {
  await requireUser();
  await markAllRead();
  revalidatePath("/meldingen");
  revalidatePath("/hq");
}

/// Maakt (of vernieuwt) het token waarmee een agent kan terugpraten. Dat is een
/// sleutel, en het oude token werkt daarna niet meer.
export async function rotateInboundToken(agentId: string) {
  await requireOwner();
  await db.agent.update({ where: { id: agentId }, data: { inboundToken: `at_${randomToken(24)}` } });
  revalidatePath(`/agents/${agentId}`);
}
