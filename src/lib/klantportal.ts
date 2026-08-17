import "server-only";

import { db } from "./db";
import { randomToken } from "./crypto";

// De klantportal.
//
// Eén regel bepaalt hier alles: **een klant ziet uitsluitend zijn eigen
// gegevens.** Niet "meestal", niet "als de query klopt" — altijd. Daarom loopt
// elke uitvraag hier langs één functie die begint bij de klant-ID uit het token
// en van daaruit naar buiten werkt. Er is geen enkele plek waar een portal-
// pagina zelf een query bouwt; dat is precies hoe je per ongeluk andermans
// campagne toont.
//
// De tweede regel: interne informatie blijft binnen. Marges, notities,
// beoordelingen van creators, welke agent wat deed, wat iets ons kostte — daar
// heeft een klant niets mee te maken en het staat hier dus niet in het type.

export type PortalCampagne = {
  id: string;
  naam: string;
  status: string;
  deadline: Date | null;
  creators: { naam: string; kanalen: string[]; deliverables: string[]; geleverd: boolean }[];
  resultaten: { bereik: number | null; views: number | null; interacties: number | null } | null;
};

export type PortalFactuur = {
  nummer: string;
  omschrijving: string | null;
  bedragEur: number;
  vervaldatum: Date;
  betaald: boolean;
};

export type KlantPortal = {
  klant: { id: string; naam: string; logoUrl: string | null; kleur: string | null };
  campagnes: PortalCampagne[];
  facturen: PortalFactuur[];
};

/// Haalt alles op wat déze klant mag zien, en niets anders.
///
/// Alle vervolgvragen vertrekken vanuit `clientId`. Zolang dat zo blijft, kan
/// er geen gegeven van een andere klant in terechtkomen.
export async function bouwKlantPortal(clientId: string): Promise<KlantPortal | null> {
  const klant = await db.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true },
  });
  if (!klant) return null;

  const projecten = await db.project.findMany({
    where: { clientId: klant.id },
    orderBy: { createdAt: "desc" },
    include: {
      creators: {
        include: {
          creator: { select: { name: true, instagram: true, tiktok: true, youtube: true } },
          uploads: { select: { bereik: true, views: true, likes: true } },
        },
      },
    },
  });

  const facturen = await db.invoice.findMany({
    where: { clientId: klant.id, direction: "uitgaand", status: { not: "concept" } },
    orderBy: { dueOn: "desc" },
    select: {
      number: true,
      description: true,
      amountEur: true,
      dueOn: true,
      status: true,
    },
  });

  return {
    klant: {
      id: klant.id,
      naam: klant.name,
      // Huisstijl van de klant. Zolang die er niet is valt het rapport terug op
      // de Beerthuizen-stijl; zodra hij er wél is verandert alles mee zonder
      // dat er iets herbouwd hoeft te worden.
      logoUrl: null,
      kleur: null,
    },
    campagnes: projecten.map((project) => {
      const uploads = project.creators.flatMap((k) => k.uploads);
      const metBereik = uploads.filter((u) => u.bereik !== null);
      const metViews = uploads.filter((u) => u.views !== null);
      const metLikes = uploads.filter((u) => u.likes !== null);

      return {
        id: project.id,
        naam: project.name,
        status: project.status,
        deadline: project.deadline,
        creators: project.creators.map((koppeling) => ({
          naam: koppeling.creator.name,
          kanalen: [
            koppeling.creator.instagram && "Instagram",
            koppeling.creator.tiktok && "TikTok",
            koppeling.creator.youtube && "YouTube",
          ].filter((x): x is string => Boolean(x)),
          deliverables: koppeling.deliverables,
          geleverd: koppeling.resultatenOntvangenOp !== null,
          // Bewust niet: motivatie, vergoeding, onze beoordeling. Dat is
          // intern en gaat de klant niet aan.
        })),
        // Alleen tonen wat gemeten is. Geen enkele upload met cijfers betekent
        // geen resultatenblok, niet een blok vol nullen.
        resultaten:
          uploads.length === 0
            ? null
            : {
                bereik: metBereik.length ? metBereik.reduce((n, u) => n + (u.bereik ?? 0), 0) : null,
                views: metViews.length ? metViews.reduce((n, u) => n + (u.views ?? 0), 0) : null,
                interacties: metLikes.length ? metLikes.reduce((n, u) => n + (u.likes ?? 0), 0) : null,
              },
      };
    }),
    facturen: facturen.map((factuur) => ({
      nummer: factuur.number,
      omschrijving: factuur.description,
      bedragEur: factuur.amountEur,
      vervaldatum: factuur.dueOn,
      betaald: factuur.status === "betaald",
    })),
  };
}

/// Een klant toegang geven tot zijn portal.
///
/// Hetzelfde principe als de klantlink: geen account, geen wachtwoord, één
/// token. Anders dan een formulierlink verloopt deze niet na dertig dagen —
/// een portal is bedoeld om terug te komen.
export async function maakPortalToegang(clientId: string): Promise<string> {
  const bestaand = await db.setting.findUnique({ where: { key: `portal:${clientId}` } });
  const opgeslagen = (bestaand?.value ?? {}) as { token?: string };
  if (opgeslagen.token) return opgeslagen.token;

  const token = `kp_${randomToken(24)}`;
  await db.setting.upsert({
    where: { key: `portal:${clientId}` },
    update: { value: { token } },
    create: { key: `portal:${clientId}`, value: { token } },
  });
  return token;
}

/// Van token naar klant. Geeft null bij een onbekend token — nooit een
/// willekeurige klant, en nooit de eerste uit de lijst.
export async function klantVoorPortalToken(token: string): Promise<string | null> {
  if (!token.startsWith("kp_")) return null;

  const instellingen = await db.setting.findMany({ where: { key: { startsWith: "portal:" } } });
  const gevonden = instellingen.find((rij) => (rij.value as { token?: string })?.token === token);
  if (!gevonden) return null;

  return gevonden.key.slice("portal:".length);
}
