// Klaarzetten wat de agenttests nodig hebben.
//
//   DOTENV_CONFIG_PATH=.env.production npx tsx scripts/test-voorbereiden.mts
//   DOTENV_CONFIG_PATH=.env.production npx tsx scripts/test-voorbereiden.mts --doen
//   DOTENV_CONFIG_PATH=.env.production npx tsx scripts/test-voorbereiden.mts --opruimen
//
// Twee dingen maken een test onmogelijk voordat hij begint:
//
//   1. Lars moet tien bedrijven zoeken, maar heeft geen enkel middel om iets op
//      te zoeken. Zonder webtoegang kan hij alleen bedrijven verzinnen — en dat
//      is precies wat zijn geheugen hem verbiedt. Dan test je niets.
//
//   2. Maud moet een debiteurenstand maken, maar er staat geen enkele factuur
//      in het systeem. Ook dan test je niets.
//
// Alle facturen die dit script maakt beginnen met TEST- en zijn met --opruimen
// in één keer weg. Er wordt niets verstuurd en niets geboekt.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });
const DOEN = process.argv.includes("--doen");
const OPRUIMEN = process.argv.includes("--opruimen");

const MERK = "TEST-";

/// Vandaag, op middernacht, zodat "vijf dagen te laat" ook echt vijf is.
function dagenGeleden(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

async function opruimen() {
  const weg = await db.invoice.deleteMany({ where: { number: { startsWith: MERK } } });
  await db.client.deleteMany({ where: { name: { startsWith: MERK } } });
  console.log(`${weg.count} testfacturen verwijderd, testklanten verwijderd.`);
}

async function main() {
  if (OPRUIMEN) {
    await opruimen();
    await db.$disconnect();
    return;
  }

  console.log("VOORBEREIDING AGENTTESTS\n" + "─".repeat(66));

  // ── Lars kan niets opzoeken ──────────────────────────────────────────────
  const lars = await db.agent.findUnique({ where: { key: "bizdev" }, include: { tools: true } });
  const heeftWeb = lars?.tools.some((t) => t.toolKey === "web_fetch" && t.enabled);

  console.log(`\nLars — webtoegang`);
  if (heeftWeb) {
    console.log("  🟢 heeft web_fetch al");
  } else {
    console.log("  🔴 heeft geen web_fetch, terwijl zijn opdracht is om bedrijven op te zoeken");
    console.log("     → toevoegen met leesrecht (ophalen en bekijken, verandert niets)");
    if (DOEN && lars) {
      await db.agentTool.create({
        data: { agentId: lars.id, toolKey: "web_fetch", permission: "lezen", enabled: true },
      });
      console.log("     🟢 toegevoegd");
    }
  }

  // ── Maud heeft geen facturen ─────────────────────────────────────────────
  const bestaand = await db.invoice.count({ where: { number: { startsWith: MERK } } });
  console.log(`\nMaud — testfacturen`);
  if (bestaand > 0) {
    console.log(`  🟢 er staan er al ${bestaand}; draai eerst --opruimen om opnieuw te beginnen`);
    await db.$disconnect();
    return;
  }

  const klanten = [
    { naam: `${MERK}Vane BV`, email: "administratie@vane.test" },
    { naam: `${MERK}Kade Sports`, email: "finance@kade.test" },
    { naam: `${MERK}Noorderlicht Media`, email: "info@noorderlicht.test" },
  ];

  const facturen = [
    // Vijf openstaand, keurig binnen termijn. Negatief = vervalt nog.
    { nr: "2026-101", klant: 0, bedrag: 4500, uit: 12, verval: -18, status: "verzonden", omschrijving: "Campagnebegeleiding najaarslijn" },
    { nr: "2026-102", klant: 1, bedrag: 2750, uit: 9, verval: -21, status: "verzonden", omschrijving: "Creatorselectie en briefing" },
    { nr: "2026-103", klant: 2, bedrag: 1875, uit: 6, verval: -24, status: "verzonden", omschrijving: "Podcaststudio, vier opnamedagen" },
    { nr: "2026-104", klant: 0, bedrag: 3200, uit: 4, verval: -26, status: "verzonden", omschrijving: "Fotografie productlijn" },
    { nr: "2026-105", klant: 1, bedrag: 950, uit: 2, verval: -28, status: "verzonden", omschrijving: "Advertentiebeheer augustus" },

    // Twee betaald.
    { nr: "2026-098", klant: 2, bedrag: 5400, uit: 45, verval: 15, status: "betaald", betaald: 14, omschrijving: "Campagne zomerlijn, eindafrekening" },
    { nr: "2026-099", klant: 0, bedrag: 1250, uit: 38, verval: 8, status: "betaald", betaald: 7, omschrijving: "Contentproductie juli" },

    // Vijf dagen te laat — eerste herinnering.
    { nr: "2026-096", klant: 1, bedrag: 2100, uit: 35, verval: 5, status: "verzonden", omschrijving: "Creatorvergoedingen doorbelast" },

    // Vijfendertig dagen te laat — dit is de zorg.
    { nr: "2026-088", klant: 2, bedrag: 7800, uit: 65, verval: 35, status: "verzonden", omschrijving: "Campagne voorjaar, tweede termijn" },
  ];

  console.log(`  ${facturen.length} uitgaande facturen + 1 inkomende, alles met TEST- ervoor`);
  for (const f of facturen) {
    const laat = f.verval > 0 && f.status !== "betaald";
    console.log(
      `    ${(MERK + f.nr).padEnd(14)} €${String(f.bedrag).padStart(6)} ${f.status.padEnd(10)}` +
        `${f.status === "betaald" ? " voldaan" : laat ? ` ${f.verval} dagen te laat` : ` vervalt over ${-f.verval} dagen`}`,
    );
  }
  console.log(`    ${(MERK + "INK-0042").padEnd(14)} €   890 inkomend   studiohuur september`);

  if (!DOEN) {
    console.log("\nNiets gewijzigd. Draai met --doen om het echt klaar te zetten.");
    await db.$disconnect();
    return;
  }

  const aangemaakt = [];
  for (const k of klanten) {
    aangemaakt.push(await db.client.create({ data: { name: k.naam, email: k.email, invoiceEmail: k.email } }));
  }

  for (const f of facturen) {
    const klant = aangemaakt[f.klant];
    await db.invoice.create({
      data: {
        number: MERK + f.nr,
        clientName: klant.name,
        clientId: klant.id,
        clientEmail: klant.email,
        description: f.omschrijving,
        direction: "uitgaand",
        issuedOn: dagenGeleden(f.uit),
        dueOn: dagenGeleden(f.verval),
        amountEur: f.bedrag,
        paidAmountEur: f.status === "betaald" ? f.bedrag : null,
        status: f.status as "verzonden" | "betaald",
        sentAt: dagenGeleden(f.uit),
        paidAt: "betaald" in f && f.betaald !== undefined ? dagenGeleden(f.betaald as number) : null,
        source: "testdata",
        notes: "TESTDATA — verzonnen factuur voor het agenttestprogramma. Niet versturen, niet boeken.",
      },
    });
  }

  await db.invoice.create({
    data: {
      number: `${MERK}INK-0042`,
      clientName: "Studioruimte Blaricum",
      description: "Huur studioruimte september",
      direction: "inkomend",
      issuedOn: dagenGeleden(3),
      dueOn: dagenGeleden(-11),
      amountEur: 890,
      status: "verzonden",
      source: "testdata",
      notes: "TESTDATA — verzonnen inkomende factuur. Niet betalen.",
    },
  });

  console.log("\n🟢 Klaargezet. Opruimen kan met --opruimen.");
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
