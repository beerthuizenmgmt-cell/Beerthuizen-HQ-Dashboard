import "server-only";

import { db } from "@/lib/db";
import { runAgent } from "./run";
import { notify } from "./../notifications";
import { formatDayLong } from "@/lib/format";

// Het ochtendrapport van de Head of Operations.
//
// Hij begint altijd met dezelfde vraag: is er iets nieuws sinds mijn vorige
// rapport? Zo niet, dan gebruikt hij wat er al ligt en doet hij géén nieuwe
// AI-aanroep. Een rapport dat elke dag "geen bijzonderheden" concludeert mag
// niet elke dag opnieuw geld kosten.

const LAST_REPORT_KEY = "last_head_report";

type Delta = {
  since: Date | null;
  insights: { agent: string; title: string; body: string; relevance: string }[];
  changedTasks: { title: string; status: string; agent: string | null }[];
  alerts: { message: string; level: string }[];
  approvals: { agent: string; title: string; summary: string }[];
  openQuestions: number;
  unanalysedChanges: { label: string; reason: string }[];
};

async function lastReportAt(): Promise<Date | null> {
  const setting = await db.setting.findUnique({ where: { key: LAST_REPORT_KEY } });
  const value = (setting?.value as { at?: string } | undefined)?.at;
  return value ? new Date(value) : null;
}

export async function collectDelta(): Promise<Delta> {
  const since = await lastReportAt();
  const window = since ?? new Date(Date.now() - 24 * 60 * 60_000);

  const [insights, changedTasks, alerts, approvals, openQuestions, watches] = await Promise.all([
    db.agentInsight.findMany({
      where: { reportedAt: null },
      orderBy: [{ relevance: "desc" }, { createdAt: "desc" }],
      take: 20,
      include: { agent: { select: { name: true } } },
    }),
    db.task.findMany({
      where: { updatedAt: { gte: window }, status: { not: "cancelled" } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: { agent: { select: { name: true } } },
    }),
    db.activityEvent.findMany({
      where: { occurredAt: { gte: window }, level: { in: ["warn", "error"] } },
      orderBy: { occurredAt: "desc" },
      take: 15,
      select: { message: true, level: true },
    }),
    db.approval.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      include: { agent: { select: { name: true } } },
    }),
    db.meetingQuestion.count({ where: { answeredAt: null, skippedAt: null } }),
    db.agentWatch.findMany({
      where: { active: true },
      select: { label: true, dataHash: true, analyzedHash: true, lastReason: true },
    }),
  ]);

  return {
    since,
    insights: insights.map((insight) => ({
      agent: insight.agent.name,
      title: insight.title,
      body: insight.body,
      relevance: insight.relevance,
    })),
    changedTasks: changedTasks.map((task) => ({
      title: task.title,
      status: task.status,
      agent: task.agent?.name ?? null,
    })),
    alerts: alerts.map((alert) => ({ message: alert.message, level: alert.level })),
    approvals: approvals.map((approval) => ({
      agent: approval.agent.name,
      title: approval.title,
      summary: approval.summary,
    })),
    openQuestions,
    unanalysedChanges: watches
      .filter((watch) => watch.dataHash && watch.dataHash !== watch.analyzedHash)
      .map((watch) => ({ label: watch.label, reason: watch.lastReason ?? "gewijzigd" })),
  };
}

function isEmpty(delta: Delta): boolean {
  return (
    delta.insights.length === 0 &&
    delta.changedTasks.length === 0 &&
    delta.alerts.length === 0 &&
    delta.approvals.length === 0 &&
    delta.openQuestions === 0 &&
    delta.unanalysedChanges.length === 0
  );
}

export type HeadReport = {
  text: string;
  usedAi: boolean;
  reason: string;
};

/// Bouwt het ochtendrapport. Geeft ook terug óf er een AI-aanroep voor nodig
/// was, zodat je in het dashboard ziet wanneer er wél en niet betaald is.
export async function buildMorningReport(): Promise<HeadReport> {
  const chief = await db.agent.findFirst({ where: { isChief: true } });
  if (!chief) return { text: "Er is geen Head of Operations ingesteld.", usedAi: false, reason: "geen chief" };

  const delta = await collectDelta();

  if (isEmpty(delta)) {
    // Niets nieuws: geen aanroep, geen kosten.
    const text = [
      `Goedemorgen. ${formatDayLong(new Date())}.`,
      ``,
      `Er is niets veranderd sinds mijn vorige rapport: geen nieuwe inzichten, geen`,
      `gewijzigde taken, geen alerts en geen openstaande goedkeuringen.`,
      ``,
      `Ik heb hier geen analyse voor laten draaien — dat zou alleen geld kosten.`,
    ].join("\n");

    await recordReport(text, false);
    return { text, usedAi: false, reason: "niets nieuws sinds het vorige rapport" };
  }

  const briefing = [
    `Maak het ochtendrapport voor Enriqueo. Dit is alles wat er is veranderd sinds`,
    delta.since ? `je vorige rapport van ${delta.since.toLocaleString("nl-NL")}.` : `gisteren.`,
    ``,
    section("Nieuwe inzichten van je agents", delta.insights.map((insight) =>
      `- [${insight.relevance}] ${insight.agent}: ${insight.title}\n  ${insight.body.slice(0, 400)}`,
    )),
    section("Taken die veranderden", delta.changedTasks.map((task) =>
      `- ${task.title} → ${task.status}${task.agent ? ` (${task.agent})` : ""}`,
    )),
    section("Waarschuwingen", delta.alerts.map((alert) => `- [${alert.level}] ${alert.message}`)),
    section("Wachten op jouw akkoord", delta.approvals.map((approval) =>
      `- ${approval.agent}: ${approval.title} — ${approval.summary.slice(0, 200)}`,
    )),
    delta.openQuestions > 0 ? `\n${delta.openQuestions} vragen staan klaar voor de ochtendcall.` : "",
    section("Gewijzigde data die nog niet geanalyseerd is", delta.unanalysedChanges.map((change) =>
      `- ${change.label}: ${change.reason}`,
    )),
    ``,
    `Schrijf geen opsomming van wat er staat — dat kan Enriqueo zelf lezen. Schrijf`,
    `wat het betekent. Houd de vorm aan die in je werkinstructies staat: vandaag,`,
    `aandacht, agents, van jou nodig, en maximaal drie prioriteiten. Kort en`,
    `actiegericht; is er weinig te melden, dan is het rapport kort. Dat is beter`,
    `dan kunstmatige drukte.`,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await runAgent({
    agentId: chief.id,
    input: briefing,
    trigger: "chief_cycle",
    reason: "nieuwe gebeurtenissen sinds het vorige rapport",
    gereedschap: "geen",
  });

  if (!result.ok) {
    return {
      text: `Het rapport kon niet gemaakt worden: ${result.error}`,
      usedAi: false,
      reason: result.error ?? "fout",
    };
  }

  await recordReport(result.text, true);

  await db.agentInsight.updateMany({
    where: { reportedAt: null },
    data: { reportedAt: new Date() },
  });

  return {
    text: result.text,
    usedAi: true,
    reason: `${delta.insights.length} inzichten, ${delta.changedTasks.length} taakwijzigingen, ${delta.alerts.length} waarschuwingen`,
  };
}

function section(title: string, lines: string[]): string {
  if (lines.length === 0) return "";
  return `\n## ${title}\n${lines.join("\n")}`;
}

async function recordReport(text: string, usedAi: boolean): Promise<void> {
  await db.setting.upsert({
    where: { key: LAST_REPORT_KEY },
    update: { value: { at: new Date().toISOString(), text, usedAi } },
    create: { key: LAST_REPORT_KEY, value: { at: new Date().toISOString(), text, usedAi } },
  });

  await notify({
    level: "info",
    title: "Ochtendrapport van de Head of Operations",
    body: text.slice(0, 300),
    link: "/overleg",
    push: usedAi,
  });
}

export async function getLastReport(): Promise<{ at: Date; text: string; usedAi: boolean } | null> {
  const setting = await db.setting.findUnique({ where: { key: LAST_REPORT_KEY } });
  const value = setting?.value as { at?: string; text?: string; usedAi?: boolean } | undefined;
  if (!value?.at || !value.text) return null;
  return { at: new Date(value.at), text: value.text, usedAi: Boolean(value.usedAi) };
}
