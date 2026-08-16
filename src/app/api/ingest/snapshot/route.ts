import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateInstance, derivedKey, ingestError, resolveAgent } from "@/lib/ingest";
import type { AgentCategory, AgentStatus } from "@/generated/prisma/enums";

// Payloadvorm van de bestaande reader (~/.elara-reader). Onbekende velden worden
// genegeerd zodat een nieuwere readerversie dit endpoint niet omver trekt.

const AgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(""),
  role: z.string().default(""),
  category: z.string().default("other"),
  status: z.string().default("idle"),
  status_text: z.string().optional(),
  model: z.string().optional(),
  channels: z.array(z.string()).default([]),
  progress_pct: z.number().int().min(0).max(100).optional(),
  last_active_at: z.string().optional(),
});

const SnapshotSchema = z.object({
  instance_id: z.string().optional(),
  timestamp: z.string().optional(),
  reader_version: z.string().optional(),
  agents: z.array(AgentSchema).default([]),
  models: z
    .array(
      z.object({
        id: z.string(),
        provider: z.string().default("unknown"),
        online: z.boolean().default(true),
        context_window: z.number().int().positive().optional(),
      }),
    )
    .default([]),
  skills: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().default(""),
        description: z.string().default(""),
        installed: z.boolean().default(false),
        slash_command: z.string().optional(),
        icon: z.string().optional(),
        category: z.string().optional(),
      }),
    )
    .default([]),
});

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
const STATUSES: AgentStatus[] = ["active", "idle", "error", "offline", "paused"];

function toCategory(value: string): AgentCategory {
  return (CATEGORIES as string[]).includes(value) ? (value as AgentCategory) : "other";
}
function toStatus(value: string): AgentStatus {
  return (STATUSES as string[]).includes(value) ? (value as AgentStatus) : "idle";
}
function toDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function POST(request: Request) {
  const auth = await authenticateInstance(request);
  if ("error" in auth) return ingestError(auth.error);
  const { instance } = auth;

  const parsed = SnapshotSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 422 });
  }
  const snapshot = parsed.data;

  let created = 0;
  for (const raw of snapshot.agents) {
    const existing = await resolveAgent(instance.id, instance.publicId, raw.id);
    const data = {
      status: toStatus(raw.status),
      statusText: raw.status_text ?? null,
      model: raw.model ?? null,
      channels: raw.channels,
      progressPct: raw.progress_pct ?? null,
      lastActiveAt: toDate(raw.last_active_at) ?? null,
      instanceId: instance.id,
      lastCheckedAt: new Date(),
      lastError: null,
    };

    if (existing) {
      // Naam, rol en categorie zijn van jou zodra je ze in de UI hebt aangepast;
      // de reader mag alleen de levende status bijwerken.
      await db.agent.update({ where: { id: existing.id }, data });
    } else {
      await db.agent.create({
        data: {
          ...data,
          key: derivedKey(instance.publicId, raw.id),
          name: raw.name || raw.id,
          role: raw.role || "OpenClaw agent",
          category: toCategory(raw.category),
          adapterType: "reader_ingest",
          adapterConfig: { instancePublicId: instance.publicId, remoteAgentId: raw.id },
          sortOrder: 100,
        },
      });
      created += 1;
    }
  }

  for (const model of snapshot.models) {
    await db.modelInfo.upsert({
      where: { instanceId_modelId: { instanceId: instance.id, modelId: model.id } },
      update: { provider: model.provider, online: model.online, contextWindow: model.context_window ?? null },
      create: {
        instanceId: instance.id,
        modelId: model.id,
        provider: model.provider,
        online: model.online,
        contextWindow: model.context_window ?? null,
      },
    });
  }

  for (const skill of snapshot.skills) {
    await db.skill.upsert({
      where: { instanceId_key: { instanceId: instance.id, key: skill.id } },
      update: {
        name: skill.name || skill.id,
        description: skill.description,
        installed: skill.installed,
        slashCommand: skill.slash_command ?? null,
        icon: skill.icon ?? null,
        category: skill.category ?? null,
      },
      create: {
        instanceId: instance.id,
        key: skill.id,
        name: skill.name || skill.id,
        description: skill.description,
        installed: skill.installed,
        slashCommand: skill.slash_command ?? null,
        icon: skill.icon ?? null,
        category: skill.category ?? null,
      },
    });
  }

  await db.instance.update({
    where: { id: instance.id },
    data: { lastSnapshotAt: new Date(), readerVersion: snapshot.reader_version ?? instance.readerVersion },
  });

  return Response.json({
    ok: true,
    agents: snapshot.agents.length,
    created,
    models: snapshot.models.length,
    skills: snapshot.skills.length,
  });
}
