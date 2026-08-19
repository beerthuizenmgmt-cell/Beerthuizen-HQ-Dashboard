"use server";

import { revalidatePath } from "next/cache";
// De bot-token is een sleutel, en de Telegram-lijn loopt naar Enriqueo's eigen
// telefoon. Beide horen niet bij een teamlid.
import { requireOwner } from "@/lib/access";
import { resolveChatId, saveBotToken, sendTelegram } from "@/lib/telegram";

export type TelegramState = { error?: string; ok?: string };

export async function connectBot(_prev: TelegramState, formData: FormData): Promise<TelegramState> {
  await requireOwner();

  const token = String(formData.get("botToken") ?? "").trim();
  if (!token) return { error: "Plak het token van @BotFather." };

  const result = await saveBotToken(token);
  revalidatePath("/instellingen");
  return result.ok ? { ok: result.message } : { error: result.message };
}

/// Zoekt de chat waarin jij de bot hebt aangesproken.
export async function findMyChat(): Promise<{ ok: boolean; message: string }> {
  await requireOwner();
  const result = await resolveChatId();
  revalidatePath("/instellingen");
  return { ok: result.ok, message: result.message };
}

/// Eén proefbericht, zodat je ziet dat de lijn werkt. Gaat naar jouw eigen chat
/// en nergens anders heen.
export async function sendTestMessage(): Promise<{ ok: boolean; message: string }> {
  await requireOwner();

  const eerste = await sendTelegram(
    [
      "✅ *Verbinding werkt*",
      "",
      "Dit is een proefbericht van je Head of Operations.",
      "Vanaf nu ontvang je hier het ochtendrapport, urgente problemen en verzoeken om akkoord.",
      "",
      "Het volledige overzicht blijft in het dashboard staan.",
    ].join("\n"),
  );

  if (!eerste.ok) return { ok: false, message: eerste.error ?? "Versturen mislukt." };

  // Het bericht hierboven is keurige Markdown en kwam altijd al aan — daarom
  // zei deze knop "werkt" terwijl echte meldingen soms wegbleven. Wat wél
  // struikelde waren berichten met tekens die de Markdown-lezer van Telegram
  // als opmaak leest: een liggend streepje in een bestandsnaam, een sterretje
  // in een bedrag, een blokhaak om een verwijzing. Die weigerde hij in hun
  // geheel. Dit tweede bericht zit er expres vol mee, zodat je met één druk op
  // de knop ziet dat het nu ook aankomt.
  const tweede = await sendTelegram(
    [
      "🧪 *Tweede proef — lastige tekens*",
      "",
      "Bijlage: rapport_q4_definitief_v2.pdf",
      "Bedrag: 30% * 2 = korting op [offerte #88]",
      "Contact: partnerships_team@voorbeeld.nl",
      "",
      "Kwam dit binnen? Dan komen meldingen over echte klanten en bedragen",
      "ook aan. Zonder vetgedrukte kop is ook goed: dan viel hij netjes terug",
      "op platte tekst in plaats van helemaal niet te versturen.",
    ].join("\n"),
  );

  if (!tweede.ok) {
    return {
      ok: false,
      message: `Het eerste bericht kwam aan, het tweede niet: ${tweede.error ?? "onbekende fout"}. Meldingen met opmaaktekens komen dus nog steeds niet door.`,
    };
  }

  return { ok: true, message: "Twee proefberichten verstuurd — kijk in Telegram of ze allebei binnen zijn." };
}

/// Haalt nieuwe berichten op en laat de Head erop antwoorden. Werkt ook lokaal,
/// waar Telegram geen webhook kan afleveren.
export async function checkTelegram(): Promise<{ ok: boolean; message: string }> {
  await requireOwner();

  const { pollUpdates } = await import("@/lib/telegram");
  const result = await pollUpdates();

  revalidatePath("/instellingen");
  revalidatePath("/team/dm-chief");

  if (result.error) return { ok: false, message: result.error };
  return {
    ok: true,
    message:
      result.handled === 0
        ? "Geen nieuwe berichten."
        : `${result.handled} bericht(en) verwerkt — de Head heeft geantwoord.`,
  };
}
