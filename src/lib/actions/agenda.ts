"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fromDayKey } from "@/lib/format";

/// Een taak naar een andere dag zetten. Dit is de snelste manier om je week te
/// herschikken zonder elke taak apart te openen.
export async function moveTaskToDay(taskId: string, dayKey: string | null) {
  const user = await requireUser();

  const task = await db.task.findUnique({ where: { id: taskId }, select: { title: true } });
  if (!task) return;

  await db.task.update({
    where: { id: taskId },
    data: { dueAt: dayKey ? fromDayKey(dayKey) : null },
  });

  await db.taskUpdate.create({
    data: {
      taskId,
      authorType: "user",
      authorUserId: user.id,
      kind: "status",
      body: dayKey
        ? `Ingepland op ${new Date(`${dayKey}T00:00:00.000Z`).toLocaleDateString("nl-NL", { timeZone: "UTC", day: "numeric", month: "long" })}.`
        : "Uit de planning gehaald.",
    },
  });

  revalidatePath("/agenda");
  revalidatePath("/taken");
  revalidatePath(`/taken/${taskId}`);
}

export type QuickPlanState = { error?: string; ok?: boolean };

/// Direct iets op een dag zetten, zonder het hele takenformulier te openen.
export async function planOnDay(_prev: QuickPlanState, formData: FormData): Promise<QuickPlanState> {
  const user = await requireUser();

  const title = String(formData.get("title") ?? "").trim();
  const dayKey = String(formData.get("day") ?? "");
  const agentId = String(formData.get("agentId") ?? "") || null;

  if (!title) return { error: "Geef de taak een titel." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return { error: "Ongeldige datum." };

  const task = await db.task.create({
    data: {
      title,
      agentId,
      dueAt: fromDayKey(dayKey),
      status: agentId ? "assigned" : "inbox",
      source: "agenda",
      createdByUserId: user.id,
    },
  });

  await db.taskUpdate.create({
    data: {
      taskId: task.id,
      authorType: "user",
      authorUserId: user.id,
      kind: "status",
      body: "Ingepland vanuit de agenda.",
    },
  });

  revalidatePath("/agenda");
  revalidatePath("/taken");
  return { ok: true };
}
