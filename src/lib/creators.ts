import "server-only";

import { db } from "./db";
import { maakToken, vervaldatum } from "./portaal";

// Creators, hun campagnes, en wat ze na afloop aanleveren.
//
// Het uitgangspunt staat in de uploadlink zelf: de creator hoeft niets te
// weten. Geen account, geen login, niet zoeken welke klant of welke campagne.
// De link wéét dat al. Wat wij kunnen afleiden vragen we niet.
//
// De tweede regel is even hard: **wat er niet in staat, verzinnen we niet.**
// Levert een creator geen bereik aan, dan blijft dat veld leeg en komt er een
// regel in `ontbreekt`. Een rapport met een geraden getal is erger dan een
// rapport met een gat, want een gat kun je zien.

/// Hoe ver een creator is met aanleveren. Drie standen, want twee is te grof:
/// "heeft iets gestuurd maar de insights ontbreken" is iets anders dan "heeft
/// niets gestuurd", en vraagt om een ander bericht.
export type Leverstatus = "compleet" | "gedeeltelijk" | "ontbreekt";

export type CreatorStand = {
  creatorCampagneId: string;
  creatorId: string;
  creatorNaam: string;
  status: Leverstatus;
  /// Wat er nog mist, in gewone taal.
  mist: string[];
  aantalContentstukken: number;
  deliverables: number;
  gevraagdOp: Date | null;
  ontvangenOp: Date | null;
};

/// Wat er mis kan zijn met een aanlevering, los van wat er ontbreekt.
export type Waarschuwing = { soort: string; wat: string };

export type OntbrekendResultaat = {
  creatorCampagneId: string;
  creatorNaam: string;
  gevraagdOp: Date | null;
  wat: string;
};

/// Zet voor elke geselecteerde creator een eigen uploadlink klaar.
///
/// Eén link per creator per campagne. Bestaat er al een openstaande link, dan
/// hergebruiken we die: twee links naar dezelfde creator sturen levert alleen
/// verwarring op over welke de goede is.
export async function vraagResultatenOp(
  creatorCampagneIds: string[],
  userId: string,
): Promise<{ creatorNaam: string; link: string; nieuw: boolean }[]> {
  const basis = (process.env.APP_URL ?? "https://beerthuizen-hq.vercel.app").replace(/\/$/, "");

  const koppelingen = await db.creatorCampagne.findMany({
    where: { id: { in: creatorCampagneIds } },
    include: {
      creator: { select: { name: true } },
      project: { select: { name: true, clientId: true } },
      uploads: { select: { requestId: true } },
    },
  });

  const uitkomst: { creatorNaam: string; link: string; nieuw: boolean }[] = [];

  for (const koppeling of koppelingen) {
    // Al een openstaande link? Dan die.
    const bestaand = await db.portalRequest.findFirst({
      where: {
        type: "creatorresultaten",
        label: `${koppeling.creator.name} — ${koppeling.project.name}`,
        submittedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (bestaand) {
      uitkomst.push({
        creatorNaam: koppeling.creator.name,
        link: `${basis}/portaal/${bestaand.token}`,
        nieuw: false,
      });
      continue;
    }

    const aanvraag = await db.portalRequest.create({
      data: {
        token: maakToken(),
        type: "creatorresultaten",
        // Het label draagt de koppeling: hieraan herkennen we bij binnenkomst
        // welke creator bij welke campagne hoort, zonder dat de creator iets
        // hoeft te kiezen.
        label: `${koppeling.creator.name} — ${koppeling.project.name}`,
        clientId: koppeling.project.clientId,
        expiresAt: vervaldatum(),
        createdByUserId: userId,
      },
    });

    await db.creatorCampagne.update({
      where: { id: koppeling.id },
      data: { resultatenGevraagdOp: new Date() },
    });

    uitkomst.push({
      creatorNaam: koppeling.creator.name,
      link: `${basis}/portaal/${aanvraag.token}`,
      nieuw: true,
    });
  }

  return uitkomst;
}

/// Een getal uit wat een mens intypte. "12.4k", "1.234", "ongeveer 8000".
///
/// Geeft null terug zodra het niet zeker is. Dat is het hele punt: liever geen
/// getal dan een verkeerd getal.
export function leesGetal(ruw: string | undefined | null): number | null {
  if (!ruw) return null;
  const tekst = ruw.trim().toLowerCase();
  if (!tekst || /^(geen|onbekend|weet ik niet|n\.?v\.?t\.?|-)$/.test(tekst)) return null;

  const match = /(\d[\d.,\s]*)\s*(k|m)?/.exec(tekst);
  if (!match) return null;

  const suffix = match[2];
  const factor = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : 1;
  let cijfers = match[1].replace(/\s/g, "");

  // Een punt betekent niet altijd hetzelfde. In "12.400" is het een
  // duizendscheiding, in "84.2k" een decimaalteken — en dat verschil is de
  // factor duizend. Zonder deze regel werd 84,2 duizend bereik gelezen als
  // 842.000, en dan klopt een heel campagnerapport niet meer.
  const puntGevolgdDoorDrie = /\.\d{3}(\D|$)/.test(cijfers);
  if (suffix || !puntGevolgdDoorDrie) {
    // Decimaal: hooguit één scheidingsteken, en dat is het decimaalteken.
    cijfers = cijfers.replace(",", ".");
  } else {
    // Duizendscheiding: punten eruit, komma blijft het decimaalteken.
    cijfers = cijfers.replace(/\./g, "").replace(",", ".");
  }

  const waarde = Number(cijfers);
  if (!Number.isFinite(waarde)) return null;

  return Math.round(waarde * factor);
}

/// Links uit een tekstveld: één per regel, spaties en lege regels eruit.
export function leesLinks(ruw: string | undefined | null): string[] {
  if (!ruw) return [];
  return ruw
    .split(/[\n,]+/)
    .map((regel) => regel.trim())
    .filter((regel) => /^https?:\/\//i.test(regel));
}

/// Verwerkt wat een creator aanleverde tot een upload die aan de juiste creator
/// én campagne hangt. Geeft terug wat er ontbreekt.
export async function verwerkCreatorResultaten(
  requestId: string,
  inzending: Record<string, string>,
): Promise<{ ok: boolean; ontbreekt: string[]; waarschuwingen?: Waarschuwing[]; creatorNaam?: string }> {
  const aanvraag = await db.portalRequest.findUnique({ where: { id: requestId } });
  if (!aanvraag?.label) return { ok: false, ontbreekt: ["De aanvraag is niet te herleiden."] };

  // Het label is "Creatornaam — Campagnenaam"; daarmee vinden we de koppeling
  // terug zonder dat de creator iets hoefde te kiezen.
  const [creatorNaam, projectNaam] = aanvraag.label.split(" — ");
  const koppeling = await db.creatorCampagne.findFirst({
    where: {
      creator: { name: creatorNaam?.trim() },
      project: { name: projectNaam?.trim() },
    },
    include: { creator: { select: { name: true } } },
  });

  if (!koppeling) {
    return {
      ok: false,
      ontbreekt: [`Geen campagnekoppeling gevonden voor "${aanvraag.label}".`],
    };
  }

  const links = leesLinks(inzending.contentLinks);
  const bereik = leesGetal(inzending.bereik);
  const views = leesGetal(inzending.weergaven);
  const interacties = leesGetal(inzending.interacties);

  // Wat we niet hebben, benoemen we. Dit is wat Fleur straks moet natrekken en
  // wat er in het rapport als gat zichtbaar blijft.
  const ontbreekt: string[] = [];
  if (links.length === 0) ontbreekt.push("Geen bruikbare links naar de geplaatste content");
  if (bereik === null) ontbreekt.push("Bereik niet opgegeven");
  if (views === null) ontbreekt.push("Weergaven niet opgegeven");
  if (interacties === null) ontbreekt.push("Interacties niet opgegeven");
  if (!inzending.insights?.trim()) ontbreekt.push("Geen insights aangeleverd");

  // Engagement alleen berekenen als beide getallen er zijn. Anders is het een
  // verzinsel met een deelteken erin.
  const engagementRate =
    interacties !== null && bereik !== null && bereik > 0
      ? Math.round((interacties / bereik) * 10_000) / 100
      : null;

  const kanaal =
    /instagram/i.test(inzending.kanalen ?? "")
      ? "instagram"
      : /tiktok/i.test(inzending.kanalen ?? "")
        ? "tiktok"
        : /youtube/i.test(inzending.kanalen ?? "")
          ? "youtube"
          : "overig";

  await db.creatorUpload.create({
    data: {
      creatorCampagneId: koppeling.id,
      requestId: aanvraag.id,
      kanaal,
      contentLinks: links,
      bestanden: inzending.insights ? { insights: inzending.insights } : undefined,
      opmerking: inzending.opmerking || null,
      bereik,
      views,
      likes: interacties,
      engagementRate,
      ontbreekt,
    },
  });

  await db.creatorCampagne.update({
    where: { id: koppeling.id },
    data: { resultatenOntvangenOp: new Date(), status: "geleverd" },
  });

  // Meer dan alleen lege velden: dubbele aanleveringen, onmogelijke cijfers,
  // bereik dat nergens op slaat. Gemarkeerd, nooit gecorrigeerd.
  const waarschuwingen = await controleerAanlevering(koppeling.id, {
    bereik,
    views,
    likes: interacties,
    links,
  });

  // Daan hoort het meteen, zodat Enriqueo er niet achteraan hoeft.
  await meldOntbrekendeResultaten(koppeling.id, ontbreekt, waarschuwingen);

  return { ok: true, ontbreekt, waarschuwingen, creatorNaam: koppeling.creator.name };
}

/// Welke creators hebben nog niet geleverd, en wat ontbreekt er bij wie wél
/// leverde. Dit voedt zowel het scherm van Fleur als het overzicht van Daan.
export async function ontbrekendeResultaten(projectId?: string): Promise<OntbrekendResultaat[]> {
  const koppelingen = await db.creatorCampagne.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      status: { notIn: ["afgezegd", "voorgesteld"] },
    },
    include: {
      creator: { select: { name: true } },
      uploads: { select: { ontbreekt: true } },
    },
  });

  const gaten: OntbrekendResultaat[] = [];

  for (const koppeling of koppelingen) {
    if (koppeling.uploads.length === 0) {
      gaten.push({
        creatorCampagneId: koppeling.id,
        creatorNaam: koppeling.creator.name,
        gevraagdOp: koppeling.resultatenGevraagdOp,
        wat: koppeling.resultatenGevraagdOp
          ? "Heeft nog niets aangeleverd"
          : "Nog niet om resultaten gevraagd",
      });
      continue;
    }

    const punten = [...new Set(koppeling.uploads.flatMap((u) => u.ontbreekt))];
    for (const punt of punten) {
      gaten.push({
        creatorCampagneId: koppeling.id,
        creatorNaam: koppeling.creator.name,
        gevraagdOp: koppeling.resultatenGevraagdOp,
        wat: punt,
      });
    }
  }

  return gaten;
}

/// Controleert een aanlevering op meer dan alleen ontbrekende velden.
///
/// Een creator die per ongeluk twee keer instuurt, of die 2 miljoen bereik
/// opgeeft bij 40.000 volgers, levert data die er compleet uitziet maar nergens
/// op slaat. Zulke cijfers halen ongemerkt een heel campagnerapport onderuit,
/// dus ze worden gemarkeerd — niet gecorrigeerd. Corrigeren zou betekenen dat
/// we zelf een getal verzinnen.
export async function controleerAanlevering(
  creatorCampagneId: string,
  nieuw: { bereik: number | null; views: number | null; likes: number | null; links: string[] },
): Promise<Waarschuwing[]> {
  const waarschuwingen: Waarschuwing[] = [];

  const koppeling = await db.creatorCampagne.findUnique({
    where: { id: creatorCampagneId },
    include: {
      creator: { select: { volgersInstagram: true, volgersTiktok: true, volgersYoutube: true } },
      uploads: { select: { id: true, contentLinks: true, createdAt: true } },
    },
  });
  if (!koppeling) return [{ soort: "koppeling", wat: "De campagnekoppeling is niet gevonden." }];

  // Dubbel ingestuurd: dezelfde link kwam al eerder binnen.
  const eerdereLinks = new Set(koppeling.uploads.flatMap((u) => u.contentLinks));
  const dubbel = nieuw.links.filter((link) => eerdereLinks.has(link));
  if (dubbel.length > 0) {
    waarschuwingen.push({
      soort: "dubbel",
      wat: `${dubbel.length} ${dubbel.length === 1 ? "link was" : "links waren"} al eerder aangeleverd`,
    });
  }
  if (koppeling.uploads.length > 0 && dubbel.length === 0) {
    waarschuwingen.push({
      soort: "tweede_aanlevering",
      wat: `Dit is aanlevering ${koppeling.uploads.length + 1} voor deze campagne`,
    });
  }

  // Negatief of nul waar een getal hoort.
  for (const [naam, waarde] of [
    ["Bereik", nieuw.bereik],
    ["Weergaven", nieuw.views],
    ["Interacties", nieuw.likes],
  ] as const) {
    if (waarde !== null && waarde < 0) {
      waarschuwingen.push({ soort: "ongeldig", wat: `${naam} is negatief (${waarde})` });
    }
  }

  // Meer interacties dan bereik kan niet.
  if (nieuw.likes !== null && nieuw.bereik !== null && nieuw.likes > nieuw.bereik) {
    waarschuwingen.push({
      soort: "onlogisch",
      wat: `Meer interacties (${nieuw.likes}) dan bereik (${nieuw.bereik})`,
    });
  }

  // Bereik dat ver boven het volgersaantal ligt kan — een video kan viraal
  // gaan — maar tien keer je bereik is zeldzaam genoeg om te melden.
  const volgers = Math.max(
    koppeling.creator.volgersInstagram ?? 0,
    koppeling.creator.volgersTiktok ?? 0,
    koppeling.creator.volgersYoutube ?? 0,
  );
  if (volgers > 0 && nieuw.bereik !== null && nieuw.bereik > volgers * 10) {
    waarschuwingen.push({
      soort: "opvallend",
      wat: `Bereik (${nieuw.bereik.toLocaleString("nl-NL")}) is meer dan tien keer het volgersaantal (${volgers.toLocaleString("nl-NL")}). Kan kloppen bij een virale video — even nakijken.`,
    });
  }

  return waarschuwingen;
}

/// De stand per creator binnen een campagne.
export async function creatorStanden(projectId: string): Promise<CreatorStand[]> {
  const koppelingen = await db.creatorCampagne.findMany({
    where: { projectId },
    include: {
      creator: { select: { id: true, name: true } },
      uploads: { select: { ontbreekt: true, contentLinks: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return koppelingen.map((koppeling) => {
    const mist = [...new Set(koppeling.uploads.flatMap((u) => u.ontbreekt))];
    const stukken = koppeling.uploads.reduce((n, u) => n + u.contentLinks.length, 0);

    const status: Leverstatus =
      koppeling.uploads.length === 0 ? "ontbreekt" : mist.length === 0 ? "compleet" : "gedeeltelijk";

    return {
      creatorCampagneId: koppeling.id,
      creatorId: koppeling.creator.id,
      creatorNaam: koppeling.creator.name,
      status,
      mist,
      aantalContentstukken: stukken,
      deliverables: koppeling.deliverables.length,
      gevraagdOp: koppeling.resultatenGevraagdOp,
      ontvangenOp: koppeling.resultatenOntvangenOp,
    };
  });
}

/// Meldt bij Daan wat er aan een aanlevering ontbreekt.
///
/// Bewust één bericht per creator en niet één per ontbrekend veld: vier losse
/// meldingen over dezelfde creator is precies het soort ruis waar een
/// rechterhand voor uitgezet wordt.
export async function meldOntbrekendeResultaten(
  creatorCampagneId: string,
  ontbreekt: string[],
  waarschuwingen: Waarschuwing[],
): Promise<void> {
  if (ontbreekt.length === 0 && waarschuwingen.length === 0) return;

  const koppeling = await db.creatorCampagne.findUnique({
    where: { id: creatorCampagneId },
    include: { creator: { select: { name: true } }, project: { select: { id: true, name: true } } },
  });
  if (!koppeling) return;

  const daan = await db.agent.findUnique({ where: { key: "chief" } });
  const regels = [
    ...ontbreekt.map((punt) => `ontbreekt: ${punt}`),
    ...waarschuwingen.map((w) => `let op: ${w.wat}`),
  ];

  const { notify } = await import("./notifications");
  await notify({
    level: ontbreekt.length > 0 ? "warn" : "info",
    title: `${koppeling.project.name} — ${koppeling.creator.name} heeft aangeleverd`,
    body: regels.join(" · "),
    link: `/projecten/${koppeling.project.id}`,
    agentId: daan?.id ?? null,
    // Niet naar je telefoon: dit is werk voor Fleur, geen beslissing voor jou.
    push: false,
  });

  const { logActivity } = await import("./agents");
  await logActivity({
    agentId: daan?.id ?? null,
    kind: "creatorresultaat",
    level: ontbreekt.length > 0 ? "warn" : "success",
    message: `${koppeling.creator.name} leverde aan voor ${koppeling.project.name}. ${
      ontbreekt.length > 0 ? `Nog ontbrekend: ${ontbreekt.join(", ")}.` : "Compleet."
    }`,
  });
}
