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

  // Een mislukte push mag de actie die hem veroorzaakte niet omver trekken; de
  // melding staat al in het dashboard.
  //
  // Dat stond hier als bedoeling, maar niet als code: sendTelegram gooit bij een
  // onleesbare of ontbrekende bot-sleutel in plaats van netjes terug te geven.
  // Daardoor sloeg een Telegram-storing door naar wat de melding veroorzaakte —
  // een goedkeuringsverzoek werd wél vastgelegd, maar de agent kreeg een fout te
  // zien en probeerde het opnieuw. Twee keer dezelfde goedkeuring in je lijst,
  // of erger: een agent die concludeert dat vragen niet lukt.
  // De melding blijft staan met pushedAt leeg; zo zie je in het dashboard dat
  // hij je telefoon niet gehaald heeft. De reden hoort in de activiteitenlijst,
  // anders is "hij kwam niet binnen" niet te onderzoeken.
  const misluktBij = async (reden: string) => {
    await db.activityEvent.create({
      data: {
        agentId: input.agentId ?? null,
        kind: "melding_niet_gepusht",
        level: "warn",
        message: `Melding "${input.title}" staat in het dashboard maar kon niet naar Telegram: ${reden}`,
        occurredAt: new Date(),
      },
    });
  };

  try {
    const { sendTelegram } = await import("./telegram");
    const result = await sendTelegram(text);
    if (result.ok) {
      await db.notification.update({ where: { id: notification.id }, data: { pushedAt: new Date() } });
    } else {
      // Sinds sendTelegram netjes { ok: false } teruggeeft in plaats van te
      // gooien, kwam dit nooit meer in de catch terecht. Een mislukte melding
      // verdween daardoor zonder spoor: je zag alleen dat er niets binnenkwam.
      await misluktBij(result.error ?? "onbekende fout");
    }
  } catch (error) {
    await misluktBij(error instanceof Error ? error.message : "onbekende fout");
  }
}

export async function markAllRead(): Promise<void> {
  await db.notification.updateMany({ where: { readAt: null }, data: { readAt: new Date() } });
}
