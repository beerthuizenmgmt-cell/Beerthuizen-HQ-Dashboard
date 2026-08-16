import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { decryptConfig, getAdapter, readableError, type ConnectionTest } from "./adapters";

/// Test de verbinding van één agent en legt het resultaat vast, zodat het
/// overzicht laat zien wanneer er voor het laatst contact was.
export async function testAgentConnection(agentId: string): Promise<ConnectionTest> {
  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent) return { ok: false, message: "Agent bestaat niet (meer)." };

  const adapter = getAdapter(agent.adapterType);
  const config = decryptConfig(agent.adapterConfig);

  const missing = adapter.fields
    .filter((field) => field.required && !config[field.name])
    .map((field) => field.label);
  if (missing.length) {
    return { ok: false, message: `Nog invullen: ${missing.join(", ")}.` };
  }

  let result: ConnectionTest;
  try {
    result = await adapter.testConnection(config);
  } catch (error) {
    result = { ok: false, message: readableError(error) };
  }

  await db.agent.update({
    where: { id: agentId },
    data: {
      lastCheckedAt: new Date(),
      lastError: result.ok ? null : result.message,
      ...(result.ok ? {} : { status: "error" as const }),
    },
  });

  return result;
}

/// Haalt actuele status op bij agents die dat ondersteunen. Fouten worden per
/// agent opgevangen — één onbereikbare agent mag het overzicht niet blokkeren.
export async function refreshAgentStatus(agentId: string): Promise<void> {
  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent || agent.paused) return;

  const adapter = getAdapter(agent.adapterType);
  if (!adapter.fetchStatus) return;

  try {
    const snapshot = await adapter.fetchStatus(decryptConfig(agent.adapterConfig));
    await db.agent.update({
      where: { id: agentId },
      data: {
        status: snapshot.status,
        statusText: snapshot.statusText ?? null,
        model: snapshot.model ?? agent.model,
        lastActiveAt: snapshot.lastActiveAt ?? agent.lastActiveAt,
        lastCheckedAt: new Date(),
        lastError: null,
      },
    });
  } catch (error) {
    await db.agent.update({
      where: { id: agentId },
      data: { status: "error", lastError: readableError(error), lastCheckedAt: new Date() },
    });
  }
}

/// Stuurt een bericht naar een agent via zijn eigen koppeling.
export async function sendToAgent(
  agentId: string,
  text: string,
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent) return { ok: false, error: "Agent bestaat niet (meer)." };
  if (agent.paused) return { ok: false, error: `${agent.name} staat op pauze.` };

  const adapter = getAdapter(agent.adapterType);
  if (!adapter.sendMessage) {
    return {
      ok: false,
      error: `${agent.name} is gekoppeld via "${adapter.label}" en kan geen berichten ontvangen. Koppel hem via Telegram of de gateway om taken uit te besteden.`,
    };
  }

  try {
    return await adapter.sendMessage(decryptConfig(agent.adapterConfig), text);
  } catch (error) {
    return { ok: false, error: readableError(error) };
  }
}

/// Losse activiteitregel wegschrijven — gebruikt door dispatch, webhooks en cron.
export async function logActivity(input: {
  agentId?: string | null;
  kind: string;
  message: string;
  level?: "info" | "warn" | "error" | "success";
  payload?: Prisma.InputJsonValue;
}): Promise<void> {
  await db.activityEvent.create({
    data: {
      agentId: input.agentId ?? null,
      kind: input.kind,
      message: input.message,
      level: input.level ?? "info",
      payload: input.payload ?? undefined,
      occurredAt: new Date(),
    },
  });
}
