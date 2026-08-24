// De profielteksten van de agents gelijktrekken met profiles.ts.
//
//   npx tsx scripts/synchroniseer-profielen.mts            toont wat er verandert
//   npx tsx scripts/synchroniseer-profielen.mts --doen     voert het door
//
// De profielen staan in de database; profiles.ts is de bron waaruit ze gezet
// worden. Een wijziging daar doet dus niets tot je dit draait — en dat is
// makkelijk te vergeten, want de code klopt dan wel en het gedrag verandert niet.
//
// Bewust niet de hele seed: die maakt ook een gebruiker aan en zet agents op
// pauze. Dit raakt alleen de tekst waarmee een agent denkt.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";
import { AGENT_PROFILES } from "../src/lib/ai/profiles";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });
const echtDoen = process.argv.includes("--doen");

async function main() {
  console.log(`\n${echtDoen ? "PROFIELEN BIJWERKEN" : "WAT ER ZOU VERANDEREN"}\n${"─".repeat(66)}`);

  let gewijzigd = 0;

  for (const profiel of AGENT_PROFILES) {
    const huidig = await db.agent.findUnique({ where: { key: profiel.key } });
    if (!huidig) {
      console.log(`  ?  ${profiel.key.padEnd(12)} bestaat niet in deze database`);
      continue;
    }

    const verschillen: string[] = [];
    if (huidig.systemPrompt !== profiel.systemPrompt) {
      const oud = huidig.systemPrompt?.length ?? 0;
      verschillen.push(`profieltekst ${oud} → ${profiel.systemPrompt.length} tekens`);
    }
    if (huidig.role !== profiel.role) verschillen.push("functie");
    if (huidig.description !== profiel.description) verschillen.push("omschrijving");

    if (verschillen.length === 0) continue;
    gewijzigd += 1;

    console.log(`  ${echtDoen ? "→" : " "}  ${profiel.name.padEnd(12)} ${verschillen.join(", ")}`);

    if (echtDoen) {
      // Alleen de tekst. Naam, kleur, koppeling en model blijven zoals ze in het
      // dashboard zijn ingesteld — dat zijn keuzes van Enriqueo, geen beleid.
      await db.agent.update({
        where: { key: profiel.key },
        data: {
          role: profiel.role,
          description: profiel.description,
          systemPrompt: profiel.systemPrompt,
        },
      });
    }
  }

  console.log("─".repeat(66));
  console.log(
    gewijzigd === 0
      ? "Alles staat al gelijk."
      : echtDoen
        ? `${gewijzigd} agent(s) bijgewerkt.`
        : `${gewijzigd} agent(s) lopen achter. Draai opnieuw met --doen.`,
  );

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
