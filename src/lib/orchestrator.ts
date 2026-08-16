import "server-only";

import { db } from "./db";
import { sendToAgent, logActivity } from "./agents";
import { notify } from "./notifications";
import { formatDate } from "./format";
import type { ActorType } from "@/generated/prisma/enums";

/// Elk bericht in het team loopt hier langs: van jou naar een agent, en van
/// agent naar agent. Zo staat álles in een kanaal en kun je meelezen, ook
/// wanneer twee agents onderling werk doorgeven.

export type PostMessageInput = {
  channelId: string;
  fromType: ActorType;
  fromUserId?: string;
  fromAgentId?: string;
  body: string;
  /// Expliciet gericht aan één agent. Bij een DM-kanaal wordt dit automatisch
  /// ingevuld met de agent van dat kanaal.
  toAgentId?: string;
};

/// Vindt @mentions en zet ze om naar agent-ID's. Namen met spaties matchen ook,
/// want "@Research Agent" is natuurlijker dan "@research".
export async function resolveMentions(body: string): Promise<{ ids: string[]; keys: string[] }> {
  const agents = await db.agent.findMany({ select: { id: true, key: true, name: true } });
  const lowered = body.toLowerCase();

  const ids: string[] = [];
  const keys: string[] = [];
  for (const agent of agents) {
    const candidates = [agent.key, agent.name].map((value) => `@${value.toLowerCase()}`);
    if (candidates.some((candidate) => lowered.includes(candidate))) {
      ids.push(agent.id);
      keys.push(agent.key);
    }
  }
  return { ids, keys };
}

export async function postMessage(input: PostMessageInput) {
  const channel = await db.channel.findUnique({
    where: { id: input.channelId },
    include: { agent: { select: { id: true, name: true } } },
  });
  if (!channel) throw new Error("Kanaal bestaat niet.");

  const mentions = await resolveMentions(input.body);

  // In een DM is de ontvanger vanzelfsprekend; in een teamkanaal bepalen de
  // mentions wie er daadwerkelijk iets in zijn inbox krijgt.
  const explicitTarget = input.toAgentId ?? channel.agentId ?? null;
  const recipients = explicitTarget ? [explicitTarget] : mentions.ids;

  const message = await db.message.create({
    data: {
      channelId: channel.id,
      fromType: input.fromType,
      fromUserId: input.fromUserId ?? null,
      fromAgentId: input.fromAgentId ?? null,
      toAgentId: explicitTarget,
      body: input.body,
      mentions: mentions.keys,
      delivery: recipients.length ? "pending" : "local",
    },
  });

  if (recipients.length === 0) return message;

  const sender = input.fromAgentId
    ? await db.agent.findUnique({ where: { id: input.fromAgentId }, select: { name: true } })
    : null;
  const prefix = sender ? `[${sender.name} · #${channel.key}]` : `[#${channel.key}]`;

  const results = await Promise.all(
    recipients
      // Een agent hoeft zijn eigen bericht niet terug te krijgen.
      .filter((agentId) => agentId !== input.fromAgentId)
      .map(async (agentId) => ({ agentId, result: await sendToAgent(agentId, `${prefix} ${input.body}`) })),
  );

  const failed = results.filter((entry) => !entry.result.ok);

  await db.message.update({
    where: { id: message.id },
    data: {
      delivery: failed.length === 0 ? "sent" : results.length === failed.length ? "failed" : "sent",
      deliveryError: failed.length ? failed.map((entry) => entry.result.error).join(" · ") : null,
    },
  });

  // Agent-naar-agent verkeer is precies wat je wilt kunnen volgen, dus dat
  // krijgt een eigen regel in de activiteitenfeed.
  if (input.fromAgentId) {
    await logActivity({
      agentId: input.fromAgentId,
      kind: "agent_bericht",
      level: failed.length ? "warn" : "info",
      message: `${sender?.name ?? "Een agent"} stuurde een bericht in #${channel.key}`,
    });
  }

  return message;
}

/// Zet een taak om in een opdracht die een agent kan begrijpen. Bewust
/// expliciet over terugkoppelen, anders krijg je nooit een resultaat terug.
export function buildTaskBrief(task: {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  dueAt: Date | null;
}, replyUrl: string, inboundToken: string): string {
  const lines = [
    `Nieuwe taak van BHMGMT HQ: ${task.title}`,
    task.description ? `\n${task.description}` : "",
    `\nPrioriteit: ${task.priority}`,
    task.dueAt ? `Deadline: ${formatDate(task.dueAt)}` : "",
    `\nAls je klaar bent, meld je resultaat terug:`,
    `POST ${replyUrl}`,
    `Header: Authorization: Bearer ${inboundToken}`,
    `Body: {"taskId": "${task.id}", "status": "done", "message": "wat je gedaan hebt"}`,
    `\nLoop je vast, gebruik dan status "blocked" met uitleg.`,
  ];
  return lines.filter(Boolean).join("\n");
}

/// Meldt jou dat er iets van een agent binnenkwam.
export async function notifyIncoming(agentName: string, summary: string, link: string) {
  await notify({
    level: "info",
    title: `${agentName} heeft gereageerd`,
    body: summary.slice(0, 200),
    link,
    push: false,
  });
}
