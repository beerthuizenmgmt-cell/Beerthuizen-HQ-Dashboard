"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  ADAPTER_ORDER,
  encryptConfig,
  getAdapter,
  mergeWithExisting,
  type AdapterConfig,
} from "@/lib/adapters";
import { testAgentConnection } from "@/lib/agents";
import type { AdapterType, AgentCategory } from "@/generated/prisma/enums";

const CATEGORIES: AgentCategory[] = [
  "content",
  "marketing",
  "ads",
  "analyse",
  "ops",
  "research",
  "bizdev",
  "other",
];
// Uit de bron, niet overgetikt. Toen `builtin` erbij kwam is deze lijst ooit
// niet meegegroeid, waardoor het opslaan van het formulier een ingebouwde
// agent stilletjes op `manual` zette — en hij daarna niet meer meedeed aan
// proefdraaien en het ochtendoverleg.
const ADAPTER_TYPES: AdapterType[] = ADAPTER_ORDER;

export type SaveAgentState = { error?: string; ok?: boolean };

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/// Haalt de adapter-specifieke velden uit het formulier. De wizard geeft ze mee
/// als `config.<veldnaam>`, zodat er geen vaste veldenlijst in deze actie staat.
function readConfig(formData: FormData, type: AdapterType): AdapterConfig {
  const config: AdapterConfig = {};
  for (const field of getAdapter(type).fields) {
    const value = formData.get(`config.${field.name}`);
    if (typeof value === "string" && value.trim()) config[field.name] = value.trim();
  }
  return config;
}

export async function saveAgent(_prev: SaveAgentState, formData: FormData): Promise<SaveAgentState> {
  await requireUser();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const emoji = String(formData.get("emoji") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  const rawCategory = String(formData.get("category") ?? "other");
  const rawAdapter = String(formData.get("adapterType") ?? "manual");

  if (!name) return { error: "Geef de agent een naam." };
  if (!role) return { error: "Geef de agent een rol, zodat je in het overzicht ziet waar hij over gaat." };

  const category = (CATEGORIES as string[]).includes(rawCategory) ? (rawCategory as AgentCategory) : "other";
  const adapterType = (ADAPTER_TYPES as string[]).includes(rawAdapter)
    ? (rawAdapter as AdapterType)
    : "manual";

  const submitted = readConfig(formData, adapterType);

  const missing = getAdapter(adapterType)
    .fields.filter((field) => field.required && !submitted[field.name])
    .map((field) => field.label);

  const existing = id ? await db.agent.findUnique({ where: { id } }) : null;

  // Bij bewerken mogen geheimen leeg blijven: dan houden we wat er al stond.
  const merged =
    existing && existing.adapterType === adapterType
      ? mergeWithExisting(adapterType, submitted, existing.adapterConfig)
      : submitted;

  const stillMissing = getAdapter(adapterType)
    .fields.filter((field) => field.required && !merged[field.name])
    .map((field) => field.label);

  if (stillMissing.length && missing.length) {
    return { error: `Vul nog in: ${stillMissing.join(", ")}.` };
  }

  const data = {
    name,
    role,
    description: description || null,
    emoji: emoji || null,
    color: color || null,
    category,
    adapterType,
    adapterConfig: encryptConfig(adapterType, merged),
  };

  if (existing) {
    await db.agent.update({ where: { id: existing.id }, data });
    revalidatePath("/agents");
    revalidatePath(`/agents/${existing.id}`);
    revalidatePath("/hq");
    return { ok: true };
  }

  // Unieke sleutel afdwingen zonder de gebruiker met techniek lastig te vallen.
  const base = slugify(name) || "agent";
  let key = base;
  for (let suffix = 2; await db.agent.findUnique({ where: { key } }); suffix += 1) {
    key = `${base}-${suffix}`;
  }

  const count = await db.agent.count();
  const created = await db.agent.create({ data: { ...data, key, sortOrder: count } });

  // Elke agent krijgt meteen zijn eigen DM-kanaal.
  await db.channel.create({
    data: {
      key: `dm-${key}`,
      name: created.name,
      kind: "dm",
      agentId: created.id,
      purpose: `Rechtstreeks gesprek met ${created.name}`,
    },
  });

  revalidatePath("/agents");
  revalidatePath("/hq");
  redirect(`/agents/${created.id}`);
}

export async function testConnectionAction(agentId: string) {
  await requireUser();
  const result = await testAgentConnection(agentId);
  revalidatePath(`/agents/${agentId}`);
  revalidatePath("/hq");
  return result;
}

export async function togglePause(agentId: string) {
  await requireUser();
  const agent = await db.agent.findUnique({ where: { id: agentId }, select: { paused: true } });
  if (!agent) return;
  await db.agent.update({ where: { id: agentId }, data: { paused: !agent.paused } });
  revalidatePath(`/agents/${agentId}`);
  revalidatePath("/hq");
  revalidatePath("/agents");
}

export async function deleteAgent(agentId: string) {
  await requireUser();
  await db.agent.delete({ where: { id: agentId } });
  revalidatePath("/agents");
  revalidatePath("/hq");
  redirect("/agents");
}
