import type { AgentAdapter, AdapterConfig } from "./types";
import { readableError } from "./types";

const API = "https://api.telegram.org";
const TIMEOUT_MS = 10_000;

async function call<T>(token: string, method: string, body?: object): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!json.ok) throw new Error(json.description ?? `Telegram gaf een fout bij ${method}`);
    return json.result as T;
  } finally {
    clearTimeout(timer);
  }
}

export const telegramAdapter: AgentAdapter = {
  type: "telegram",
  label: "Telegram-bot",
  description:
    "De agent heeft een eigen Telegram-bot. Taken gaan als bericht naar de chat, antwoorden komen via webhook terug.",
  fields: [
    {
      name: "botToken",
      label: "Bot-token",
      type: "password",
      required: true,
      secret: true,
      placeholder: "123456789:AAF...",
      help: "Krijg je van @BotFather in Telegram.",
    },
    {
      name: "chatId",
      label: "Chat-ID",
      type: "text",
      required: true,
      placeholder: "-1001234567890",
      help: "De chat waarin deze agent meepraat. Stuur je bot een bericht en gebruik daarna getUpdates, of gebruik @userinfobot.",
    },
  ],
  capabilities: { send: true, poll: true, receive: true },

  async testConnection(config: AdapterConfig) {
    try {
      const me = await call<{ username?: string; first_name?: string }>(config.botToken, "getMe");

      // Bot-token klopt. Nu kijken of de chat ook echt bereikbaar is — een
      // geldig token met een verkeerde chat-ID levert anders pas bij de eerste
      // taak een fout op.
      try {
        const chat = await call<{ title?: string; username?: string; type?: string }>(
          config.botToken,
          "getChat",
          { chat_id: config.chatId },
        );
        const chatName = chat.title ?? chat.username ?? chat.type ?? config.chatId;
        return {
          ok: true,
          message: `Verbonden met @${me.username ?? me.first_name} in "${chatName}".`,
          details: { bot: me.username, chat: chatName },
        };
      } catch (chatError) {
        return {
          ok: false,
          message: `Bot @${me.username} werkt, maar de chat is niet bereikbaar: ${readableError(chatError)}. Voeg de bot toe aan de chat en stuur er één bericht in.`,
        };
      }
    } catch (error) {
      return { ok: false, message: readableError(error) };
    }
  },

  async fetchStatus(config: AdapterConfig) {
    try {
      await call(config.botToken, "getMe");
      return { status: "idle" as const, statusText: "Bot bereikbaar" };
    } catch {
      return { status: "offline" as const, statusText: "Bot niet bereikbaar" };
    }
  },

  async sendMessage(config: AdapterConfig, text: string) {
    try {
      const result = await call<{ message_id: number }>(config.botToken, "sendMessage", {
        chat_id: config.chatId,
        text,
        parse_mode: "Markdown",
      });
      return { ok: true, externalId: String(result.message_id) };
    } catch (error) {
      return { ok: false, error: readableError(error) };
    }
  },
};
