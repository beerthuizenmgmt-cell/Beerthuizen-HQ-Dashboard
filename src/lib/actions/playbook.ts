"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner, audit } from "@/lib/access";

export type PlaybookState = { error?: string; ok?: boolean };

/// De werkinstructies van een agent. Alleen de eigenaar: deze tekst stuurt
/// gedrag aan en gaat mee in elke denkbeurt.
export async function savePlaybook(
  agentId: string,
  _prev: PlaybookState,
  formData: FormData,
): Promise<PlaybookState> {
  const user = await requireOwner();

  const tekst = String(formData.get("playbook") ?? "").trim();

  const agent = await db.agent.findUnique({ where: { id: agentId }, select: { name: true } });
  if (!agent) return { error: "Agent bestaat niet." };

  // Er zit geen bovengrens aan wat je kunt schrijven, maar wel aan wat verstandig
  // is. Boven de 20.000 tekens gaat een prompt zwaar wegen op elke aanroep.
  if (tekst.length > 20_000) {
    return {
      error: `Dit is ${tekst.length.toLocaleString("nl-NL")} tekens — dat kost ongeveer ${Math.round(
        tekst.length / 3.6,
      ).toLocaleString("nl-NL")} tokens bij élke denkbeurt. Kort het in tot de dingen die zijn gedrag echt sturen.`,
    };
  }

  await db.agent.update({ where: { id: agentId }, data: { playbook: tekst || null } });

  await audit(
    user,
    tekst ? "playbook_opslaan" : "playbook_wissen",
    `${agent.name} · ${tekst.length} tekens`,
    { type: "agent", id: agentId },
  );

  revalidatePath(`/agents/${agentId}`);
  return { ok: true };
}
