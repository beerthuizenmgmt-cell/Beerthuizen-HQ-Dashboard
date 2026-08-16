"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getToolEntry, encryptToolConfig, decryptToolConfig } from "@/lib/ai/toolkit";
import { maskSecret } from "@/lib/crypto";

export type ToolState = { error?: string; ok?: string };

/// Koppelt een tool aan één agent. Bewust per agent: dezelfde tool bij een
/// collega is een aparte koppeling met een eigen configuratie.
export async function attachTool(_prev: ToolState, formData: FormData): Promise<ToolState> {
  await requireUser();

  const agentId = String(formData.get("agentId") ?? "");
  const toolKey = String(formData.get("toolKey") ?? "");
  const label = String(formData.get("label") ?? "").trim();

  const entry = getToolEntry(toolKey);
  if (!entry) return { error: "Onbekende tool." };

  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent) return { error: "Agent bestaat niet." };

  const submitted: Record<string, string> = {};
  for (const field of entry.fields) {
    const value = formData.get(`config.${field.name}`);
    if (typeof value === "string" && value.trim()) submitted[field.name] = value.trim();
  }

  const existing = await db.agentTool.findUnique({
    where: { agentId_toolKey: { agentId, toolKey } },
  });

  // Bij bewerken mogen geheimen leeg blijven: dan houden we wat er stond.
  const current = existing ? decryptToolConfig(existing.config) : {};
  const merged = { ...current, ...submitted };

  const missing = entry.fields
    .filter((field) => field.required && !merged[field.name])
    .map((field) => field.label);
  if (missing.length) return { error: `Nog invullen: ${missing.join(", ")}.` };

  const data = {
    label: label || entry.name,
    config: encryptToolConfig(toolKey, merged),
    enabled: true,
  };

  if (existing) {
    await db.agentTool.update({ where: { id: existing.id }, data });
  } else {
    await db.agentTool.create({ data: { agentId, toolKey, ...data } });
  }

  revalidatePath(`/agents/${agentId}`);

  return {
    ok: entry.implemented
      ? `${entry.name} gekoppeld aan ${agent.name}.`
      : `${entry.name} vastgelegd bij ${agent.name}. Let op: deze koppeling is nog niet gebouwd, dus ${agent.name} kan hem nog niet gebruiken.`,
  };
}

export async function detachTool(toolId: string) {
  await requireUser();
  const tool = await db.agentTool.findUnique({ where: { id: toolId }, select: { agentId: true } });
  if (!tool) return;
  await db.agentTool.delete({ where: { id: toolId } });
  revalidatePath(`/agents/${tool.agentId}`);
}

export async function toggleTool(toolId: string, enabled: boolean) {
  await requireUser();
  const tool = await db.agentTool.update({
    where: { id: toolId },
    data: { enabled },
    select: { agentId: true },
  });
  revalidatePath(`/agents/${tool.agentId}`);
}

/// Wat het scherm mag zien: geheimen gemaskeerd.
export async function toolConfigForUi(toolId: string): Promise<Record<string, string>> {
  await requireUser();
  const tool = await db.agentTool.findUnique({ where: { id: toolId } });
  if (!tool) return {};

  const entry = getToolEntry(tool.toolKey);
  const secrets = new Set((entry?.fields ?? []).filter((field) => field.secret).map((f) => f.name));
  const decrypted = decryptToolConfig(tool.config);

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(decrypted)) {
    out[key] = secrets.has(key) ? maskSecret(value) : value;
  }
  return out;
}

// ============================================================
// Identiteit
// ============================================================

export type IdentityState = { error?: string; ok?: string };

const MAX_AVATAR_BYTES = 400_000;

/// Naam, functietitel, beschrijving en gezicht. De avatar mag een adres zijn of
/// een geüpload bestand; dat laatste bewaren we als data-URI in de database, dan
/// werkt het ook online zonder aparte opslagdienst.
export async function saveIdentity(_prev: IdentityState, formData: FormData): Promise<IdentityState> {
  await requireUser();

  const agentId = String(formData.get("agentId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const emoji = String(formData.get("emoji") ?? "").trim();
  const avatarUrlField = String(formData.get("avatarUrl") ?? "").trim();
  const removeAvatar = formData.get("removeAvatar") === "on";

  if (!name) return { error: "Geef de agent een naam." };
  if (!role) return { error: "Geef een functietitel." };

  let avatarUrl: string | null | undefined;

  if (removeAvatar) {
    avatarUrl = null;
  } else {
    const file = formData.get("avatarFile");
    if (file instanceof File && file.size > 0) {
      if (!file.type.startsWith("image/")) return { error: "Kies een afbeelding." };
      if (file.size > MAX_AVATAR_BYTES) {
        return {
          error: `Die afbeelding is ${Math.round(file.size / 1024)} kB. Houd het onder ${MAX_AVATAR_BYTES / 1024} kB — hij wordt klein getoond, dus dat is ruim genoeg.`,
        };
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      avatarUrl = `data:${file.type};base64,${buffer.toString("base64")}`;
    } else if (avatarUrlField) {
      if (!/^https?:\/\//.test(avatarUrlField)) return { error: "Een adres moet met http of https beginnen." };
      avatarUrl = avatarUrlField;
    }
  }

  await db.agent.update({
    where: { id: agentId },
    data: {
      name,
      role,
      description: description || null,
      emoji: emoji || null,
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
    },
  });

  // De naam staat ook op zijn DM-kanaal.
  await db.channel.updateMany({ where: { agentId }, data: { name } });

  revalidatePath(`/agents/${agentId}`);
  revalidatePath("/agents");
  revalidatePath("/hq");
  return { ok: "Opgeslagen." };
}
