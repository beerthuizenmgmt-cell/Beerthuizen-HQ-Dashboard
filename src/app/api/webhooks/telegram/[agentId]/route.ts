import { db } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { logActivity } from "@/lib/agents";

// Telegram-webhook per agent. Registreren doe je met:
//
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//     -d "url=<APP_URL>/api/webhooks/telegram/<agentId>" \
//     -d "secret_token=<inboundToken van de agent>"
//
// Telegram stuurt dat secret mee als X-Telegram-Bot-Api-Secret-Token, zodat
// alleen echte updates binnenkomen.

type TelegramUpdate = {
  message?: {
    text?: string;
    caption?: string;
    chat?: { id?: number };
    from?: { is_bot?: boolean; first_name?: string };
  };
};

export async function POST(request: Request, { params }: RouteContext<"/api/webhooks/telegram/[agentId]">) {
  const { agentId } = await params;

  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent) return Response.json({ ok: true }); // Stil negeren: Telegram blijft anders herhalen.

  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!agent.inboundToken || secret !== agent.inboundToken) {
    return Response.json({ error: "bad_secret" }, { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  const text = update?.message?.text ?? update?.message?.caption;
  if (!text) return Response.json({ ok: true });

  const channel = await db.channel.findUnique({ where: { agentId: agent.id } });
  if (!channel) return Response.json({ ok: true });

  await db.message.create({
    data: {
      channelId: channel.id,
      fromType: "agent",
      fromAgentId: agent.id,
      body: text,
      delivery: "delivered",
    },
  });

  await db.agent.update({
    where: { id: agent.id },
    data: { lastActiveAt: new Date(), status: "active", lastError: null },
  });

  await logActivity({
    agentId: agent.id,
    kind: "telegram_bericht",
    message: `${agent.name} stuurde een bericht via Telegram`,
  });

  await notify({
    title: `${agent.name} heeft gereageerd`,
    body: text.slice(0, 200),
    link: `/team/${channel.key}`,
    agentId: agent.id,
  });

  return Response.json({ ok: true });
}
