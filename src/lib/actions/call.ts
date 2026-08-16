"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { sendToAgent, logActivity } from "@/lib/agents";
import { meetingDate, summariseMeeting } from "@/lib/standup";

/// Markeert dat je de call bent binnengesprongen. Puur voor de vastlegging —
/// zo zie je later of het overleg echt gehouden is.
export async function startCall() {
  await requireUser();

  const meeting = await db.meeting.findUnique({ where: { date: meetingDate() } });
  if (!meeting) return;

  if (!meeting.callStartedAt) {
    await db.meeting.update({ where: { id: meeting.id }, data: { callStartedAt: new Date() } });
  }
  revalidatePath("/overleg/call");
}

/// Jouw antwoord op één vraag. Gaat meteen terug naar de agent die hem stelde,
/// want een antwoord dat alleen in het dashboard blijft staan helpt hem niet.
export async function answerQuestion(
  questionId: string,
  answer: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();

  const text = answer.trim();
  if (!text) return { ok: false, error: "Er is nog geen antwoord om te versturen." };

  const question = await db.meetingQuestion.findUnique({
    where: { id: questionId },
    include: { agent: { select: { id: true, name: true } } },
  });
  if (!question) return { ok: false, error: "Deze vraag bestaat niet meer." };

  const result = await sendToAgent(
    question.agent.id,
    [
      `Antwoord uit het ochtendoverleg van BHMGMT.`,
      ``,
      `Jouw vraag: ${question.body}`,
      `Antwoord van Beerthuizen: ${text}`,
    ].join("\n"),
  );

  await db.meetingQuestion.update({
    where: { id: question.id },
    data: {
      answer: text,
      answeredAt: new Date(),
      deliveredAt: result.ok ? new Date() : null,
      deliveryError: result.ok ? null : result.error,
    },
  });

  revalidatePath("/overleg/call");
  revalidatePath("/overleg");

  // Het antwoord staat vast, ook als bezorgen mislukte — je hoeft het niet
  // opnieuw in te spreken, alleen de koppeling te repareren.
  return result.ok
    ? { ok: true }
    : { ok: false, error: `Vastgelegd, maar niet bezorgd bij ${question.agent.name}: ${result.error}` };
}

export async function skipQuestion(questionId: string) {
  await requireUser();
  await db.meetingQuestion.update({ where: { id: questionId }, data: { skippedAt: new Date() } });
  revalidatePath("/overleg/call");
}

export async function reopenQuestion(questionId: string) {
  await requireUser();
  await db.meetingQuestion.update({
    where: { id: questionId },
    data: { skippedAt: null, answeredAt: null, answer: null },
  });
  revalidatePath("/overleg/call");
}

/// Iets wat tijdens de call besloten wordt, meteen als taak vastleggen.
export async function taskFromCall(
  agentId: string,
  title: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();

  const trimmed = title.trim();
  if (!trimmed) return { ok: false, error: "Geef de taak een omschrijving." };

  const task = await db.task.create({
    data: {
      title: trimmed.slice(0, 120),
      description: trimmed.length > 120 ? trimmed : null,
      agentId,
      status: "assigned",
      priority: "normal",
      source: "call",
      createdByUserId: user.id,
    },
  });

  await db.taskUpdate.create({
    data: {
      taskId: task.id,
      authorType: "user",
      authorUserId: user.id,
      kind: "status",
      body: "Afgesproken tijdens de ochtendcall.",
    },
  });

  revalidatePath("/overleg/call");
  revalidatePath("/taken");
  return { ok: true };
}

export async function endCall() {
  await requireUser();

  const meeting = await db.meeting.findUnique({ where: { date: meetingDate() } });
  if (!meeting) return;

  const summary = await summariseMeeting(meeting.id);
  await db.meeting.update({
    where: { id: meeting.id },
    data: { callEndedAt: new Date(), status: "closed", closedAt: new Date(), summaryMd: summary },
  });

  const answered = await db.meetingQuestion.count({
    where: { meetingId: meeting.id, answeredAt: { not: null } },
  });

  await logActivity({
    kind: "call_afgerond",
    level: "success",
    message: `Ochtendcall afgerond · ${answered} vragen beantwoord`,
  });

  revalidatePath("/overleg");
  revalidatePath("/overleg/call");
  revalidatePath("/hq");
}
