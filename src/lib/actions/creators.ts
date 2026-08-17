"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/access";
import { leesGetal } from "@/lib/creators";
import type { CreatorSoort } from "@/generated/prisma/enums";

export type CreatorState = { error?: string; ok?: string };

/// Een creator toevoegen aan het register.
///
/// Alleen de naam is verplicht. De rest weet je vaak later pas, en een formulier
/// dat cijfers eist die je niet hebt levert verzonnen cijfers op.
export async function maakCreator(_prev: CreatorState, formData: FormData): Promise<CreatorState> {
  const user = await requireUser();

  const naam = String(formData.get("name") ?? "").trim();
  if (!naam) return { error: "Vul in ieder geval een naam in." };

  const tekst = (veld: string) => {
    const waarde = String(formData.get(veld) ?? "").trim();
    return waarde || null;
  };

  const bestaat = await db.creator.findFirst({ where: { name: { equals: naam, mode: "insensitive" } } });
  if (bestaat) {
    return { error: `${naam} staat al in het register. Werk hem daar bij in plaats van hem twee keer aan te maken.` };
  }

  const creator = await db.creator.create({
    data: {
      name: naam,
      soort: (String(formData.get("soort") ?? "extern") as CreatorSoort) ?? "extern",
      instagram: tekst("instagram")?.replace(/^@/, "") ?? null,
      tiktok: tekst("tiktok")?.replace(/^@/, "") ?? null,
      youtube: tekst("youtube"),
      niche:
        tekst("niche")
          ?.split(",")
          .map((n) => n.trim())
          .filter(Boolean) ?? [],
      land: tekst("land"),
      agency: tekst("agency"),
      volgersInstagram: leesGetal(tekst("volgersInstagram")),
      volgersTiktok: leesGetal(tekst("volgersTiktok")),
      prijsindicatieEur: leesGetal(tekst("prijsindicatieEur")),
      // Waar de cijfers vandaan komen hoort erbij. Zonder bron is een getal
      // een bewering, en daar mag geen agent op rekenen.
      cijfersBron: formData.get("volgersInstagram") || formData.get("volgersTiktok")
        ? `handmatig ingevoerd door ${user.name}`
        : null,
      cijfersOp: formData.get("volgersInstagram") || formData.get("volgersTiktok") ? new Date() : null,
    },
  });

  await audit(user, "creator_toegevoegd", naam, { type: "creator", id: creator.id });
  revalidatePath("/creators");

  return { ok: `${naam} staat in het register.` };
}

/// Een creator aan een campagne hangen.
export async function koppelCreatorAanCampagne(creatorId: string, projectId: string): Promise<void> {
  const user = await requireUser();

  const [creator, project] = await Promise.all([
    db.creator.findUnique({ where: { id: creatorId.trim() }, select: { id: true, name: true } }),
    db.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } }),
  ]);

  if (!creator) throw new Error("Die creator bestaat niet. Controleer het ID.");
  if (!project) throw new Error("Die campagne bestaat niet.");

  const bestaat = await db.creatorCampagne.findUnique({
    where: { creatorId_projectId: { creatorId: creator.id, projectId: project.id } },
  });
  if (bestaat) throw new Error(`${creator.name} zit al op ${project.name}.`);

  await db.creatorCampagne.create({ data: { creatorId: creator.id, projectId: project.id } });
  await audit(user, "creator_gekoppeld", `${creator.name} → ${project.name}`);

  revalidatePath("/creators");
  revalidatePath("/projecten");
}
