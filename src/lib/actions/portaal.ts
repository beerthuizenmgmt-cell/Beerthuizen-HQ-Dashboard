"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner, audit } from "@/lib/access";
import { notify } from "@/lib/notifications";
import { logActivity } from "@/lib/agents";
import { FORMULIEREN, maakToken, vervaldatum, zoekBestaandeKlant } from "@/lib/portaal";
import type { PortalFormType } from "@/generated/prisma/enums";

export type PortaalState = { error?: string; ok?: string; link?: string };

/// Een nieuwe klantlink aanmaken.
export async function maakKlantlink(
  _prev: PortaalState,
  formData: FormData,
): Promise<PortaalState> {
  const user = await requireOwner();

  const label = String(formData.get("label") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim() || null;
  const type = String(formData.get("type") ?? "klantgegevens") as PortalFormType;

  if (!FORMULIEREN[type]) return { error: "Onbekend formulier." };
  if (!label && !clientId) return { error: "Vul de naam van de klant in." };

  const aanvraag = await db.portalRequest.create({
    data: {
      token: maakToken(),
      type,
      clientId,
      label: label || null,
      expiresAt: vervaldatum(),
      createdByUserId: user.id,
    },
  });

  await audit(user, "portaal_link", `${FORMULIEREN[type].titel} voor ${label || clientId}`);
  revalidatePath("/klanten");

  const basis = (process.env.APP_URL ?? "https://beerthuizen-hq.vercel.app").replace(/\/$/, "");
  return { ok: "Link aangemaakt.", link: `${basis}/portaal/${aanvraag.token}` };
}

/// Vastleggen dat je de link daadwerkelijk hebt verstuurd.
export async function markeerVerstuurd(id: string): Promise<void> {
  const user = await requireOwner();
  await db.portalRequest.updateMany({
    where: { id, status: "aangemaakt" },
    data: { status: "verstuurd" },
  });
  await audit(user, "portaal_verstuurd", id);
  revalidatePath("/klanten");
}

export async function verwijderAanvraag(id: string): Promise<void> {
  const user = await requireOwner();
  await db.portalRequest.delete({ where: { id } });
  await audit(user, "portaal_ingetrokken", id);
  revalidatePath("/klanten");
}

/// Een tweede link voor een project waar nog informatie voor nodig is.
///
/// Geen nieuw project en geen nieuw formulier: de klant ziet alleen de vragen
/// die nog openstaan, en zijn antwoorden worden samengevoegd met wat er al
/// ligt. Alles opnieuw laten invullen is de snelste manier om een klant af te
/// laten haken.
export async function maakAanvullink(projectId: string): Promise<PortaalState> {
  const user = await requireOwner();

  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { request: { select: { type: true, clientId: true, label: true } } },
  });
  if (!project) return { error: "Dit project bestaat niet." };
  if (project.missingInfo.length === 0) return { error: "Er ontbreekt niets meer." };

  const aanvraag = await db.portalRequest.create({
    data: {
      token: maakToken(),
      type: project.request?.type ?? "campagnebriefing",
      clientId: project.clientId,
      label: project.name,
      supplementsId: project.id,
      expiresAt: vervaldatum(),
      createdByUserId: user.id,
    },
  });

  await audit(user, "portaal_aanvulling", project.name);
  revalidatePath("/projecten");
  revalidatePath("/klanten");

  const basis = (process.env.APP_URL ?? "https://beerthuizen-hq.vercel.app").replace(/\/$/, "");
  return { ok: "Aanvullink klaar.", link: `${basis}/portaal/${aanvraag.token}` };
}

/// Wat er ontbreekt om echt te kunnen beginnen, en bij wie het opgehaald moet
/// worden.
///
/// Een briefing kan compleet zijn volgens het formulier en toch te dun om mee
/// te werken. Dit is het verschil tussen "verzonden" en "bruikbaar" — en juist
/// dat verschil hoort iemand te zien vóórdat er werk in gaat zitten.
export function beoordeelBriefing(
  ingevuld: Record<string, string>,
): { veld: string; wat: string; vanWie: string }[] {
  const gaten: { veld: string; wat: string; vanWie: string }[] = [];
  const heeft = (naam: string) => (ingevuld[naam] ?? "").trim().length > 0;

  if (!heeft("budget") && ingevuld.budgetStatus?.startsWith("Nee")) {
    gaten.push({
      veld: "budget",
      wat: "Budgetindicatie — zonder richtbedrag is elk voorstel een gok",
      vanWie: "klant, via Enriqueo",
    });
  }

  if (!heeft("periodeTot")) {
    gaten.push({ veld: "periodeTot", wat: "Einddatum van de campagne", vanWie: "klant" });
  }

  if (!heeft("deadline")) {
    gaten.push({ veld: "deadline", wat: "Wanneer het voorstel uiterlijk nodig is", vanWie: "klant" });
  }

  // Een doelgroep van drie woorden is geen doelgroep.
  if ((ingevuld.doelgroep ?? "").trim().length < 40) {
    gaten.push({
      veld: "doelgroep",
      wat: "Scherpere doelgroepomschrijving — nu te algemeen voor creatorselectie",
      vanWie: "klant",
    });
  }

  if (!heeft("deliverables") || ingevuld.deliverables?.includes("Weet ik nog niet")) {
    gaten.push({ veld: "deliverables", wat: "Welke content er gemaakt moet worden", vanWie: "Fleur, in het voorstel" });
  }

  if (ingevuld.creatorsInGedachten?.startsWith("Nee, we horen") && !heeft("niche")) {
    gaten.push({
      veld: "niche",
      wat: "Richting voor creatorselectie — niche, type of voorbeelden",
      vanWie: "Fleur, samen met de klant",
    });
  }

  if (!heeft("hergebruik") || ingevuld.hergebruik?.startsWith("Weet ik nog niet")) {
    gaten.push({
      veld: "hergebruik",
      wat: "Of de content ook voor eigen kanalen of advertenties gebruikt wordt",
      vanWie: "klant — dit bepaalt de afspraken met creators",
    });
  }

  if (!heeft("bestanden")) {
    gaten.push({ veld: "bestanden", wat: "Brandbook, logo's en beeldmateriaal", vanWie: "klant" });
  }

  return gaten;
}

/// Maakt het project en zet het werk uit bij Daan en Fleur.
async function startProject(
  aanvraagId: string,
  clientId: string | null,
  ingevuld: Record<string, string>,
): Promise<{ projectId: string; gaten: { veld: string; wat: string; vanWie: string }[] }> {
  const gaten = beoordeelBriefing(ingevuld);
  const merk = ingevuld.merk ?? ingevuld.bedrijfsnaam ?? "Onbekend merk";

  const datum = (waarde?: string) => {
    if (!waarde) return null;
    const d = new Date(`${waarde}T12:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const project = await db.project.create({
    data: {
      name: `${merk} — campagne`,
      clientId,
      requestId: aanvraagId,
      status: gaten.length > 0 ? "info_nodig" : "nieuw",
      missingInfo: gaten.map((gat) => `${gat.wat} (${gat.vanWie})`),
      startsOn: datum(ingevuld.periodeVan),
      endsOn: datum(ingevuld.periodeTot),
      deadline: datum(ingevuld.deadline),
    },
  });

  // Een samenvatting die iemand in tien seconden leest. De volledige briefing
  // staat bij de aanvraag; dit is wat er nodig is om te beginnen.
  const kern = [
    `Merk: ${merk}`,
    `Product: ${ingevuld.product ?? "—"}`,
    `Doel: ${ingevuld.doel ?? "—"}${ingevuld.doelToelichting ? ` — ${ingevuld.doelToelichting}` : ""}`,
    `Doelgroep: ${ingevuld.doelgroep ?? "—"}`,
    `Periode: ${ingevuld.periodeVan ?? "?"} tot ${ingevuld.periodeTot ?? "?"}`,
    `Budget: ${ingevuld.budgetStatus ?? "—"}${ingevuld.budget ? ` — ${ingevuld.budget}` : ""}`,
    `Platforms: ${ingevuld.platforms ?? "—"}`,
    `Boodschap: ${ingevuld.boodschap ?? "—"}`,
    `Actie: ${ingevuld.cta ?? "—"}${ingevuld.ctaToelichting ? ` — ${ingevuld.ctaToelichting}` : ""}`,
  ].join("\n");

  const gatenTekst = gaten.length
    ? `\n\nWat er nog ontbreekt:\n${gaten.map((gat) => `- ${gat.wat} → ${gat.vanWie}`).join("\n")}`
    : `\n\nDe briefing is compleet.`;

  const daan = await db.agent.findUnique({ where: { key: "chief" } });
  const fleur = await db.agent.findUnique({ where: { key: "influencer" } });

  if (daan) {
    await db.task.create({
      data: {
        title: `Nieuwe aanvraag: ${merk}`,
        description:
          `Er is een campagnebriefing binnengekomen. Bepaal de planning, bewaak de deadline en haal op ` +
          `wat er ontbreekt.\n\n${kern}${gatenTekst}`,
        agentId: daan.id,
        projectId: project.id,
        status: "assigned",
        priority: gaten.length > 3 ? "high" : "normal",
        source: "klantportaal",
        dueAt: datum(ingevuld.deadline),
      },
    });
  }

  if (fleur) {
    await db.task.create({
      data: {
        title: `Creatorstrategie: ${merk}`,
        description:
          `Bepaal de creatorstrategie voor deze aanvraag: doelgroepmatch, niches, selectie en aanpak. ` +
          `Onderbouw met scores; vraag Stefano om onderzoek waar je het niet zeker weet.\n\n${kern}${gatenTekst}`,
        agentId: fleur.id,
        projectId: project.id,
        status: "assigned",
        priority: "normal",
        source: "klantportaal",
        dueAt: datum(ingevuld.deadline),
      },
    });
  }

  return { projectId: project.id, gaten };
}

/// Voegt nieuwe antwoorden samen met een bestaande briefing.
///
/// Alleen wat de klant nu echt heeft ingevuld overschrijft; een leeg veld wist
/// nooit iets dat er al stond.
async function vulProjectAan(
  projectId: string,
  nieuw: Record<string, string>,
): Promise<{ veld: string; wat: string; vanWie: string }[]> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { request: true, tasks: { select: { id: true, agentId: true } } },
  });
  if (!project?.request) return [];

  const bestaand = (project.request.submission as Record<string, string> | null) ?? {};
  const samengevoegd = { ...bestaand };
  for (const [sleutel, waarde] of Object.entries(nieuw)) {
    if (waarde.trim()) samengevoegd[sleutel] = waarde;
  }

  const gaten = beoordeelBriefing(samengevoegd);

  const datum = (waarde?: string) => {
    if (!waarde) return null;
    const d = new Date(`${waarde}T12:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  await db.portalRequest.update({
    where: { id: project.request.id },
    data: { submission: samengevoegd },
  });

  await db.project.update({
    where: { id: projectId },
    data: {
      status: gaten.length > 0 ? "info_nodig" : "nieuw",
      missingInfo: gaten.map((gat) => `${gat.wat} (${gat.vanWie})`),
      endsOn: datum(samengevoegd.periodeTot) ?? project.endsOn,
      deadline: datum(samengevoegd.deadline) ?? project.deadline,
    },
  });

  // De taken van Daan en Fleur dragen de gatenlijst; die moet mee veranderen,
  // anders werken ze straks met een lijst die niet meer klopt.
  const regel = gaten.length
    ? `Nog nodig:\n${gaten.map((gat) => `- ${gat.wat} → ${gat.vanWie}`).join("\n")}`
    : `De briefing is nu compleet.`;

  for (const taak of project.tasks) {
    await db.taskUpdate.create({
      data: {
        taskId: taak.id,
        authorType: "system",
        kind: "comment",
        body: `De klant heeft aanvullende informatie geleverd.\n\n${regel}`,
      },
    });
  }

  return gaten;
}

/// Het formulier van de klant verwerken.
///
/// Draait zonder ingelogde gebruiker: de klant heeft geen account. Het token is
/// de enige sleutel, en die is al gecontroleerd voordat het formulier getoond
/// werd. Hier controleren we hem nog een keer — een formulier kan altijd later
/// opnieuw verstuurd worden.
export async function verwerkFormulier(
  token: string,
  _prev: PortaalState,
  formData: FormData,
): Promise<PortaalState> {
  const aanvraag = await db.portalRequest.findUnique({ where: { token } });
  if (!aanvraag) return { error: "Deze link is niet geldig." };
  if (aanvraag.expiresAt < new Date()) return { error: "Deze link is verlopen." };
  if (aanvraag.status === "ingevuld" || aanvraag.status === "verwerkt") {
    return { error: "Deze gegevens zijn al ontvangen." };
  }

  const formulier = FORMULIEREN[aanvraag.type];
  const velden = formulier.secties.flatMap((sectie) => sectie.velden);

  const ingevuld: Record<string, string> = {};
  const ontbreekt: string[] = [];

  // Meerkeuzevelden leveren meerdere waarden; die horen als één antwoord terug
  // te komen en niet alleen de laatste.
  for (const veld of velden) {
    if (veld.type === "multi") {
      const waarden = formData.getAll(veld.naam).map(String).filter(Boolean);
      if (waarden.length) ingevuld[veld.naam] = waarden.join(", ");
      continue;
    }
    const waarde = String(formData.get(veld.naam) ?? "").trim();
    if (waarde) ingevuld[veld.naam] = waarde;
  }

  // Pas daarna beoordelen wat verplicht was. Een vervolgvraag die de klant
  // nooit te zien kreeg mag hij ook niet missen — anders blokkeert het
  // formulier op een veld dat er voor hem niet eens stond.
  for (const veld of velden) {
    if (!veld.verplicht) continue;
    if (veld.toonAls && !veld.toonAls.waarden.includes(ingevuld[veld.toonAls.veld] ?? "")) continue;
    if (!ingevuld[veld.naam]) ontbreekt.push(veld.label);
  }

  if (ontbreekt.length > 0) {
    return { error: `Vul nog in: ${ontbreekt.join(", ")}.` };
  }

  // Klant herkennen of aanmaken. Bij twijfel koppelen we niet automatisch.
  let clientId = aanvraag.clientId;
  let dubbelReden: string | null = null;

  if (!clientId && aanvraag.type === "klantgegevens") {
    const match = await zoekBestaandeKlant({
      bedrijfsnaam: ingevuld.bedrijfsnaam,
      kvk: ingevuld.kvk,
      btw: ingevuld.btw,
      email: ingevuld.email,
    });

    if (match.zekerheid === "zeker" && match.clientId) clientId = match.clientId;
    else if (match.zekerheid === "mogelijk") dubbelReden = match.reden;
  }

  const klantVelden: Record<string, string> = {};
  for (const veld of velden) {
    if (veld.doel && ingevuld[veld.naam]) klantVelden[veld.doel] = ingevuld[veld.naam];
  }

  // Ook een briefing levert klantgegevens op — die willen we niet kwijtraken.
  if (aanvraag.type === "klantgegevens" || aanvraag.type === "campagnebriefing") {
    if (clientId) {
      await db.client.update({
        where: { id: clientId },
        data: { ...klantVelden, detailsConfirmedAt: new Date() },
      });
    } else {
      const nieuw = await db.client.create({
        data: {
          name: ingevuld.bedrijfsnaam ?? aanvraag.label ?? "Onbekend",
          ...klantVelden,
          detailsConfirmedAt: new Date(),
        },
      });
      clientId = nieuw.id;
    }
  }

  await db.portalRequest.update({
    where: { id: aanvraag.id },
    data: {
      status: "ingevuld",
      submission: ingevuld,
      missingFields: [],
      submittedAt: new Date(),
      clientId,
    },
  });

  // Een campagnebriefing wordt een project met werk eraan. Bij klantgegevens
  // hoeft dat niet: die vullen alleen de administratie aan.
  let gaten: { veld: string; wat: string; vanWie: string }[] = [];
  let aanvulling = false;

  if (aanvraag.supplementsId) {
    // Aanvulling: samenvoegen met wat er al lag en het project bijwerken.
    aanvulling = true;
    gaten = await vulProjectAan(aanvraag.supplementsId, ingevuld);
  } else if (aanvraag.type === "campagnebriefing") {
    const uitkomst = await startProject(aanvraag.id, clientId, ingevuld);
    gaten = uitkomst.gaten;
  }

  // Naar de juiste agents. De klant merkt hier niets van.
  const naam = ingevuld.bedrijfsnaam ?? aanvraag.label ?? "een klant";
  for (const agentKey of formulier.naarAgents) {
    const agent = await db.agent.findUnique({ where: { key: agentKey } });
    if (!agent) continue;
    await logActivity({
      agentId: agent.id,
      kind: "klantgegevens",
      level: "success",
      message: `${naam} heeft ${formulier.titel.toLowerCase()} aangeleverd.`,
    });
  }

  if (aanvraag.type === "campagnebriefing") {
    await notify({
      level: gaten.length > 0 ? "warn" : "success",
      title: aanvulling
        ? gaten.length > 0
          ? "Aanvulling ontvangen — er ontbreekt nog iets"
          : "Aanvulling ontvangen — de briefing is nu compleet"
        : gaten.length > 0
          ? "Campagnebriefing binnen — informatie ontbreekt"
          : "Campagnebriefing binnen",
      body:
        `${ingevuld.merk ?? naam}: ${ingevuld.doel ?? "doel onbekend"}. ` +
        (gaten.length > 0
          ? `Nog nodig: ${gaten.map((gat) => gat.wat.split(" —")[0]).join(", ")}. Daan en Fleur zijn erop gezet.`
          : `Daan en Fleur zijn erop gezet.`),
      link: "/projecten",
      push: true,
    });
  } else {
    await notify({
      level: dubbelReden ? "warn" : "success",
      title: dubbelReden ? "Klantgegevens ontvangen — mogelijk dubbel" : "Klantgegevens ontvangen",
      body: dubbelReden
        ? `${naam} heeft zijn gegevens ingevuld, maar ${dubbelReden}. Controleer of dit dezelfde klant is.`
        : `${naam} heeft alle gevraagde gegevens ingevuld. Maud kan hiermee factureren.`,
      link: "/klanten",
      push: true,
    });
  }

  revalidatePath("/klanten");
  revalidatePath("/projecten");
  revalidatePath("/taken");
  return { ok: "ontvangen" };
}

/// Nagekeken en akkoord. Pas dan geldt de aanvraag als afgehandeld.
export async function markeerVerwerkt(id: string): Promise<void> {
  const user = await requireOwner();
  await db.portalRequest.update({
    where: { id },
    data: { status: "verwerkt", processedAt: new Date() },
  });
  await audit(user, "portaal_verwerkt", id);
  revalidatePath("/klanten");
}
