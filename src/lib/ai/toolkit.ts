import "server-only";

import { GEBOUWD_GEREEDSCHAP } from "./tool-keys";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import type { ToolDefinition } from "./provider";

// Catalogus van koppelingen die je per agent kunt aanzetten.
//
// Modulair van opzet: een nieuw systeem toevoegen betekent hier een regel
// erbij, eventueel met een handler. De agents zelf hoeven daar niets van te
// weten en worden niet opnieuw gebouwd.
//
// `implemented` is bewust eerlijk. Een koppeling die hier op false staat kun je
// wel vastleggen, maar de agent krijgt hem niet in handen — hij verschijnt niet
// in zijn gereedschapskist. Beter een zichtbare lege plek dan een knop die niets
// doet.

export type ToolField = {
  name: string;
  label: string;
  type: "text" | "password" | "url";
  required: boolean;
  secret?: boolean;
  placeholder?: string;
  help?: string;
};

/// De toolboxen zoals ze bij Beerthuizen Management heten. Eén tool zit in één
/// box; waar hij thuishoort bepaalt waar je hem zoekt, niet wie hem mag.
export type ToolCategory =
  | "creatief"
  | "content"
  | "onderzoek"
  | "monitoring"
  | "data"
  | "sales"
  | "financieel"
  | "automatisering"
  | "communicatie"
  | "overig";

export const CATEGORIE_LABELS: Record<ToolCategory, string> = {
  creatief: "Creative",
  content: "Content & copy",
  onderzoek: "Research & SEO",
  monitoring: "Monitoring & intelligence",
  data: "Data & analytics",
  sales: "Sales & commercieel",
  financieel: "Financieel",
  automatisering: "Automatisering",
  communicatie: "Communicatie",
  overig: "Overig",
};

export type ToolCatalogEntry = {
  key: string;
  name: string;
  category: ToolCategory;
  description: string;
  /// Bij welke agents dit voor de hand ligt — puur als suggestie in de UI.
  suggestedFor: string[];
  fields: ToolField[];
  implemented: boolean;
  /// Hoe de agent hem aanroept. Alleen ingevuld als hij echt werkt.
  definition?: (config: Record<string, string>, label: string) => ToolDefinition;
  run?: (
    config: Record<string, string>,
    args: Record<string, unknown>,
  ) => Promise<{ ok: boolean; message: string }>;
};

// ============================================================
// Werkende koppelingen
// ============================================================

/// Blokkeert adressen in je eigen netwerk. Zonder dit kan een agent via een
/// meegegeven URL bij je router of interne diensten komen.
async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Dat is geen geldig adres.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Alleen http en https zijn toegestaan.");
  }

  const host = url.hostname;
  const address = isIP(host) ? host : (await lookup(host)).address;

  const isPrivate =
    /^127\./.test(address) ||
    /^10\./.test(address) ||
    /^192\.168\./.test(address) ||
    /^169\.254\./.test(address) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address) ||
    address === "::1" ||
    address.startsWith("fc") ||
    address.startsWith("fd") ||
    host === "localhost";

  if (isPrivate) throw new Error("Adressen in je eigen netwerk zijn niet toegestaan.");
  return url;
}

const webFetch: ToolCatalogEntry = {
  key: "web_fetch",
  name: "Webpagina lezen",
  category: "onderzoek",
  description:
    "De agent kan een openbare webpagina ophalen en de tekst lezen. Handig om een concurrent, een tarievenpagina of een nieuwsbericht echt te bekijken in plaats van erover te speculeren.",
  suggestedFor: ["research", "bizdev", "social", "influencer"],
  fields: [],
  implemented: true,
  definition: () => ({
    name: "lees_webpagina",
    description:
      "Haal een openbare webpagina op en lees de tekst. Gebruik dit om een bron echt te bekijken in plaats van te gokken. Geef altijd het volledige adres.",
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "Volledig adres, inclusief https://" } },
      required: ["url"],
    },
  }),
  async run(_config, args) {
    const raw = typeof args.url === "string" ? args.url.trim() : "";
    if (!raw) return { ok: false, message: "url is verplicht" };

    try {
      const url = await assertPublicUrl(raw);
      const response = await fetch(url, {
        headers: { "user-agent": "BHMGMT-HQ/1.0 (dashboard agent)" },
        signal: AbortSignal.timeout(20_000),
        redirect: "follow",
      });

      if (!response.ok) return { ok: false, message: `De pagina gaf ${response.status} terug.` };

      const type = response.headers.get("content-type") ?? "";
      if (!/text\/html|text\/plain|application\/json|application\/xml|text\/xml/.test(type)) {
        return { ok: false, message: `Dit is geen leesbare pagina (${type || "onbekend type"}).` };
      }

      const body = await response.text();
      const text = body
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      // Ruim genoeg om iets te begrijpen, niet zoveel dat het je tokens opeet.
      const excerpt = text.slice(0, 6000);
      return {
        ok: true,
        message: `Inhoud van ${url.hostname}${text.length > 6000 ? " (ingekort)" : ""}:\n\n${excerpt}`,
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Ophalen mislukt." };
    }
  },
};

const webSearch: ToolCatalogEntry = {
  key: "web_search",
  name: "Zoekmachine",
  category: "onderzoek",
  description:
    "De agent kan zelf op het web zoeken in plaats van te wachten tot jij een link aanlevert. Vereist een sleutel bij Brave Search; die heeft een gratis laag om mee te beginnen.",
  suggestedFor: ["research", "bizdev", "influencer", "social"],
  fields: [
    {
      name: "apiKey",
      label: "Brave Search API-sleutel",
      type: "password",
      required: true,
      secret: true,
      placeholder: "BSA...",
    },
  ],
  implemented: true,
  definition: () => ({
    name: "zoek_op_internet",
    description:
      "Zoek op het web en krijg titels, adressen en korte samenvattingen terug. Gebruik dit vóórdat je Enriqueo iets vraagt wat op internet te vinden is — een tarief, een adres, wie er bij een merk over partnerships gaat. Lees daarna met lees_webpagina de bron die er het meest toe doet: deze zoekopdracht geeft samenvattingen van derden, geen uitspraken van de bron zelf.",
    parameters: {
      type: "object",
      properties: {
        vraag: { type: "string", description: "Waar je naar zoekt, in gewone taal" },
        aantal: { type: "number", description: "Hoeveel resultaten, standaard 5, hoogstens 10" },
      },
      required: ["vraag"],
    },
  }),
  async run(config, args) {
    const vraag = typeof args.vraag === "string" ? args.vraag.trim() : "";
    if (!vraag) return { ok: false, message: "vraag is verplicht" };
    if (!config.apiKey) return { ok: false, message: "Er is nog geen zoeksleutel ingesteld." };

    const aantal = Math.min(Math.max(Number(args.aantal) || 5, 1), 10);

    try {
      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", vraag);
      url.searchParams.set("count", String(aantal));
      // Nederlandstalig en Nederlands gericht: het bureau werkt hier, en een
      // Amerikaans tarief of een Amerikaanse partnerpagina helpt niemand.
      url.searchParams.set("country", "nl");
      url.searchParams.set("search_lang", "nl");

      const response = await fetch(url, {
        headers: { accept: "application/json", "x-subscription-token": config.apiKey },
        signal: AbortSignal.timeout(20_000),
      });

      // Brave antwoordt op een onbruikbare sleutel met 422, niet met 401 — dat
      // ziet eruit als een fout in de vraag terwijl het de sleutel is.
      if ([401, 403, 422].includes(response.status)) {
        return {
          ok: false,
          message:
            "De zoekmachine accepteerde dit niet. Meestal is de sleutel verlopen of verkeerd overgenomen; controleer hem bij Tools → Zoekmachine.",
        };
      }
      if (response.status === 429) {
        return {
          ok: false,
          message: "Te veel zoekopdrachten achter elkaar; het abonnement staat dit even niet toe.",
        };
      }
      if (!response.ok) return { ok: false, message: `De zoekmachine gaf ${response.status} terug.` };

      const body = (await response.json()) as {
        web?: { results?: { title?: string; url?: string; description?: string; age?: string }[] };
      };
      const treffers = body.web?.results ?? [];

      if (treffers.length === 0) {
        return {
          ok: true,
          message: `Niets gevonden voor "${vraag}". Dat betekent niet dat het er niet is — probeer andere woorden voordat je concludeert dat het niet bestaat.`,
        };
      }

      const regels = treffers.map((t, i) => {
        // De opmaaktekens die Brave in samenvattingen zet zijn hier ruis.
        const tekst = (t.description ?? "").replace(/<[^>]+>/g, "").trim();
        return [
          `${i + 1}. ${t.title ?? "zonder titel"}`,
          `   ${t.url ?? ""}${t.age ? ` · ${t.age}` : ""}`,
          tekst ? `   ${tekst}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      });

      return {
        ok: true,
        message: [
          `Zoekresultaten voor "${vraag}":`,
          ``,
          ...regels,
          ``,
          `Dit zijn samenvattingen van derden. Gaat het om een bedrag, een naam of een toezegging,`,
          `lees dan de bron zelf met lees_webpagina voordat je het als feit gebruikt.`,
        ].join("\n"),
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Zoeken mislukt." };
    }
  },
};

const youtubeZoeken: ToolCatalogEntry = {
  key: "youtube",
  name: "YouTube zoeken",
  category: "onderzoek",
  description:
    "Zoek creators en video's op YouTube: op onderwerp, op regio, op taal. Dit is het enige sociale netwerk met een open zoekfunctie — Instagram en TikTok laten alleen toe dat je een account opzoekt waarvan je de naam al weet.",
  suggestedFor: ["research", "influencer", "social"],
  fields: [
    {
      name: "apiKey",
      label: "YouTube Data API-sleutel",
      type: "password",
      required: true,
      secret: true,
      placeholder: "AIza...",
    },
  ],
  implemented: true,
  // Twee handelingen op één koppeling: zoeken, en de cijfers van een kanaal
  // opvragen. Zoekresultaten geven geen abonnees mee — daar is een tweede
  // aanroep voor nodig, en zonder die stap staat er een naam zonder bereik.
  definition: () => ({
    name: "zoek_op_youtube",
    description:
      "Zoek kanalen of video's op YouTube. Geeft naam, kanaal-ID, omschrijving en datum terug. Gebruik dit om creators te vinden die over een onderwerp maken; leg wat je vindt daarna vast met leg_creator_vast.",
    parameters: {
      type: "object",
      properties: {
        vraag: { type: "string", description: "Waar je op zoekt, bijvoorbeeld: restaurants Amsterdam" },
        soort: {
          type: "string",
          enum: ["kanaal", "video"],
          description: "Zoek je makers (kanaal) of losse video's? Standaard kanaal.",
        },
        regio: { type: "string", description: "Landcode, standaard NL" },
        aantal: { type: "number", description: "Hoeveel resultaten, standaard 10, hoogstens 25" },
        kanaalId: {
          type: "string",
          description:
            "Vul dit in plaats van een vraag in om de cijfers van één kanaal op te halen: abonnees, views en aantal video's.",
        },
      },
      required: [],
    },
  }),
  async run(config, args) {
    if (!config.apiKey) return { ok: false, message: "Er is nog geen YouTube-sleutel ingesteld." };

    const kanaalId = typeof args.kanaalId === "string" ? args.kanaalId.trim() : "";
    if (kanaalId) return await youtubeKanaal(config.apiKey, kanaalId);

    const vraag = typeof args.vraag === "string" ? args.vraag.trim() : "";
    if (!vraag) return { ok: false, message: "geef een vraag om te zoeken, of een kanaalId om cijfers op te halen" };

    const soort = args.soort === "video" ? "video" : "channel";
    const aantal = Math.min(Math.max(Number(args.aantal) || 10, 1), 25);
    const regio = (typeof args.regio === "string" && args.regio.trim()) || "NL";

    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/search");
      url.searchParams.set("part", "snippet");
      url.searchParams.set("q", vraag);
      url.searchParams.set("type", soort);
      url.searchParams.set("maxResults", String(aantal));
      url.searchParams.set("regionCode", regio);
      url.searchParams.set("relevanceLanguage", "nl");
      url.searchParams.set("key", config.apiKey);

      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });

      if (response.status === 403) {
        // 403 is bij Google zowel "sleutel deugt niet" als "quotum op". Het
        // verschil staat in de tekst, en dat scheelt een halfuur zoeken.
        const tekst = await response.text();
        const opgebruikt = /quota/i.test(tekst);
        return {
          ok: false,
          message: opgebruikt
            ? "Het dagquotum van YouTube is op. Morgen weer, of vraag een hoger quotum aan bij Google."
            : "De YouTube-sleutel werd geweigerd. Controleer hem bij Tools, en of de YouTube Data API aanstaat in je Google-project.",
        };
      }
      if (!response.ok) return { ok: false, message: `YouTube gaf ${response.status} terug.` };

      const body = (await response.json()) as {
        items?: {
          id?: { channelId?: string; videoId?: string };
          snippet?: {
            title?: string;
            channelTitle?: string;
            description?: string;
            publishedAt?: string;
          };
        }[];
      };

      const treffers = body.items ?? [];
      if (treffers.length === 0) {
        return { ok: true, message: `Niets gevonden op YouTube voor "${vraag}".` };
      }

      const regels = treffers.map((t, i) => {
        const s = t.snippet ?? {};
        const id = t.id?.channelId ?? t.id?.videoId ?? "";
        const adres = t.id?.channelId
          ? `https://www.youtube.com/channel/${t.id.channelId}`
          : `https://www.youtube.com/watch?v=${t.id?.videoId ?? ""}`;
        return [
          `${i + 1}. ${s.title ?? "zonder titel"}${s.channelTitle && s.channelTitle !== s.title ? ` — ${s.channelTitle}` : ""}`,
          `   ${adres}`,
          s.description ? `   ${s.description.slice(0, 160)}` : "",
        ]
          .filter(Boolean)
          .join("\n") + (id ? "" : "");
      });

      return {
        ok: true,
        message: [
          `YouTube, ${soort === "channel" ? "kanalen" : "video's"} voor "${vraag}":`,
          ``,
          ...regels,
          ``,
          `Dit zijn zoekresultaten, geen cijfers. Volgersaantallen staan hier niet bij —`,
          `vul die alleen in als je ze echt gezien hebt, met bron.`,
        ].join("\n"),
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Zoeken mislukt." };
    }
  },
};

/// De cijfers van één YouTube-kanaal. Apart van het zoeken, want de zoek-API
/// geeft ze niet mee en een naam zonder bereik zegt niets bij een selectie.
async function youtubeKanaal(apiKey: string, kanaalId: string) {
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.searchParams.set("part", "snippet,statistics");
    url.searchParams.set("id", kanaalId);
    url.searchParams.set("key", apiKey);

    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return { ok: false, message: `YouTube gaf ${response.status} terug.` };

    const body = (await response.json()) as {
      items?: {
        snippet?: { title?: string; description?: string; country?: string; publishedAt?: string };
        statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string };
      }[];
    };

    const kanaal = body.items?.[0];
    if (!kanaal) return { ok: true, message: `Geen kanaal gevonden met ID ${kanaalId}.` };

    const s = kanaal.snippet ?? {};
    const st = kanaal.statistics ?? {};
    const abonnees = Number(st.subscriberCount ?? 0);
    const views = Number(st.viewCount ?? 0);
    const videos = Number(st.videoCount ?? 0);

    return {
      ok: true,
      message: [
        `${s.title ?? kanaalId}`,
        `abonnees: ${abonnees.toLocaleString("nl-NL")}`,
        `video's: ${videos.toLocaleString("nl-NL")} · totaal ${views.toLocaleString("nl-NL")} views`,
        // Gemiddelde views per video zegt meer over wat een campagne oplevert
        // dan het abonneeaantal: een oud kanaal kan veel abonnees hebben die
        // allang niet meer kijken.
        videos > 0
          ? `gemiddeld ${Math.round(views / videos).toLocaleString("nl-NL")} views per video, over alles wat er staat`
          : "",
        s.country ? `land: ${s.country}` : "",
        ``,
        `Gemeten op ${new Date().toISOString().slice(0, 10)}. Zet dit met bron in het register.`,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Opzoeken mislukt." };
  }
}

const instagramProfiel: ToolCatalogEntry = {
  key: "instagram",
  name: "Instagram-profiel opzoeken",
  category: "onderzoek",
  description:
    "Haal de echte cijfers van een openbaar Instagram-zakelijk of creatoraccount op: volgers, aantal berichten en de recente posts met likes en reacties. Let op: Instagram kent géén zoekfunctie in hun API — je kunt alleen een account opvragen waarvan je de gebruikersnaam al hebt. Zoeken doe je dus elders, en de cijfers haal je hier.",
  suggestedFor: ["influencer", "research", "social", "analytics"],
  fields: [
    {
      name: "accessToken",
      label: "Access token",
      type: "password",
      required: true,
      secret: true,
    },
    {
      name: "igUserId",
      label: "Jouw Instagram-account-ID",
      type: "text",
      required: true,
      placeholder: "17841400000000000",
    },
  ],
  implemented: true,
  definition: () => ({
    name: "instagram_profiel",
    description:
      "Zoek de cijfers van een Instagram-account op via zijn gebruikersnaam: volgers, aantal berichten en de laatste posts met likes en reacties. Gebruik dit om een creator die je gevonden hebt te controleren voordat je hem voorstelt — en om engagement zelf uit te rekenen in plaats van te schatten.",
    parameters: {
      type: "object",
      properties: {
        gebruikersnaam: { type: "string", description: "De handle zonder @" },
      },
      required: ["gebruikersnaam"],
    },
  }),
  async run(config, args) {
    const naam =
      typeof args.gebruikersnaam === "string" ? args.gebruikersnaam.trim().replace(/^@/, "") : "";
    if (!naam) return { ok: false, message: "gebruikersnaam is verplicht" };
    if (!config.accessToken || !config.igUserId) {
      return { ok: false, message: "Instagram is nog niet volledig ingesteld: token en account-ID zijn allebei nodig." };
    }

    try {
      const velden =
        `business_discovery.username(${naam}){username,followers_count,media_count,` +
        `media.limit(12){like_count,comments_count,timestamp,caption}}`;

      const url = new URL(`https://graph.facebook.com/v21.0/${config.igUserId}`);
      url.searchParams.set("fields", velden);
      url.searchParams.set("access_token", config.accessToken);

      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      const body = (await response.json()) as {
        error?: { message?: string; code?: number };
        business_discovery?: {
          username?: string;
          followers_count?: number;
          media_count?: number;
          media?: { data?: { like_count?: number; comments_count?: number; timestamp?: string }[] };
        };
      };

      if (body.error) {
        // Business Discovery werkt alleen op zakelijke en creatoraccounts. Een
        // privéaccount of een persoonlijk account bestaat voor deze API niet, en
        // dat is iets anders dan een verkeerd token.
        const tekst = body.error.message ?? "onbekende fout";
        if (/does not exist|cannot be found|not a business/i.test(tekst)) {
          return {
            ok: true,
            message: `@${naam} is niet op te vragen. Dat betekent meestal dat het geen zakelijk of creatoraccount is, of dat het privé staat — niet dat het account niet bestaat.`,
          };
        }
        return { ok: false, message: `Instagram gaf een fout: ${tekst}` };
      }

      const p = body.business_discovery;
      if (!p) return { ok: true, message: `Geen gegevens gevonden voor @${naam}.` };

      const posts = p.media?.data ?? [];
      const volgers = p.followers_count ?? 0;

      // Engagement zelf uitrekenen over wat we echt zien, in plaats van een
      // percentage overnemen dat iemand anders heeft bedacht.
      const interacties = posts.reduce(
        (n, m) => n + (m.like_count ?? 0) + (m.comments_count ?? 0),
        0,
      );
      const gemiddeld = posts.length ? Math.round(interacties / posts.length) : 0;
      const engagement = volgers > 0 && posts.length ? ((gemiddeld / volgers) * 100).toFixed(2) : null;

      return {
        ok: true,
        message: [
          `@${p.username ?? naam}`,
          `volgers: ${volgers.toLocaleString("nl-NL")}`,
          `berichten: ${p.media_count ?? "onbekend"}`,
          posts.length
            ? `laatste ${posts.length} berichten: gemiddeld ${gemiddeld.toLocaleString("nl-NL")} interacties` +
              (engagement ? ` — dat is ${engagement}% van zijn volgers` : "")
            : "geen recente berichten zichtbaar",
          ``,
          `Gemeten op ${new Date().toISOString().slice(0, 10)}. Zet dit met bron in het register,`,
          `want over een halfjaar is dit een ander getal.`,
        ].join("\n"),
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Opzoeken mislukt." };
    }
  },
};

const customWebhook: ToolCatalogEntry = {
  key: "custom_webhook",
  name: "Eigen webhook",
  category: "overig",
  description:
    "Laat de agent een systeem van jou aanroepen via een webhook — bijvoorbeeld Make, Zapier of n8n. Daarmee koppel je zelf elk systeem aan, zonder dat er iets herbouwd hoeft te worden.",
  suggestedFor: ["operations", "creative", "analytics"],
  fields: [
    {
      name: "url",
      label: "Webhook-adres",
      type: "url",
      required: true,
      placeholder: "https://hook.eu2.make.com/...",
      help: "Het adres dat de agent aanroept.",
    },
    {
      name: "purpose",
      label: "Wat doet deze webhook?",
      type: "text",
      required: true,
      placeholder: "Zet een rij in de campagnesheet",
      help: "De agent leest dit om te weten wanneer hij hem moet gebruiken.",
    },
    {
      name: "secret",
      label: "Geheime header",
      type: "password",
      required: false,
      secret: true,
      help: "Optioneel. Wordt meegestuurd als X-Webhook-Secret.",
    },
  ],
  implemented: true,
  definition: (config, label) => ({
    name: `webhook_${label}`,
    description: `Roep de webhook "${label}" aan. Waar hij voor is: ${config.purpose ?? "onbekend"}.`,
    parameters: {
      type: "object",
      properties: {
        gegevens: {
          type: "object",
          description: "De gegevens die je meestuurt. Houd het beperkt tot wat nodig is.",
        },
      },
      required: ["gegevens"],
    },
  }),
  async run(config, args) {
    try {
      const url = await assertPublicUrl(config.url ?? "");
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(config.secret ? { "x-webhook-secret": config.secret } : {}),
        },
        body: JSON.stringify(args.gegevens ?? {}),
        signal: AbortSignal.timeout(20_000),
      });

      const text = (await response.text()).slice(0, 500);
      return response.ok
        ? { ok: true, message: `Webhook aangeroepen (${response.status}). Antwoord: ${text || "leeg"}` }
        : { ok: false, message: `Webhook gaf ${response.status} terug: ${text}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Aanroepen mislukt." };
    }
  },
};

// ============================================================
// Vastgelegd, nog niet aangesloten
// ============================================================

function planned(
  key: string,
  name: string,
  category: ToolCatalogEntry["category"],
  description: string,
  suggestedFor: string[],
  fields: ToolField[] = [],
): ToolCatalogEntry {
  return { key, name, category, description, suggestedFor, fields, implemented: false };
}

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  webFetch,
  webSearch,
  youtubeZoeken,
  instagramProfiel,
  customWebhook,

  planned(
    "canva",
    "Canva",
    "creatief",
    "Ontwerpen aanmaken en aanpassen in Canva. Vereist een Canva Connect-app met OAuth.",
    ["creative", "social"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "image_ai",
    "Beeldgeneratie",
    "creatief",
    "Beeld laten maken bij een concept of hook. Vereist een beeldmodel-aanbieder.",
    ["creative", "social"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "video_ai",
    "Videogeneratie",
    "creatief",
    "Video of animatie laten maken bij een campagneconcept.",
    ["creative"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "meta_ads",
    "Meta Ads",
    "data",
    "Campagnecijfers ophalen uit Meta: spend, bereik, CTR, CPM, conversies.",
    ["analytics", "influencer"],
    [
      { name: "accessToken", label: "Access token", type: "password", required: true, secret: true },
      { name: "adAccountId", label: "Ad account-ID", type: "text", required: true, placeholder: "act_..." },
    ],
  ),
  planned(
    "google_analytics",
    "Google Analytics",
    "data",
    "Websitegedrag en conversies koppelen aan campagnes.",
    ["analytics"],
    [{ name: "propertyId", label: "Property-ID", type: "text", required: true }],
  ),
  planned(
    "sheets",
    "Google Sheets",
    "data",
    "Rapportages wegschrijven naar een sheet die je klant of team al gebruikt.",
    ["analytics", "operations"],
    [{ name: "spreadsheetId", label: "Spreadsheet-ID", type: "text", required: true }],
  ),
  planned(
    "competitor_monitoring",
    "Concurrentiemonitor",
    "onderzoek",
    "Bronnen in de gaten houden en de agent wakker maken zodra er iets verandert. Sluit aan op de detectie die er al is.",
    ["research"],
    [{ name: "sources", label: "Adressen, één per regel", type: "text", required: true }],
  ),
  instagramProfiel,
  planned(
    "email",
    "E-mail",
    "communicatie",
    "Mail lezen en concepten voorbereiden. Versturen blijft altijd via jouw akkoord lopen.",
    ["bizdev", "operations"],
    [
      { name: "address", label: "E-mailadres", type: "text", required: true },
      { name: "password", label: "Wachtwoord", type: "password", required: true, secret: true },
    ],
  ),
  planned(
    "surfer",
    "Surfer SEO",
    "onderzoek",
    "Contentbriefings en SEO-analyses. Wordt ook gebruikt om copy te toetsen voordat die de deur uit gaat.",
    ["research", "creative", "social", "bizdev"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "semrush",
    "Semrush",
    "onderzoek",
    "Zoekwoorden, concurrentieposities en zichtbaarheid in zoekmachines.",
    ["research", "analytics"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "ahrefs",
    "Ahrefs",
    "onderzoek",
    "Backlinks, verkeersschattingen en concurrentieonderzoek.",
    ["research", "analytics"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "paradigma_ai",
    "Paradigma AI",
    "onderzoek",
    "Marktsignalen en trendonderzoek.",
    ["research"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "google_search",
    "Google & web research",
    "onderzoek",
    "Openbare bronnen doorzoeken. Vult web_fetch aan, dat één pagina leest.",
    ["research", "bizdev"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "brand24",
    "Brand24",
    "monitoring",
    "Vermeldingen van merken, campagnes en concurrenten volgen.",
    ["research", "analytics", "chief", "influencer", "social", "bizdev"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "browse_ai",
    "Browse AI",
    "monitoring",
    "Pagina's automatisch uitlezen en wijzigingen signaleren. Handig om concurrenten te volgen zonder handwerk.",
    ["chief", "research", "analytics", "operations", "influencer", "bizdev"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "fullstory",
    "FullStory",
    "monitoring",
    "Gedrag van bezoekers terugkijken: waar haken mensen af.",
    ["chief", "analytics", "operations"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "meta",
    "Meta",
    "data",
    "Pagina's, campagnes en advertentieresultaten van Facebook en Instagram.",
    ["analytics", "influencer", "social", "research"],
    [
      { name: "accessToken", label: "Access token", type: "password", required: true, secret: true },
      { name: "accountId", label: "Account-ID", type: "text", required: false },
    ],
  ),
  planned(
    "tiktok",
    "TikTok",
    "data",
    "Bereik, views en engagement van TikTok-content.",
    ["analytics", "social", "influencer"],
    [
      { name: "accessToken", label: "Access token", type: "password", required: true, secret: true },
      { name: "accountId", label: "Account-ID", type: "text", required: false },
    ],
  ),
  youtubeZoeken,
  planned(
    "youtube_analytics",
    "YouTube Analytics",
    "data",
    "Kijkcijfers, kijktijd en engagement van video's.",
    ["analytics", "social", "influencer"],
    [
      { name: "accessToken", label: "Access token", type: "password", required: true, secret: true },
      { name: "accountId", label: "Account-ID", type: "text", required: false },
    ],
  ),
  planned(
    "influencity",
    "Influencity",
    "data",
    "Creatorprofielen, bereik, doelgroepoverlap en campagneresultaten.",
    ["influencer", "analytics", "bizdev"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "algolia",
    "Algolia",
    "data",
    "Zoeken door je eigen gegevens: campagnes, creators, documenten.",
    ["operations", "analytics", "chief"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "campaign_intelligence",
    "Campaign Intelligence",
    "data",
    "Eigen campagnedatabase: wat er gedraaid heeft en wat het opleverde.",
    ["influencer", "analytics"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "photoroom",
    "Photoroom",
    "creatief",
    "Productbeelden vrijstaand maken en achtergronden vervangen.",
    ["creative", "social"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "kling_ai",
    "Kling AI",
    "creatief",
    "Video genereren vanuit een concept of still.",
    ["creative", "social"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "v0",
    "v0",
    "creatief",
    "Werkende schermen en prototypes genereren vanuit een beschrijving.",
    ["creative", "operations"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "lexica",
    "Lexica",
    "creatief",
    "Beeld zoeken en genereren voor moodboards en concepten.",
    ["creative"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "midjourney",
    "Midjourney",
    "creatief",
    "Beeld genereren voor concepten, moodboards en social.",
    ["creative", "social"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "higgsfield",
    "Higgsfield",
    "creatief",
    "Bewegend beeld genereren voor social formats.",
    ["creative", "social"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "ai_arcade",
    "AI Arcade",
    "creatief",
    "Verzameling beeld- en videogereedschap voor concepten.",
    ["creative"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "brandwell",
    "Brandwell",
    "creatief",
    "Merkgestuurde content en visuals produceren.",
    ["creative", "social"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "writer_com",
    "Writer.com",
    "content",
    "Copy schrijven binnen een vastgelegde merkstem.",
    ["creative", "social", "bizdev", "research"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "grammarly",
    "Grammarly",
    "content",
    "Taal- en stijlcontrole voordat tekst de deur uit gaat.",
    ["creative", "social", "bizdev"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "jasper",
    "Jasper",
    "content",
    "Campagnecopy, hooks en varianten genereren.",
    ["creative", "social", "bizdev"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "copy_ai",
    "Copy.ai",
    "content",
    "Snel copyvarianten maken om uit te kiezen.",
    ["creative", "social", "bizdev"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "contentshake",
    "ContentShake",
    "content",
    "Contentideeën en artikelen vanuit zoekdata.",
    ["creative", "social", "research"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "hubspot_ai",
    "HubSpot AI",
    "sales",
    "Contacten, deals en opvolging. Berichten blijven altijd voorbereid tot jij akkoord geeft.",
    ["bizdev", "chief"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "reply_io",
    "Reply.io",
    "sales",
    "Opvolgreeksen voorbereiden. Versturen blijft aan jou.",
    ["bizdev"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "albert_ai",
    "Albert.ai",
    "sales",
    "Campagnes op advertentienetwerken sturen en optimaliseren.",
    ["bizdev", "analytics"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "linkedin",
    "LinkedIn",
    "sales",
    "Bedrijven en beslissers opzoeken voor prospectonderzoek.",
    ["bizdev", "research"],
    [
      { name: "accessToken", label: "Access token", type: "password", required: true, secret: true },
      { name: "accountId", label: "Account-ID", type: "text", required: false },
    ],
  ),
  planned(
    "userbot_ai",
    "Userbot.ai",
    "sales",
    "Chat- en gespreksautomatisering richting geïnteresseerden.",
    ["bizdev", "chief"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "boekhouding",
    "Boekhoudsysteem",
    "financieel",
    "Grootboek, facturen en betaalstatus uitlezen.",
    ["finance"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "facturatie",
    "Facturatiesysteem",
    "financieel",
    "Facturen opstellen en de status ervan volgen. Versturen blijft approval.",
    ["finance"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "crm",
    "CRM",
    "financieel",
    "Klantgegevens en contactmomenten, zodra je een CRM kiest.",
    ["bizdev", "finance", "influencer"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
  planned(
    "automations",
    "Automations / workflow-engine",
    "automatisering",
    "Terugkerend werk laten lopen via Make, Zapier of n8n. Werkt vandaag al via de eigen webhook.",
    ["chief", "operations", "analytics"],
    [{ name: "apiKey", label: "API-sleutel", type: "password", required: true, secret: true }],
  ),
];

// Onderhoudsscripts kunnen dit bestand niet lezen — het is server-only. Zij
// gebruiken tool-keys.ts. Deze controle draait bij het opstarten en piept
// zodra de twee lijsten uiteenlopen, zodat een script nooit een koppeling
// aanzet die hier niet bestaat.
{
  const echtGebouwd = TOOL_CATALOG.filter((entry) => entry.implemented)
    .map((entry) => entry.key)
    .sort();
  const beloofd = [...GEBOUWD_GEREEDSCHAP].sort();
  if (echtGebouwd.join(",") !== beloofd.join(",")) {
    console.warn(
      `[toolkit] tool-keys.ts loopt uit de pas: gebouwd is [${echtGebouwd}], daar staat [${beloofd}]`,
    );
  }
}

export function getToolEntry(key: string): ToolCatalogEntry | undefined {
  return TOOL_CATALOG.find((entry) => entry.key === key);
}

/// Catalogus voor de browser: zonder handlers, zonder geheimen.
export function toolCatalogForUi() {
  return TOOL_CATALOG.map((entry) => ({
    key: entry.key,
    name: entry.name,
    category: entry.category,
    description: entry.description,
    suggestedFor: entry.suggestedFor,
    fields: entry.fields,
    implemented: entry.implemented,
  }));
}

// ============================================================
// Koppelingen van één agent
// ============================================================

export function encryptToolConfig(toolKey: string, config: Record<string, string>): Record<string, string> {
  const entry = getToolEntry(toolKey);
  const secrets = new Set((entry?.fields ?? []).filter((field) => field.secret).map((field) => field.name));
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    if (!value) continue;
    out[key] = secrets.has(key) ? encryptSecret(value) : value;
  }
  return out;
}

export function decryptToolConfig(config: unknown): Record<string, string> {
  if (!config || typeof config !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = decryptSecret(value);
  }
  return out;
}

export type ResolvedTool = {
  id: string;
  toolKey: string;
  label: string;
  definition: ToolDefinition;
  config: Record<string, string>;
  entry: ToolCatalogEntry;
};

/// De gereedschapskist van één agent: alleen wat aan hém gekoppeld is, aan staat
/// en echt werkt. Een tool bij de Creative Director komt niet vanzelf bij
/// Analytics terecht.
export async function toolsForAgent(agentId: string): Promise<ResolvedTool[]> {
  const attached = await db.agentTool.findMany({ where: { agentId, enabled: true } });

  const resolved: ResolvedTool[] = [];
  for (const row of attached) {
    const entry = getToolEntry(row.toolKey);
    if (!entry?.implemented || !entry.definition) continue;

    const config = decryptToolConfig(row.config);
    const label = (row.label ?? entry.name).toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24);

    resolved.push({
      id: row.id,
      toolKey: row.toolKey,
      label,
      definition: entry.definition(config, label),
      config,
      entry,
    });
  }

  return resolved;
}

export async function runAgentTool(
  agentId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; message: string } | null> {
  const tools = await toolsForAgent(agentId);
  const match = tools.find((tool) => tool.definition.name === toolName);
  if (!match?.entry.run) return null;

  const result = await match.entry.run(match.config, args);

  // lastUsedAt hoort hier ook bij: een tool die net echt werk deed, is gebruikt.
  // Zonder deze regel bleef "laatste gebruik" op de koppelingenpagina leeg,
  // terwijl bijvoorbeeld "Webpagina lezen" al tientallen keren was aangeroepen.
  const nu = new Date();
  await db.agentTool.update({
    where: { id: match.id },
    data: {
      lastUsedAt: nu,
      lastCheckedAt: nu,
      lastError: result.ok ? null : result.message.slice(0, 300),
    },
  });

  return result;
}
