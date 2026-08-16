"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { postMessage } from "@/lib/orchestrator";

export type MessageState = { error?: string; ok?: boolean };

export async function sendChannelMessage(
  _prev: MessageState,
  formData: FormData,
): Promise<MessageState> {
  const user = await requireUser();

  const channelId = String(formData.get("channelId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!channelId || !body) return { error: "Typ eerst een bericht." };

  const channel = await db.channel.findUnique({ where: { id: channelId }, select: { key: true } });
  if (!channel) return { error: "Kanaal bestaat niet." };

  try {
    const message = await postMessage({
      channelId,
      fromType: "user",
      fromUserId: user.id,
      body,
    });

    revalidatePath(`/team/${channel.key}`);

    if (message.delivery === "failed") {
      return { error: message.deliveryError ?? "Bezorgen bij de agent is mislukt." };
    }
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Versturen mislukt." };
  }
}
