"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { sendToAgent, logActivity } from "@/lib/agents";
import { buildTaskBrief } from "@/lib/orchestrator";
import { notify } from "@/lib/notifications";
import type { TaskPriority, TaskStatus } from "@/generated/prisma/enums";

const PRIORITIES: TaskPriority[] = ["low", "normal", "high", "urgent"];
const STATUSES: TaskStatus[] = ["inbox", "assigned", "in_progress", "blocked", "review", "done", "cancelled"];

export type TaskState = { error?: string; ok?: string };

function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/// Elke agent krijgt bij zijn eerste taak een eigen terugpraat-token.
async function ensureInboundToken(agentId: string): Promise<string> {
  const agent = await db.agent.findUnique({ where: { id: agentId }, select: { inboundToken: true } });
  if (agent?.inboundToken) return agent.inboundToken;

  const token = `at_${randomToken(24)}`;
  await db.agent.update({ where: { id: agentId }, data: { inboundToken: token } });
  return token;
}

export async function createTask(_prev: TaskState, formData: FormData): Promise<TaskState> {
  const user = await requireUser();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Geef de taak een titel." };

  const description = String(formData.get("description") ?? "").trim();
  const agentId = String(formData.get("agentId") ?? "") || null;
  const rawPriority = String(formData.get("priority") ?? "normal");
  const dueRaw = String(formData.get("dueAt") ?? "").trim();
  const dispatchNow = formData.get("dispatch") === "on";

  const priority = (PRIORITIES as string[]).includes(rawPriority) ? (rawPriority as TaskPriority) : "normal";
  const dueAt = dueRaw ? new Date(dueRaw) : null;

  const task = await db.task.create({
    data: {
      title,
      description: description || null,
      agentId,
      priority,
      dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null,
      status: agentId ? "assigned" : "inbox",
      createdByUserId: user.id,
      source: "manual",
    },
  });

  await db.taskUpdate.create({
    data: {
      taskId: task.id,
      authorType: "user",
      authorUserId: user.id,
      kind: "status",
      body: agentId ? "Taak aangemaakt en toegewezen." : "Taak aangemaakt in de inbox.",
    },
  });

  if (agentId && dispatchNow) {
    const result = await dispatchTask(task.id);
    revalidatePath("/taken");
    return result.ok ? { ok: "Taak aangemaakt en verstuurd." } : { error: result.error };
  }

  revalidatePath("/taken");
  revalidatePath("/hq");
  return { ok: "Taak aangemaakt." };
}

export async function dispatchTask(taskId: string): Promise<{ ok: boolean; error?: string }> {
  await requireUser();

  const task = await db.task.findUnique({ where: { id: taskId }, include: { agent: true } });
  if (!task) return { ok: false, error: "Taak bestaat niet meer." };
  if (!task.agent) return { ok: false, error: "Wijs de taak eerst aan een agent toe." };

  const token = await ensureInboundToken(task.agent.id);
  const brief = buildTaskBrief(task, `${appUrl()}/api/agents/${task.agent.id}/reply`, token);

  const result = await sendToAgent(task.agent.id, brief);

  await db.taskUpdate.create({
    data: {
      taskId: task.id,
      authorType: "system",
      kind: result.ok ? "dispatch" : "error",
      body: result.ok
        ? `Opdracht verstuurd naar ${task.agent.name}.`
        : `Versturen naar ${task.agent.name} mislukt: ${result.error}`,
    },
  });

  if (result.ok) {
    await db.task.update({
      where: { id: task.id },
      data: { dispatchedAt: new Date(), status: task.status === "assigned" ? "in_progress" : task.status },
    });
    await logActivity({
      agentId: task.agent.id,
      kind: "taak_verstuurd",
      level: "info",
      message: `Taak "${task.title}" uitbesteed aan ${task.agent.name}`,
    });
  } else {
    await notify({
      level: "warn",
      title: `Taak kon niet naar ${task.agent.name}`,
      body: result.error,
      link: `/taken/${task.id}`,
      agentId: task.agent.id,
      push: true,
    });
  }

  revalidatePath("/taken");
  revalidatePath(`/taken/${task.id}`);
  return { ok: result.ok, error: result.error };
}

export async function setTaskStatus(taskId: string, status: string) {
  const user = await requireUser();
  if (!(STATUSES as string[]).includes(status)) return;

  const next = status as TaskStatus;
  await db.task.update({
    where: { id: taskId },
    data: { status: next, completedAt: next === "done" ? new Date() : null },
  });
  await db.taskUpdate.create({
    data: {
      taskId,
      authorType: "user",
      authorUserId: user.id,
      kind: "status",
      body: `Status gewijzigd naar ${next}.`,
    },
  });

  revalidatePath("/taken");
  revalidatePath(`/taken/${taskId}`);
  revalidatePath("/hq");
}

export async function assignTask(taskId: string, agentId: string) {
  const user = await requireUser();
  const task = await db.task.findUnique({ where: { id: taskId }, select: { status: true } });
  if (!task) return;

  const agent = await db.agent.findUnique({ where: { id: agentId }, select: { name: true } });

  await db.task.update({
    where: { id: taskId },
    data: { agentId, status: task.status === "inbox" ? "assigned" : task.status },
  });
  await db.taskUpdate.create({
    data: {
      taskId,
      authorType: "user",
      authorUserId: user.id,
      kind: "status",
      body: `Toegewezen aan ${agent?.name ?? "een agent"}.`,
    },
  });

  revalidatePath("/taken");
  revalidatePath(`/taken/${taskId}`);
}

export async function addTaskComment(_prev: TaskState, formData: FormData): Promise<TaskState> {
  const user = await requireUser();

  const taskId = String(formData.get("taskId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!taskId || !body) return { error: "Schrijf eerst iets." };

  await db.taskUpdate.create({
    data: { taskId, authorType: "user", authorUserId: user.id, kind: "comment", body },
  });

  revalidatePath(`/taken/${taskId}`);
  return { ok: "Toegevoegd." };
}
