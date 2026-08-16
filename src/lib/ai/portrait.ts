import "server-only";

import { db } from "@/lib/db";
import { getAiConfig } from "./provider";

// Portretten voor de agents, gemaakt met dezelfde sleutel die ze al gebruiken.
//
// Eén stijlbeschrijving voor het hele team, zodat ze eruitzien als collega's van
// hetzelfde bureau en niet als acht losse plaatjes.

const SETTING_KEY = "ai";
const DEFAULT_IMAGE_MODEL = "google/gemini-2.5-flash-image";

export async function getImageModel(): Promise<string> {
  const setting = await db.setting.findUnique({ where: { key: SETTING_KEY } });
  const stored = (setting?.value ?? {}) as { imageModel?: string };
  return stored.imageModel || DEFAULT_IMAGE_MODEL;
}

/// De gedeelde stijl. Hier zit het "team"-gevoel in: zelfde licht, zelfde
/// achtergrond, zelfde kadrering — alleen de persoon verschilt.
function buildPrompt(name: string, role: string, description: string | null): string {
  return [
    `Professional corporate headshot portrait for a modern Dutch creative agency.`,
    ``,
    `Person: ${name}, working as ${role}.`,
    description ? `Their work: ${description}` : "",
    ``,
    `Style requirements — keep these identical for every portrait so the team looks consistent:`,
    `- Square framing, head and shoulders, subject centred and looking at camera`,
    `- Charcoal near-black background (#0D0D0D), soft studio key light from the left`,
    `- Subtle warm orange rim light on one side, echoing the brand colour #FF4500`,
    `- Natural skin tones, sharp focus, shallow depth of field`,
    `- Smart casual clothing in muted tones, no logos, no text anywhere in the image`,
    `- Confident, approachable expression; professional but not stiff`,
    `- Photorealistic, editorial quality, no illustration or cartoon style`,
  ]
    .filter(Boolean)
    .join("\n");
}

type ImageResponse = {
  choices?: {
    message?: {
      images?: { image_url?: { url?: string }; url?: string; type?: string }[];
      content?: unknown;
    };
  }[];
  error?: { message?: string };
};

/// Zoekt het beeld in het antwoord. Aanbieders verschillen hierin, dus we
/// kijken op meerdere plekken in plaats van één vorm aan te nemen.
function extractImage(data: ImageResponse): string | null {
  const message = data.choices?.[0]?.message;
  if (!message) return null;

  for (const image of message.images ?? []) {
    const url = image.image_url?.url ?? image.url;
    if (typeof url === "string" && url.startsWith("data:image")) return url;
  }

  // Sommige modellen zetten het beeld in de content-array.
  const content = message.content;
  if (Array.isArray(content)) {
    for (const part of content as Record<string, unknown>[]) {
      const url =
        (part?.image_url as { url?: string } | undefined)?.url ??
        (typeof part?.url === "string" ? part.url : undefined);
      if (typeof url === "string" && url.startsWith("data:image")) return url;
    }
  }

  return null;
}

export type PortraitResult = { ok: boolean; message: string; dataUrl?: string };

export async function generatePortrait(agentId: string): Promise<PortraitResult> {
  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent) return { ok: false, message: "Agent bestaat niet." };

  const config = await getAiConfig();
  if (!config.apiKey) {
    return { ok: false, message: "Er is nog geen API-sleutel ingesteld bij Instellingen → Taalmodel." };
  }
  if (config.provider !== "openrouter") {
    return {
      ok: false,
      message: `Portretten maken werkt nu alleen via OpenRouter; je staat op ${config.provider}.`,
    };
  }

  const model = await getImageModel();

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
        "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
        "X-Title": "BHMGMT HQ",
      },
      body: JSON.stringify({
        model,
        modalities: ["image", "text"],
        messages: [{ role: "user", content: buildPrompt(agent.name, agent.role, agent.description) }],
      }),
      signal: AbortSignal.timeout(120_000),
    });

    const data = (await response.json()) as ImageResponse;

    if (!response.ok) {
      if (response.status === 402) {
        return {
          ok: false,
          message:
            "Je saldo bij OpenRouter is op. Waardeer je account op, dan kun je meteen verder — een portret kost een paar cent.",
        };
      }
      return {
        ok: false,
        message:
          data.error?.message ??
          `De aanbieder gaf ${response.status} terug. Controleer of "${model}" beeld kan maken.`,
      };
    }

    const raw = extractImage(data);
    if (!raw) {
      return {
        ok: false,
        message: `Er kwam geen beeld terug van "${model}". Dat model maakt waarschijnlijk alleen tekst — kies een beeldmodel bij Instellingen.`,
      };
    }

    // Verkleinen voordat het de database in gaat: op volle resolutie is één
    // portret al gauw anderhalve megabyte, en dat gaat bij elk paginabezoek mee.
    const { shrinkDataUrl } = await import("./avatar-image");
    const shrunk = await shrinkDataUrl(raw);
    const dataUrl = shrunk?.dataUrl ?? raw;

    await db.agent.update({ where: { id: agentId }, data: { avatarUrl: dataUrl } });

    return {
      ok: true,
      message: shrunk
        ? `Portret gemaakt voor ${agent.name} (${Math.round(shrunk.bytes / 1024)} kB).`
        : `Portret gemaakt voor ${agent.name}.`,
      dataUrl,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Portret maken mislukt.",
    };
  }
}
