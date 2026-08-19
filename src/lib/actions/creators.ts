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

/// Een creator bijwerken.
///
/// Zonder dit kon je een creator alleen toevoegen: stond er een typefout in een
/// naam of een verouderd volgersaantal, dan bleef die staan. Een register dat je
/// niet kunt corrigeren wordt vanzelf een register dat niemand vertrouwt.
export async function werkCreatorBij(_prev: CreatorState, formData: FormData): Promise<CreatorState> {
  const user = await requireUser();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Onbekende creator." };

  const naam = String(formData.get("name") ?? "").trim();
  if (!naam) return { error: "Vul in ieder geval een naam in." };

  const bestaand = await db.creator.findUnique({ where: { id } });
  if (!bestaand) return { error: "Deze creator bestaat niet meer." };

  const tekst = (veld: string) => {
    const waarde = String(formData.get(veld) ?? "").trim();
    return waarde || null;
  };

  // Iemand anders met dezelfde naam mag niet, maar jezelf houden wel.
  const dubbel = await db.creator.findFirst({
    where: { name: { equals: naam, mode: "insensitive" }, id: { not: id } },
  });
  if (dubbel) return { error: `Er staat al een andere creator met de naam ${naam}.` };

  const nieuweCijfers =
    leesGetal(tekst("volgersInstagram")) !== bestaand.volgersInstagram ||
    leesGetal(tekst("volgersTiktok")) !== bestaand.volgersTiktok;

  await db.creator.update({
    where: { id },
    data: {
      name: naam,
      soort: (String(formData.get("soort") ?? bestaand.soort) as CreatorSoort) ?? bestaand.soort,
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
      // Alleen bijstellen als de cijfers echt veranderd zijn: anders zou elke
      // naamscorrectie de bron van de cijfers op vandaag zetten, en dan lijkt
      // een jaar oud getal vers.
      ...(nieuweCijfers
        ? { cijfersBron: `handmatig bijgewerkt door ${user.name}`, cijfersOp: new Date() }
        : {}),
    },
  });

  await audit(user, "creator_bijgewerkt", naam, { type: "creator", id });
  revalidatePath("/creators");

  return { ok: `${naam} is bijgewerkt.` };
}

/// Een creator uit het register halen.
export async function verwijderCreator(id: string): Promise<void> {
  const user = await requireUser();

  const creator = await db.creator.findUnique({ where: { id } });
  if (!creator) return;

  await db.creator.delete({ where: { id } });
  await audit(user, "creator_verwijderd", creator.name, { type: "creator", id });
  revalidatePath("/creators");
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
