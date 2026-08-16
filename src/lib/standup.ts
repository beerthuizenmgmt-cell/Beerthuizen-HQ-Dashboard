import "server-only";

import { db } from "./db";
import { sendToAgent, logActivity } from "./agents";
import { notify } from "./notifications";
import { randomToken } from "./crypto";
import { getAdapter } from "./adapters";

/// Kalenderdag in Europe/Amsterdam, vastgelegd op middernacht UTC zodat één dag
/// altijd één rij is — ook rond zomertijd.
export function meetingDate(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${parts}T00:00:00.000Z`);
}

function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

async function ensureInboundToken(agentId: string, existing: string | null): Promise<string> {
  if (existing) return existing;
  const token = `at_${randomToken(24)}`;
  await db.agent.update({ where: { id: agentId }, data: { inboundToken: token } });
  return token;
}

function standupPrompt(agentName: string, agentId: string, token: string): string {
  return [
    `Goedemorgen ${agentName}. Tijd voor de dagelijkse standup van BHMGMT.`,
    ``,
    `Beantwoord deze vier punten:`,
    `1. Wat heb je gisteren gedaan?`,
    `2. Wat pak je vandaag op?`,
    `3. Waar loop je vast?`,
    `4. Welke vragen heb je voor Beerthuizen? Zet elke vraag op een eigen regel.`,
    ``,
    `Punt 4 is belangrijk: om 10:00 loopt hij de vragen van het hele team met je`,
    `door en spreekt hij zijn antwoord in. Stel dus wat je echt wilt weten —`,
    `keuzes, prioriteiten, akkoord op budget. Geen vragen? Laat punt 4 leeg.`,
    ``,
    `Antwoord kort en concreet, zo:`,
    `POST ${appUrl()}/api/agents/${agentId}/reply`,
    `Authorization: Bearer ${token}`,
    `{"message": "Gisteren: ... | Vandaag: ... | Blokkades: ... | Vragen: ..."}`,
  ].join("\n");
}

/// Start het overleg van vandaag: maakt het aan als het nog niet bestaat en
/// vraagt elke actieve agent om zijn standup.
export async function runStandup(): Promise<{
  meetingId: string;
  asked: number;
  failed: { agent: string; error: string }[];
  /// Agents die nog geen koppeling hebben en dus niet meedoen.
  skipped: number;
}> {
  const date = meetingDate();

  const all = await db.agent.findMany({
    where: { paused: false },
    orderBy: [{ isChief: "desc" }, { sortOrder: "asc" }],
  });

  // Alleen agents die daadwerkelijk een bericht kunnen ontvangen doen mee.
  // Anders staat de briefing elke ochtend vol met agents die nooit antwoorden.
  const agents = all.filter((agent) => getAdapter(agent.adapterType).capabilities.send);
  const skipped = all.length - agents.length;

  const meeting = await db.meeting.upsert({
    where: { date },
    update: { status: "collecting" },
    create: { date, status: "collecting" },
  });

  const failed: { agent: string; error: string }[] = [];
  let asked = 0;

  for (const agent of agents) {
    // Bestaat er al een antwoord van vandaag, dan laten we dat met rust.
    const existing = await db.standupEntry.findUnique({
      where: { meetingId_agentId: { meetingId: meeting.id, agentId: agent.id } },
    });
    if (existing?.receivedAt) continue;

    const token = await ensureInboundToken(agent.id, agent.inboundToken);
    const result = await sendToAgent(agent.id, standupPrompt(agent.name, agent.id, token));

    await db.standupEntry.upsert({
      where: { meetingId_agentId: { meetingId: meeting.id, agentId: agent.id } },
      update: { requestedAt: new Date(), error: result.ok ? null : result.error },
      create: {
        meetingId: meeting.id,
        agentId: agent.id,
        error: result.ok ? null : result.error,
      },
    });

    if (result.ok) asked += 1;
    else failed.push({ agent: agent.name, error: result.error ?? "onbekende fout" });
  }

  await logActivity({
    kind: "overleg_gestart",
    level: failed.length ? "warn" : "info",
    message:
      `Ochtendoverleg gestart · ${asked} agents gevraagd` +
      (failed.length ? `, ${failed.length} onbereikbaar` : "") +
      (skipped ? `, ${skipped} nog niet gekoppeld` : ""),
  });

  return { meetingId: meeting.id, asked, failed, skipped };
}

/// Vult het standup-antwoord van een agent in, als er vandaag een openstaande
/// uitvraag voor hem is. Geeft terug of het antwoord ergens landde.
export async function recordStandupReply(agentId: string, message: string): Promise<boolean> {
  const date = meetingDate();
  const meeting = await db.meeting.findUnique({ where: { date } });
  if (!meeting || meeting.status === "closed") return false;

  const entry = await db.standupEntry.findUnique({
    where: { meetingId_agentId: { meetingId: meeting.id, agentId } },
  });
  if (!entry || entry.receivedAt) return false;

  const parsed = parseStandup(message);
  await db.standupEntry.update({
    where: { id: entry.id },
    data: { ...parsed, rawReply: message, receivedAt: new Date(), error: null },
  });

  // Vragen worden losse regels in de wachtrij van de ochtendcall.
  const questions = splitQuestions(parsed.questions);
  if (questions.length) {
    const offset = await db.meetingQuestion.count({ where: { meetingId: meeting.id } });
    await db.meetingQuestion.createMany({
      data: questions.map((body, index) => ({
        meetingId: meeting.id,
        agentId,
        body,
        sortOrder: offset + index,
      })),
    });
  }

  // Iedereen binnen? Dan is de briefing klaar om te lezen.
  const open = await db.standupEntry.count({
    where: { meetingId: meeting.id, receivedAt: null },
  });
  if (open === 0) {
    await db.meeting.update({ where: { id: meeting.id }, data: { status: "ready" } });
    await notify({
      level: "success",
      title: "Het ochtendoverleg ligt klaar",
      body: "Alle agents hebben gerapporteerd.",
      link: "/overleg",
      push: true,
    });
  }

  return true;
}

/// Haalt "gisteren / vandaag / blokkades" uit een vrij geschreven antwoord.
/// Agents antwoorden zelden precies zoals gevraagd, dus dit accepteert zowel
/// labels met dubbele punt als genummerde regels.
export function parseStandup(message: string): {
  yesterday: string | null;
  today: string | null;
  blockers: string | null;
  questions: string | null;
} {
  const grab = (patterns: RegExp[]): string | null => {
    for (const pattern of patterns) {
      const match = pattern.exec(message);
      if (match?.[1]) {
        const value = match[1].trim().replace(/^[-–—:]\s*/, "");
        if (value) return value;
      }
    }
    return null;
  };

  const stop = "(?=\\s*(?:\\||\\n|$|gisteren|vandaag|blokkade|blokkades|blockers|nodig|vragen|vraag))";

  return {
    yesterday: grab([
      new RegExp(`gisteren\\s*:?\\s*(.+?)${stop}`, "is"),
      /^\s*1[.)]\s*([\s\S]+?)(?=\n\s*2[.)]|$)/i,
    ]),
    today: grab([
      new RegExp(`vandaag\\s*:?\\s*(.+?)${stop}`, "is"),
      /^\s*2[.)]\s*([\s\S]+?)(?=\n\s*3[.)]|$)/im,
    ]),
    blockers: grab([
      new RegExp(`(?:blokkades?|blockers?|nodig)\\s*:?\\s*(.+?)${stop}`, "is"),
      /^\s*3[.)]\s*([\s\S]+?)(?=\n\s*4[.)]|$)/im,
    ]),
    questions: grab([
      new RegExp(`(?:vragen|vraag)(?:\\s+voor\\s+\\S+)?\\s*:?\\s*(.+?)(?=\\s*(?:\\n\\n|$))`, "is"),
      /^\s*4[.)]\s*([\s\S]+)$/im,
    ]),
  };
}

/// Splitst het vragenblok in losse vragen. Agents schrijven ze als opsomming,
/// als genummerde lijst of gewoon achter elkaar met vraagtekens.
export function splitQuestions(block: string | null): string[] {
  if (!block) return [];

  const trimmed = block.trim();
  if (!trimmed || /^(geen|nee|niets|n\.?v\.?t\.?|-)$/i.test(trimmed)) return [];

  const lines = trimmed
    .split(/\n+/)
    .flatMap((line) =>
      // Meerdere vragen op één regel? Knippen na het vraagteken.
      line.includes("?") ? line.split(/(?<=\?)\s+/) : [line],
    )
    .map((line) => line.replace(/^\s*(?:[-–—*•]|\d+[.)])\s*/, "").trim())
    .filter((line) => line.length > 3);

  // Dubbele vragen komen voor als een agent zichzelf herhaalt.
  return Array.from(new Set(lines)).slice(0, 10);
}

/// Samenvatting boven de briefing. Met een OpenRouter-sleutel schrijft een model
/// hem; zonder sleutel valt hij terug op een feitelijke opsomming, zodat het
/// scherm nooit leeg blijft.
export async function summariseMeeting(meetingId: string): Promise<string> {
  const meeting = await db.meeting.findUnique({
    where: { id: meetingId },
    include: { entries: { include: { agent: { select: { name: true } } } } },
  });
  if (!meeting) return "";

  const received = meeting.entries.filter((entry) => entry.receivedAt);
  const blockers = received.filter((entry) => entry.blockers && !/geen|n\.?v\.?t/i.test(entry.blockers));

  const factual = [
    `${received.length} van ${meeting.entries.length} agents hebben gerapporteerd.`,
    blockers.length
      ? `${blockers.length} melden een blokkade: ${blockers.map((entry) => entry.agent.name).join(", ")}.`
      : `Niemand meldt een blokkade.`,
  ].join(" ");

  const key = process.env.OPENROUTER_API_KEY;
  if (!key || received.length === 0) return factual;

  const transcript = received
    .map((entry) =>
      [
        `${entry.agent.name}:`,
        `  gisteren: ${entry.yesterday ?? "-"}`,
        `  vandaag: ${entry.today ?? "-"}`,
        `  blokkades: ${entry.blockers ?? "-"}`,
      ].join("\n"),
    )
    .join("\n\n");

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        messages: [
          {
            role: "system",
            content:
              "Je vat een ochtendoverleg samen voor de eigenaar van een marketing- en mediabureau. Schrijf in het Nederlands, maximaal vier zinnen. Noem wat er vandaag speelt en wat zijn aandacht vraagt. Geen opsomming van iedereen apart, geen inleidende zin.",
          },
          { role: "user", content: transcript },
        ],
        max_tokens: 300,
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!response.ok) return factual;
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const summary = data.choices?.[0]?.message?.content?.trim();
    return summary ? `${summary}\n\n${factual}` : factual;
  } catch {
    // Geen samenvatting is vervelend, geen briefing is erger.
    return factual;
  }
}
