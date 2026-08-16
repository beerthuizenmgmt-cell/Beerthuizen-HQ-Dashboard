import "server-only";

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import type { PortalFormType } from "@/generated/prisma/enums";

// Het klantportaal.
//
// Eén beveiligde link naar één formulier voor één klant. De klant heeft geen
// account, ziet niets van HQ, en krijgt alleen het formulier waarvoor de link
// bedoeld is. Wat hij instuurt komt automatisch bij de juiste agent terecht.
//
// De opzet is bewust uitbreidbaar: een nieuw formuliertype is een regel in
// FORMULIEREN plus een sjabloon. De link, de status, de routering en de
// beveiliging werken dan meteen mee.

/// Hoe lang een link geldig blijft. Lang genoeg om er een week over te doen,
/// kort genoeg dat een oude link in iemands mailbox niets meer waard is.
const GELDIG_DAGEN = 30;

export type Veld = {
  naam: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "select" | "multi" | "date";
  verplicht: boolean;
  hint?: string;
  /// Waar dit veld in de klantgegevens terechtkomt.
  doel?: string;
  /// Keuzes bij select en multi.
  opties?: string[];
  /// Alleen tonen wanneer een eerder veld een van deze waarden heeft.
  ///
  /// Hiermee blijft het formulier kort: wie geen budget heeft vastgesteld
  /// krijgt de bedragvraag niet te zien, en wie geen creators in gedachten
  /// heeft hoeft geen namen in te vullen.
  toonAls?: { veld: string; waarden: string[] };
};

export type Formulier = {
  type: PortalFormType;
  titel: string;
  /// Wat de klant bovenaan leest. Geen jargon, geen AI, geen techniek.
  inleiding: string;
  secties: { kop: string; velden: Veld[] }[];
  /// Welke agents dit verwerken. De klant ziet dit nooit.
  naarAgents: string[];
};

export const FORMULIEREN: Record<PortalFormType, Formulier> = {
  klantgegevens: {
    type: "klantgegevens",
    titel: "Gegevens voor onze administratie",
    inleiding:
      "Om je facturen correct op te kunnen maken hebben we een aantal gegevens van je nodig. Het invullen duurt ongeveer twee minuten.",
    naarAgents: ["finance"],
    secties: [
      {
        kop: "Bedrijfsgegevens",
        velden: [
          { naam: "bedrijfsnaam", label: "Bedrijfsnaam", type: "text", verplicht: true, doel: "name" },
          { naam: "contactpersoon", label: "Contactpersoon", type: "text", verplicht: true, doel: "contactName" },
          { naam: "email", label: "E-mailadres", type: "email", verplicht: true, doel: "email" },
          { naam: "telefoon", label: "Telefoonnummer", type: "tel", verplicht: false, doel: "phone" },
          { naam: "adres", label: "Adres", type: "text", verplicht: true, doel: "address" },
          { naam: "postcode", label: "Postcode", type: "text", verplicht: true, doel: "postalCode" },
          { naam: "plaats", label: "Plaats", type: "text", verplicht: true, doel: "city" },
          { naam: "land", label: "Land", type: "text", verplicht: false, doel: "country" },
          { naam: "kvk", label: "KvK-nummer", type: "text", verplicht: false, doel: "kvk" },
          { naam: "btw", label: "BTW-nummer", type: "text", verplicht: false, doel: "vatId" },
        ],
      },
      {
        kop: "Facturatie",
        velden: [
          {
            naam: "factuurEmail",
            label: "E-mailadres voor facturen",
            type: "email",
            verplicht: true,
            hint: "Vaak een ander adres dan dat van de contactpersoon.",
            doel: "invoiceEmail",
          },
          {
            naam: "referentie",
            label: "Factuurreferentie of PO-nummer",
            type: "text",
            verplicht: false,
            hint: "Alleen invullen als jullie administratie dit nodig heeft.",
            doel: "invoiceReference",
          },
          {
            naam: "aanvullend",
            label: "Aanvullende factuurinformatie",
            type: "textarea",
            verplicht: false,
            doel: "invoiceNotes",
          },
        ],
      },
    ],
  },

  // De volgende drie staan klaar maar zijn nog niet in gebruik. Ze delen de
  // hele keten — link, status, routering, beveiliging — dus aanzetten is straks
  // een kwestie van de velden invullen.
  campagnebriefing: {
    type: "campagnebriefing",
    titel: "Campagnebriefing",
    inleiding:
      "Vertel ons wat je met deze campagne wilt bereiken. Hoe scherper je dit invult, hoe gerichter ons voorstel. Reken op ongeveer tien minuten; vragen die niet van toepassing zijn kun je overslaan.",
    naarAgents: ["influencer", "chief"],
    secties: [
      {
        kop: "Contact",
        velden: [
          { naam: "bedrijfsnaam", label: "Bedrijfsnaam", type: "text", verplicht: true, doel: "name" },
          { naam: "contactpersoon", label: "Contactpersoon", type: "text", verplicht: true, doel: "contactName" },
          { naam: "email", label: "E-mailadres", type: "email", verplicht: true, doel: "email" },
          { naam: "telefoon", label: "Telefoonnummer", type: "tel", verplicht: false, doel: "phone" },
        ],
      },
      {
        kop: "Merk en product",
        velden: [
          {
            naam: "merk",
            label: "Om welk merk gaat het?",
            type: "text",
            verplicht: true,
            hint: "Het merk zoals de doelgroep het kent.",
          },
          {
            naam: "product",
            label: "Welk product of welke dienst staat centraal?",
            type: "textarea",
            verplicht: true,
            hint: "Wat moeten wij ervan weten om het geloofwaardig te laten overkomen?",
          },
          { naam: "website", label: "Website", type: "text", verplicht: false },
        ],
      },
      {
        kop: "Doel van de campagne",
        velden: [
          {
            naam: "doel",
            label: "Wat moet deze campagne opleveren?",
            type: "select",
            verplicht: true,
            opties: [
              "Merkbekendheid vergroten",
              "Overweging en vertrouwen opbouwen",
              "Verkoop of leads genereren",
              "Een nieuw product introduceren",
              "Een nieuwe doelgroep bereiken",
              "Anders",
            ],
          },
          {
            naam: "doelToelichting",
            label: "Licht je doel kort toe",
            type: "textarea",
            verplicht: true,
            toonAls: { veld: "doel", waarden: ["Anders"] },
          },
          {
            naam: "boodschap",
            label: "Wat is de belangrijkste boodschap?",
            type: "textarea",
            verplicht: true,
            hint: "Als iemand na het zien van de content maar één ding onthoudt — wat moet dat zijn?",
          },
          {
            naam: "cta",
            label: "Wat moet iemand daarna doen?",
            type: "select",
            verplicht: true,
            opties: [
              "Naar de website gaan",
              "Een kortingscode gebruiken",
              "Een winkel bezoeken",
              "Zich aanmelden of inschrijven",
              "Alleen kennismaken, geen directe actie",
              "Anders",
            ],
          },
          {
            naam: "ctaToelichting",
            label: "Welke actie precies?",
            type: "text",
            verplicht: true,
            toonAls: { veld: "cta", waarden: ["Anders"] },
          },
        ],
      },
      {
        kop: "Doelgroep",
        velden: [
          {
            naam: "doelgroep",
            label: "Wie wil je bereiken?",
            type: "textarea",
            verplicht: true,
            hint: "Beschrijf ze zoals je ze zou uitleggen aan iemand die het merk niet kent. Interesses en gedrag zeggen meer dan alleen leeftijd.",
          },
          {
            naam: "leeftijd",
            label: "Leeftijdsgroep",
            type: "select",
            verplicht: false,
            opties: ["18-24", "25-34", "35-44", "45-54", "55+", "Breed, geen specifieke groep"],
          },
          {
            naam: "landen",
            label: "In welke landen of regio's?",
            type: "text",
            verplicht: false,
            hint: "Leeg laten betekent Nederland.",
          },
        ],
      },
      {
        kop: "Planning en budget",
        velden: [
          { naam: "periodeVan", label: "Gewenste startdatum", type: "date", verplicht: true },
          { naam: "periodeTot", label: "Gewenste einddatum", type: "date", verplicht: false },
          {
            naam: "deadline",
            label: "Wanneer wil je ons voorstel ontvangen?",
            type: "date",
            verplicht: false,
          },
          {
            naam: "budgetStatus",
            label: "Is er een budget vastgesteld?",
            type: "select",
            verplicht: true,
            opties: [
              "Ja, een vast budget",
              "Een indicatie, nog niet definitief",
              "Nee, we horen graag wat het kost",
            ],
          },
          {
            naam: "budget",
            label: "Welk bedrag ongeveer?",
            type: "text",
            verplicht: true,
            hint: "Een bandbreedte mag ook. Dit helpt ons een realistisch voorstel te maken in plaats van een gok.",
            toonAls: { veld: "budgetStatus", waarden: ["Ja, een vast budget", "Een indicatie, nog niet definitief"] },
          },
        ],
      },
      {
        kop: "Platforms en content",
        velden: [
          {
            naam: "platforms",
            label: "Op welke platforms?",
            type: "multi",
            verplicht: true,
            opties: ["Instagram", "TikTok", "YouTube", "LinkedIn", "Podcast", "Weet ik nog niet"],
          },
          {
            naam: "deliverables",
            label: "Wat voor content heb je in gedachten?",
            type: "multi",
            verplicht: false,
            opties: [
              "Reels of shorts",
              "Stories",
              "Feed-posts",
              "Langere video",
              "UGC voor eigen kanalen",
              "Fotografie",
              "Livestream",
              "Weet ik nog niet",
            ],
            hint: "Niet zeker? Laat het leeg — dan adviseren wij.",
          },
          {
            naam: "hergebruik",
            label: "Wil je de content ook zelf gebruiken?",
            type: "select",
            verplicht: false,
            opties: [
              "Ja, ook voor eigen kanalen",
              "Ja, ook voor advertenties",
              "Nee, alleen op de kanalen van de creator",
              "Weet ik nog niet",
            ],
            hint: "Dit heeft invloed op de afspraken met creators.",
          },
        ],
      },
      {
        kop: "Creators",
        velden: [
          {
            naam: "creatorsInGedachten",
            label: "Heb je al creators op het oog?",
            type: "select",
            verplicht: true,
            opties: [
              "Ja, ik heb namen",
              "Nee, we horen graag jullie voorstel",
              "Nee, maar ik weet wel welk type",
            ],
          },
          {
            naam: "creatorNamen",
            label: "Welke creators?",
            type: "textarea",
            verplicht: true,
            toonAls: { veld: "creatorsInGedachten", waarden: ["Ja, ik heb namen"] },
          },
          {
            naam: "niche",
            label: "Welk type creators past bij dit merk?",
            type: "textarea",
            verplicht: true,
            hint: "Bijvoorbeeld: sport en prestatie, lifestyle, food, automotive. Ook wie juist niet past is nuttig.",
            toonAls: { veld: "creatorsInGedachten", waarden: ["Nee, maar ik weet wel welk type"] },
          },
        ],
      },
      {
        kop: "Randvoorwaarden",
        velden: [
          {
            naam: "tone",
            label: "Welke toon past bij het merk?",
            type: "select",
            verplicht: false,
            opties: [
              "Informeel en toegankelijk",
              "Zakelijk en professioneel",
              "Premium en ingetogen",
              "Energiek en humoristisch",
              "Anders",
            ],
          },
          {
            naam: "toneToelichting",
            label: "Hoe zou je de toon omschrijven?",
            type: "text",
            verplicht: true,
            toonAls: { veld: "tone", waarden: ["Anders"] },
          },
          {
            naam: "voorwaarden",
            label: "Zijn er eisen of dingen die absoluut niet mogen?",
            type: "textarea",
            verplicht: false,
            hint: "Denk aan claims die niet gemaakt mogen worden, concurrenten waar creators niet mee mogen werken, of wettelijke eisen.",
          },
        ],
      },
      {
        kop: "Materiaal",
        velden: [
          {
            naam: "bestanden",
            label: "Links naar brandbook, briefing, logo's, beeld of video",
            type: "textarea",
            verplicht: false,
            hint: "Deel een link naar Drive, Dropbox of WeTransfer. Eén link per regel.",
          },
          {
            naam: "aanvullend",
            label: "Is er nog iets dat we moeten weten?",
            type: "textarea",
            verplicht: false,
          },
        ],
      },
    ],
  },
  contentaanlevering: {
    type: "contentaanlevering",
    titel: "Contentaanlevering",
    inleiding: "Lever hier het materiaal aan dat we voor je gaan gebruiken.",
    naarAgents: ["creative", "social"],
    secties: [],
  },
  projectinformatie: {
    type: "projectinformatie",
    titel: "Projectinformatie",
    inleiding: "Een paar vragen zodat we het project goed kunnen inrichten.",
    naarAgents: ["chief"],
    secties: [],
  },
};

export function isBeschikbaar(type: PortalFormType): boolean {
  return FORMULIEREN[type].secties.length > 0;
}

/// Een token dat niet te raden is. 32 bytes is ruim; korter zou een link
/// opleveren die iemand met genoeg pogingen kan vinden.
export function maakToken(): string {
  return randomBytes(32).toString("base64url");
}

export function vervaldatum(): Date {
  return new Date(Date.now() + GELDIG_DAGEN * 24 * 60 * 60_000);
}

/// Zoekt de aanvraag bij een token. Geeft niets terug wanneer hij verlopen,
/// verwerkt of onbekend is — een oude link mag nooit alsnog gegevens tonen.
export async function haalAanvraag(token: string) {
  const aanvraag = await db.portalRequest.findUnique({
    where: { token },
    include: { client: { select: { id: true, name: true } } },
  });

  if (!aanvraag) return null;
  if (aanvraag.expiresAt < new Date()) return { ...aanvraag, verlopen: true as const };
  if (aanvraag.status === "verwerkt" || aanvraag.status === "ingevuld") {
    return { ...aanvraag, alIngevuld: true as const };
  }

  return { ...aanvraag, verlopen: false as const };
}

/// Zoekt een bestaande klant die dit zou kunnen zijn.
///
/// Bewust conservatief: een gelijk KvK- of btw-nummer is bewijs, een gelijke
/// naam is een vermoeden. Bij een vermoeden koppelen we niet automatisch —
/// twee klanten samenvoegen die niet dezelfde zijn is lastiger terug te draaien
/// dan er één keer naar vragen.
export async function zoekBestaandeKlant(gegevens: {
  bedrijfsnaam?: string;
  kvk?: string;
  btw?: string;
  email?: string;
}): Promise<{ zekerheid: "zeker" | "mogelijk" | "geen"; clientId: string | null; reden: string }> {
  const kvk = gegevens.kvk?.replace(/\D/g, "");
  const btw = gegevens.btw?.replace(/\s/g, "").toUpperCase();

  if (kvk && kvk.length >= 8) {
    const treffer = await db.client.findFirst({ where: { kvk: { contains: kvk } } });
    if (treffer) return { zekerheid: "zeker", clientId: treffer.id, reden: `zelfde KvK-nummer als ${treffer.name}` };
  }

  if (btw && btw.length >= 10) {
    const treffer = await db.client.findFirst({ where: { vatId: { contains: btw } } });
    if (treffer) return { zekerheid: "zeker", clientId: treffer.id, reden: `zelfde btw-nummer als ${treffer.name}` };
  }

  if (gegevens.bedrijfsnaam) {
    const treffers = await db.client.findMany({
      where: { name: { contains: gegevens.bedrijfsnaam.trim(), mode: "insensitive" } },
      take: 3,
    });
    if (treffers.length === 1) {
      return {
        zekerheid: "mogelijk",
        clientId: treffers[0].id,
        reden: `er bestaat al een klant met een vergelijkbare naam: ${treffers[0].name}`,
      };
    }
    if (treffers.length > 1) {
      return {
        zekerheid: "mogelijk",
        clientId: null,
        reden: `${treffers.length} bestaande klanten hebben een vergelijkbare naam`,
      };
    }
  }

  return { zekerheid: "geen", clientId: null, reden: "geen bestaande klant gevonden" };
}
