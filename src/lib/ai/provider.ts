import "server-only";

import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

// Model-agnostische laag. Nergens in de agentlogica staat een modelnaam: die
// komt uit de instellingen of uit het profiel van de agent zelf. Wisselen van
// model of aanbieder raakt dus alleen dit bestand.

export type Provider = "openrouter" | "openai" | "anthropic";

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; content: string; toolCallId: string; name: string };

export type ChatResult = {
  text: string;
  toolCalls: ToolCall[];
  usage: { promptTokens: number; completionTokens: number };
  model: string;
  /// Werkelijke kosten zoals de aanbieder ze rapporteert, in zijn eigen valuta.
  /// Niet elke aanbieder geeft dit; dan blijft het leeg en rekenen we zelf met
  /// de tarieventabel.
  cost?: { amount: number; currency: string };
};

export type AiConfig = {
  provider: Provider;
  apiKey: string | null;
  /// Voor denkwerk: analyses, adviezen, het ochtendrapport.
  defaultModel: string;
  /// Voor eenvoudig, repetitief werk. Leeg = gebruik het standaardmodel.
  fastModel: string | null;
};

const SETTING_KEY = "ai";

/// Het model dat we als eerste proberen wanneer er nog niets is ingesteld.
/// Bewust hier en niet in de agentlogica, en aanpasbaar in de instellingen.
export const SUGGESTED_DEFAULT_MODEL = "openai/gpt-5.6-luna";

export async function getAiConfig(): Promise<AiConfig> {
  const setting = await db.setting.findUnique({ where: { key: SETTING_KEY } });
  const stored = (setting?.value ?? {}) as Partial<AiConfig> & { apiKey?: string };

  const envKey =
    process.env.OPENROUTER_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY ?? null;

  return {
    provider: stored.provider ?? "openrouter",
    // Sleutel uit de instellingen staat versleuteld; env is de uitwijkroute.
    apiKey: stored.apiKey ? decryptSecret(stored.apiKey) : envKey,
    defaultModel: stored.defaultModel || SUGGESTED_DEFAULT_MODEL,
    fastModel: stored.fastModel || null,
  };
}

/// Is er een sleutel? Bewust zónder ontsleutelen: schermen die alleen willen
/// weten óf er verbinding is, hoeven het geheim niet in het geheugen te krijgen.
export async function hasApiKey(): Promise<boolean> {
  const setting = await db.setting.findUnique({ where: { key: SETTING_KEY } });
  const stored = (setting?.value ?? {}) as { apiKey?: string };
  return Boolean(
    stored.apiKey ||
      process.env.OPENROUTER_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY,
  );
}

/// Alles wat een scherm mag weten over de AI-koppeling: de aanbieder, het model
/// en óf er verbinding is. Nooit de sleutel zelf.
export async function getAiStatus(): Promise<{
  provider: Provider;
  defaultModel: string;
  fastModel: string | null;
  connected: boolean;
  label: string;
}> {
  const setting = await db.setting.findUnique({ where: { key: SETTING_KEY } });
  const stored = (setting?.value ?? {}) as Partial<AiConfig> & { apiKey?: string };
  const provider = stored.provider ?? "openrouter";
  const connected = await hasApiKey();

  return {
    provider,
    defaultModel: stored.defaultModel || SUGGESTED_DEFAULT_MODEL,
    fastModel: stored.fastModel || null,
    connected,
    label: connected ? `${provider}: verbonden` : `${provider}: geen sleutel ingesteld`,
  };
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super(
      "Er is nog geen taalmodel ingesteld. Vul bij Instellingen → Taalmodel een API-sleutel in, dan gaan de agents aan het werk.",
    );
    this.name = "AiNotConfiguredError";
  }
}

const BASE_URLS: Record<Provider, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
};

export class ModelNotAvailableError extends Error {
  constructor(
    public readonly model: string,
    public readonly provider: Provider,
    public readonly suggestions: string[],
  ) {
    super(
      `Model "${model}" bestaat niet bij ${provider}. Er is dus geen aanroep gedaan en niets in rekening gebracht. ` +
        (suggestions.length
          ? `Modellen die er wél op lijken: ${suggestions.join(", ")}. Kies er een bij Instellingen → Taalmodel.`
          : `Kies een geldig model bij Instellingen → Taalmodel.`),
    );
    this.name = "ModelNotAvailableError";
  }
}

// De modellenlijst verandert zelden; één keer per uur ophalen is genoeg en
// scheelt een extra verzoek bij elke aanroep.
let modelCache: { ids: Set<string>; at: number; provider: Provider } | null = null;
const MODEL_CACHE_MS = 60 * 60_000;

/// Controleert vóór het bellen of het model bestaat. Doet hij dat niet, dan
/// gaat er geen aanroep uit — een verkeerde modelnaam mag geen mislukte,
/// betaalde poging worden.
async function assertModelAvailable(model: string, provider: Provider): Promise<void> {
  const fresh = modelCache && modelCache.provider === provider && Date.now() - modelCache.at < MODEL_CACHE_MS;

  if (!fresh) {
    try {
      const models = await listModels();
      modelCache = { ids: new Set(models.map((entry) => entry.id)), at: Date.now(), provider };
    } catch {
      // Lijst niet op te halen? Dan blokkeren we niet — de aanroep zelf geeft
      // straks een duidelijke fout als er echt iets mis is.
      return;
    }
  }

  if (!modelCache || modelCache.ids.size === 0) return;
  if (modelCache.ids.has(model)) return;

  const needle = model.toLowerCase().split("/").pop() ?? model.toLowerCase();
  const suggestions = [...modelCache.ids]
    .filter((id) => id.toLowerCase().includes(needle.split("-")[0] ?? ""))
    .slice(0, 5);

  throw new ModelNotAvailableError(model, provider, suggestions);
}

/// Leegt de cache, zodat een net gewijzigde sleutel of aanbieder meteen telt.
export function clearModelCache(): void {
  modelCache = null;
}

export async function chat(options: {
  messages: ChatMessage[];
  model?: string;
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<ChatResult> {
  const config = await getAiConfig();
  if (!config.apiKey) throw new AiNotConfiguredError();

  const model = options.model || config.defaultModel;
  const timeout = options.timeoutMs ?? 90_000;

  await assertModelAvailable(model, config.provider);

  return config.provider === "anthropic"
    ? callAnthropic(config, model, options, timeout)
    : callOpenAiCompatible(config, model, options, timeout);
}

// ============================================================
// OpenAI-compatibel (OpenRouter en OpenAI zelf)
// ============================================================

type OpenAiToolCall = { id: string; type: string; function: { name: string; arguments: string } };

async function callOpenAiCompatible(
  config: AiConfig,
  model: string,
  options: Parameters<typeof chat>[0],
  timeoutMs: number,
): Promise<ChatResult> {
  const body: Record<string, unknown> = {
    model,
    messages: options.messages.map((message) => {
      if (message.role === "tool") {
        return { role: "tool", content: message.content, tool_call_id: message.toolCallId };
      }
      if (message.role === "assistant" && message.toolCalls?.length) {
        return {
          role: "assistant",
          content: message.content || null,
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: JSON.stringify(call.arguments) },
          })),
        };
      }
      return { role: message.role, content: message.content };
    }),
  };

  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.maxTokens) body.max_tokens = options.maxTokens;
  // OpenRouter rekent zelf af en kan de werkelijke kosten per aanroep
  // meesturen. Dat is nauwkeuriger dan naschatten met een tarieventabel.
  if (config.provider === "openrouter") body.usage = { include: true };
  if (options.tools?.length) {
    body.tools = options.tools.map((tool) => ({
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));
  }

  const response = await fetch(`${BASE_URLS[config.provider]}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
      ...(config.provider === "openrouter"
        ? { "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000", "X-Title": "BHMGMT HQ" }
        : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) throw new Error(await describeFailure(response, model));

  const data = (await response.json()) as {
    choices?: { message?: { content?: string | null; tool_calls?: OpenAiToolCall[] } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    model?: string;
  };

  const message = data.choices?.[0]?.message;

  return {
    text: message?.content ?? "",
    toolCalls: (message?.tool_calls ?? []).map((call) => ({
      id: call.id,
      name: call.function.name,
      arguments: safeParse(call.function.arguments),
    })),
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
    },
    model: data.model ?? model,
    // OpenRouter rekent in dollarkrediet.
    cost:
      typeof data.usage?.cost === "number" ? { amount: data.usage.cost, currency: "USD" } : undefined,
  };
}

// ============================================================
// Anthropic
// ============================================================

async function callAnthropic(
  config: AiConfig,
  model: string,
  options: Parameters<typeof chat>[0],
  timeoutMs: number,
): Promise<ChatResult> {
  const system = options.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");

  const content = options.messages
    .filter((message) => message.role !== "system")
    .map((message) => {
      if (message.role === "tool") {
        return {
          role: "user" as const,
          content: [{ type: "tool_result", tool_use_id: message.toolCallId, content: message.content }],
        };
      }
      if (message.role === "assistant" && message.toolCalls?.length) {
        return {
          role: "assistant" as const,
          content: [
            ...(message.content ? [{ type: "text", text: message.content }] : []),
            ...message.toolCalls.map((call) => ({
              type: "tool_use",
              id: call.id,
              name: call.name,
              input: call.arguments,
            })),
          ],
        };
      }
      return { role: message.role as "user" | "assistant", content: message.content };
    });

  const response = await fetch(`${BASE_URLS.anthropic}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: system || undefined,
      messages: content,
      max_tokens: options.maxTokens ?? 4096,
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.tools?.length
        ? {
            tools: options.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.parameters,
            })),
          }
        : {}),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) throw new Error(await describeFailure(response, model));

  const data = (await response.json()) as {
    content?: ({ type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> })[];
    usage?: { input_tokens?: number; output_tokens?: number };
    model?: string;
  };

  const blocks = data.content ?? [];

  return {
    text: blocks
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n"),
    toolCalls: blocks
      .filter(
        (block): block is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
          block.type === "tool_use",
      )
      .map((block) => ({ id: block.id, name: block.name, arguments: block.input })),
    usage: {
      promptTokens: data.usage?.input_tokens ?? 0,
      completionTokens: data.usage?.output_tokens ?? 0,
    },
    model: data.model ?? model,
  };
}

// ============================================================
// Hulp
// ============================================================

/// Providerfouten zijn cryptisch. Dit maakt er iets van waar je wat mee kunt —
/// vooral "dit model bestaat niet", want dat gaat gebeuren.
async function describeFailure(response: Response, model: string): Promise<string> {
  const text = await response.text().catch(() => "");
  let detail = text.slice(0, 300);
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    if (parsed.error?.message) detail = parsed.error.message;
  } catch {
    /* geen JSON, ruwe tekst is prima */
  }

  if (response.status === 401 || response.status === 403) {
    return `De API-sleutel werd geweigerd (${response.status}). Controleer hem bij Instellingen → Taalmodel.`;
  }
  if (response.status === 404 || /model/i.test(detail)) {
    return `Model "${model}" werd niet geaccepteerd: ${detail}. Kies een bestaand model bij Instellingen → Taalmodel.`;
  }
  if (response.status === 429) {
    return `De aanbieder remt af (429): ${detail}`;
  }
  return `Aanroep mislukt (${response.status}): ${detail}`;
}

function safeParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export type ModelOption = { id: string; name: string; contextLength?: number; pricePerMillion?: number };

/// Haalt de actuele modellenlijst bij de aanbieder op, zodat je kunt kiezen uit
/// wat er echt bestaat in plaats van een naam te typen die misschien klopt.
export async function listModels(): Promise<ModelOption[]> {
  const config = await getAiConfig();
  if (!config.apiKey) throw new AiNotConfiguredError();

  if (config.provider === "anthropic") {
    const response = await fetch(`${BASE_URLS.anthropic}/models`, {
      headers: { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(await describeFailure(response, "-"));
    const data = (await response.json()) as { data?: { id: string; display_name?: string }[] };
    return (data.data ?? []).map((model) => ({ id: model.id, name: model.display_name ?? model.id }));
  }

  const response = await fetch(`${BASE_URLS[config.provider]}/models`, {
    headers: { authorization: `Bearer ${config.apiKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(await describeFailure(response, "-"));

  const data = (await response.json()) as {
    data?: { id: string; name?: string; context_length?: number; pricing?: { prompt?: string } }[];
  };

  return (data.data ?? [])
    .map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      contextLength: model.context_length,
      pricePerMillion: model.pricing?.prompt ? Number(model.pricing.prompt) * 1_000_000 : undefined,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
