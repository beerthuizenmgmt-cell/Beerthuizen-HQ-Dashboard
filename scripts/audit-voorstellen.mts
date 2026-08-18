// De voorstelworkflow, van briefing tot klaar voor akkoord.
//
//   DOTENV_CONFIG_PATH=.env.production npx tsx scripts/audit-voorstellen.mts
//
// Drie voorstellen: een influencercampagne, een event en een studio-opdracht.
// Per soort hoort een andere route en een andere set onderdelen — een studio-
// opdracht heeft geen creators, een event geen advertentiebudget.
//
// De belangrijkste controle staat onderaan: een voorstel met een open plek of
// een verzonnen bedrag mag niet langs de kwaliteitscontrole komen.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";
import { sectiesVoor, agentsVoor } from "../src/lib/voorstellen";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });
const MERK = "AUDIT-";
let goed = 0, fout = 0;
const toets = (n: string, ok: boolean, g = "") => {
  console.log(`  ${ok ? "🟢" : "🔴"} ${n}${g ? ` — ${g}` : ""}`);
  ok ? goed++ : fout++;
};

async function main() {
  console.log("\nVOORSTELWORKFLOW\n" + "═".repeat(70));
  const { runTool } = await import("../src/lib/ai/tools");

  const daan = await db.agent.findUnique({ where: { key: "chief" } });
  const fleur = await db.agent.findUnique({ where: { key: "influencer" } });
  const alsDaan = { agentId: daan!.id, agentName: daan!.name, isChief: true };
  const alsFleur = { agentId: fleur!.id, agentName: fleur!.name, isChief: false };

  // ── Routering per soort ──────────────────────────────────────────────────
  console.log("\nWie werkt aan welk soort voorstel");
  toets("influencer: Fleur en Jesse erbij", agentsVoor("influencer").includes("influencer") && agentsVoor("influencer").includes("creative"));
  toets("influencer heeft creators", sectiesVoor("influencer").some((s) => s.sleutel === "creators"));
  toets("studio heeft géén creators", !sectiesVoor("studio").some((s) => s.sleutel === "creators"));
  toets("advertising heeft advertentiebudget", sectiesVoor("advertising").some((s) => s.sleutel === "advertentiebudget"));
  toets("event heeft géén advertentiebudget", !sectiesVoor("event").some((s) => s.sleutel === "advertentiebudget"));
  toets("advertising gaat langs Mila", agentsVoor("advertising").includes("analytics"));
  toets("studio gaat langs Jolanda", agentsVoor("studio").includes("operations"));
  toets("aanleiding komt uit het dossier, niet van een agent", sectiesVoor("influencer").find((s) => s.sleutel === "aanleiding")?.agentKey === null);

  // ── Een campagne met briefing ────────────────────────────────────────────
  console.log("\nTest 1 — influencercampagne met briefing");
  const klant = await db.client.create({ data: { name: `${MERK}Nike Nederland` } });
  const aanvraag = await db.portalRequest.create({
    data: {
      token: `audit-${Date.now()}`, type: "campagnebriefing", label: `${MERK}Nike`,
      clientId: klant.id, expiresAt: new Date(Date.now() + 864e5),
      submission: {
        doel: "Awareness voor de nieuwe sportcollectie",
        doelgroep: "Vrouwen van 20 tot 35 in Nederland die drie keer per week sporten",
        doelToelichting: "Nieuwe collectie in oktober, wil langdurige samenwerking opbouwen",
        budget: "25.000",
      },
    },
  });
  const project = await db.project.create({
    data: { name: `${MERK}Nike najaar`, clientId: klant.id, requestId: aanvraag.id, deadline: new Date("2026-09-20") },
  });

  const start = await runTool("start_voorstel", { naam: `${MERK}Nike — najaarscampagne`, soort: "influencer", project_id: project.id }, alsDaan);
  toets("voorstel gestart", start.ok, start.message.slice(0, 70));
  toets("meldt welke collega's nodig zijn", /Fleur|influencer/i.test(start.message));

  const voorstel = await db.voorstel.findFirst({
    where: { naam: { startsWith: MERK } },
    include: { secties: { orderBy: { sortOrder: "asc" } } },
  });
  toets("secties aangemaakt", (voorstel?.secties.length ?? 0) === sectiesVoor("influencer").length, `${voorstel?.secties.length}`);

  const doelgroep = voorstel!.secties.find((s) => s.sleutel === "doelgroep");
  toets("doelgroep automatisch overgenomen", doelgroep?.status === "ingevuld", String(doelgroep?.inhoud).slice(0, 40));
  toets("met vermelding van de bron", (doelgroep?.bron ?? "").includes("briefing"));
  const doel = voorstel!.secties.find((s) => s.sleutel === "doelstelling");
  toets("doelstelling ook overgenomen", doel?.status === "ingevuld");

  // ── Een agent vult zijn onderdeel ────────────────────────────────────────
  console.log("\nEen collega vult zijn deel in");
  const vul = await runTool("vul_voorstel_sectie", {
    voorstel_id: voorstel!.id, sectie: "strategie",
    inhoud: "Drie creators uit de sport- en lifestylehoek, elk met een eigen invalshoek op de collectie, verspreid over zes weken.",
    bron: "eigen inschatting op basis van de briefing",
  }, alsFleur);
  toets("sectie ingevuld", vul.ok, vul.message.slice(0, 60));
  toets("meldt hoeveel er nog open staat", /open/.test(vul.message));

  const fout1 = await runTool("vul_voorstel_sectie", { voorstel_id: voorstel!.id, sectie: "advertentiebudget", inhoud: "x" }, alsFleur);
  toets("sectie die niet bij dit soort hoort wordt geweigerd", !fout1.ok, fout1.message.slice(0, 70));

  const gat = await runTool("meld_ontbrekend_in_voorstel", {
    voorstel_id: voorstel!.id, wat: "Definitief budget", vanWie: "Enriqueo",
  }, alsFleur);
  toets("ontbrekend gemeld in plaats van verzonnen", gat.ok);
  const naGat = await db.voorstel.findUnique({ where: { id: voorstel!.id } });
  toets("staat op de gatenlijst", naGat!.ontbreekt.some((o) => o.includes("budget")));
  const nogmaals = await runTool("meld_ontbrekend_in_voorstel", { voorstel_id: voorstel!.id, wat: "Definitief budget", vanWie: "Enriqueo" }, alsFleur);
  toets("niet twee keer hetzelfde gat", nogmaals.ok && /al op/i.test(nogmaals.message));

  // ── De controle ──────────────────────────────────────────────────────────
  console.log("\nDe kwaliteitscontrole");
  const teVroeg = await runTool("controleer_voorstel", {
    voorstel_id: voorstel!.id, wat: "Campagne", investering: "€25.000", beslissing: "Akkoord?",
  }, alsDaan);
  toets("half voorstel komt niet langs de controle", !teVroeg.ok);
  toets("noemt wat er mis is", /niet ingevuld|punt/i.test(teVroeg.message), teVroeg.message.slice(0, 80));

  // Alles invullen, met opzet één open plek en één te korte tekst.
  const teksten: Record<string, string> = {
    creators: "Drie creators, nader te bepalen na akkoord.",
    concept: "Kort.",
    deliverables: "Per creator 2 Reels en 4 Stories, in totaal 6 Reels en 12 Stories voor Nike Nederland.",
    planning: "Start 2026-07-01, oplevering content 2026-09-15, campagne live 2026-10-01.",
    investering: "€ 25.000 totaal: € 18.000 creatorvergoedingen, € 4.000 productie, € 3.000 begeleiding.",
    voorwaarden: "Betaling binnen 30 dagen. Usage rights 6 maanden organisch. Annulering kosteloos tot 14 dagen voor start.",
    vervolgstappen: "Na akkoord benaderen we de creators en leveren we binnen twee weken de definitieve planning.",
  };
  for (const [sleutel, inhoud] of Object.entries(teksten)) {
    await runTool("vul_voorstel_sectie", { voorstel_id: voorstel!.id, sectie: sleutel, inhoud }, alsFleur);
  }
  await runTool("vul_voorstel_sectie", { voorstel_id: voorstel!.id, sectie: "aanleiding", inhoud: "Nike Nederland lanceert in oktober een nieuwe sportcollectie en wil daar zichtbaarheid bij." }, alsDaan);

  const tweede = await runTool("controleer_voorstel", {
    voorstel_id: voorstel!.id, wat: "Influencercampagne met drie creators", investering: "€25.000",
    impact: "Awareness bij de doelgroep", aandachtspunt: "Budget nog niet definitief", beslissing: "Akkoord op budget en aanpak?",
  }, alsDaan);
  toets("open plek wordt gevonden", !tweede.ok && /open plek|nader te bepalen/i.test(tweede.message), tweede.message.slice(0, 100));
  toets("te korte tekst wordt gevonden", /kort/i.test(tweede.message));

  toets("planning in het verleden wordt gevonden", /verleden/i.test(tweede.message), tweede.message.slice(0, 90));

  // Repareren en opnieuw.
  await runTool("vul_voorstel_sectie", { voorstel_id: voorstel!.id, sectie: "planning", inhoud: "Start 2026-09-01, oplevering content 2026-09-15, campagne live 2026-10-01." }, alsFleur);
  await runTool("vul_voorstel_sectie", { voorstel_id: voorstel!.id, sectie: "creators", inhoud: "Drie creators uit ons register met een sport- en lifestylepubliek in Nederland, elk met onderbouwing per creator in de bijlage." }, alsFleur);
  await runTool("vul_voorstel_sectie", { voorstel_id: voorstel!.id, sectie: "concept", inhoud: "Elke creator laat zien hoe de collectie past in haar eigen trainingsweek, in plaats van een productdemonstratie." }, alsFleur);

  const derde = await runTool("controleer_voorstel", {
    voorstel_id: voorstel!.id, wat: "Influencercampagne met drie creators", investering: "€ 25.000",
    impact: "Awareness bij vrouwen 20-35", aandachtspunt: "Budget nog te bevestigen", beslissing: "Akkoord op aanpak en budget?",
  }, alsDaan);
  toets("nu wél door de controle", derde.ok, derde.message.slice(0, 60));

  const klaar = await db.voorstel.findUnique({ where: { id: voorstel!.id } });
  toets("status klaar voor akkoord", klaar?.status === "klaar_voor_akkoord", String(klaar?.status));
  toets("samenvatting vastgelegd", Boolean(klaar?.samenvattingWat && klaar?.samenvattingBeslissing));
  toets("gatenlijst blijft zichtbaar", klaar!.ontbreekt.length > 0, klaar!.ontbreekt.join(" · "));

  // ── Test 2 en 3: event en studio ─────────────────────────────────────────
  console.log("\nTest 2 en 3 — event en studio");
  const event = await runTool("start_voorstel", { naam: `${MERK}Zomerevent`, soort: "event" }, alsDaan);
  toets("event gestart", event.ok);
  const studio = await runTool("start_voorstel", { naam: `${MERK}Fotoshoot`, soort: "studio" }, alsDaan);
  toets("studio gestart", studio.ok);

  const eventV = await db.voorstel.findFirst({ where: { naam: `${MERK}Zomerevent` }, include: { secties: true } });
  const studioV = await db.voorstel.findFirst({ where: { naam: `${MERK}Fotoshoot` }, include: { secties: true } });
  toets("event zonder briefing meldt de gaten", eventV!.ontbreekt.length >= 3, `${eventV!.ontbreekt.length}`);
  toets("studio heeft minder onderdelen dan influencer", studioV!.secties.length < voorstel!.secties.length, `${studioV!.secties.length} vs ${voorstel!.secties.length}`);
  toets("studio kent geen creators", !studioV!.secties.some((s) => s.sleutel === "creators"));

  // ── Een ID waar een teken vanaf viel ─────────────────────────────────────
  console.log("\nEen ID met een tikfout");
  const kort = voorstel!.id.slice(0, voorstel!.id.length - 1);
  const metTikfout = await runTool("vul_voorstel_sectie", {
    voorstel_id: kort, sectie: "aanleiding",
    inhoud: "Nike Nederland lanceert in oktober een nieuwe sportcollectie en wil daar zichtbaarheid bij.",
  }, alsDaan);
  toets("laatste teken weggevallen wordt opgevangen", metTikfout.ok, metTikfout.message.slice(0, 80));
  toets("en meldt dat het is gecorrigeerd", /klopte net niet/i.test(metTikfout.message));

  const veelTeKort = await runTool("vul_voorstel_sectie", { voorstel_id: "cms", sectie: "aanleiding", inhoud: "x" }, alsDaan);
  toets("een te kort begin wordt niet geraden", !veelTeKort.ok, veelTeKort.message.slice(0, 60));

  console.log("\nFoute invoer");
  const zonderNaam = await runTool("start_voorstel", { soort: "influencer" }, alsDaan);
  toets("zonder naam geweigerd", !zonderNaam.ok);
  const raarSoort = await runTool("start_voorstel", { naam: "x", soort: "verzonnen" }, alsDaan);
  toets("onbekend soort geweigerd", !raarSoort.ok, raarSoort.message.slice(0, 50));
  const onbekendProject = await runTool("start_voorstel", { naam: "x", soort: "influencer", project_id: "bestaat-niet" }, alsDaan);
  toets("onbekend project geweigerd", !onbekendProject.ok);

  // ── Opruimen ─────────────────────────────────────────────────────────────
  await db.voorstelSectie.deleteMany({ where: { voorstel: { naam: { startsWith: MERK } } } });
  await db.voorstel.deleteMany({ where: { naam: { startsWith: MERK } } });
  await db.notification.deleteMany({ where: { title: { contains: MERK } } });
  await db.activityEvent.deleteMany({ where: { message: { contains: MERK } } });
  await db.project.deleteMany({ where: { name: { startsWith: MERK } } });
  await db.portalRequest.deleteMany({ where: { label: { startsWith: MERK } } });
  await db.client.deleteMany({ where: { name: { startsWith: MERK } } });

  console.log(`\n${"═".repeat(70)}\n${goed} geslaagd, ${fout} mislukt. Testdata opgeruimd.`);
  await db.$disconnect();
  if (fout > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
