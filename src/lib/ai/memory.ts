import "server-only";

import { db } from "@/lib/db";

// Het geheugen van een agent.
//
// Zonder dit begint elke denkbeurt bij nul: dezelfde uitleg, dezelfde vragen,
// dezelfde fouten. Met dit weet hij dat je vorige week besloot geen brand trips
// meer in december te plannen, en waarom.
//
// Bewust klein gehouden. Een geheugen dat alles onthoudt is een geheugen dat
// niets weegt — en het gaat mee in élk prompt, dus elk woord kost geld.

export const MEMORY_KINDS = ["besluit", "voorkeur", "afspraak", "leerpunt", "context"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

/// Hoeveel herinneringen er maximaal meegaan in één prompt. Vastgezette
/// herinneringen gaan altijd mee en tellen hier los van.
const MAX_IN_PROMPT = 12;

export function isMemoryKind(value: string): value is MemoryKind {
  return (MEMORY_KINDS as readonly string[]).includes(value);
}

/// De herinneringen die nu gelden: niet gearchiveerd, niet verlopen.
export async function activeMemories(agentId: string) {
  return db.agentMemory.findMany({
    where: {
      agentId,
      archivedAt: null,
      OR: [{ activeUntil: null }, { activeUntil: { gt: new Date() } }],
    },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
  });
}

/// Het geheugen als tekst voor het systeemprompt. Leeg als er niets is —
/// dan staat er ook geen loos kopje in het prompt.
export async function memoryAsPrompt(agentId: string): Promise<string> {
  const all = await activeMemories(agentId);
  if (all.length === 0) return "";

  const pinned = all.filter((memory) => memory.pinned);
  const rest = all.filter((memory) => !memory.pinned).slice(0, MAX_IN_PROMPT);
  const chosen = [...pinned, ...rest];

  // Bijhouden wat echt gebruikt wordt, zodat je in het dossier ziet welke
  // herinneringen dode ballast zijn.
  await db.agentMemory.updateMany({
    where: { id: { in: chosen.map((memory) => memory.id) } },
    data: { lastUsedAt: new Date() },
  });

  const lines = chosen.map((memory) => {
    const datum = memory.createdAt.toISOString().slice(0, 10);
    const wie = memory.source === "user" ? "Enriqueo" : "jijzelf";
    return `- [${memory.kind}, ${datum}, vastgelegd door ${wie}] ${memory.title}: ${memory.body}`;
  });

  const weggelaten = all.length - chosen.length;

  return [
    `# Wat je onthouden hebt`,
    ...lines,
    weggelaten > 0
      ? `(${weggelaten} oudere herinneringen laat ik hier weg; ze staan wel in je dossier.)`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/// Iets onthouden. Dubbel opslaan heeft geen zin, dus een herinnering met
/// dezelfde titel wordt bijgewerkt in plaats van eronder geplakt.
export async function remember(options: {
  agentId: string;
  kind: MemoryKind;
  title: string;
  body: string;
  source?: "agent" | "user";
  pinned?: boolean;
  activeUntil?: Date | null;
}): Promise<{ created: boolean }> {
  const title = options.title.trim().slice(0, 200);
  const body = options.body.trim().slice(0, 2000);

  const existing = await db.agentMemory.findFirst({
    where: { agentId: options.agentId, title, archivedAt: null },
  });

  if (existing) {
    await db.agentMemory.update({
      where: { id: existing.id },
      data: {
        body,
        kind: options.kind,
        pinned: options.pinned ?? existing.pinned,
        activeUntil: options.activeUntil ?? existing.activeUntil,
      },
    });
    return { created: false };
  }

  await db.agentMemory.create({
    data: {
      agentId: options.agentId,
      kind: options.kind,
      title,
      body,
      source: options.source ?? "agent",
      pinned: options.pinned ?? false,
      activeUntil: options.activeUntil ?? null,
    },
  });

  return { created: true };
}

export async function archiveMemory(id: string): Promise<void> {
  await db.agentMemory.update({ where: { id }, data: { archivedAt: new Date() } });
}
