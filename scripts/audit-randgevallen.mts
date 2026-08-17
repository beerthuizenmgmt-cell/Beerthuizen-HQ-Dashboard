// Probeert het systeem expres te laten struikelen.
//
//   npx tsx scripts/audit-randgevallen.mts
//
// Maakt testdata aan, kijkt hoe het systeem reageert, en ruimt alles weer op.
// Voert geen externe acties uit.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";
import { zoekBestaandeKlant, beoordeelBriefing, haalAanvraag, maakToken } from "../src/lib/portaal";
import { assertUsableApiKey, keyProbleem } from "../src/lib/ai/provider";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });

const MERK = "AUDIT-TEST";
let goed = 0;
let fout = 0;

function toets(naam: string, gelukt: boolean, toelichting = "") {
  console.log(`  ${gelukt ? "🟢" : "🔴"} ${naam}${toelichting ? ` — ${toelichting}` : ""}`);
  if (gelukt) goed += 1;
  else fout += 1;
}

async function main() {
  console.log("\nRANDGEVALLEN\n" + "─".repeat(64));

  // ── API-sleutels ─────────────────────────────────────────────────────────
  console.log("\nSleutelcontrole");
  toets("spatie wordt geweigerd", keyProbleem("sk-or v1-abc") !== null);
  toets("liggend streepje wordt geweigerd", keyProbleem("sk-or—v1-abc") !== null);
  toets("te lange waarde wordt geweigerd", (keyProbleem("x".repeat(2000)) ?? "").includes("2000 tekens"));
  toets("geldige sleutel wordt geaccepteerd", keyProbleem("sk-or-v1-" + "a".repeat(64)) === null);
  try {
    assertUsableApiKey("goed-genoeg");
    toets("assert laat een geldige sleutel door", true);
  } catch {
    toets("assert laat een geldige sleutel door", false);
  }

  // ── Klantherkenning ──────────────────────────────────────────────────────
  console.log("\nKlantherkenning");
  const klantA = await db.client.create({
    data: { name: `${MERK} Alpha BV`, kvk: "99887766", vatId: "NL999888777B01", email: "a@audit.test" },
  });

  const opKvk = await zoekBestaandeKlant({ bedrijfsnaam: "Heel iets anders", kvk: "99887766" });
  toets("gelijk KvK-nummer geeft zekere match", opKvk.zekerheid === "zeker" && opKvk.clientId === klantA.id);

  const opBtw = await zoekBestaandeKlant({ bedrijfsnaam: "Anders", btw: "NL999888777B01" });
  toets("gelijk btw-nummer geeft zekere match", opBtw.zekerheid === "zeker");

  const opNaam = await zoekBestaandeKlant({ bedrijfsnaam: `${MERK} Alpha` });
  toets("gelijke naam geeft alleen een vermoeden", opNaam.zekerheid === "mogelijk", opNaam.reden);

  const onbekend = await zoekBestaandeKlant({ bedrijfsnaam: "Volstrekt Onbekend NV" });
  toets("onbekende klant geeft geen match", onbekend.zekerheid === "geen");

  const leeg = await zoekBestaandeKlant({});
  toets("lege invoer geeft geen match", leeg.zekerheid === "geen");

  const kortKvk = await zoekBestaandeKlant({ kvk: "123" });
  toets("te kort KvK-nummer koppelt niet", kortKvk.zekerheid === "geen");

  // ── Briefingbeoordeling ──────────────────────────────────────────────────
  console.log("\nBriefingbeoordeling");
  const leegGaten = beoordeelBriefing({});
  toets("lege briefing levert gaten op", leegGaten.length >= 6, `${leegGaten.length} punten`);

  const volledig = beoordeelBriefing({
    budgetStatus: "Ja, een vast budget",
    budget: "25.000",
    periodeTot: "2026-11-30",
    deadline: "2026-09-05",
    doelgroep: "Mensen van 25 tot 40 die drie tot vijf keer per week gericht trainen en bewust etiketten lezen.",
    deliverables: "Reels of shorts, Stories",
    creatorsInGedachten: "Ja, ik heb namen",
    hergebruik: "Ja, ook voor advertenties",
    bestanden: "https://drive.google.com/x",
  });
  toets("volledige briefing levert geen gaten op", volledig.length === 0, `${volledig.length} punten`);

  const korteDoelgroep = beoordeelBriefing({ doelgroep: "Iedereen" });
  toets("te korte doelgroep wordt herkend", korteDoelgroep.some((g) => g.veld === "doelgroep"));

  const weetNiet = beoordeelBriefing({ deliverables: "Weet ik nog niet" });
  toets('"weet ik nog niet" telt als ontbrekend', weetNiet.some((g) => g.veld === "deliverables"));

  toets("elk gat noemt van wie het moet komen", leegGaten.every((g) => g.vanWie.length > 0));

  // ── Portaaltokens ────────────────────────────────────────────────────────
  console.log("\nPortaaltokens");
  toets("token is lang genoeg om niet te raden", maakToken().length >= 40);
  toets("twee tokens zijn nooit gelijk", maakToken() !== maakToken());
  toets("onbekend token geeft niets terug", (await haalAanvraag("bestaat-echt-niet")) === null);

  const verlopen = await db.portalRequest.create({
    data: { token: maakToken(), type: "klantgegevens", label: `${MERK} verlopen`, expiresAt: new Date(Date.now() - 864e5) },
  });
  const uitkomstVerlopen = await haalAanvraag(verlopen.token);
  toets("verlopen link wordt als verlopen gemeld", uitkomstVerlopen !== null && "verlopen" in uitkomstVerlopen && uitkomstVerlopen.verlopen === true);

  const gebruikt = await db.portalRequest.create({
    data: {
      token: maakToken(),
      type: "klantgegevens",
      label: `${MERK} gebruikt`,
      status: "ingevuld",
      expiresAt: new Date(Date.now() + 864e5),
    },
  });
  const uitkomstGebruikt = await haalAanvraag(gebruikt.token);
  toets("gebruikte link geeft niets meer prijs", uitkomstGebruikt !== null && "alIngevuld" in uitkomstGebruikt);

  // ── Facturen ─────────────────────────────────────────────────────────────
  console.log("\nFacturen");
  const f1 = await db.invoice.create({
    data: {
      number: `${MERK}-001`,
      clientName: klantA.name,
      clientId: klantA.id,
      direction: "uitgaand",
      issuedOn: new Date("2026-07-01"),
      dueOn: new Date("2026-07-31"),
      amountEur: 1000,
      status: "verzonden",
      sentAt: new Date("2026-07-01"),
    },
  });
  toets("factuur aanmaken lukt", Boolean(f1.id));

  let dubbelGeweigerd = false;
  try {
    await db.invoice.create({
      data: {
        number: `${MERK}-001`,
        clientName: klantA.name,
        issuedOn: new Date("2026-07-01"),
        dueOn: new Date("2026-07-31"),
        amountEur: 500,
      },
    });
  } catch {
    dubbelGeweigerd = true;
  }
  toets("dubbel factuurnummer wordt geweigerd", dubbelGeweigerd);

  const { verrijk, debiteurenstand } = await import("../src/lib/facturen");
  const verrijkt = verrijk(f1);
  toets("dagen openstaand wordt berekend", verrijkt.dagenOpenstaand > 0, `${verrijkt.dagenOpenstaand} dagen`);
  toets("te laat wordt herkend", verrijkt.teLaat);
  toets("volgende stap is bekend", verrijkt.volgendeStap.length > 0, verrijkt.volgendeStap);

  const stand = await debiteurenstand();
  toets("debiteurenstand telt de factuur mee", stand.teOntvangenEur >= 1000);

  // ── Betalingskoppeling ───────────────────────────────────────────────────
  console.log("\nBetalingskoppeling");
  const { zoekFactuur } = await import("../src/lib/betalingen");

  const exact = await zoekFactuur({ amountEur: 1000, reference: `Betaling ${MERK}-001` });
  toets("nummer plus bedrag geeft zekere match", exact.zekerheid === "zeker", exact.reden);

  const verkeerdBedrag = await zoekFactuur({ amountEur: 750, reference: `Betaling ${MERK}-001` });
  toets("juist nummer maar afwijkend bedrag koppelt niet", verkeerdBedrag.zekerheid === "onzeker", verkeerdBedrag.reden);

  const alleenBedrag = await zoekFactuur({ amountEur: 1000, reference: "Overboeking" });
  toets("alleen een bedrag koppelt niet automatisch", alleenBedrag.zekerheid !== "zeker", alleenBedrag.reden);

  const nergens = await zoekFactuur({ amountEur: 12345.67, reference: "Iets anders" });
  toets("onbekend bedrag geeft geen match", nergens.zekerheid === "geen");

  // ── Opruimen ─────────────────────────────────────────────────────────────
  await db.invoice.deleteMany({ where: { number: { startsWith: MERK } } });
  await db.portalRequest.deleteMany({ where: { label: { startsWith: MERK } } });
  await db.client.deleteMany({ where: { name: { startsWith: MERK } } });

  console.log(`\n${"─".repeat(64)}\n${goed} geslaagd, ${fout} mislukt. Testdata opgeruimd.`);
  await db.$disconnect();
  if (fout > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
