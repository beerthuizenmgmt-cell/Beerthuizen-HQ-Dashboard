import "server-only";

import { db } from "./db";
import type { BoekingStatus } from "@/generated/prisma/enums";

// De studio's: fotostudio en podcaststudio.
//
// De hele opzet draait om één vraag die vaak fout gaat: **is deze dag vrij?**
// Een systeem dat daar soms "ja" op zegt terwijl er al iemand staat, is erger
// dan geen systeem — dan sta je met twee klanten in dezelfde ruimte.
//
// Daarom claimt alleen een *bevestigde* boeking de dag. Een aanvraag of een
// uitstaand voorstel doet dat niet: twee klanten mogen dezelfde dag aanvragen,
// en jij beslist wie hem krijgt. Zodra er bevestigd wordt, sluit de database
// de dag af — niet de applicatie, want twee mensen die tegelijk bevestigen
// glippen langs elke controle in code.

export type Beschikbaarheid = {
  vrij: boolean;
  reden: string;
  /// Wie er staat, als hij bezet is.
  bezetDoor?: { boekingId: string; klant: string | null; doel: string | null };
};

/// Is deze ruimte op deze dag vrij?
export async function isVrij(
  ruimteId: string,
  dag: Date,
  dagdeel = "hele dag",
  negeerBoekingId?: string,
): Promise<Beschikbaarheid> {
  const ruimte = await db.studioruimte.findUnique({ where: { id: ruimteId } });
  if (!ruimte) return { vrij: false, reden: "Die ruimte bestaat niet." };
  if (!ruimte.actief) return { vrij: false, reden: `${ruimte.naam} is niet in gebruik.` };

  const dagStart = new Date(dag);
  dagStart.setHours(0, 0, 0, 0);

  const bezet = await db.studioboeking.findFirst({
    where: {
      ruimteId,
      dag: dagStart,
      dagdeel,
      status: "bevestigd",
      ...(negeerBoekingId ? { id: { not: negeerBoekingId } } : {}),
    },
    include: { client: { select: { name: true } } },
  });

  if (bezet) {
    return {
      vrij: false,
      reden: `${ruimte.naam} is op ${dagStart.toISOString().slice(0, 10)} al bevestigd.`,
      bezetDoor: {
        boekingId: bezet.id,
        klant: bezet.client?.name ?? bezet.contact,
        doel: bezet.doel,
      },
    };
  }

  return { vrij: true, reden: `${ruimte.naam} is vrij op ${dagStart.toISOString().slice(0, 10)}.` };
}

/// Welke dagen zijn de komende weken nog vrij?
export async function vrijeDagen(ruimteId: string, vanaf: Date, dagen = 30): Promise<Date[]> {
  const start = new Date(vanaf);
  start.setHours(0, 0, 0, 0);
  const eind = new Date(start.getTime() + dagen * 864e5);

  const bezet = await db.studioboeking.findMany({
    where: { ruimteId, status: "bevestigd", dag: { gte: start, lt: eind } },
    select: { dag: true },
  });
  const bezetteDagen = new Set(bezet.map((b) => b.dag.toISOString().slice(0, 10)));

  const vrij: Date[] = [];
  for (let i = 0; i < dagen; i += 1) {
    const dag = new Date(start.getTime() + i * 864e5);
    if (!bezetteDagen.has(dag.toISOString().slice(0, 10))) vrij.push(dag);
  }
  return vrij;
}

export type BoekingUitkomst = { ok: boolean; boekingId?: string; melding: string };

/// Een aanvraag vastleggen. Blokkeert nog niets: twee klanten mogen dezelfde
/// dag aanvragen.
export async function vraagAan(input: {
  ruimteId: string;
  dag: Date;
  dagdeel?: string;
  clientId?: string | null;
  contact?: string | null;
  doel?: string | null;
}): Promise<BoekingUitkomst> {
  const ruimte = await db.studioruimte.findUnique({ where: { id: input.ruimteId } });
  if (!ruimte) return { ok: false, melding: "Die ruimte bestaat niet." };

  const dag = new Date(input.dag);
  dag.setHours(0, 0, 0, 0);

  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);
  if (dag < vandaag) {
    return { ok: false, melding: "Die dag is al geweest. Kies een datum in de toekomst." };
  }

  const boeking = await db.studioboeking.create({
    data: {
      ruimteId: input.ruimteId,
      dag,
      dagdeel: input.dagdeel ?? "hele dag",
      clientId: input.clientId ?? null,
      contact: input.contact ?? null,
      doel: input.doel ?? null,
      tariefEur: ruimte.dagtariefEur,
      status: "aangevraagd",
    },
  });

  // Melden dat er al iemand staat is nuttig, maar het is geen weigering: jij
  // beslist wie de dag krijgt.
  const stand = await isVrij(input.ruimteId, dag, input.dagdeel ?? "hele dag");

  return {
    ok: true,
    boekingId: boeking.id,
    melding: stand.vrij
      ? `Aanvraag vastgelegd. ${ruimte.naam} is die dag nog vrij.`
      : `Aanvraag vastgelegd, maar let op: ${stand.reden} Bevestigen kan pas als die boeking wijkt.`,
  };
}

/// Bevestigen. Hier wordt de dag geclaimd.
export async function bevestig(boekingId: string): Promise<BoekingUitkomst> {
  const boeking = await db.studioboeking.findUnique({
    where: { id: boekingId },
    include: { ruimte: { select: { naam: true } } },
  });
  if (!boeking) return { ok: false, melding: "Die boeking bestaat niet." };
  if (boeking.status === "bevestigd") return { ok: true, boekingId, melding: "Stond al bevestigd." };
  if (boeking.status === "geannuleerd") {
    return { ok: false, melding: "Deze boeking is geannuleerd. Maak een nieuwe aanvraag." };
  }

  const stand = await isVrij(boeking.ruimteId, boeking.dag, boeking.dagdeel, boekingId);
  if (!stand.vrij) {
    return {
      ok: false,
      melding: `${stand.reden}${stand.bezetDoor?.klant ? ` Geboekt door ${stand.bezetDoor.klant}.` : ""}`,
    };
  }

  try {
    await db.studioboeking.update({ where: { id: boekingId }, data: { status: "bevestigd" } });
  } catch {
    // De database hield het tegen. Dat gebeurt wanneer iemand anders in
    // dezelfde seconde bevestigde — precies waarvoor die index er is.
    return {
      ok: false,
      melding: "Iemand anders heeft deze dag zojuist bevestigd. Kies een andere dag.",
    };
  }

  return { ok: true, boekingId, melding: `${boeking.ruimte.naam} staat vast op ${boeking.dag.toISOString().slice(0, 10)}.` };
}

/// Verplaatsen naar een andere dag. Houdt vast waar hij vandaan kwam, zodat je
/// later ziet dat het een verplaatsing was en geen nieuwe boeking.
export async function verplaats(boekingId: string, nieuweDag: Date): Promise<BoekingUitkomst> {
  const boeking = await db.studioboeking.findUnique({ where: { id: boekingId } });
  if (!boeking) return { ok: false, melding: "Die boeking bestaat niet." };
  if (boeking.status === "geannuleerd") return { ok: false, melding: "Deze boeking is geannuleerd." };

  const dag = new Date(nieuweDag);
  dag.setHours(0, 0, 0, 0);
  if (dag.getTime() === boeking.dag.getTime()) {
    return { ok: true, boekingId, melding: "Dat is dezelfde dag; er is niets veranderd." };
  }

  const stand = await isVrij(boeking.ruimteId, dag, boeking.dagdeel, boekingId);
  if (!stand.vrij && boeking.status === "bevestigd") {
    return { ok: false, melding: `Verplaatsen kan niet: ${stand.reden}` };
  }

  await db.studioboeking.update({
    where: { id: boekingId },
    data: { dag, verplaatstVanaf: boeking.verplaatstVanaf ?? boeking.dag },
  });

  return {
    ok: true,
    boekingId,
    melding: `Verplaatst van ${boeking.dag.toISOString().slice(0, 10)} naar ${dag.toISOString().slice(0, 10)}.`,
  };
}

/// Annuleren. De dag komt daarmee weer vrij.
export async function annuleer(boekingId: string, reden: string): Promise<BoekingUitkomst> {
  const boeking = await db.studioboeking.findUnique({ where: { id: boekingId } });
  if (!boeking) return { ok: false, melding: "Die boeking bestaat niet." };
  if (!reden.trim()) {
    // Zonder reden weet je later niet of het een afzegging was of een
    // verplaatsing die misging.
    return { ok: false, melding: "Geef een reden op; anders is later niet te zien wat er gebeurde." };
  }

  await db.studioboeking.update({
    where: { id: boekingId },
    data: { status: "geannuleerd", annuleringsreden: reden.trim() },
  });

  return { ok: true, boekingId, melding: "Geannuleerd. De dag is weer vrij." };
}

/// De bezetting over een periode, per ruimte.
export async function bezetting(vanaf: Date, dagen = 30) {
  const start = new Date(vanaf);
  start.setHours(0, 0, 0, 0);
  const eind = new Date(start.getTime() + dagen * 864e5);

  const ruimtes = await db.studioruimte.findMany({
    where: { actief: true },
    orderBy: { naam: "asc" },
    include: {
      boekingen: {
        where: { dag: { gte: start, lt: eind }, status: { notIn: ["geannuleerd"] } },
        include: { client: { select: { name: true } } },
        orderBy: { dag: "asc" },
      },
    },
  });

  return ruimtes.map((ruimte) => {
    const bevestigd = ruimte.boekingen.filter((b) => b.status === "bevestigd");
    return {
      id: ruimte.id,
      naam: ruimte.naam,
      soort: ruimte.soort,
      dagtariefEur: ruimte.dagtariefEur,
      bezetteDagen: bevestigd.length,
      // Alleen over de gevraagde periode; een percentage zonder noemer zegt niets.
      bezettingsgraad: Math.round((bevestigd.length / dagen) * 100),
      aanvragen: ruimte.boekingen.filter((b) => b.status === "aangevraagd").length,
      boekingen: ruimte.boekingen.map((b) => ({
        id: b.id,
        dag: b.dag,
        status: b.status as BoekingStatus,
        klant: b.client?.name ?? b.contact,
        doel: b.doel,
        tariefEur: b.tariefEur,
      })),
    };
  });
}
