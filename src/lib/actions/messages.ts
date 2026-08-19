"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { after } from "next/server";
import { bezorgBericht, plaatsBericht } from "@/lib/orchestrator";

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
    // Eerst alleen vastleggen. Zo staat jouw bericht meteen in beeld in plaats
    // van dat je vijftien seconden naar een leeg scherm kijkt en niet weet of
    // het is aangekomen.
    const message = await plaatsBericht({
      channelId,
      fromType: "user",
      fromUserId: user.id,
      body,
    });

    revalidatePath(`/team/${channel.key}`);

    // Het denkwerk erna. De pagina ververst zichzelf en pikt het antwoord op
    // zodra het er staat.
    after(async () => {
      try {
        await bezorgBericht(message.id);
      } catch (error) {
        // Zonder dit verdwijnt een mislukt antwoord in het niets: jij hebt
        // allang een bevestiging gekregen en ziet alleen dat er niets komt.
        await db.activityEvent.create({
          data: {
            kind: "bericht_niet_bezorgd",
            level: "warn",
            message: `Bericht in #${channel.key} kon niet bij de agent worden gebracht: ${
              error instanceof Error ? error.message : "onbekende fout"
            }`,
            occurredAt: new Date(),
          },
        });
      }
    });

    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Versturen mislukt." };
  }
}
