// Kan een klant bij de gegevens van een andere klant?
//
//   DOTENV_CONFIG_PATH=.env.production npx tsx scripts/audit-klantportal.mts
//
// Dit is de test die er het meest toe doet. Alle andere fouten kosten tijd;
// deze kost een klant. Er worden daarom twee complete klanten opgezet — met
// campagnes, creators, resultaten en facturen — en daarna wordt geprobeerd om
// via de ene bij de andere te komen.
//
// Ook wordt gecontroleerd dat er geen intern gegeven meelekt: marges, onze
// beoordeling van een creator, wat een creator kostte, interne notities.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";
import { bouwKlantPortal, maakPortalToegang, klantVoorPortalToken } from "../src/lib/klantportal";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });

const MERK = "AUDIT-";
let goed = 0;
let fout = 0;

function toets(naam: string, gelukt: boolean, gezien = "") {
  console.log(`  ${gelukt ? "🟢" : "🔴"} ${naam}${gezien ? ` — ${gezien}` : ""}`);
  if (gelukt) goed += 1;
  else fout += 1;
}

async function main() {
  console.log("\nKLANTPORTAAL — SCHEIDING TUSSEN KLANTEN\n" + "═".repeat(70));

  // ── Twee complete klanten ────────────────────────────────────────────────
  const alfa = await db.client.create({ data: { name: `${MERK}Alfa BV` } });
  const beta = await db.client.create({ data: { name: `${MERK}Beta NV` } });

  const projectAlfa = await db.project.create({
    data: { name: `${MERK}Alfa najaarscampagne`, clientId: alfa.id, status: "loopt" },
  });
  const projectBeta = await db.project.create({
    data: { name: `${MERK}Beta lancering`, clientId: beta.id, status: "loopt" },
  });

  const creatorA = await db.creator.create({
    data: { name: `${MERK}Creator Alfa`, instagram: "alfa", beoordeling: 5, notities: "INTERN: goede marge" },
  });
  const creatorB = await db.creator.create({
    data: { name: `${MERK}Creator Beta`, tiktok: "beta", beoordeling: 2, notities: "INTERN: moeizaam" },
  });

  const koppelingA = await db.creatorCampagne.create({
    data: {
      creatorId: creatorA.id,
      projectId: projectAlfa.id,
      deliverables: ["2 Reels"],
      vergoedingEur: 1500,
      motivatie: "INTERN: past qua publiek, en is goedkoop",
      resultatenOntvangenOp: new Date(),
    },
  });
  await db.creatorCampagne.create({
    data: { creatorId: creatorB.id, projectId: projectBeta.id, deliverables: ["1 video"], vergoedingEur: 3000 },
  });

  await db.creatorUpload.create({
    data: { creatorCampagneId: koppelingA.id, bereik: 50_000, views: 62_000, likes: 2_100 },
  });

  await db.invoice.create({
    data: {
      number: `${MERK}ALFA-01`, clientName: alfa.name, clientId: alfa.id,
      direction: "uitgaand", issuedOn: new Date(), dueOn: new Date(), amountEur: 5000,
      status: "verzonden", notes: "INTERN: marge 42%",
    },
  });
  await db.invoice.create({
    data: {
      number: `${MERK}BETA-01`, clientName: beta.name, clientId: beta.id,
      direction: "uitgaand", issuedOn: new Date(), dueOn: new Date(), amountEur: 9000,
      status: "verzonden",
    },
  });

  toets("twee klanten met eigen campagnes opgezet", true);

  // ── Wat ziet Alfa? ───────────────────────────────────────────────────────
  console.log("\nAlfa opent zijn portal");
  const portalAlfa = await bouwKlantPortal(alfa.id);
  const alsTekst = JSON.stringify(portalAlfa);

  toets("Alfa ziet zijn eigen campagne", portalAlfa!.campagnes.some((c) => c.naam.includes("Alfa")));
  toets("Alfa ziet zijn eigen factuur", portalAlfa!.facturen.some((f) => f.nummer.includes("ALFA")));

  toets("Alfa ziet de campagne van Beta NIET", !alsTekst.includes("Beta lancering"));
  toets("Alfa ziet de factuur van Beta NIET", !alsTekst.includes("BETA-01"));
  toets("Alfa ziet de creator van Beta NIET", !alsTekst.includes("Creator Beta"));
  toets("Alfa ziet de naam van Beta NIET", !alsTekst.includes("Beta NV"));

  console.log("\nWat er intern hoort te blijven");
  toets("geen vergoeding per creator", !alsTekst.includes("1500") && !alsTekst.includes("vergoeding"));
  toets("geen interne motivatie", !alsTekst.includes("INTERN"));
  toets("geen beoordeling van creators", !alsTekst.includes("beoordeling"));
  toets("geen interne notities bij facturen", !alsTekst.includes("marge"));
  toets("geen agentinformatie", !/agent/i.test(alsTekst));

  // ── Tokens ───────────────────────────────────────────────────────────────
  console.log("\nToegang via token");
  const tokenAlfa = await maakPortalToegang(alfa.id);
  const tokenBeta = await maakPortalToegang(beta.id);

  toets("elke klant krijgt een eigen token", tokenAlfa !== tokenBeta);
  toets("token is lang genoeg", tokenAlfa.length >= 32, `${tokenAlfa.length} tekens`);
  toets("tweede keer geeft hetzelfde token", (await maakPortalToegang(alfa.id)) === tokenAlfa);

  toets("token van Alfa leidt naar Alfa", (await klantVoorPortalToken(tokenAlfa)) === alfa.id);
  toets("token van Beta leidt naar Beta", (await klantVoorPortalToken(tokenBeta)) === beta.id);

  console.log("\nProberen binnen te komen");
  toets("onbekend token geeft niets", (await klantVoorPortalToken("kp_bestaatniet")) === null);
  toets("leeg token geeft niets", (await klantVoorPortalToken("")) === null);
  toets("token zonder voorvoegsel geeft niets", (await klantVoorPortalToken(alfa.id)) === null);
  toets("een klant-ID als token werkt niet", (await klantVoorPortalToken(`kp_${beta.id}`)) === null);
  toets(
    "verminkt token geeft niets, niet de eerste de beste klant",
    (await klantVoorPortalToken(tokenAlfa.slice(0, -4))) === null,
  );

  const onbekend = await bouwKlantPortal("bestaat-echt-niet");
  toets("onbekende klant geeft geen portal", onbekend === null);

  // ── Lege situatie ────────────────────────────────────────────────────────
  console.log("\nEen klant zonder campagnes");
  const leeg = await db.client.create({ data: { name: `${MERK}Nog Niets BV` } });
  const portalLeeg = await bouwKlantPortal(leeg.id);
  toets("portal bestaat wel", portalLeeg !== null);
  toets("geen campagnes, geen fout", portalLeeg!.campagnes.length === 0);
  toets("geen facturen", portalLeeg!.facturen.length === 0);

  // ── Campagne zonder resultaten ───────────────────────────────────────────
  const zonderResultaat = portalAlfa!.campagnes.find((c) => c.creators.every((cr) => !cr.geleverd));
  const betaPortal = await bouwKlantPortal(beta.id);
  toets(
    "campagne zonder cijfers toont geen nullen",
    betaPortal!.campagnes[0].resultaten === null,
    JSON.stringify(betaPortal!.campagnes[0].resultaten),
  );
  void zonderResultaat;

  // ── Opruimen ─────────────────────────────────────────────────────────────
  await db.creatorUpload.deleteMany({ where: { creatorCampagne: { creator: { name: { startsWith: MERK } } } } });
  await db.creatorCampagne.deleteMany({ where: { creator: { name: { startsWith: MERK } } } });
  await db.creator.deleteMany({ where: { name: { startsWith: MERK } } });
  await db.invoice.deleteMany({ where: { number: { startsWith: MERK } } });
  await db.project.deleteMany({ where: { name: { startsWith: MERK } } });
  await db.setting.deleteMany({
    where: { key: { in: [`portal:${alfa.id}`, `portal:${beta.id}`, `portal:${leeg.id}`] } },
  });
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
