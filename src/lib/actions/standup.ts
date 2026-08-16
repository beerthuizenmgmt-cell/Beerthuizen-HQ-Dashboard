"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { runStandup, summariseMeeting } from "@/lib/standup";

export async function startStandupNow(): Promise<{ ok: boolean; message: string }> {
  await requireUser();

  const result = await runStandup();
  revalidatePath("/overleg");
  revalidatePath("/hq");

  if (result.asked === 0) {
    return {
      ok: false,
      message: result.skipped
        ? `Niemand om te vragen: alle ${result.skipped} agents missen nog een koppeling die berichten kan ontvangen.`
        : "Er is niemand gevraagd — controleer of je agents gekoppeld en actief zijn.",
    };
  }

  const parts = [`${result.asked} agent(s) gevraagd om hun standup.`];
  if (result.failed.length) {
    parts.push(`Niet gelukt bij: ${result.failed.map((entry) => entry.agent).join(", ")}.`);
  }
  if (result.skipped) parts.push(`${result.skipped} nog niet gekoppeld.`);

  return { ok: true, message: parts.join(" ") };
}

export async function refreshSummary(meetingId: string) {
  await requireUser();
  const summary = await summariseMeeting(meetingId);
  await db.meeting.update({ where: { id: meetingId }, data: { summaryMd: summary } });
  revalidatePath("/overleg");
}

export async function closeMeeting(meetingId: string) {
  await requireUser();
  await db.meeting.update({
    where: { id: meetingId },
    data: { status: "closed", closedAt: new Date() },
  });
  revalidatePath("/overleg");
}

/// Maakt van een gemelde blokkade meteen een taak, zodat het overleg iets
/// oplevert in plaats van alleen iets vaststelt.
export async function taskFromBlocker(entryId: string) {
  const user = await requireUser();

  const entry = await db.standupEntry.findUnique({
    where: { id: entryId },
    include: { agent: { select: { id: true, name: true } } },
  });
  if (!entry?.blockers) return;

  const task = await db.task.create({
    data: {
      title: `Blokkade oplossen: ${entry.blockers.slice(0, 80)}`,
      description: `Gemeld door ${entry.agent.name} in het ochtendoverleg.\n\n${entry.blockers}`,
      agentId: entry.agent.id,
      status: "assigned",
      priority: "high",
      source: "standup",
      createdByUserId: user.id,
    },
  });

  await db.taskUpdate.create({
    data: {
      taskId: task.id,
      authorType: "user",
      authorUserId: user.id,
      kind: "status",
      body: "Aangemaakt vanuit het ochtendoverleg.",
    },
  });

  revalidatePath("/overleg");
  revalidatePath("/taken");
}
