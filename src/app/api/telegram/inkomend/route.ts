import { after } from "next/server";
import { db } from "@/lib/db";
import { getTelegramConfig, handleIncoming, toonTypt, webhookGeheimKlopt } from "@/lib/telegram";

// Waar Telegram je berichten aflevert.
//
// Dit adres is vanaf internet bereikbaar, dus het staat of valt met het geheim
// dat Telegram meestuurt in een header. Klopt dat niet, dan gaat er niets naar
// een agent en antwoorden we alsof het adres niet bestaat — een indringer hoort
// niet te kunnen afleiden dat hij het juiste adres te pakken heeft.

export const dynamic = "force-dynamic";

// Daan denkt na en schakelt collega's in; dat duurt langer dan een gewoon
// verzoek. Het antwoord aan Telegram gaat direct weg, het denkwerk erna.
export const maxDuration = 300;

type Update = {
  update_id?: number;
  message?: {
    text?: string;
    chat?: { id?: number };
    from?: { is_bot?: boolean };
    reply_to_message?: { message_id?: number };
  };
};

export async function POST(request: Request) {
  if (!(await webhookGeheimKlopt(request.headers.get("x-telegram-bot-api-secret-token")))) {
    return new Response("Not found", { status: 404 });
  }

  let update: Update;
  try {
    update = (await request.json()) as Update;
  } catch {
    return Response.json({ ok: true });
  }

  const tekst = update.message?.text?.trim();
  const vanChat = update.message?.chat?.id;
  const config = await getTelegramConfig();
  const chief = await db.agent.findFirst({ where: { isChief: true }, select: { id: true } });

  // Alleen jouw eigen chat, geen berichten van bots, en alleen als er een Head
  // of Operations is om het aan te geven.
  const bruikbaar =
    Boolean(tekst) &&
    Boolean(chief) &&
    String(vanChat) === config.chatId &&
    !update.message?.from?.is_bot;

  if (!bruikbaar) return Response.json({ ok: true });

  // Telegram wil binnen enkele seconden een antwoord, anders stuurt hij hetzelfde
  // bericht opnieuw en krijg je het dubbel verwerkt. Daarom eerst bevestigen en
  // daarna pas nadenken.
  after(async () => {
    await toonTypt();
    try {
      await handleIncoming(chief!.id, tekst!, update.message?.reply_to_message?.message_id);
    } catch (error) {
      // Zonder dit verdwijnt een mislukt gesprek in het niets: Telegram heeft
      // allang een 200 gekregen, dus jij ziet alleen dat er geen antwoord komt.
      await db.activityEvent.create({
        data: {
          agentId: chief!.id,
          kind: "telegram_mislukt",
          level: "warn",
          message: `Bericht via Telegram kon niet verwerkt worden: ${
            error instanceof Error ? error.message : "onbekende fout"
          }`,
          occurredAt: new Date(),
        },
      });
    }
  });

  return Response.json({ ok: true });
}
