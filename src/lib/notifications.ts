import "server-only";

import { db } from "./db";
import type { ActivityLevel } from "@/generated/prisma/enums";

type NotifyInput = {
  level?: ActivityLevel;
  title: string;
  body?: string;
  link?: string;
  agentId?: string | null;
  /// Alleen echt storende dingen gaan door naar je telefoon. De rest wacht
  /// netjes in het meldingencentrum.
  push?: boolean;
};

export async function notify(input: NotifyInput): Promise<void> {
  const notification = await db.notification.create({
    data: {
      level: input.level ?? "info",
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      agentId: input.agentId ?? null,
    },
  });

  if (!input.push) return;

  const setting = await db.setting.findUnique({ where: { key: "alerts" } });
  const alerts = (setting?.value ?? {}) as { telegram?: boolean };
  if (alerts.telegram === false) return;

  const token = process.env.TELEGRAM_ALERT_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID;
  if (!token || !chatId) return; // Nog niet ingesteld — geen reden om te klagen.

  const icon = { info: "ℹ️", success: "✅", warn: "⚠️", error: "🚨" }[notification.level];
  const text = [`${icon} *${input.title}*`, input.body].filter(Boolean).join("\n");

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
      signal: AbortSignal.timeout(8000),
    });
    await db.notification.update({ where: { id: notification.id }, data: { pushedAt: new Date() } });
  } catch {
    // Een mislukte push mag de actie die hem veroorzaakte niet omver trekken.
    // De melding staat al in het dashboard.
  }
}

export async function markAllRead(): Promise<void> {
  await db.notification.updateMany({ where: { readAt: null }, data: { readAt: new Date() } });
}
