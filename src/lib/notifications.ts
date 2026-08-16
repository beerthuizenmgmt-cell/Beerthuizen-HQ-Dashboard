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

  const icon = { info: "ℹ️", success: "✅", warn: "⚠️", error: "🚨" }[notification.level];
  const text = [`${icon} *${input.title}*`, input.body].filter(Boolean).join("\n");

  // Een mislukte push mag de actie die hem veroorzaakte niet omver trekken;
  // de melding staat al in het dashboard.
  const { sendTelegram } = await import("./telegram");
  const result = await sendTelegram(text);
  if (result.ok) {
    await db.notification.update({ where: { id: notification.id }, data: { pushedAt: new Date() } });
  }
}

export async function markAllRead(): Promise<void> {
  await db.notification.updateMany({ where: { readAt: null }, data: { readAt: new Date() } });
}
