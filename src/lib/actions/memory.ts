"use server";

import { revalidatePath } from "next/cache";
import { requireOwner, audit } from "@/lib/access";
import { remember, archiveMemory, isMemoryKind } from "@/lib/ai/memory";
import { db } from "@/lib/db";

export type MemoryState = { error?: string; ok?: boolean };

/// Enriqueo geeft een agent iets mee om te onthouden. Alleen de eigenaar: het
/// geheugen stuurt gedrag aan, dus dit is geen knop voor iedereen.
export async function addMemory(
  agentId: string,
  _prev: MemoryState,
  formData: FormData,
): Promise<MemoryState> {
  const user = await requireOwner();

  const title = String(formData.get("titel") ?? "").trim();
  const body = String(formData.get("inhoud") ?? "").trim();
  const kind = String(formData.get("soort") ?? "context");

  if (!title || !body) return { error: "Vul een titel en de inhoud in." };
  if (!isMemoryKind(kind)) return { error: "Onbekende soort." };

  const agent = await db.agent.findUnique({ where: { id: agentId }, select: { name: true } });
  if (!agent) return { error: "Agent bestaat niet." };

  await remember({
    agentId,
    kind,
    title,
    body,
    source: "user",
    pinned: formData.get("vastzetten") === "on",
  });

  await audit(user, "memory_add", `${agent.name}: ${title}`, { type: "agent", id: agentId });
  revalidatePath(`/agents/${agentId}`);

  return { ok: true };
}

export async function forgetMemory(agentId: string, memoryId: string): Promise<void> {
  const user = await requireOwner();

  const memory = await db.agentMemory.findUnique({
    where: { id: memoryId },
    select: { title: true, agentId: true },
  });
  if (!memory || memory.agentId !== agentId) return;

  await archiveMemory(memoryId);
  await audit(user, "memory_archive", memory.title, { type: "agent", id: agentId });
  revalidatePath(`/agents/${agentId}`);
}

/// Vastzetten of losmaken. Vastgezette herinneringen gaan altijd mee, ook als
/// de lijst langer wordt dan wat er in één prompt past.
export async function togglePinned(agentId: string, memoryId: string): Promise<void> {
  await requireOwner();

  const memory = await db.agentMemory.findUnique({
    where: { id: memoryId },
    select: { pinned: true, agentId: true },
  });
  if (!memory || memory.agentId !== agentId) return;

  await db.agentMemory.update({ where: { id: memoryId }, data: { pinned: !memory.pinned } });
  revalidatePath(`/agents/${agentId}`);
}
