"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner, audit } from "@/lib/access";
import { getToolEntry } from "@/lib/ai/toolkit";
import type { ToolPermission } from "@/generated/prisma/enums";

export type IntegratieState = { error?: string; ok?: string };

const PERMISSIONS: ToolPermission[] = ["lezen", "voorstellen", "schrijven"];

/// Wat een agent met een tool mag. Alleen de eigenaar: dit bepaalt of een agent
/// ergens alleen mag kijken of ook mag ingrijpen.
export async function setToolPermission(
  agentId: string,
  toolKey: string,
  permission: string,
): Promise<void> {
  const user = await requireOwner();
  if (!(PERMISSIONS as string[]).includes(permission)) return;

  const koppeling = await db.agentTool.findUnique({
    where: { agentId_toolKey: { agentId, toolKey } },
    include: { agent: { select: { name: true } } },
  });
  if (!koppeling) return;

  await db.agentTool.update({
    where: { id: koppeling.id },
    data: { permission: permission as ToolPermission },
  });

  await audit(user, "tool_permission", `${koppeling.agent.name} · ${toolKey} → ${permission}`, {
    type: "agent",
    id: agentId,
  });

  revalidatePath("/tools");
  revalidatePath(`/agents/${agentId}`);
}

/// Een tool aan een agent hangen, of er weer af halen.
export async function koppelTool(
  agentId: string,
  toolKey: string,
  aan: boolean,
): Promise<IntegratieState> {
  const user = await requireOwner();

  const entry = getToolEntry(toolKey);
  if (!entry) return { error: "Onbekende tool." };

  const agent = await db.agent.findUnique({ where: { id: agentId }, select: { name: true } });
  if (!agent) return { error: "Agent bestaat niet." };

  if (aan) {
    const integratie = await db.toolIntegration.findUnique({ where: { toolKey } });
    if (integratie && !integratie.enabled) {
      return { error: `${entry.name} staat bedrijfsbreed uit. Zet hem eerst aan op de toolspagina.` };
    }

    await db.agentTool.upsert({
      where: { agentId_toolKey: { agentId, toolKey } },
      update: { enabled: true },
      create: { agentId, toolKey, enabled: true },
    });
    await audit(user, "tool_koppel", `${agent.name} · ${toolKey}`, { type: "agent", id: agentId });
  } else {
    // Losmaken en niet verwijderen: de instellingen en het gebruik blijven zo
    // bewaard als je hem later weer aanzet.
    await db.agentTool.updateMany({ where: { agentId, toolKey }, data: { enabled: false } });
    await audit(user, "tool_ontkoppel", `${agent.name} · ${toolKey}`, { type: "agent", id: agentId });
  }

  revalidatePath("/tools");
  revalidatePath(`/agents/${agentId}`);
  return { ok: aan ? `${entry.name} gekoppeld aan ${agent.name}.` : `${entry.name} losgemaakt.` };
}

/// Tool bedrijfsbreed aan- of uitzetten.
export async function zetToolActief(toolKey: string, actief: boolean): Promise<void> {
  const user = await requireOwner();

  await db.toolIntegration.upsert({
    where: { toolKey },
    update: { enabled: actief },
    create: { toolKey, enabled: actief },
  });

  await audit(user, actief ? "tool_aan" : "tool_uit", toolKey);
  revalidatePath("/tools");
}

/// Wat dit platform per maand kost. Handmatig, want abonnementsgeld valt
/// nergens automatisch uit af te leiden — en verzinnen doen we niet.
export async function setToolKosten(
  toolKey: string,
  _prev: IntegratieState,
  formData: FormData,
): Promise<IntegratieState> {
  const user = await requireOwner();

  const ruw = String(formData.get("bedrag") ?? "").trim().replace(",", ".");
  const notities = String(formData.get("notities") ?? "").trim();

  let bedrag: number | null = null;
  if (ruw) {
    const getal = Number(ruw);
    if (!Number.isFinite(getal) || getal < 0) return { error: "Vul een bedrag in, of laat het leeg." };
    bedrag = getal;
  }

  await db.toolIntegration.upsert({
    where: { toolKey },
    update: { monthlyCostEur: bedrag, notes: notities || null },
    create: { toolKey, monthlyCostEur: bedrag, notes: notities || null },
  });

  await audit(user, "tool_kosten", `${toolKey} → ${bedrag === null ? "onbekend" : `€${bedrag}`}`);
  revalidatePath("/tools");

  return { ok: "Opgeslagen." };
}

/// De sleutels van een koppeling opslaan.
///
/// Dit ontbrak. Je kon een tool wel aan een agent hangen, maar de sleutel
/// nergens invullen — dus stonden er zesentachtig koppelingen zonder één werkende
/// verbinding, en niemand die kon zien waaróm ze niets deden.
///
/// Wat geheim is gaat versleuteld de database in en komt nooit meer terug naar
/// de browser. Laat je een veld leeg, dan blijft staan wat er stond: zo kun je
/// het bedrag aanpassen zonder je sleutel opnieuw te moeten intikken.
export async function bewaarToolSleutels(
  agentId: string,
  toolKey: string,
  waarden: Record<string, string>,
): Promise<IntegratieState> {
  const user = await requireOwner();

  const entry = getToolEntry(toolKey);
  if (!entry) return { error: "Onbekende tool." };

  const koppeling = await db.agentTool.findUnique({
    where: { agentId_toolKey: { agentId, toolKey } },
  });
  if (!koppeling) return { error: "Deze tool is nog niet aan deze agent gekoppeld." };

  const { decryptToolConfig, encryptToolConfig } = await import("@/lib/ai/toolkit");
  const bestaand = decryptToolConfig(koppeling.config);

  const samen: Record<string, string> = { ...bestaand };
  for (const veld of entry.fields ?? []) {
    const nieuw = (waarden[veld.name] ?? "").trim();
    if (nieuw) samen[veld.name] = nieuw;
  }

  // Verplichte velden die nog steeds leeg zijn: dan werkt de koppeling niet en
  // dat zeggen we nu, in plaats van dat de agent er later op stukloopt.
  const ontbreekt = (entry.fields ?? [])
    .filter((veld) => veld.required && !samen[veld.name])
    .map((veld) => veld.label);

  await db.agentTool.update({
    where: { id: koppeling.id },
    data: { config: encryptToolConfig(toolKey, samen) },
  });

  const agent = await db.agent.findUnique({ where: { id: agentId }, select: { name: true } });
  await audit(user, "tool_sleutel", `${agent?.name ?? agentId} · ${toolKey}`, {
    type: "agent",
    id: agentId,
  });

  revalidatePath("/tools");
  revalidatePath(`/agents/${agentId}`);

  return ontbreekt.length
    ? { error: `Opgeslagen, maar ${ontbreekt.join(" en ")} ontbreekt nog — zo werkt de koppeling niet.` }
    : { ok: `Sleutels opgeslagen voor ${agent?.name ?? "de agent"}.` };
}

/// Wat er is ingevuld, zonder de geheimen zelf.
///
/// Het scherm moet kunnen laten zien dát er een sleutel staat, maar hem nooit
/// tonen: een wachtwoordveld met de echte waarde erin is met één klik in de
/// broncode te lezen.
export async function leesToolInstellingen(
  agentId: string,
  toolKey: string,
): Promise<{ ingevuld: string[]; ontbreekt: string[] }> {
  await requireOwner();

  const entry = getToolEntry(toolKey);
  if (!entry) return { ingevuld: [], ontbreekt: [] };

  const koppeling = await db.agentTool.findUnique({
    where: { agentId_toolKey: { agentId, toolKey } },
  });
  if (!koppeling) return { ingevuld: [], ontbreekt: (entry.fields ?? []).map((f) => f.name) };

  const { decryptToolConfig } = await import("@/lib/ai/toolkit");
  const config = decryptToolConfig(koppeling.config);

  return {
    ingevuld: (entry.fields ?? []).filter((f) => config[f.name]).map((f) => f.name),
    ontbreekt: (entry.fields ?? []).filter((f) => f.required && !config[f.name]).map((f) => f.name),
  };
}

/// De sleutels van het bureau voor een koppeling.
///
/// Eén keer invullen in plaats van bij elke agent apart. Je hebt één abonnement
/// bij Tavily, niet één per agent; hem drie keer moeten intikken is werk dat
/// niets oplevert en een plek waar er eentje verkeerd gaat.
export async function bewaarBureauSleutels(
  toolKey: string,
  waarden: Record<string, string>,
): Promise<IntegratieState> {
  const user = await requireOwner();

  const entry = getToolEntry(toolKey);
  if (!entry) return { error: "Onbekende tool." };

  const { decryptToolConfig, encryptToolConfig } = await import("@/lib/ai/toolkit");

  const bestaand = await db.toolIntegration.findUnique({ where: { toolKey } });
  const huidig = decryptToolConfig(bestaand?.config);

  const samen: Record<string, string> = { ...huidig };
  for (const veld of entry.fields ?? []) {
    const nieuw = (waarden[veld.name] ?? "").trim();
    if (nieuw) samen[veld.name] = nieuw;
  }

  const versleuteld = encryptToolConfig(toolKey, samen);

  await db.toolIntegration.upsert({
    where: { toolKey },
    update: { config: versleuteld },
    create: { toolKey, config: versleuteld },
  });

  await audit(user, "tool_sleutel_bureau", toolKey, { type: "tool", id: toolKey });

  const ontbreekt = (entry.fields ?? [])
    .filter((veld) => veld.required && !samen[veld.name])
    .map((veld) => veld.label);

  // Zodra de sleutel er is, koppelen we hem aan wie hem nodig heeft.
  //
  // Handmatig agents aanwijzen is werk dat het systeem zelf kan doen: in de
  // catalogus staat per koppeling al voor wiens vak hij bedoeld is. Jij plakt
  // een sleutel, wij zorgen dat de juiste mensen ermee kunnen werken.
  //
  // Alleen als er niets ontbreekt, want een halve koppeling uitdelen levert
  // negen agents op die op dezelfde foutmelding stuklopen.
  let gekoppeldAan: string[] = [];
  if (ontbreekt.length === 0 && entry.suggestedFor.length > 0) {
    const agents = await db.agent.findMany({
      where: { key: { in: entry.suggestedFor }, adapterType: { not: "reader_ingest" } },
      select: { id: true, name: true },
    });

    for (const agent of agents) {
      await db.agentTool.upsert({
        where: { agentId_toolKey: { agentId: agent.id, toolKey } },
        update: { enabled: true },
        create: { agentId: agent.id, toolKey, enabled: true },
      });
    }
    gekoppeldAan = agents.map((a) => a.name);
  }

  revalidatePath("/tools");
  revalidatePath("/agents");

  if (ontbreekt.length) {
    return { error: `Opgeslagen, maar ${ontbreekt.join(" en ")} ontbreekt nog — zo werkt de koppeling niet.` };
  }

  return {
    ok: gekoppeldAan.length
      ? `${entry.name} staat aan voor ${gekoppeldAan.join(", ")}.`
      : `Sleutels opgeslagen voor ${entry.name}.`,
  };
}
