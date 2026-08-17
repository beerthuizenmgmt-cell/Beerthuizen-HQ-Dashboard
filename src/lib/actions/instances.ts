"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
// Een instance heeft een eigen sleutel waarmee van buiten data binnenkomt.
import { requireOwner } from "@/lib/access";
import { createInstance } from "@/lib/ingest";

export type InstanceState = {
  error?: string;
  /// De sleutel is hierna niet meer op te vragen — alleen de hash gaat de
  /// database in. Daarom geven we hem één keer terug aan de UI.
  created?: { name: string; publicId: string; apiKey: string };
};

export async function addInstance(_prev: InstanceState, formData: FormData): Promise<InstanceState> {
  await requireOwner();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Geef de koppeling een naam, bijvoorbeeld 'Mac Mini kantoor'." };

  const { instance, apiKey } = await createInstance(name);
  revalidatePath("/instellingen");

  return { created: { name: instance.name, publicId: instance.publicId, apiKey } };
}

export async function deleteInstance(instanceId: string) {
  await requireOwner();
  await db.instance.delete({ where: { id: instanceId } });
  revalidatePath("/instellingen");
}
