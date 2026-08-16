import type { AdapterType } from "@/generated/prisma/enums";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto";
import { builtinAdapter } from "./builtin";
import { manualAdapter } from "./manual";
import { openclawGatewayAdapter } from "./openclaw-gateway";
import { readerIngestAdapter } from "./reader-ingest";
import { telegramAdapter } from "./telegram";
import type { AdapterConfig, AgentAdapter } from "./types";

export * from "./types";

export const ADAPTERS: Record<AdapterType, AgentAdapter> = {
  builtin: builtinAdapter,
  openclaw_gateway: openclawGatewayAdapter,
  telegram: telegramAdapter,
  reader_ingest: readerIngestAdapter,
  manual: manualAdapter,
};

/// Volgorde in de wizard: eerst wat we zelf draaien, daarna externe koppelingen.
export const ADAPTER_ORDER: AdapterType[] = [
  "builtin",
  "telegram",
  "openclaw_gateway",
  "reader_ingest",
  "manual",
];

export function getAdapter(type: AdapterType): AgentAdapter {
  return ADAPTERS[type];
}

/// Beschrijving van alle koppeltypes voor de UI — zonder servercode mee te sturen.
export function adapterCatalog() {
  return ADAPTER_ORDER.map((type) => {
    const adapter = ADAPTERS[type];
    return {
      type,
      label: adapter.label,
      description: adapter.description,
      fields: adapter.fields,
      capabilities: adapter.capabilities,
    };
  });
}

/// Versleutelt de velden die de adapter als geheim markeert. De rest blijft
/// leesbaar, zodat je in de database gewoon kunt zien welke URL erbij hoort.
export function encryptConfig(type: AdapterType, config: AdapterConfig): AdapterConfig {
  const secretFields = new Set(getAdapter(type).fields.filter((f) => f.secret).map((f) => f.name));
  const out: AdapterConfig = {};
  for (const [key, value] of Object.entries(config)) {
    if (!value) continue;
    out[key] = secretFields.has(key) ? encryptSecret(value) : value;
  }
  return out;
}

export function decryptConfig(config: unknown): AdapterConfig {
  if (!config || typeof config !== "object") return {};
  const out: AdapterConfig = {};
  for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = decryptSecret(value);
  }
  return out;
}

/// Veilige versie voor de browser: geheimen worden gemaskeerd getoond.
export function publicConfig(type: AdapterType, config: unknown): AdapterConfig {
  const secretFields = new Set(getAdapter(type).fields.filter((f) => f.secret).map((f) => f.name));
  const decrypted = decryptConfig(config);
  const out: AdapterConfig = {};
  for (const [key, value] of Object.entries(decrypted)) {
    out[key] = secretFields.has(key) ? maskSecret(value) : value;
  }
  return out;
}

/// Als een veld in het formulier de gemaskeerde waarde bevat, heeft de gebruiker
/// hem niet aangepast — dan houden we het bestaande geheim.
export function mergeWithExisting(
  type: AdapterType,
  submitted: AdapterConfig,
  existing: unknown,
): AdapterConfig {
  const current = decryptConfig(existing);
  const secretFields = new Set(getAdapter(type).fields.filter((f) => f.secret).map((f) => f.name));
  const out: AdapterConfig = { ...submitted };
  for (const field of secretFields) {
    const value = submitted[field];
    if (!value || value === maskSecret(current[field] ?? "")) {
      if (current[field]) out[field] = current[field];
      else delete out[field];
    }
  }
  return out;
}
