import type { AgentAdapter, AdapterConfig } from "./types";

/// Agents die dit dashboard zelf draait op een taalmodel. Er is geen externe
/// verbinding: "een bericht sturen" betekent hier dat de agent erover nadenkt
/// en antwoordt. Alles wat hij onderweg doet — taken aanmaken, rapporteren,
/// goedkeuring vragen — loopt via zijn gereedschap en is terug te zien.
export const builtinAdapter: AgentAdapter = {
  type: "builtin",
  label: "Ingebouwd (AI)",
  description:
    "Deze agent draait in het dashboard zelf op een taalmodel. Geen externe koppeling nodig; wel een API-sleutel bij Instellingen → Taalmodel.",
  fields: [],
  capabilities: { send: true, poll: false, receive: false },

  async testConnection() {
    // Bewust een aparte import: de AI-laag mag niet meegeladen worden zolang
    // niemand hem nodig heeft.
    const { getAiConfig } = await import("@/lib/ai/provider");
    const config = await getAiConfig();

    if (!config.apiKey) {
      return {
        ok: false,
        message:
          "Nog geen API-sleutel ingesteld. Vul er een in bij Instellingen → Taalmodel, dan kan deze agent aan het werk.",
      };
    }

    return {
      ok: true,
      message: `Klaar om te denken via ${config.provider}, standaardmodel ${config.defaultModel}. Of dat model bestaat blijkt bij de eerste opdracht.`,
      details: { provider: config.provider, model: config.defaultModel },
    };
  },

  async sendMessage(_config: AdapterConfig, text: string, agentId?: string) {
    if (!agentId) return { ok: false, error: "Interne fout: geen agent meegegeven." };

    const { runAgent } = await import("@/lib/ai/run");
    const result = await runAgent({ agentId, input: text, trigger: "message" });

    return result.ok
      ? { ok: true, reply: result.text, externalId: result.runId }
      : { ok: false, error: result.error ?? "De agent kon niet antwoorden." };
  },
};
