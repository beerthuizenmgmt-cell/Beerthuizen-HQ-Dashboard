"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/access";
import { saveMailConfig, stuurProefmail, verstuurGoedgekeurdeMail } from "@/lib/mail";

// Alles hier is alleen voor de eigenaar: het gaat over een sleutel waarmee er
// post namens Beerthuizen Management de deur uit gaat.

export async function bewaarMailinstellingen(
  _vorige: { ok?: boolean; message?: string },
  formData: FormData,
): Promise<{ ok?: boolean; message?: string }> {
  await requireOwner();

  const afzender = String(formData.get("afzender") ?? "").trim();
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const antwoordNaar = String(formData.get("antwoordNaar") ?? "").trim();

  // Resend wil een adres op een geverifieerd domein. Een adres bij gmail of
  // outlook wordt geweigerd, en dat wil je hier horen en niet pas als er een
  // klantmail blijft hangen.
  if (afzender && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(afzender.replace(/^.*<|>$/g, ""))) {
    return { ok: false, message: "Dat afzenderadres klopt niet." };
  }

  try {
    await saveMailConfig({ apiKey, afzender, antwoordNaar });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Opslaan mislukt." };
  }

  revalidatePath("/instellingen");
  return { ok: true, message: "Mailinstellingen opgeslagen." };
}

/// Proefmail naar jezelf. Gaat nergens anders heen.
export async function stuurProefmailNaar(
  _vorige: { ok?: boolean; message?: string },
  formData: FormData,
): Promise<{ ok?: boolean; message?: string }> {
  const user = await requireOwner();
  const naar = String(formData.get("naar") ?? "").trim() || user.email;

  const uitkomst = await stuurProefmail(naar);
  return uitkomst.ok
    ? { ok: true, message: `Proefmail verstuurd naar ${naar} — kijk ook even in je spam.` }
    : { ok: false, message: uitkomst.error ?? "Versturen mislukt." };
}

/// De goedgekeurde mail daadwerkelijk de deur uit doen.
export async function verstuurMailNu(approvalId: string): Promise<{ ok: boolean; message: string }> {
  await requireOwner();
  const uitkomst = await verstuurGoedgekeurdeMail(approvalId);
  revalidatePath("/goedkeuringen");
  return uitkomst;
}
