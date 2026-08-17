// Elk stuk gereedschap, met goede en met foute invoer.
//
//   DOTENV_CONFIG_PATH=.env.production npx tsx scripts/audit-gereedschap.mts
//
// De agents kunnen hiervandaan niet denken — de AI-sleutel is bewust alleen op
// de server leesbaar. Hun handen wél. En daar zitten de fouten: een tool die
// stilletjes niets doet, of die omvalt op een verkeerd ID, kost een agent zijn
// hele denkbeurt zonder dat je ziet waarom.
//
// Alles wat dit script aanmaakt draagt AUDIT- in zijn titel en wordt aan het
// eind weer verwijderd. Er gaat niets naar buiten.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });

const MERK = "AUDIT-";
let goed = 0;
let fout = 0;
const bevindingen: string[] = [];

function toets(naam: string, gelukt: boolean, gezien = "") {
  console.log(`  ${gelukt ? "🟢" : "🔴"} ${naam}${gezien ? ` — ${gezien}` : ""}`);
  if (gelukt) goed += 1;
  else {
    fout += 1;
    bevindingen.push(`${naam}${gezien ? ` — ${gezien}` : ""}`);
  }
}

async function main() {
  const { runTool } = await import("../src/lib/ai/tools");

  const daan = await db.agent.findUnique({ where: { key: "chief" } });
  const fleur = await db.agent.findUnique({ where: { key: "influencer" } });
  if (!daan || !fleur) throw new Error("Daan of Fleur ontbreekt.");

  const alsDaan = { agentId: daan.id, agentName: daan.name, isChief: true };
  const alsFleur = { agentId: fleur.id, agentName: fleur.name, isChief: false };

  console.log("\nGEREEDSCHAP\n" + "═".repeat(70));

  // ── maak_taak ────────────────────────────────────────────────────────────
  console.log("\nmaak_taak");
  const t1 = await runTool("maak_taak", { titel: `${MERK}losse taak` }, alsFleur);
  toets("taak zonder toewijzing", t1.ok, t1.message.slice(0, 60));

  const t2 = await runTool(
    "maak_taak",
    { titel: `${MERK}doorgeven aan collega`, toelichting: "Overdracht testen", agent: "research", prioriteit: "high", deadline: "2026-09-01" },
    alsFleur,
  );
  toets("taak doorgeven aan een collega", t2.ok, t2.message.slice(0, 60));

  const doorgegeven = await db.task.findFirst({
    where: { title: `${MERK}doorgeven aan collega` },
    include: { agent: { select: { key: true } } },
  });
  toets("komt bij de juiste collega terecht", doorgegeven?.agent?.key === "research", doorgegeven?.agent?.key ?? "nergens");
  toets("prioriteit blijft staan", doorgegeven?.priority === "high", String(doorgegeven?.priority));
  toets("deadline blijft staan", doorgegeven?.dueAt?.toISOString().startsWith("2026-09-01") === true, String(doorgegeven?.dueAt));
  toets("maker wordt vastgelegd", doorgegeven?.createdByAgentId === fleur.id);

  const t3 = await runTool("maak_taak", { titel: `${MERK}fout`, agent: "bestaat-niet" }, alsFleur);
  toets("onbekende collega wordt gemeld", !t3.ok || /niet|onbekend/i.test(t3.message), t3.message.slice(0, 70));

  const t4 = await runTool("maak_taak", {}, alsFleur);
  toets("taak zonder titel wordt geweigerd", !t4.ok, t4.message.slice(0, 60));

  const t5 = await runTool("maak_taak", { titel: `${MERK}rare datum`, deadline: "morgen misschien" }, alsFleur);
  toets("onleesbare deadline laat de taak niet omvallen", t5.ok, t5.message.slice(0, 60));

  // ── werk_taak_bij ────────────────────────────────────────────────────────
  console.log("\nwerk_taak_bij");
  const u1 = await runTool(
    "werk_taak_bij",
    { taak_id: doorgegeven!.id, bericht: "Opgepakt en afgerond.", status: "done" },
    alsFleur,
  );
  toets("status bijwerken", u1.ok, u1.message.slice(0, 60));

  const bijgewerkt = await db.task.findUnique({
    where: { id: doorgegeven!.id },
    include: { updates: true },
  });
  toets("status staat echt op done", bijgewerkt?.status === "done", String(bijgewerkt?.status));
  toets("er staat een verslagregel bij", (bijgewerkt?.updates.length ?? 0) > 0, `${bijgewerkt?.updates.length} regels`);

  const u2 = await runTool("werk_taak_bij", { taak_id: "bestaat-echt-niet", bericht: "hallo" }, alsFleur);
  toets("onbekende taak wordt gemeld, niet gecrasht", !u2.ok, u2.message.slice(0, 60));

  const u3 = await runTool("werk_taak_bij", { taak_id: doorgegeven!.id, bericht: "x", status: "verzonnen" }, alsFleur);
  toets("onbekende status valt niet om", typeof u3.ok === "boolean", u3.message.slice(0, 60));

  // ── rapporteer_in_kanaal ─────────────────────────────────────────────────
  console.log("\nrapporteer_in_kanaal");
  const k1 = await runTool("rapporteer_in_kanaal", { kanaal: "algemeen", bericht: `${MERK}bericht in het kanaal` }, alsFleur);
  toets("bericht plaatsen", k1.ok, k1.message.slice(0, 60));

  const geplaatst = await db.message.findFirst({ where: { body: { contains: `${MERK}bericht` } } });
  toets("staat in de database met afzender", geplaatst?.fromAgentId === fleur.id);

  const k2 = await runTool("rapporteer_in_kanaal", { kanaal: "bestaat-niet", bericht: "hallo" }, alsFleur);
  toets("onbekend kanaal wordt gemeld", !k2.ok, k2.message.slice(0, 60));

  const k3 = await runTool("rapporteer_in_kanaal", { kanaal: "algemeen", bericht: "" }, alsFleur);
  toets("leeg bericht wordt geweigerd", !k3.ok, k3.message.slice(0, 60));

  // ── vraag_aan_enriqueo ───────────────────────────────────────────────────
  console.log("\nvraag_aan_enriqueo");
  const v1 = await runTool("vraag_aan_enriqueo", { vraag: `${MERK}Mag dit zo?` }, alsFleur);
  toets("vraag in de wachtrij zetten", v1.ok, v1.message.slice(0, 60));

  const inWachtrij = await db.meetingQuestion.findFirst({ where: { body: { contains: MERK } } });
  toets("komt in de wachtrij van de ochtendcall", Boolean(inWachtrij));
  toets("met de juiste agent erbij", inWachtrij?.agentId === fleur.id);

  const v2 = await runTool("vraag_aan_enriqueo", { vraag: "" }, alsFleur);
  toets("lege vraag wordt geweigerd", !v2.ok, v2.message.slice(0, 60));

  // ── vraag_goedkeuring ────────────────────────────────────────────────────
  console.log("\nvraag_goedkeuring");
  const g1 = await runTool(
    "vraag_goedkeuring",
    {
      soort: "email_send",
      titel: `${MERK}mail naar een prospect`,
      onderbouwing: "Test van de goedkeuringsroute. Er gaat niets weg.",
      actie: { ontvanger: "test@voorbeeld.test", onderwerp: "Test", tekst: "Dit is testdata." },
    },
    alsFleur,
  );
  toets("goedkeuring aanvragen", g1.ok, g1.message.slice(0, 60));

  const aanvraag = await db.approval.findFirst({ where: { title: { contains: MERK } } });
  toets("staat open, niet goedgekeurd", aanvraag?.status === "pending", String(aanvraag?.status));
  toets("de uitgewerkte actie staat erbij", Boolean(aanvraag) && aanvraag!.payload !== null);
  toets("soort klopt", aanvraag?.kind === "email_send", String(aanvraag?.kind));

  const g2 = await runTool("vraag_goedkeuring", { soort: "email_send", titel: "x" }, alsFleur);
  toets("onvolledige aanvraag wordt geweigerd", !g2.ok, g2.message.slice(0, 60));

  // ── noteer_bevinding ─────────────────────────────────────────────────────
  console.log("\nnoteer_bevinding");
  const b1 = await runTool("noteer_bevinding", { bevinding: `${MERK}iets wat opvalt`, urgentie: "warn" }, alsFleur);
  toets("bevinding vastleggen", b1.ok, b1.message.slice(0, 60));
  const bevinding = await db.activityEvent.findFirst({ where: { message: { contains: MERK } } });
  toets("staat in de activiteitenfeed", Boolean(bevinding));
  toets("met de juiste urgentie", bevinding?.level === "warn", String(bevinding?.level));

  // ── onthoud ──────────────────────────────────────────────────────────────
  console.log("\nonthoud");
  const o1 = await runTool(
    "onthoud",
    { soort: "afspraak", titel: `${MERK}testafspraak`, inhoud: "Dit is testdata en wordt weer verwijderd.", vastzetten: true },
    alsFleur,
  );
  toets("iets onthouden", o1.ok, o1.message.slice(0, 60));
  const herinnering = await db.agentMemory.findFirst({ where: { title: { contains: MERK } } });
  toets("staat in zijn geheugen", Boolean(herinnering));
  toets("vastgezet zoals gevraagd", herinnering?.pinned === true);

  const o2 = await runTool(
    "onthoud",
    { soort: "afspraak", titel: `${MERK}testafspraak`, inhoud: "Bijgewerkte tekst." },
    alsFleur,
  );
  toets("tweede keer werkt hij bij in plaats van te verdubbelen", o2.ok);
  const aantal = await db.agentMemory.count({ where: { title: { contains: MERK } } });
  toets("nog steeds één herinnering", aantal === 1, `${aantal} gevonden`);

  const o3 = await runTool("onthoud", { soort: "verzonnen_soort", titel: "x", inhoud: "y" }, alsFleur);
  toets("onbekend soort wordt geweigerd", !o3.ok, o3.message.slice(0, 60));

  // ── zoek_onderzoek ───────────────────────────────────────────────────────
  console.log("\nzoek_onderzoek");
  const z1 = await runTool("zoek_onderzoek", { zoekterm: "sportvoeding" }, alsFleur);
  toets("zoeken in het archief", z1.ok, z1.message.slice(0, 70));
  const z2 = await runTool("zoek_onderzoek", { zoekterm: "volstrekt onbestaand onderwerp xyzzy" }, alsFleur);
  toets("niets gevonden wordt netjes gemeld", z2.ok && /geen|niets|niet/i.test(z2.message), z2.message.slice(0, 70));

  // ── leg_onderzoek_vast (alleen Stefano) ──────────────────────────────────
  console.log("\nleg_onderzoek_vast");
  const stefano = await db.agent.findUnique({ where: { key: "research" } });
  const alsStefano = { agentId: stefano!.id, agentName: stefano!.name, isChief: false };
  const r1 = await runTool(
    "leg_onderzoek_vast",
    {
      vraag: `${MERK}Werkt het onderzoeksarchief?`,
      onderwerp: "markt",
      waarover: `${MERK}testmarkt`,
      bevindingen: "Dit is testdata.",
      conclusie: "Wordt weer verwijderd.",
      bronnen: [{ titel: "Testbron", url: "https://voorbeeld.test" }],
    },
    alsStefano,
  );
  toets("onderzoek vastleggen", r1.ok, r1.message.slice(0, 60));

  const r2 = await runTool("leg_onderzoek_vast", { vraag: `${MERK}zonder bron`, onderwerp: "markt", bevindingen: "x" }, alsStefano);
  toets("zonder bron wordt opgemerkt", typeof r2.ok === "boolean", r2.message.slice(0, 70));

  // ── lees_facturen (alleen Maud) ──────────────────────────────────────────
  console.log("\nlees_facturen");
  const maud = await db.agent.findUnique({ where: { key: "finance" } });
  const f1 = await runTool("lees_facturen", {}, { agentId: maud!.id, agentName: maud!.name, isChief: false });
  toets("administratie lezen", f1.ok);
  toets("richting staat erbij", /UITGAAND|INKOMEND/.test(f1.message));
  toets("testdata is als testdata gemarkeerd", /TESTDATA/.test(f1.message));
  const f2 = await runTool("lees_facturen", { alleen_te_laat: true }, { agentId: maud!.id, agentName: maud!.name, isChief: false });
  toets("alleen te laat filtert echt", f2.ok && !/vervalt 2026-09/.test(f2.message));

  // ── vraag_agent (alleen Daan) ────────────────────────────────────────────
  console.log("\nvraag_agent");
  const q1 = await runTool("vraag_agent", { agent: "bestaat-niet", opdracht: "test" }, alsDaan);
  toets(
    "loopt bewust niet via runTool maar via de denklus",
    !q1.ok && /onbekend gereedschap/i.test(q1.message),
    q1.message.slice(0, 60),
  );
  console.log("     ⓘ een echte collega bevragen laat hem nadenken en kan hier niet");

  // ── bericht_enriqueo (alleen Daan) ───────────────────────────────────────
  console.log("\nbericht_enriqueo");
  const m1 = await runTool(
    "bericht_enriqueo",
    { niveau: "vraag", bericht: `${MERK}dit hoort niet aan te komen`, taak_id: "bestaat-niet" },
    alsDaan,
  );
  toets(
    "valt niet om op een verkeerd taak-ID",
    typeof m1.ok === "boolean" && !/PrismaClient|foreign key/i.test(m1.message),
    m1.message.slice(0, 70),
  );
  console.log("     ⓘ echt verzenden vereist de Telegram-sleutel en kan hier niet");

  // ── onbekend gereedschap ─────────────────────────────────────────────────
  console.log("\nonbekend gereedschap");
  const x1 = await runTool("dit_bestaat_niet", {}, alsFleur);
  toets("wordt netjes gemeld", !x1.ok && /onbekend/i.test(x1.message), x1.message.slice(0, 60));

  // ── web_fetch ────────────────────────────────────────────────────────────
  console.log("\nweb_fetch (de enige externe koppeling die werkt)");
  const { runAgentTool } = await import("../src/lib/ai/toolkit");
  const w1 = await runAgentTool(daan.id, "lees_webpagina", { url: "https://example.com" });
  toets("openbare pagina ophalen", w1?.ok === true, (w1?.message ?? "geen tool gevonden").slice(0, 60));

  const w2 = await runAgentTool(daan.id, "lees_webpagina", { url: "https://dit-bestaat-echt-niet-xyzzy.test" });
  toets("onbereikbare pagina wordt gemeld", w2?.ok === false, (w2?.message ?? "").slice(0, 60));

  const w3 = await runAgentTool(daan.id, "lees_webpagina", { url: "geen-url" });
  toets("onzin-adres wordt geweigerd", w3?.ok === false, (w3?.message ?? "").slice(0, 60));

  const koppeling = await db.agentTool.findFirst({ where: { agentId: daan.id, toolKey: "web_fetch" } });
  toets("laatste gebruik wordt nu bijgehouden", koppeling?.lastUsedAt !== null, String(koppeling?.lastUsedAt));

  const zonderTool = await runAgentTool(maud!.id, "lees_webpagina", { url: "https://example.com" });
  toets("agent zonder deze tool krijgt hem niet", zonderTool === null);

  // ── Opruimen ─────────────────────────────────────────────────────────────
  console.log("\nopruimen");
  await db.taskUpdate.deleteMany({ where: { task: { title: { startsWith: MERK } } } });
  const wegTaken = await db.task.deleteMany({ where: { title: { startsWith: MERK } } });
  const wegBerichten = await db.message.deleteMany({ where: { body: { contains: MERK } } });
  const wegVragen = await db.meetingQuestion.deleteMany({ where: { body: { contains: MERK } } });
  const wegApprovals = await db.approval.deleteMany({ where: { OR: [{ title: { contains: MERK } }, { summary: { contains: MERK } }] } });
  const wegActiviteit = await db.activityEvent.deleteMany({ where: { message: { contains: MERK } } });
  const wegGeheugen = await db.agentMemory.deleteMany({ where: { title: { contains: MERK } } });
  const wegOnderzoek = await db.researchEntry.deleteMany({ where: { question: { contains: MERK } } });
  console.log(
    `  ${wegTaken.count} taken · ${wegBerichten.count} berichten · ${wegVragen.count} vragen · ` +
      `${wegApprovals.count} goedkeuringen · ${wegActiviteit.count} activiteit · ${wegGeheugen.count} herinneringen · ` +
      `${wegOnderzoek.count} onderzoeken`,
  );

  console.log(`\n${"═".repeat(70)}\n${goed} geslaagd, ${fout} mislukt.`);
  if (bevindingen.length) {
    console.log("\nWat er niet klopt:");
    for (const b of bevindingen) console.log(`  🔴 ${b}`);
  }

  await db.$disconnect();
  if (fout > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
