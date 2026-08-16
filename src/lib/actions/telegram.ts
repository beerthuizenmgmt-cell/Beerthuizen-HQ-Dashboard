"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { resolveChatId, saveBotToken, sendTelegram } from "@/lib/telegram";

export type TelegramState = { error?: string; ok?: string };

export async function connectBot(_prev: TelegramState, formData: FormData): Promise<TelegramState> {
  await requireUser();

  const token = String(formData.get("botToken") ?? "").trim();
  if (!token) return { error: "Plak het token van @BotFather." };

  const result = await saveBotToken(token);
  revalidatePath("/instellingen");
  return result.ok ? { ok: result.message } : { error: result.message };
}

/// Zoekt de chat waarin jij de bot hebt aangesproken.
export async function findMyChat(): Promise<{ ok: boolean; message: string }> {
  await requireUser();
  const result = await resolveChatId();
  revalidatePath("/instellingen");
  return { ok: result.ok, message: result.message };
}

/// Eén proefbericht, zodat je ziet dat de lijn werkt. Gaat naar jouw eigen chat
/// en nergens anders heen.
export async function sendTestMessage(): Promise<{ ok: boolean; message: string }> {
  await requireUser();

  const result = await sendTelegram(
    [
      "✅ *Verbinding werkt*",
      "",
      "Dit is een proefbericht van je Head of Operations.",
      "Vanaf nu ontvang je hier het ochtendrapport, urgente problemen en verzoeken om akkoord.",
      "",
      "Het volledige overzicht blijft in het dashboard staan.",
    ].join("\n"),
  );

  return result.ok
    ? { ok: true, message: "Proefbericht verstuurd — kijk in Telegram." }
    : { ok: false, message: result.error ?? "Versturen mislukt." };
}
