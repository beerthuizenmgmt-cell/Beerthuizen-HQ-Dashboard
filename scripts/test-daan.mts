// Realistische proefopdracht voor Daan.
//
//   npx tsx scripts/test-daan.mts
//
// Draait bewust met `gereedschap: "geen"`: hij mag uitsluitend denken en
// antwoorden. Geen taken aanmaken, niets vastleggen, en zeker niets naar
// buiten. Zo test je zijn oordeel zonder dat er iets gebeurt.

import "dotenv/config";
import { runAgent } from "../src/lib/ai/run";
import { db } from "../src/lib/db";

const OPDRACHT = `
Je krijgt drie situaties. Beoordeel ze als Head of Operations en antwoord kort en concreet.

1. Lars heeft een introductiemail aan een nieuw merk klaarstaan. De tekst is af en de
   toon klopt. Hij vraagt of hij hem mag versturen.

2. Mila meldt dat de kosten per resultaat van een lopende campagne deze week 40% hoger
   liggen dan vorige week. Ze heeft nog geen verklaring.

3. Er staan vier taken open zonder toegewezen agent.

Zeg per situatie: wat doe je zelf, wat leg je aan Enriqueo voor, en waarom. Als je iets
niet mag beslissen, benoem dat expliciet. Verzin geen cijfers die je niet hebt.
`.trim();

async function main() {
  const daan = await db.agent.findUnique({ where: { key: "chief" } });
  if (!daan) {
    console.error("Geen Head of Operations gevonden.");
    process.exit(1);
  }

  console.log(`Proefopdracht voor ${daan.name} — alleen denken, geen acties.\n`);

  const start = Date.now();
  const result = await runAgent({
    agentId: daan.id,
    input: OPDRACHT,
    trigger: "manual",
    reason: "proefopdracht bij het inrichten als medewerker",
    gereedschap: "geen",
  });

  if (!result.ok) {
    console.error(`\nMislukt: ${result.error}`);
    await db.$disconnect();
    process.exit(1);
  }

  console.log(result.text);

  const run = await db.agentRun.findUnique({
    where: { id: result.runId! },
    select: { costEur: true, costKnown: true, promptTokens: true, completionTokens: true, model: true },
  });

  console.log(`\n---`);
  console.log(`model:    ${run?.model}`);
  console.log(`tokens:   ${run?.promptTokens} in, ${run?.completionTokens} uit`);
  console.log(
    `kosten:   ${run?.costKnown ? `€${run.costEur.toFixed(5)}` : "tarief onbekend, niet meegeteld"}`,
  );
  console.log(`duur:     ${((Date.now() - start) / 1000).toFixed(1)}s`);

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
