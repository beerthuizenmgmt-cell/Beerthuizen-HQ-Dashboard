import "server-only";

import { db } from "./db";
import { decryptSecret, encryptSecret } from "./crypto";
import { TELEGRAM_MAX, isOpmaakfout, knipOp, zonderOpmaak } from "./telegram-tekst";

// De persoonlijke lijn tussen Enriqueo en de Head of Operations.
// Het token staat versleuteld in de instellingen; alleen deze module
// ontsleutelt het, op het moment van versturen.

const SETTING_KEY = "telegram";

export type TelegramConfig = {
  botToken: string | null;
  botUsername: string | null;
  chatId: string | null;
};

export async function getTelegramConfig(): Promise<TelegramConfig> {
  const setting = await db.setting.findUnique({ where: { key: SETTING_KEY } });
  const stored = (setting?.value ?? {}) as {
    botToken?: string;
    botUsername?: string;
    chatId?: string;
  };

  return {
    botToken: stored.botToken ? decryptSecret(stored.botToken) : (process.env.TELEGRAM_ALERT_BOT_TOKEN ?? null),
    botUsername: stored.botUsername ?? null,
    chatId: stored.chatId ?? process.env.TELEGRAM_ALERT_CHAT_ID ?? null,
  };
}

/// Status voor de schermen: nooit het token zelf.
export async function getTelegramStatus(): Promise<{
  hasToken: boolean;
  botUsername: string | null;
  chatId: string | null;
  ready: boolean;
}> {
  const setting = await db.setting.findUnique({ where: { key: SETTING_KEY } });
  const stored = (setting?.value ?? {}) as { botToken?: string; botUsername?: string; chatId?: string };
  const hasToken = Boolean(stored.botToken || process.env.TELEGRAM_ALERT_BOT_TOKEN);
  const chatId = stored.chatId ?? process.env.TELEGRAM_ALERT_CHAT_ID ?? null;

  return {
    hasToken,
    botUsername: stored.botUsername ?? null,
    chatId,
    ready: hasToken && Boolean(chatId),
  };
}

async function call<T>(token: string, method: string, body?: object): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(15_000),
  });

  const json = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(json.description ?? `Telegram gaf een fout bij ${method}`);
  return json.result as T;
}

/// Slaat het token op en controleert meteen of de bot bestaat.
export async function saveBotToken(token: string): Promise<{ ok: boolean; message: string }> {
  try {
    const me = await call<{ username?: string; first_name?: string }>(token, "getMe");

    const setting = await db.setting.findUnique({ where: { key: SETTING_KEY } });
    const current = (setting?.value ?? {}) as Record<string, unknown>;

    const value = {
      ...current,
      botToken: encryptSecret(token),
      botUsername: me.username ?? null,
    };

    await db.setting.upsert({
      where: { key: SETTING_KEY },
      update: { value },
      create: { key: SETTING_KEY, value },
    });

    return { ok: true, message: `Bot @${me.username} gekoppeld.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Token werkt niet." };
  }
}

/// Zoekt de chat waarin Enriqueo de bot heeft aangesproken. Telegram geeft een
/// bot geen toegang tot een chat totdat de gebruiker zelf begint — vandaar deze
/// stap in plaats van een chat-ID dat je zelf moet opzoeken.
export async function resolveChatId(): Promise<{ ok: boolean; message: string; chatId?: string }> {
  const config = await getTelegramConfig();
  if (!config.botToken) return { ok: false, message: "Er is nog geen bot-token opgeslagen." };

  try {
    const updates = await call<
      { message?: { chat?: { id?: number; type?: string; first_name?: string; username?: string } } }[]
    >(config.botToken, "getUpdates");

    const chats = new Map<string, { type?: string; name: string }>();
    for (const update of updates) {
      const chat = update.message?.chat;
      if (!chat?.id) continue;
      chats.set(String(chat.id), {
        type: chat.type,
        name: chat.first_name ?? chat.username ?? String(chat.id),
      });
    }

    if (chats.size === 0) {
      return {
        ok: false,
        message: `Nog geen bericht ontvangen. Open Telegram, zoek @${config.botUsername ?? "je bot"}, druk op Start en stuur één bericht. Klik daarna opnieuw.`,
      };
    }

    // Bij meerdere chats: de privéchat wint, dat is de persoonlijke lijn.
    const preferred =
      [...chats.entries()].find(([, chat]) => chat.type === "private") ?? [...chats.entries()][0];

    const setting = await db.setting.findUnique({ where: { key: SETTING_KEY } });
    const current = (setting?.value ?? {}) as Record<string, unknown>;

    await db.setting.upsert({
      where: { key: SETTING_KEY },
      update: { value: { ...current, chatId: preferred[0] } },
      create: { key: SETTING_KEY, value: { ...current, chatId: preferred[0] } },
    });

    return { ok: true, message: `Verbonden met ${preferred[1].name}.`, chatId: preferred[0] };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Ophalen mislukt." };
  }
}

/// Haalt nieuwe Telegram-berichten op en laat de Head erop antwoorden.
///
/// Waarom ophalen en niet wachten op een webhook: Telegram kan localhost niet
/// bereiken. Zodra het dashboard online staat werkt de webhook ook, maar deze
/// route werkt altijd — ook vanaf je eigen Mac.
export async function pollUpdates(): Promise<{ handled: number; error?: string }> {
  const config = await getTelegramConfig();
  if (!config.botToken || !config.chatId) return { handled: 0, error: "Telegram is nog niet gekoppeld." };

  const setting = await db.setting.findUnique({ where: { key: SETTING_KEY } });
  const stored = (setting?.value ?? {}) as Record<string, unknown>;
  const offset = typeof stored.updateOffset === "number" ? stored.updateOffset : undefined;

  try {
    const updates = await call<
      {
        update_id: number;
        message?: {
          text?: string;
          chat?: { id?: number };
          from?: { is_bot?: boolean };
          reply_to_message?: { message_id?: number };
        };
      }[]
    >(config.botToken, "getUpdates", offset ? { offset } : {});

    if (updates.length === 0) return { handled: 0 };

    const chief = await db.agent.findFirst({ where: { isChief: true } });
    let handled = 0;
    let highest = offset ?? 0;

    for (const update of updates) {
      highest = Math.max(highest, update.update_id);

      const text = update.message?.text?.trim();
      const from = update.message?.chat?.id;
      // Alleen jouw eigen chat, en geen berichten van bots.
      if (!text || !chief || String(from) !== config.chatId || update.message?.from?.is_bot) continue;

      await handleIncoming(chief.id, text, update.message?.reply_to_message?.message_id);
      handled += 1;
    }

    // Offset één hoger, anders krijg je dezelfde berichten opnieuw.
    await db.setting.upsert({
      where: { key: SETTING_KEY },
      update: { value: { ...stored, updateOffset: highest + 1 } },
      create: { key: SETTING_KEY, value: { ...stored, updateOffset: highest + 1 } },
    });

    return { handled };
  } catch (error) {
    return { handled: 0, error: error instanceof Error ? error.message : "Ophalen mislukt." };
  }
}

/// Eén binnengekomen bericht: vastleggen, de Head laten nadenken, en zijn
/// antwoord terugsturen. Zo kun je vanaf je telefoon gewoon met hem praten.
export async function handleIncoming(
  chiefId: string,
  text: string,
  replyToMessageId?: number,
): Promise<void> {
  const channel = await db.channel.findUnique({ where: { agentId: chiefId } });

  // Waar gaat dit antwoord over? Eerst kijken of hij rechtstreeks op een vraag
  // heeft geantwoord; anders de oudste openstaande vraag, want die staat het
  // langst te wachten.
  const draad = replyToMessageId
    ? await db.telegramThread.findFirst({
        where: { telegramMessageId: replyToMessageId, answeredAt: null },
        include: { task: true, project: true, client: true },
      })
    : await db.telegramThread.findFirst({
        where: { answeredAt: null },
        orderBy: { askedAt: "asc" },
        include: { task: true, project: true, client: true },
      });

  if (channel) {
    await db.message.create({
      data: {
        channelId: channel.id,
        fromType: "user",
        toAgentId: chiefId,
        body: text,
        delivery: "delivered",
      },
    });
  }

  if (draad) {
    await db.telegramThread.update({
      where: { id: draad.id },
      data: { answer: text, answeredAt: new Date() },
    });
  }

  // Met context erbij weet hij dat "4.000" een budget is voor een bepaalde
  // klant, en niet een los getal.
  const context = draad
    ? [
        ``,
        `Dit is een antwoord op jouw vraag: "${draad.question}"`,
        draad.client ? `Het gaat over klant ${draad.client.name}.` : "",
        draad.project ? `Het gaat over project ${draad.project.name} (${draad.projectId}).` : "",
        draad.task ? `Het gaat over taak "${draad.task.title}" (${draad.taskId}).` : "",
        ``,
        `Verwerk zijn antwoord op de juiste plek: werk de taak of het project bij, `,
        `leg het vast als je het moet onthouden, en zet zo nodig het vervolg uit. `,
        `Bevestig kort wat je ermee gedaan hebt.`,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const { runAgent } = await import("./ai/run");
  const result = await runAgent({
    agentId: chiefId,
    input: `Enriqueo stuurt je dit via Telegram:\n\n${text}${context}\n\nAntwoord kort en direct — dit leest hij op zijn telefoon.`,
    trigger: "message",
    reason: draad ? `antwoord op: ${draad.question.slice(0, 80)}` : "bericht via Telegram",
  });

  const reply = result.ok
    ? result.text
    : `Ik kon hier niet op antwoorden: ${result.error}`;

  if (channel) {
    await db.message.create({
      data: {
        channelId: channel.id,
        fromType: "agent",
        fromAgentId: chiefId,
        body: reply,
        delivery: "delivered",
      },
    });
  }

  await sendTelegram(reply);
}

/// Stuurt een bericht namens de Head of Operations.
export async function sendTelegram(
  text: string,
): Promise<{ ok: boolean; error?: string; messageId?: number }> {
  // Ook het uitlezen zelf kan mislukken: staat de bot-sleutel versleuteld
  // opgeslagen met een APP_SECRET dat er niet meer is, dan gooit het ontsleutelen.
  // Zonder deze vangnetregel sloeg zo'n fout door naar wat het bericht
  // veroorzaakte — een goedkeuringsverzoek werd wél vastgelegd, maar de agent
  // kreeg een fout en probeerde het opnieuw. Versturen mislukt hier altijd
  // nétjes, met een reden.
  let config;
  try {
    config = await getTelegramConfig();
  } catch (error) {
    return {
      ok: false,
      error: `De Telegram-sleutel is niet te lezen: ${error instanceof Error ? error.message : "onbekende fout"}`,
    };
  }

  if (!config.botToken || !config.chatId) {
    return { ok: false, error: "Telegram is nog niet volledig gekoppeld." };
  }

  // Berichten die te lang zijn weigert Telegram in hun geheel. Een
  // teamsamenvatting of een contractanalyse haalt die grens makkelijk.
  const stukken = knipOp(text, TELEGRAM_MAX);

  let laatsteId: number | undefined;
  for (const stuk of stukken) {
    const uitkomst = await stuurEenStuk(config.botToken, config.chatId, stuk);
    if (!uitkomst.ok) return uitkomst;
    laatsteId = uitkomst.messageId ?? laatsteId;
  }

  return { ok: true, messageId: laatsteId };
}

async function stuurEenStuk(
  token: string,
  chatId: string,
  tekst: string,
): Promise<{ ok: boolean; error?: string; messageId?: number }> {
  const basis = { chat_id: chatId, link_preview_options: { is_disabled: true } };

  try {
    // Het bericht-ID onthouden we: antwoordt Enriqueo rechtstreeks op dit
    // bericht, dan weten we exact bij welke vraag zijn antwoord hoort.
    const verstuurd = await call<{ message_id?: number }>(token, "sendMessage", {
      ...basis,
      text: tekst,
      parse_mode: "Markdown",
    });
    return { ok: true, messageId: verstuurd?.message_id };
  } catch (error) {
    // Struikelt de Markdown-lezer over een teken in de tekst, dan weigert
    // Telegram het hele bericht. Plat versturen is dan beter dan niet aankomen.
    if (!isOpmaakfout(error)) {
      return { ok: false, error: error instanceof Error ? error.message : "Versturen mislukt." };
    }

    try {
      const verstuurd = await call<{ message_id?: number }>(token, "sendMessage", {
        ...basis,
        text: zonderOpmaak(tekst),
      });
      return { ok: true, messageId: verstuurd?.message_id };
    } catch (tweedeKeer) {
      return {
        ok: false,
        error: tweedeKeer instanceof Error ? tweedeKeer.message : "Versturen mislukt.",
      };
    }
  }
}

