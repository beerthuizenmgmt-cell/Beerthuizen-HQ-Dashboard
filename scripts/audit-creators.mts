// De hele creatorketen, van register tot verwerkt resultaat.
//
//   DOTENV_CONFIG_PATH=.env.production npx tsx scripts/audit-creators.mts
//
// Niet "de tabel bestaat", maar: een creator aanmaken, aan een campagne
// koppelen, om resultaten vragen, die resultaten aanleveren zoals een creator
// dat zou doen — inclusief slordig ingetypte cijfers — en controleren of ze bij
// de juiste creator én campagne belanden en of ontbrekende data ook echt als
// ontbrekend wordt gemarkeerd.
//
// Alles draagt AUDIT- in de naam en wordt aan het eind verwijderd.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";
import { leesGetal, leesLinks } from "../src/lib/creators";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });

const MERK = "AUDIT-";
let goed = 0;
let fout = 0;

function toets(naam: string, gelukt: boolean, gezien = "") {
  console.log(`  ${gelukt ? "🟢" : "🔴"} ${naam}${gezien ? ` — ${gezien}` : ""}`);
  if (gelukt) goed += 1;
  else fout += 1;
}

function toests_extra() {
  // De punt is soms duizendscheiding en soms decimaalteken. Het verschil is de
  // factor duizend, dus dit is precies waar een rapport op omvalt.
  toets("84.2k is 84.200, geen 842.000", leesGetal("84.2k") === 84200, String(leesGetal("84.2k")));
  toets("1.500 zonder suffix is duizendvijfhonderd", leesGetal("1.500") === 1500, String(leesGetal("1.500")));
  toets("3,5k met komma", leesGetal("3,5k") === 3500, String(leesGetal("3,5k")));
  toets("2.4m is twee komma vier miljoen", leesGetal("2.4m") === 2400000, String(leesGetal("2.4m")));
  toets("1.234.567 blijft heel", leesGetal("1.234.567") === 1234567, String(leesGetal("1.234.567")));
  toets("12,5 is twaalf en een half", leesGetal("12,5") === 13, String(leesGetal("12,5")));
}

async function main() {
  console.log("\nCREATORKETEN\n" + "═".repeat(70));

  // ── Cijfers lezen zoals een mens ze intypt ───────────────────────────────
  console.log("\nCijfers uit een ingevuld formulier");
  toets("gewoon getal", leesGetal("12400") === 12400);
  toets("met duizendpunten", leesGetal("12.400") === 12400, String(leesGetal("12.400")));
  toets("met k", leesGetal("12.4k") === 12400, String(leesGetal("12.4k")));
  toets("met m", leesGetal("1.2m") === 1200000, String(leesGetal("1.2m")));
  toets("met tekst eromheen", leesGetal("ongeveer 8000 bereik") === 8000, String(leesGetal("ongeveer 8000 bereik")));
  toets('"weet ik niet" geeft niets', leesGetal("weet ik niet") === null);
  toets("leeg geeft niets", leesGetal("") === null);
  toets("onzin geeft niets", leesGetal("geen idee eigenlijk") === null, String(leesGetal("geen idee eigenlijk")));
  toests_extra();

  console.log("\nLinks uit een tekstvak");
  const links = leesLinks("https://instagram.com/p/abc\n\nhttps://tiktok.com/@x/video/1\nvergeten link");
  toets("twee geldige links", links.length === 2, links.join(" · "));
  toets("regel zonder http valt af", !links.some((l) => l.includes("vergeten")));

  // ── De keten ─────────────────────────────────────────────────────────────
  console.log("\nDe keten");

  const klant = await db.client.create({ data: { name: `${MERK}Merk BV` } });
  const project = await db.project.create({
    data: { name: `${MERK}Najaarscampagne`, clientId: klant.id, status: "loopt" },
  });
  toets("campagne aangemaakt", Boolean(project.id));

  const creator = await db.creator.create({
    data: {
      name: `${MERK}Lieke de Vries`,
      soort: "eigen",
      status: "actief",
      instagram: "liekedevries",
      niche: ["fitness", "voeding"],
      land: "Nederland",
      volgersInstagram: 84_000,
      engagement: 3.4,
      cijfersBron: "handmatig ingevoerd tijdens de audit",
    },
  });
  toets("creator in het register", Boolean(creator.id));
  toets("meerdere niches mogelijk", creator.niche.length === 2);

  const tweede = await db.creator.create({
    data: { name: `${MERK}Sam Jansen`, soort: "via_agency", agency: `${MERK}Bureau X` },
  });
  toets("creator via een ander bureau", tweede.soort === "via_agency");

  const koppeling = await db.creatorCampagne.create({
    data: {
      creatorId: creator.id,
      projectId: project.id,
      status: "bevestigd",
      motivatie: "Publiek komt overeen met de doelgroep; eerder goed gepresteerd op voeding.",
      deliverables: ["2 Reels", "4 Stories"],
      vergoedingEur: 1250,
    },
  });
  toets("creator aan campagne gekoppeld", Boolean(koppeling.id));

  const tweedeKoppeling = await db.creatorCampagne.create({
    data: { creatorId: tweede.id, projectId: project.id, status: "bevestigd" },
  });
  toets("tweede creator op dezelfde campagne", Boolean(tweedeKoppeling.id));

  let dubbelGeweigerd = false;
  try {
    await db.creatorCampagne.create({ data: { creatorId: creator.id, projectId: project.id } });
  } catch {
    dubbelGeweigerd = true;
  }
  toets("dezelfde creator niet twee keer op één campagne", dubbelGeweigerd);

  const ander = await db.project.create({ data: { name: `${MERK}Tweede campagne`, clientId: klant.id } });
  const meerdere = await db.creatorCampagne.create({
    data: { creatorId: creator.id, projectId: ander.id },
  });
  toets("dezelfde creator wél op een andere campagne", Boolean(meerdere.id));

  // ── Resultaten opvragen ──────────────────────────────────────────────────
  console.log("\nResultaten opvragen");
  const { vraagResultatenOp } = await import("../src/lib/creators");
  const user = await db.user.findFirst({ where: { role: "owner" } });

  const links1 = await vraagResultatenOp([koppeling.id, tweedeKoppeling.id], user!.id);
  toets("twee links aangemaakt", links1.length === 2);
  toets("elke link is uniek", new Set(links1.map((l) => l.link)).size === 2);
  toets("link bevat een lang token", /\/portaal\/\S{32,}$/.test(links1[0].link), links1[0].link.slice(-28));

  const opnieuw = await vraagResultatenOp([koppeling.id], user!.id);
  toets("tweede keer vragen hergebruikt dezelfde link", !opnieuw[0].nieuw && opnieuw[0].link === links1.find((l) => l.creatorNaam === creator.name)!.link);

  const bijgewerkt = await db.creatorCampagne.findUnique({ where: { id: koppeling.id } });
  toets("vastgelegd wanneer er gevraagd is", bijgewerkt?.resultatenGevraagdOp !== null);

  // ── De creator levert aan ────────────────────────────────────────────────
  console.log("\nDe creator levert aan");
  const { verwerkCreatorResultaten, ontbrekendeResultaten } = await import("../src/lib/creators");

  const aanvraag = await db.portalRequest.findFirst({
    where: { type: "creatorresultaten", label: { startsWith: `${MERK}Lieke` } },
  });
  toets("de aanvraag is terug te vinden", Boolean(aanvraag));

  const uitkomst = await verwerkCreatorResultaten(aanvraag!.id, {
    contentLinks: "https://instagram.com/p/abc123\nhttps://instagram.com/reel/def456",
    kanalen: "Instagram",
    bereik: "84.2k",
    weergaven: "121000",
    interacties: "4.850",
    insights: "https://drive.google.com/screenshot",
    opmerking: "Tweede Reel liep beter dan de eerste.",
  });
  toets("aanlevering verwerkt", uitkomst.ok, uitkomst.ontbreekt.join(" · "));
  toets("gekoppeld aan de juiste creator", uitkomst.creatorNaam === creator.name, String(uitkomst.creatorNaam));

  const upload = await db.creatorUpload.findFirst({
    where: { creatorCampagneId: koppeling.id },
    include: { creatorCampagne: { include: { project: true, creator: true } } },
  });
  toets("hangt aan de juiste campagne", upload?.creatorCampagne.project.id === project.id);
  toets("slordig getal correct gelezen", upload?.bereik === 84200, String(upload?.bereik));
  toets("duizendpunt correct gelezen", upload?.likes === 4850, String(upload?.likes));
  toets("twee links bewaard", upload?.contentLinks.length === 2);
  toets("kanaal herkend", upload?.kanaal === "instagram", String(upload?.kanaal));
  toets(
    "engagement berekend uit echte cijfers",
    upload?.engagementRate !== null && Math.abs((upload?.engagementRate ?? 0) - 5.76) < 0.1,
    String(upload?.engagementRate),
  );
  toets("niets ontbreekt bij een volledige aanlevering", upload?.ontbreekt.length === 0, upload?.ontbreekt.join(" · "));
  toets("campagnestatus op geleverd", (await db.creatorCampagne.findUnique({ where: { id: koppeling.id } }))?.status === "geleverd");

  // ── Een halve aanlevering ────────────────────────────────────────────────
  console.log("\nEen halve aanlevering — hier mag niets geraden worden");
  const aanvraag2 = await db.portalRequest.findFirst({
    where: { type: "creatorresultaten", label: { startsWith: `${MERK}Sam` } },
  });
  const half = await verwerkCreatorResultaten(aanvraag2!.id, {
    contentLinks: "even kwijt",
    kanalen: "TikTok",
    bereik: "",
    weergaven: "weet ik niet",
    interacties: "",
    insights: "",
    opmerking: "",
  });
  toets("verwerkt ondanks ontbrekende gegevens", half.ok);
  toets("vier gaten gemeld", half.ontbreekt.length >= 4, `${half.ontbreekt.length}: ${half.ontbreekt.join(" · ")}`);

  const halfUpload = await db.creatorUpload.findFirst({ where: { creatorCampagneId: tweedeKoppeling.id } });
  toets("bereik blijft leeg in plaats van 0", halfUpload?.bereik === null, String(halfUpload?.bereik));
  toets("engagement niet berekend zonder cijfers", halfUpload?.engagementRate === null);
  toets("onbruikbare link niet opgeslagen", halfUpload?.contentLinks.length === 0);

  // ── Controle op wat er binnenkomt ────────────────────────────────────────
  console.log("\nControle op de aanlevering zelf");
  const { controleerAanlevering, creatorStanden } = await import("../src/lib/creators");

  const dubbel = await controleerAanlevering(koppeling.id, {
    bereik: 84200, views: 121000, likes: 4850,
    links: ["https://instagram.com/p/abc123"],
  });
  toets("dubbele link herkend", dubbel.some((w) => w.soort === "dubbel"), dubbel.map((w) => w.wat).join(" · "));

  const onlogisch = await controleerAanlevering(koppeling.id, {
    bereik: 1000, views: 900, likes: 5000, links: [],
  });
  toets("meer interacties dan bereik wordt gemeld", onlogisch.some((w) => w.soort === "onlogisch"));

  const negatief = await controleerAanlevering(koppeling.id, {
    bereik: -50, views: null, likes: null, links: [],
  });
  toets("negatief bereik wordt gemeld", negatief.some((w) => w.soort === "ongeldig"));

  const viraal = await controleerAanlevering(koppeling.id, {
    bereik: 2_000_000, views: null, likes: null, links: [],
  });
  toets("bereik ver boven volgersaantal wordt gemeld", viraal.some((w) => w.soort === "opvallend"), viraal.find((w) => w.soort === "opvallend")?.wat.slice(0, 60) ?? "");

  const normaal = await controleerAanlevering(tweedeKoppeling.id, {
    bereik: 12000, views: 15000, likes: 400, links: ["https://tiktok.com/@x/video/9"],
  });
  toets("geen valse alarmen bij normale cijfers", !normaal.some((w) => ["ongeldig", "onlogisch", "opvallend"].includes(w.soort)), normaal.map((w) => w.soort).join(" · "));

  // ── Stand per creator ────────────────────────────────────────────────────
  console.log("\nStand per creator");
  const standen = await creatorStanden(project.id);
  toets("twee creators in beeld", standen.length === 2);
  const lieke = standen.find((s) => s.creatorNaam.includes("Lieke"));
  const sam = standen.find((s) => s.creatorNaam.includes("Sam"));
  toets("volledige aanlevering is compleet", lieke?.status === "compleet", String(lieke?.status));
  toets("halve aanlevering is gedeeltelijk", sam?.status === "gedeeltelijk", String(sam?.status));
  toets("aantal contentstukken geteld", lieke?.aantalContentstukken === 2, String(lieke?.aantalContentstukken));
  toets("wat er mist staat erbij", (sam?.mist.length ?? 0) >= 4, `${sam?.mist.length}`);

  const derde = await db.creator.create({ data: { name: `${MERK}Nog Niet Gevraagd` } });
  await db.creatorCampagne.create({ data: { creatorId: derde.id, projectId: project.id, status: "bevestigd" } });
  const standen2 = await creatorStanden(project.id);
  toets("wie niets stuurde staat op ontbreekt", standen2.find((s) => s.creatorNaam.includes("Nog Niet"))?.status === "ontbreekt");

  // ── Wat Fleur en Daan te zien krijgen ────────────────────────────────────
  console.log("\nWat er ontbreekt, in beeld");
  const gaten = await ontbrekendeResultaten(project.id);
  toets("gaten worden gemeld", gaten.length >= 4, `${gaten.length} punten`);
  toets("met de creatornaam erbij", gaten.every((g) => g.creatorNaam.length > 0));
  for (const gat of gaten.slice(0, 5)) console.log(`       · ${gat.creatorNaam}: ${gat.wat}`);

  // ── Opruimen ─────────────────────────────────────────────────────────────
  await db.notification.deleteMany({ where: { OR: [{ title: { contains: MERK } }, { body: { contains: MERK } }] } });
  await db.activityEvent.deleteMany({ where: { message: { contains: MERK } } });
  await db.creatorUpload.deleteMany({ where: { creatorCampagne: { creator: { name: { startsWith: MERK } } } } });
  await db.creatorCampagne.deleteMany({ where: { creator: { name: { startsWith: MERK } } } });
  await db.creator.deleteMany({ where: { name: { startsWith: MERK } } });
  await db.portalRequest.deleteMany({ where: { label: { startsWith: MERK } } });
  await db.task.deleteMany({ where: { project: { name: { startsWith: MERK } } } });
  await db.project.deleteMany({ where: { name: { startsWith: MERK } } });
  await db.client.deleteMany({ where: { name: { startsWith: MERK } } });

  console.log(`\n${"═".repeat(70)}\n${goed} geslaagd, ${fout} mislukt. Testdata opgeruimd.`);
  await db.$disconnect();
  if (fout > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
