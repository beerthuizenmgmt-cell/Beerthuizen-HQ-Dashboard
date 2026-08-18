// Alle testscenario's achter elkaar, lokaal.
//
//   npx tsx scripts/draai-scenarios.mts            alle acht
//   npx tsx scripts/draai-scenarios.mts A-campagne  één
//
// Draait tegen de lokale database met de echte agents en het echte
// gereedschap. Telegram staat lokaal uit, dus er gaat niets naar buiten.
//
// Bewust geen tijdslimiet: op de server kapt Vercel een keten van zes agents
// af, hier niet. Dat is precies waarom dit lokaal moet kunnen.

import "dotenv/config";

const { db } = await import("../src/lib/db");
const { runAgent } = await import("../src/lib/ai/run");
const { SCENARIOS, scenario, tijdlijnVan } = await import("../src/lib/scenarios");

if (!process.env.DATABASE_URL?.includes("localhost")) {
  console.error("WEIGER: dit is geen lokale database.");
  process.exit(1);
}

const gekozen = process.argv[2] ? [scenario(process.argv[2])!].filter(Boolean) : SCENARIOS;
if (gekozen.length === 0) {
  console.error(`Onbekend scenario. Beschikbaar: ${SCENARIOS.map((s) => s.key).join(", ")}`);
  process.exit(1);
}

console.log(`\n${gekozen.length} scenario('s), lokaal, met echte agents\n${"═".repeat(74)}`);

let totaleKosten = 0;

let eerste = true;

for (const spec of gekozen) {
  // Even wachten tussen scenario's. Een keten van zes agents doet twintig
  // aanroepen; direct doorgaan naar het volgende scenario loopt gegarandeerd
  // tegen de limiet per minuut aan. De provider probeert zelf al opnieuw,
  // maar beter is het om niet in de rem te rijden.
  if (!eerste) {
    process.stdout.write("  even rust, 45s…\r");
    await new Promise((klaar) => setTimeout(klaar, 45_000));
  }
  eerste = false;

  const agent = await db.agent.findUnique({ where: { key: spec.startAgent } });
  if (!agent) {
    console.log(`\n🔴 ${spec.key} — agent "${spec.startAgent}" bestaat niet`);
    continue;
  }

  console.log(`\n▶ ${spec.naam}`);
  console.log(`  start bij ${agent.name} · ${new Date().toISOString().slice(11, 19)}`);

  const testrun = await db.testrun.create({
    data: { scenario: spec.key, naam: spec.naam, opdracht: spec.opdracht },
  });

  const t0 = Date.now();
  const uitkomst = await runAgent({
    agentId: agent.id,
    input: spec.opdracht,
    trigger: "manual",
    reason: `Testscenario ${spec.key}`,
  });
  const duur = Math.round((Date.now() - t0) / 1000);

  await db.testrun.update({
    where: { id: testrun.id },
    data: {
      afgerondOp: new Date(),
      antwoord: uitkomst.ok ? uitkomst.text : null,
      fout: uitkomst.ok ? null : (uitkomst.error ?? "onbekende fout"),
    },
  });

  const tl = await tijdlijnVan(testrun.id);
  const s = tl!.samenvatting;
  totaleKosten += s.kosten;

  console.log(
    `  ${uitkomst.ok ? "🟢" : "🔴"} ${duur}s · ${s.agentsGebruikt.length} agents · ${s.takenAangemaakt} taken · ` +
      `${s.vragenAanEnriqueo} vragen · ${s.goedkeuringen} goedkeuringen · €${s.kosten.toFixed(4)}`,
  );
  if (!uitkomst.ok) console.log(`     ${uitkomst.error}`);
  console.log(`     route: ${s.agentsGebruikt.join(" → ") || "alleen de startagent"}`);
}

console.log(`\n${"═".repeat(74)}`);
console.log(`Klaar. Totale kosten: €${totaleKosten.toFixed(4)}`);
