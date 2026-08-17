"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
// Niemand beslist namens Enriqueo over externe acties of uitgaven.
import { requireOwner } from "@/lib/access";
import { logActivity } from "@/lib/agents";
import { sendTelegram } from "@/lib/telegram";

// Goedkeuringen. Een agent bereidt een externe, financiële of
// reputatiegevoelige actie volledig voor en biedt hem hier aan; Enriqueo
// beslist.
//
// Belangrijk en bewust: goedkeuren voert de actie hier niet uit. Er is nog geen
// koppeling die namens het bureau kan mailen of publiceren. Akkoord betekent dat
// de agent groen licht heeft, en dat wordt vastgelegd als taak zodat het niet
// verdwijnt. Zodra er wél een koppeling is, voert die het uit.

export type DecisionResult = { ok: boolean; message: string };

/// Jouw correctie is de leerstof van de agent.
///
/// Zonder dit krijg je dezelfde fout elke week opnieuw voorgelegd: de agent
/// weet dat dit verzoek is afgewezen, maar niet waarom, en dus ook niet wat
/// hij de volgende keer anders moet doen. Met dit staat je opmerking bij zijn
/// volgende denkbeurt in zijn geheugen.
async function leerVanBeslissing(
  agentId: string,
  titel: string,
  opmerking: string,
  besluit: "goedgekeurd" | "afgewezen",
): Promise<void> {
  const tekst = opmerking.trim();
  if (!tekst) return;

  const { remember } = await import("@/lib/ai/memory");
  await remember({
    agentId,
    kind: "leerpunt",
    title: `${besluit === "afgewezen" ? "Afgewezen" : "Bijgestuurd"}: ${titel}`.slice(0, 200),
    body: `Enriqueo zei hierover: "${tekst}" — houd hier voortaan rekening mee.`,
    source: "user",
  });
}

export async function approveRequest(approvalId: string, note: string): Promise<DecisionResult> {
  const user = await requireOwner();

  const approval = await db.approval.findUnique({
    where: { id: approvalId },
    include: { agent: { select: { id: true, name: true } } },
  });
  if (!approval) return { ok: false, message: "Dit verzoek bestaat niet meer." };
  if (approval.status !== "pending") return { ok: false, message: "Hier is al over beslist." };

  // Het akkoord wordt een taak voor de agent die het vroeg, zodat er iets
  // tastbaars overblijft in plaats van alleen een vinkje.
  const task = await db.task.create({
    data: {
      title: `Uitvoeren na akkoord: ${approval.title}`.slice(0, 200),
      description: [
        approval.summary,
        "",
        "Enriqueo gaf akkoord" + (note.trim() ? ` met de opmerking: ${note.trim()}` : "."),
        "",
        "De voorbereide actie:",
        JSON.stringify(approval.payload, null, 2),
      ].join("\n"),
      agentId: approval.agent.id,
      status: "assigned",
      priority: "high",
      source: "approval",
      createdByUserId: user.id,
    },
  });

  await db.approval.update({
    where: { id: approvalId },
    data: {
      status: "approved",
      decisionNote: note.trim() || null,
      decidedAt: new Date(),
      decidedByUserId: user.id,
      linkedTaskId: task.id,
    },
  });

  await logActivity({
    agentId: approval.agent.id,
    kind: "goedkeuring_verleend",
    level: "success",
    message: `Akkoord gegeven: ${approval.title}`,
  });

  await leerVanBeslissing(approval.agent.id, approval.title, note, "goedgekeurd");

  await sendTelegram(
    `✅ *Akkoord gegeven*\n${approval.title}\n\n${approval.agent.name} kan door.${note.trim() ? `\n\nJouw opmerking: ${note.trim()}` : ""}`,
  );

  revalidatePath("/goedkeuringen");
  revalidatePath("/taken");
  revalidatePath("/hq");

  return {
    ok: true,
    message: `Akkoord vastgelegd en als taak bij ${approval.agent.name} gezet.`,
  };
}

export async function rejectRequest(approvalId: string, note: string): Promise<DecisionResult> {
  const user = await requireOwner();

  const approval = await db.approval.findUnique({
    where: { id: approvalId },
    include: { agent: { select: { id: true, name: true } } },
  });
  if (!approval) return { ok: false, message: "Dit verzoek bestaat niet meer." };
  if (approval.status !== "pending") return { ok: false, message: "Hier is al over beslist." };

  await db.approval.update({
    where: { id: approvalId },
    data: {
      status: "rejected",
      decisionNote: note.trim() || null,
      decidedAt: new Date(),
      decidedByUserId: user.id,
    },
  });

  await leerVanBeslissing(approval.agent.id, approval.title, note, "afgewezen");

  // De agent moet weten waaróm, anders komt hetzelfde verzoek morgen terug.
  await db.message.create({
    data: {
      channelId: (await db.channel.findUniqueOrThrow({ where: { agentId: approval.agent.id } })).id,
      fromType: "user",
      fromUserId: user.id,
      toAgentId: approval.agent.id,
      body: `Ik doe "${approval.title}" niet.${note.trim() ? ` ${note.trim()}` : ""}`,
      delivery: "local",
    },
  });

  await logActivity({
    agentId: approval.agent.id,
    kind: "goedkeuring_geweigerd",
    level: "warn",
    message: `Afgewezen: ${approval.title}`,
  });

  revalidatePath("/goedkeuringen");
  return { ok: true, message: `Afgewezen. ${approval.agent.name} krijgt je uitleg te zien.` };
}
