// Het campagnerapport: klopt het als niet iedereen geleverd heeft?
//
//   DOTENV_CONFIG_PATH=.env.production npx tsx scripts/audit-rapportage.mts
//
// Dit is waar een rapport stilletjes gaat liegen: drie van de vijf creators
// leveren cijfers, de andere twee niet, en het totaal wordt gepresenteerd als
// het totaal. Deze test zet die situatie expres op.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";
import { bouwCampagnerapport } from "../src/lib/rapportage";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });
const MERK = "AUDIT-";
let goed = 0, fout = 0;
const toets = (n: string, ok: boolean, g = "") => {
  console.log(`  ${ok ? "🟢" : "🔴"} ${n}${g ? ` — ${g}` : ""}`);
  ok ? goed++ : fout++;
};

async function main() {
  console.log("\nCAMPAGNERAPPORT\n" + "═".repeat(70));

  const klant = await db.client.create({ data: { name: `${MERK}Rapportklant` } });
  const project = await db.project.create({
    data: { name: `${MERK}Rapportcampagne`, clientId: klant.id, status: "loopt" },
  });

  // Drie creators: twee leveren volledig, één levert niets.
  const namen = ["Volledig Een", "Volledig Twee", "Levert Niets"];
  const koppelingen = [];
  for (const naam of namen) {
    const c = await db.creator.create({ data: { name: `${MERK}${naam}`, volgersInstagram: 50_000 } });
    koppelingen.push(
      await db.creatorCampagne.create({
        data: { creatorId: c.id, projectId: project.id, status: "bevestigd", deliverables: ["1 Reel"] },
      }),
    );
  }

  await db.creatorUpload.create({
    data: {
      creatorCampagneId: koppelingen[0].id, kanaal: "instagram",
      contentLinks: ["https://a.test/1"], bereik: 40_000, views: 52_000, likes: 2_000,
    },
  });
  await db.creatorUpload.create({
    data: {
      creatorCampagneId: koppelingen[1].id, kanaal: "instagram",
      contentLinks: ["https://a.test/2"], bereik: 60_000, views: 71_000, likes: 3_400,
    },
  });

  const rapport = (await bouwCampagnerapport(project.id))!;

  console.log("\nDe cijfers");
  toets("bereik telt alleen wie leverde", rapport.totalen.bereik.waarde === 100_000, String(rapport.totalen.bereik.waarde));
  toets("en zegt van hoeveel", rapport.totalen.bereik.vanHoeveel === 2, `${rapport.totalen.bereik.vanHoeveel} van ${rapport.totalen.bereik.vanTotaal}`);
  toets("drie creators geteld", rapport.totalen.creators === 3);
  toets("twee contentstukken", rapport.totalen.contentstukken === 2, String(rapport.totalen.contentstukken));
  toets(
    "engagement over de juiste noemer",
    rapport.totalen.engagementRate.waarde === 5.4,
    `${rapport.totalen.engagementRate.waarde}% van ${rapport.totalen.engagementRate.vanHoeveel} creators`,
  );

  console.log("\nWie niet leverde");
  const stil = rapport.perCreator.find((c) => c.naam.includes("Levert Niets"))!;
  toets("krijgt geen nul maar niets", stil.bereik === null && stil.views === null, `bereik=${stil.bereik}`);
  toets("engagement blijft leeg", stil.engagementRate === null);
  toets("staat wél in het rapport", rapport.perCreator.length === 3);

  console.log("\nKlaar om te versturen?");
  toets("rapport is niet compleet", !rapport.compleet);
  toets("het gat wordt benoemd", rapport.gaten.some((g) => g.includes("Levert Niets")), rapport.gaten[0] ?? "");

  // Nu levert de derde alsnog.
  await db.creatorUpload.create({
    data: {
      creatorCampagneId: koppelingen[2].id, kanaal: "tiktok",
      contentLinks: ["https://a.test/3"], bereik: 20_000, views: 24_000, likes: 600,
    },
  });
  const compleet = (await bouwCampagnerapport(project.id))!;
  toets("nu wel compleet", compleet.compleet, compleet.gaten.join(" · "));
  toets("bereik nu van alle drie", compleet.totalen.bereik.vanHoeveel === 3);
  toets("totaal bijgewerkt", compleet.totalen.bereik.waarde === 120_000, String(compleet.totalen.bereik.waarde));

  console.log("\nLege campagne");
  const leegProject = await db.project.create({ data: { name: `${MERK}Leeg`, clientId: klant.id } });
  const leeg = (await bouwCampagnerapport(leegProject.id))!;
  toets("geen creators, geen fout", leeg.totalen.creators === 0);
  toets("bereik is leeg, niet nul", leeg.totalen.bereik.waarde === null);
  toets("meldt dat er geen creators zijn", leeg.gaten.some((g) => g.includes("geen creators")));
  toets("onbekende campagne geeft niets", (await bouwCampagnerapport("bestaat-niet")) === null);

  await db.creatorUpload.deleteMany({ where: { creatorCampagne: { creator: { name: { startsWith: MERK } } } } });
  await db.creatorCampagne.deleteMany({ where: { creator: { name: { startsWith: MERK } } } });
  await db.creator.deleteMany({ where: { name: { startsWith: MERK } } });
  await db.project.deleteMany({ where: { name: { startsWith: MERK } } });
  await db.client.deleteMany({ where: { name: { startsWith: MERK } } });

  console.log(`\n${"═".repeat(70)}\n${goed} geslaagd, ${fout} mislukt. Testdata opgeruimd.`);
  await db.$disconnect();
  if (fout > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
