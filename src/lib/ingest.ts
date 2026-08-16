import "server-only";

import bcrypt from "bcryptjs";
import { db } from "./db";
import { randomToken } from "./crypto";

export type IngestAuthError = "missing_auth" | "malformed_auth" | "unknown_instance" | "bad_key";

type InstanceRecord = Awaited<ReturnType<typeof db.instance.findUniqueOrThrow>>;

/// Auth voor de ingest-endpoints: `Authorization: Bearer <publicId>:<apiKey>`.
/// Exact het formaat dat de bestaande reader in ~/.elara-reader al stuurt.
export async function authenticateInstance(
  request: Request,
): Promise<{ error: IngestAuthError } | { instance: InstanceRecord }> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return { error: "missing_auth" as const };

  const separator = match[1].indexOf(":");
  if (separator === -1) return { error: "malformed_auth" as const };

  const publicId = match[1].slice(0, separator);
  const apiKey = match[1].slice(separator + 1);

  const instance = await db.instance.findUnique({ where: { publicId } });
  if (!instance || !instance.active) return { error: "unknown_instance" as const };
  if (!(await bcrypt.compare(apiKey, instance.apiKeyHash))) return { error: "bad_key" as const };

  return { instance };
}

export function ingestError(kind: IngestAuthError) {
  const messages: Record<IngestAuthError, string> = {
    missing_auth: "Authorization-header ontbreekt. Verwacht: Bearer <instance_id>:<api_key>",
    malformed_auth: "Authorization-header heeft niet de vorm <instance_id>:<api_key>",
    unknown_instance: "Onbekende of uitgeschakelde instance",
    bad_key: "Ongeldige API-sleutel",
  };
  return Response.json({ error: kind, message: messages[kind] }, { status: 401 });
}

/// Maakt een nieuwe instance aan. De sleutel is hierna niet meer op te vragen —
/// alleen de hash gaat de database in.
export async function createInstance(name: string) {
  const publicId = `i_bhmgmt_${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)}`;
  const apiKey = `ek_${randomToken(24)}`;
  const instance = await db.instance.create({
    data: { name, publicId, apiKeyHash: await bcrypt.hash(apiKey, 10) },
  });
  return { instance, apiKey };
}

/// Zoekt de lokale agent die bij een agent-ID uit een snapshot hoort.
/// Volgorde: expliciete koppeling in adapterConfig → afgeleide sleutel.
export async function resolveAgent(instanceId: string, instancePublicId: string, remoteId: string) {
  const linked = await db.agent.findFirst({
    where: {
      instanceId,
      adapterConfig: { path: ["remoteAgentId"], equals: remoteId },
    },
  });
  if (linked) return linked;

  return db.agent.findUnique({ where: { key: derivedKey(instancePublicId, remoteId) } });
}

export function derivedKey(instancePublicId: string, remoteId: string): string {
  return `${instancePublicId}--${remoteId}`.toLowerCase();
}
