import "server-only";

import { db } from "./db";
import { creatorStanden } from "./creators";

// Het campagnerapport.
//
// Eén regel bepaalt de hele opzet: **een getal dat we niet gemeten hebben komt
// er niet in.** Niet als nul, niet als schatting, niet als gemiddelde van de
// rest. Waar iets ontbreekt staat dat er, met de naam van de creator erbij.
//
// Dat is geen voorzichtigheid maar rekenkunde. Tel je een creator zonder
// cijfers mee als nul, dan daalt het gemiddelde door iets wat je niet weet, en
// een klant die dat later ontdekt gelooft de rest ook niet meer.
//
// Elk totaal draagt daarom `vanHoeveel` en `vanTotaal`: waarop is dit
// gebaseerd, en hoeveel creators zijn er in totaal.

export type Meting = {
  waarde: number | null;
  /// Van hoeveel creators dit totaal komt.
  vanHoeveel: number;
  /// Hoeveel creators er meededen.
  vanTotaal: number;
};

export type CreatorRegel = {
  naam: string;
  kanaal: string;
  deliverables: string[];
  contentstukken: number;
  bereik: number | null;
  views: number | null;
  interacties: number | null;
  engagementRate: number | null;
  ontbreekt: string[];
};

export type Campagnerapport = {
  campagne: {
    naam: string;
    klant: string | null;
    status: string;
    periodeVan: Date | null;
    periodeTot: Date | null;
    deadline: Date | null;
  };
  /// Uit de briefing, voor zover die er is.
  opzet: { doel: string | null; doelgroep: string | null; budget: string | null };
  totalen: {
    creators: number;
    contentstukken: number;
    bereik: Meting;
    views: Meting;
    interacties: Meting;
    /// Gewogen over de creators die zowel bereik als interacties opgaven.
    engagementRate: Meting;
  };
  perCreator: CreatorRegel[];
  /// Wat er ontbreekt voordat dit rapport naar een klant kan.
  gaten: string[];
  /// Klaar om te versturen, of nog niet.
  compleet: boolean;
};

function meet(waarden: (number | null)[], totaal: number): Meting {
  const echte = waarden.filter((w): w is number => w !== null);
  return {
    waarde: echte.length > 0 ? echte.reduce((a, b) => a + b, 0) : null,
    vanHoeveel: echte.length,
    vanTotaal: totaal,
  };
}

export async function bouwCampagnerapport(projectId: string): Promise<Campagnerapport | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      client: { select: { name: true } },
      request: { select: { submission: true } },
      creators: {
        include: {
          creator: { select: { name: true } },
          uploads: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!project) return null;

  const standen = await creatorStanden(project.id);
  const briefing = (project.request?.submission as Record<string, string> | null) ?? null;

  const perCreator: CreatorRegel[] = project.creators.map((koppeling) => {
    // Meerdere aanleveringen tellen op; een creator die twee keer instuurde
    // heeft niet twee campagnes gedaan.
    const bereik = meet(koppeling.uploads.map((u) => u.bereik), 1).waarde;
    const views = meet(koppeling.uploads.map((u) => u.views), 1).waarde;
    const interacties = meet(koppeling.uploads.map((u) => u.likes), 1).waarde;

    return {
      naam: koppeling.creator.name,
      kanaal: koppeling.uploads[0]?.kanaal ?? "onbekend",
      deliverables: koppeling.deliverables,
      contentstukken: koppeling.uploads.reduce((n, u) => n + u.contentLinks.length, 0),
      bereik,
      views,
      interacties,
      // Per creator opnieuw uitrekenen in plaats van het opgeslagen cijfer
      // overnemen: bij twee aanleveringen klopt dat laatste niet meer.
      engagementRate:
        interacties !== null && bereik !== null && bereik > 0
          ? Math.round((interacties / bereik) * 10_000) / 100
          : null,
      ontbreekt: [...new Set(koppeling.uploads.flatMap((u) => u.ontbreekt))],
    };
  });

  const totaalCreators = perCreator.length;
  const bereik = meet(perCreator.map((c) => c.bereik), totaalCreators);
  const interacties = meet(perCreator.map((c) => c.interacties), totaalCreators);

  // Engagement over het geheel: alleen de creators die beide cijfers gaven.
  const volledig = perCreator.filter((c) => c.bereik !== null && c.interacties !== null);
  const somBereik = volledig.reduce((n, c) => n + (c.bereik ?? 0), 0);
  const somInteracties = volledig.reduce((n, c) => n + (c.interacties ?? 0), 0);

  // Wat er ontbreekt voordat dit naar buiten kan.
  const gaten: string[] = [];
  for (const stand of standen) {
    if (stand.status === "ontbreekt") {
      gaten.push(`${stand.creatorNaam} heeft nog niets aangeleverd`);
    } else if (stand.mist.length > 0) {
      gaten.push(`${stand.creatorNaam}: ${stand.mist.join(", ")}`);
    }
  }
  if (totaalCreators === 0) gaten.push("Er zijn nog geen creators aan deze campagne gekoppeld");

  return {
    campagne: {
      naam: project.name,
      klant: project.client?.name ?? null,
      status: project.status,
      periodeVan: project.startsOn,
      periodeTot: project.endsOn,
      deadline: project.deadline,
    },
    opzet: {
      doel: briefing?.doel ?? null,
      doelgroep: briefing?.doelgroep ?? null,
      budget: briefing?.budget ?? null,
    },
    totalen: {
      creators: totaalCreators,
      contentstukken: perCreator.reduce((n, c) => n + c.contentstukken, 0),
      bereik,
      views: meet(perCreator.map((c) => c.views), totaalCreators),
      interacties,
      engagementRate: {
        waarde:
          volledig.length > 0 && somBereik > 0
            ? Math.round((somInteracties / somBereik) * 10_000) / 100
            : null,
        vanHoeveel: volledig.length,
        vanTotaal: totaalCreators,
      },
    },
    perCreator,
    gaten,
    compleet: gaten.length === 0,
  };
}
