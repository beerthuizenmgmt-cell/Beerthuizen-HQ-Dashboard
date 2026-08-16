import "server-only";

import { db } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { logActivity } from "@/lib/agents";
import { meetingDate } from "@/lib/standup";
import { fromDayKey } from "@/lib/format";
import type { ToolDefinition } from "./provider";
import type { TaskPriority } from "@/generated/prisma/enums";
import { remember, isMemoryKind } from "./memory";

// Het gereedschap van de agents. Alles hier werkt binnen het dashboard: geen
// enkel stuk gereedschap doet iets naar buiten. Externe acties lopen via
// vraag_goedkeuring, zodat Enriqueo altijd de laatste stap zet.

export type ToolContext = {
  agentId: string;
  agentName: string;
  isChief: boolean;
};

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: "maak_taak",
    description:
      "Maak een taak aan op het takenbord. Gebruik dit voor werk dat gedaan moet worden — door jezelf, door een collega-agent, of door Enriqueo.",
    parameters: {
      type: "object",
      properties: {
        titel: { type: "string", description: "Korte omschrijving van wat er moet gebeuren" },
        toelichting: { type: "string", description: "Context: waarom, wat is het gewenste resultaat" },
        agent: {
          type: "string",
          description:
            "Sleutel van de agent die het uitvoert: chief, influencer, analytics, research, creative, social, operations, bizdev. Laat leeg als het voor Enriqueo is.",
        },
        prioriteit: { type: "string", enum: ["low", "normal", "high", "urgent"] },
        deadline: { type: "string", description: "Datum als JJJJ-MM-DD, optioneel" },
      },
      required: ["titel"],
    },
  },
  {
    name: "werk_taak_bij",
    description: "Werk een bestaande taak bij: voortgang melden, resultaat vastleggen of de status wijzigen.",
    parameters: {
      type: "object",
      properties: {
        taak_id: { type: "string" },
        bericht: { type: "string", description: "Wat je gedaan hebt of waar je staat" },
        status: { type: "string", enum: ["in_progress", "blocked", "review", "done"] },
      },
      required: ["taak_id", "bericht"],
    },
  },
  {
    name: "rapporteer_in_kanaal",
    description:
      "Plaats een bericht in een teamkanaal zodat het team en Enriqueo meelezen. Kanalen: algemeen, campagnes, resultaten.",
    parameters: {
      type: "object",
      properties: {
        kanaal: { type: "string", enum: ["algemeen", "campagnes", "resultaten"] },
        bericht: { type: "string" },
      },
      required: ["kanaal", "bericht"],
    },
  },
  {
    name: "vraag_aan_enriqueo",
    description:
      "Zet een vraag klaar voor de ochtendcall. Gebruik dit voor keuzes, prioriteiten of akkoord waar je zijn oordeel voor nodig hebt maar wat niet vandaag hoeft.",
    parameters: {
      type: "object",
      properties: { vraag: { type: "string" } },
      required: ["vraag"],
    },
  },
  {
    name: "vraag_goedkeuring",
    description:
      "Bied een volledig voorbereide externe, financiële of reputatiegevoelige actie ter goedkeuring aan. Verplicht voor: klanten of influencers berichten, geld uitgeven, budgetten wijzigen, publiceren, toezeggingen doen. Bereid het zo compleet voor dat Enriqueo alleen ja of nee hoeft te zeggen.",
    parameters: {
      type: "object",
      properties: {
        soort: {
          type: "string",
          enum: ["email_send", "external_message", "budget", "publish", "system_change", "other"],
        },
        titel: { type: "string", description: "Waar gaat het om, in één regel" },
        onderbouwing: { type: "string", description: "Waarom dit nodig is en wat het oplevert" },
        actie: {
          type: "object",
          description:
            "De volledig uitgewerkte actie. Bijvoorbeeld ontvanger, onderwerp en de complete tekst, of het exacte bedrag en waar het heen gaat.",
        },
      },
      required: ["soort", "titel", "onderbouwing", "actie"],
    },
  },
  {
    name: "noteer_bevinding",
    description:
      "Leg een bevinding vast in de activiteitenfeed: iets wat opvalt, een risico, een kans. Gebruik dit om zichtbaar te maken wat je hebt gezien zonder er meteen een taak van te maken.",
    parameters: {
      type: "object",
      properties: {
        bevinding: { type: "string" },
        urgentie: { type: "string", enum: ["info", "warn", "error", "success"] },
      },
      required: ["bevinding"],
    },
  },
  {
    name: "onthoud",
    description:
      "Leg iets vast dat je later opnieuw nodig hebt: een besluit van Enriqueo en de reden erachter, een voorkeur, een vaste afspraak of een leerpunt. Dit gaat mee in al je volgende denkbeurten. Gebruik het niet voor gegevens die al in het dashboard staan — taken, cijfers en activiteiten kun je gewoon opzoeken.",
    parameters: {
      type: "object",
      properties: {
        soort: {
          type: "string",
          enum: ["besluit", "voorkeur", "afspraak", "leerpunt", "context"],
        },
        titel: { type: "string", description: "Waar het over gaat, in een paar woorden" },
        inhoud: { type: "string", description: "Wat je precies onthoudt, inclusief het waarom" },
        vastzetten: {
          type: "boolean",
          description: "Waar voor iets dat altijd mee moet, ook als je geheugen langer wordt",
        },
      },
      required: ["soort", "titel", "inhoud"],
    },
  },
];

/// Alleen de Head of Operations kan collega's aan het werk zetten; zo blijft de
/// aansturing op één plek en wordt het geen wirwar van agents die elkaar
/// opdrachten geven.
export const CHIEF_TOOLS: ToolDefinition[] = [
  {
    name: "vraag_agent",
    description:
      "Stel een vraag aan een van je agents of geef hem een opdracht. Hij denkt na en antwoordt je meteen.",
    parameters: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description: "Sleutel: influencer, analytics, research, creative, social, operations, bizdev",
        },
        vraag: { type: "string" },
      },
      required: ["agent", "vraag"],
    },
  },
];

const PRIORITIES: TaskPriority[] = ["low", "normal", "high", "urgent"];

export type ToolResult = { ok: boolean; message: string };

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "maak_taak":
        return await makeTask(args, context);
      case "werk_taak_bij":
        return await updateTask(args, context);
      case "rapporteer_in_kanaal":
        return await reportInChannel(args, context);
      case "vraag_aan_enriqueo":
        return await askFounder(args, context);
      case "vraag_goedkeuring":
        return await requestApproval(args, context);
      case "noteer_bevinding":
        return await noteFinding(args, context);
      case "onthoud":
        return await rememberThis(args, context);
      default:
        return { ok: false, message: `Onbekend gereedschap: ${name}` };
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "onbekende fout" };
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function makeTask(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  const title = text(args.titel);
  if (!title) return { ok: false, message: "titel is verplicht" };

  const agentKey = text(args.agent);
  const assignee = agentKey ? await db.agent.findUnique({ where: { key: agentKey } }) : null;
  if (agentKey && !assignee) return { ok: false, message: `Onbekende agent: ${agentKey}` };

  const priority = text(args.prioriteit);
  const deadline = text(args.deadline);

  const task = await db.task.create({
    data: {
      title: title.slice(0, 200),
      description: text(args.toelichting) || null,
      agentId: assignee?.id ?? null,
      priority: (PRIORITIES as string[]).includes(priority) ? (priority as TaskPriority) : "normal",
      dueAt: /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? fromDayKey(deadline) : null,
      status: assignee ? "assigned" : "inbox",
      source: "agent",
      createdByAgentId: context.agentId,
    },
  });

  await db.taskUpdate.create({
    data: {
      taskId: task.id,
      authorType: "agent",
      authorAgentId: context.agentId,
      kind: "status",
      body: `Aangemaakt door ${context.agentName}.`,
    },
  });

  return {
    ok: true,
    message: `Taak aangemaakt (id ${task.id})${assignee ? ` voor ${assignee.name}` : " in de inbox"}.`,
  };
}

async function updateTask(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  const taskId = text(args.taak_id);
  const body = text(args.bericht);
  if (!taskId || !body) return { ok: false, message: "taak_id en bericht zijn verplicht" };

  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) return { ok: false, message: "Die taak bestaat niet." };

  const status = text(args.status);
  const allowed = ["in_progress", "blocked", "review", "done"];

  await db.taskUpdate.create({
    data: {
      taskId,
      authorType: "agent",
      authorAgentId: context.agentId,
      kind: status === "done" ? "result" : "comment",
      body,
    },
  });

  if (allowed.includes(status)) {
    await db.task.update({
      where: { id: taskId },
      data: {
        status: status as "in_progress" | "blocked" | "review" | "done",
        result: status === "done" ? body : task.result,
        completedAt: status === "done" ? new Date() : null,
      },
    });

    if (status === "blocked" || status === "done") {
      await notify({
        level: status === "blocked" ? "warn" : "success",
        title:
          status === "done"
            ? `${context.agentName} rondde "${task.title}" af`
            : `${context.agentName} loopt vast op "${task.title}"`,
        body: body.slice(0, 200),
        link: `/taken/${taskId}`,
        agentId: context.agentId,
        push: status === "blocked",
      });
    }
  }

  return { ok: true, message: "Taak bijgewerkt." };
}

async function reportInChannel(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  const channelKey = text(args.kanaal) || "algemeen";
  const body = text(args.bericht);
  if (!body) return { ok: false, message: "bericht is verplicht" };

  const channel = await db.channel.findUnique({ where: { key: channelKey } });
  if (!channel) return { ok: false, message: `Onbekend kanaal: ${channelKey}` };

  await db.message.create({
    data: {
      channelId: channel.id,
      fromType: "agent",
      fromAgentId: context.agentId,
      body,
      delivery: "delivered",
    },
  });

  return { ok: true, message: `Geplaatst in #${channel.key}.` };
}

async function askFounder(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  const question = text(args.vraag);
  if (!question) return { ok: false, message: "vraag is verplicht" };

  const date = meetingDate();
  const meeting = await db.meeting.upsert({
    where: { date },
    update: {},
    create: { date, status: "collecting" },
  });

  const offset = await db.meetingQuestion.count({ where: { meetingId: meeting.id } });
  await db.meetingQuestion.create({
    data: { meetingId: meeting.id, agentId: context.agentId, body: question, sortOrder: offset },
  });

  return { ok: true, message: "Staat klaar voor de ochtendcall." };
}

async function requestApproval(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  const title = text(args.titel);
  const summary = text(args.onderbouwing);
  if (!title || !summary) return { ok: false, message: "titel en onderbouwing zijn verplicht" };

  const kinds = ["email_send", "external_message", "budget", "publish", "system_change", "other"];
  const kind = text(args.soort);

  const approval = await db.approval.create({
    data: {
      agentId: context.agentId,
      kind: kinds.includes(kind) ? kind : "other",
      title: title.slice(0, 200),
      summary,
      payload: (args.actie ?? {}) as object,
    },
  });

  await notify({
    level: "warn",
    title: `${context.agentName} vraagt akkoord: ${title}`,
    body: summary.slice(0, 200),
    link: `/goedkeuringen`,
    agentId: context.agentId,
    push: true,
  });

  await logActivity({
    agentId: context.agentId,
    kind: "goedkeuring_gevraagd",
    level: "warn",
    message: `${context.agentName} vraagt akkoord: ${title}`,
  });

  return {
    ok: true,
    message: `Ter goedkeuring aangeboden (id ${approval.id}). Voer de actie niet uit; wacht op akkoord van Enriqueo.`,
  };
}

async function noteFinding(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  const finding = text(args.bevinding);
  if (!finding) return { ok: false, message: "bevinding is verplicht" };

  const levels = ["info", "warn", "error", "success"];
  const level = text(args.urgentie);

  await logActivity({
    agentId: context.agentId,
    kind: "bevinding",
    level: (levels.includes(level) ? level : "info") as "info" | "warn" | "error" | "success",
    message: finding.slice(0, 500),
  });

  return { ok: true, message: "Vastgelegd in de activiteitenfeed." };
}

async function rememberThis(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  const title = text(args.titel);
  const body = text(args.inhoud);
  if (!title || !body) return { ok: false, message: "titel en inhoud zijn verplicht" };

  const kind = text(args.soort);
  if (!isMemoryKind(kind)) {
    return { ok: false, message: "soort moet besluit, voorkeur, afspraak, leerpunt of context zijn" };
  }

  const { created } = await remember({
    agentId: context.agentId,
    kind,
    title,
    body,
    source: "agent",
    pinned: args.vastzetten === true,
  });

  return {
    ok: true,
    message: created
      ? "Onthouden. Dit gaat mee in je volgende denkbeurten."
      : "Je wist dit al; ik heb het bijgewerkt met de nieuwe inhoud.",
  };
}
