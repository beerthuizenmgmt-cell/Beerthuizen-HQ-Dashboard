import "server-only";

import { db } from "./db";
import { sendToAgent, logActivity } from "./agents";
import { notify } from "./notifications";
import { randomToken } from "./crypto";
import { getAdapter } from "./adapters";
import { readableError } from "./adapters/types";

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

/// De uitvraag. Agents die in het dashboard zelf draaien antwoorden gewoon met
/// tekst in hetzelfde verzoek; die kunnen — en hoeven — geen HTTP-verzoek terug
/// te sturen. Alleen agents achter een externe koppeling melden zich later terug
/// via de reply-route, en die krijgen het adres en het token mee.
function standupPrompt(
  agentName: string,
  agentId: string,
  token: string,
  terugAntwoordViaHttp: boolean,
): string {
  const vorm = `Gisteren: ... | Vandaag: ... | Blokkades: ... | Vragen: ...`;

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
    ...(terugAntwoordViaHttp
      ? [
          `Antwoord kort en concreet, zo:`,
          `POST ${appUrl()}/api/agents/${agentId}/reply`,
          `Authorization: Bearer ${token}`,
          `{"message": "${vorm}"}`,
        ]
      : [
          `Antwoord kort en concreet, en gebruik exact deze vorm — één regel, met`,
          `verticale streepjes ertussen en verder geen inleiding of afsluiting:`,
          ``,
          vorm,
          ``,
          `Heb je geen blokkade of geen vragen, schrijf daar dan "geen".`,
        ]),
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

  // Iedereen tegelijk vragen, niet één voor één. Negen agents die elk een minuut
  // nadenken passen na elkaar in geen enkel webverzoek; naast elkaar duurt het
  // overleg zo lang als de traagste agent.
  const uitkomsten = await Promise.all(
    agents.map(async (agent) => {
      try {
        // Bestaat er al een antwoord van vandaag, dan laten we dat met rust.
        const existing = await db.standupEntry.findUnique({
          where: { meetingId_agentId: { meetingId: meeting.id, agentId: agent.id } },
        });
        if (existing?.receivedAt) return "al_binnen" as const;

        // De regel wordt vóór het vragen weggeschreven. Wordt het verzoek daarna
        // afgekapt, dan zie je in het overleg dat deze agent bevraagd is in plaats
        // van dat hij spoorloos ontbreekt.
        await db.standupEntry.upsert({
          where: { meetingId_agentId: { meetingId: meeting.id, agentId: agent.id } },
          update: { requestedAt: new Date(), error: null },
          create: { meetingId: meeting.id, agentId: agent.id },
        });

        const token = await ensureInboundToken(agent.id, agent.inboundToken);
        const viaHttp = getAdapter(agent.adapterType).capabilities.receive;
        const result = await sendToAgent(
          agent.id,
          standupPrompt(agent.name, agent.id, token, viaHttp),
        );

        if (!result.ok) {
          await db.standupEntry.update({
            where: { meetingId_agentId: { meetingId: meeting.id, agentId: agent.id } },
            data: { error: result.error },
          });
          return { agent: agent.name, error: result.error ?? "onbekende fout" };
        }

        // Ingebouwde agents antwoorden meteen, in hetzelfde verzoek. Alleen agents
        // die via een externe koppeling draaien melden zich later terug via de
        // reply-route. Zonder deze regel bleef zo'n direct antwoord liggen en werd
        // het overleg nooit compleet.
        if (result.reply?.trim()) {
          await recordStandupReply(agent.id, result.reply);
        }

        return null;
      } catch (error) {
        // Eén agent die omvalt mag het hele overleg niet meeslepen.
        return { agent: agent.name, error: readableError(error) };
      }
    }),
  );

  for (const uitkomst of uitkomsten) {
    if (uitkomst === "al_binnen") continue;
    if (uitkomst) failed.push(uitkomst);
    else asked += 1;
  }

  // Is iedereen binnen, dan schrijven we de samenvatting meteen. Anders staat de
  // briefing 's ochtends klaar zonder kop en moet je zelf op een knop drukken.
  const nogOpen = await db.standupEntry.count({
    where: { meetingId: meeting.id, receivedAt: null },
  });
  if (nogOpen === 0) {
    const samenvatting = await summariseMeeting(meeting.id);
    await db.meeting.update({ where: { id: meeting.id }, data: { summaryMd: samenvatting } });
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

  // Iedereen binnen? Dan is de briefing klaar om te lezen. Agents antwoorden
  // tegelijk, dus de overgang naar "ready" moet één keer gebeuren en niet één
  // keer per agent die toevallig als laatste klaar is.
  const open = await db.standupEntry.count({
    where: { meetingId: meeting.id, receivedAt: null },
  });
  if (open === 0) {
    const overgang = await db.meeting.updateMany({
      where: { id: meeting.id, status: { not: "ready" } },
      data: { status: "ready" },
    });
    if (overgang.count > 0) {
      await notify({
        level: "success",
        title: "Het ochtendoverleg ligt klaar",
        body: "Alle agents hebben gerapporteerd.",
        link: "/overleg",
        push: true,
      });
    }
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

  if (received.length === 0) return factual;

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

  // Via dezelfde AI-laag als de agents zelf. Eerder stond hier een losse
  // fetch met process.env.OPENROUTER_API_KEY — die staat op Vercel niet
  // ingevuld, want de sleutel hoort bij Instellingen → Taalmodel. Daardoor
  // viel de briefing altijd stil terug op de feitelijke regel hieronder.
  try {
    const { chat } = await import("./ai/provider");
    const result = await chat({
      messages: [
        {
          role: "system",
          content:
            "Je vat een ochtendoverleg samen voor de eigenaar van een marketing- en mediabureau. Schrijf in het Nederlands, maximaal vier zinnen. Noem wat er vandaag speelt en wat zijn aandacht vraagt. Geen opsomming van iedereen apart, geen inleidende zin.",
        },
        { role: "user", content: transcript },
      ],
      maxTokens: 300,
      timeoutMs: 25_000,
    });

    const summary = result.text.trim();
    return summary ? `${summary}\n\n${factual}` : factual;
  } catch {
    // Geen samenvatting is vervelend, geen briefing is erger.
    return factual;
  }
}
