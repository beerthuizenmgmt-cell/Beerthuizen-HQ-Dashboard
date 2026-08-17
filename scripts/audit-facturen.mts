// Facturen en betalingen, met de gevallen die geld kosten.
//
//   DOTENV_CONFIG_PATH=.env.production npx tsx scripts/audit-facturen.mts
//
// Een gedeeltelijke betaling die als "betaald" wordt geboekt, of een betaling
// die aan de verkeerde factuur hangt — dat merk je pas als een klant belt.
// Daarom staan hier vooral de gevallen waarin het systeem moet wéigeren.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });
const MERK = "AUDIT-F-";
let goed = 0, fout = 0;
const toets = (n: string, ok: boolean, g = "") => {
  console.log(`  ${ok ? "🟢" : "🔴"} ${n}${g ? ` — ${g}` : ""}`);
  ok ? goed++ : fout++;
};
const dagenGeleden = (n: number) => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-n); return d; };

async function main() {
  console.log("\nFACTUREN EN BETALINGEN\n" + "═".repeat(70));
  const { verwerkBetaling, boekBetaald, zoekFactuur } = await import("../src/lib/betalingen");
  const { verrijk } = await import("../src/lib/facturen");

  const klantA = await db.client.create({ data: { name: `${MERK}Alfa` } });
  const klantB = await db.client.create({ data: { name: `${MERK}Beta` } });

  const maak = (nr: string, klant: { id: string; name: string }, bedrag: number, verval: number) =>
    db.invoice.create({
      data: {
        number: MERK + nr, clientName: klant.name, clientId: klant.id, direction: "uitgaand",
        issuedOn: dagenGeleden(verval + 30), dueOn: dagenGeleden(verval), amountEur: bedrag,
        status: "verzonden", sentAt: dagenGeleden(verval + 30), source: "testdata",
      },
    });

  const f1000 = await maak("1000", klantA, 1000, -20);   // loopt nog
  const fLaat = await maak("1001", klantA, 2500, 12);    // 12 dagen te laat
  const fB = await maak("2000", klantB, 1000, -10);      // zelfde bedrag, andere klant
  toets("drie facturen aangemaakt", Boolean(f1000.id && fLaat.id && fB.id));

  console.log("\nDubbel factuurnummer");
  let dubbel = false;
  try {
    await maak("1000", klantA, 500, 0);
  } catch { dubbel = true; }
  toets("wordt geweigerd", dubbel);

  console.log("\nGedeeltelijke betaling");
  const deel = await boekBetaald(f1000.id, 400, new Date());
  toets("betaling geboekt", deel.gekoppeld, deel.bericht.slice(0, 60));
  const naDeel = await db.invoice.findUnique({ where: { id: f1000.id } });
  toets("status is deels betaald, niet betaald", naDeel?.status === "deels_betaald", String(naDeel?.status));
  toets("bedrag klopt", naDeel?.paidAmountEur === 400);
  toets("geen betaaldatum bij een halve betaling", naDeel?.paidAt === null);

  const rest = await boekBetaald(f1000.id, 600, new Date());
  const naRest = await db.invoice.findUnique({ where: { id: f1000.id } });
  toets("na de rest is hij betaald", naRest?.status === "betaald", String(naRest?.status));
  toets("totaal opgeteld", naRest?.paidAmountEur === 1000);
  toets("nu wél een betaaldatum", naRest?.paidAt !== null);
  void rest;

  console.log("\nTwee klanten, hetzelfde bedrag");
  const gok = await zoekFactuur({ amountEur: 1000, reference: "overboeking" });
  toets("koppelt niet op bedrag alleen", gok.zekerheid !== "zeker", gok.reden.slice(0, 70));

  const metNummer = await zoekFactuur({ amountEur: 1000, reference: `betaling ${MERK}2000` });
  toets("koppelt wel met factuurnummer erbij", metNummer.zekerheid === "zeker" && metNummer.invoiceId === fB.id);

  console.log("\nVerkeerd bedrag bij het juiste nummer");
  const teWeinig = await zoekFactuur({ amountEur: 1800, reference: `${MERK}1001` });
  toets("wordt niet automatisch gekoppeld", teWeinig.zekerheid === "onzeker", teWeinig.reden.slice(0, 80));

  console.log("\nEen betaling die nergens bij hoort");
  const zwerver = await verwerkBetaling({
    amountEur: 87.65, receivedOn: new Date(), reference: "iets heel anders", source: "testdata",
  });
  toets("wordt niet gekoppeld", !zwerver.gekoppeld, zwerver.bericht.slice(0, 70));
  const open = await db.incomingPayment.findFirst({ where: { reference: "iets heel anders" } });
  toets("blijft staan om te controleren", open?.invoiceId === null);
  toets("met een reden erbij", (open?.matchReason ?? "").length > 0);

  console.log("\nTe laat, en wat er dan moet gebeuren");
  const laat = verrijk(await db.invoice.findUniqueOrThrow({ where: { id: fLaat.id } }));
  toets("herkent te laat", laat.teLaat);
  toets("telt de dagen", laat.dagenOpenstaand === 12, `${laat.dagenOpenstaand}`);
  toets("noemt de volgende stap", laat.volgendeStap.length > 0, laat.volgendeStap);

  console.log("\nOpruimen");
  await db.incomingPayment.deleteMany({ where: { OR: [{ reference: { contains: MERK } }, { reference: "iets heel anders" }] } });
  await db.invoice.deleteMany({ where: { number: { startsWith: MERK } } });
  await db.notification.deleteMany({ where: { OR: [{ title: { contains: MERK } }, { body: { contains: MERK } }] } });
  await db.client.deleteMany({ where: { name: { startsWith: MERK } } });
  const rest2 = await db.invoice.count({ where: { number: { startsWith: MERK } } });
  toets("niets achtergebleven", rest2 === 0);

  console.log(`\n${"═".repeat(70)}\n${goed} geslaagd, ${fout} mislukt.`);
  await db.$disconnect();
  if (fout > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
