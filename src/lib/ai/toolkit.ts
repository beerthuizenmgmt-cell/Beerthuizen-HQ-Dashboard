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
  planned(
    "instagram",
    "Instagram",
    "data",
    "Bereik, views en engagement van creators en eigen kanalen ophalen.",
    ["social", "influencer", "analytics"],
    [{ name: "accessToken", label: "Access token", type: "password", required: true, secret: true }],
  ),
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
  planned(
    "youtube",
    "YouTube",
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
