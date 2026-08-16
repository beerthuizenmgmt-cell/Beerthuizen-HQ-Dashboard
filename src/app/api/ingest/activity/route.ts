import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { authenticateInstance, ingestError, resolveAgent } from "@/lib/ingest";
import type { ActivityLevel } from "@/generated/prisma/enums";

const LEVELS: ActivityLevel[] = ["info", "warn", "error", "success"];

const ActivitySchema = z.object({
  instance_id: z.string().optional(),
  events: z
    .array(
      z.object({
        occurred_at: z.string(),
        agent_id: z.string().optional(),
        kind: z.string().default("event"),
        message: z.string().default(""),
        level: z.string().default("info"),
        payload: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .default([]),
});

export async function POST(request: Request) {
  const auth = await authenticateInstance(request);
  if ("error" in auth) return ingestError(auth.error);
  const { instance } = auth;

  const parsed = ActivitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 422 });
  }

  // Agent-ID's binnen één batch herhalen zich vaak; één keer opzoeken is genoeg.
  const agentIdCache = new Map<string, string | null>();
  async function localAgentId(remoteId?: string): Promise<string | null> {
    if (!remoteId) return null;
    if (agentIdCache.has(remoteId)) return agentIdCache.get(remoteId) ?? null;
    const agent = await resolveAgent(instance.id, instance.publicId, remoteId);
    agentIdCache.set(remoteId, agent?.id ?? null);
    return agent?.id ?? null;
  }

  let stored = 0;
  for (const event of parsed.data.events) {
    const occurredAt = new Date(event.occurred_at);
    if (Number.isNaN(occurredAt.getTime())) continue;

    await db.activityEvent.create({
      data: {
        occurredAt,
        kind: event.kind,
        message: event.message,
        level: (LEVELS as string[]).includes(event.level) ? (event.level as ActivityLevel) : "info",
        payload: (event.payload as Prisma.InputJsonValue) ?? undefined,
        agentId: await localAgentId(event.agent_id),
        instanceId: instance.id,
      },
    });
    stored += 1;
  }

  return Response.json({ ok: true, stored });
}
