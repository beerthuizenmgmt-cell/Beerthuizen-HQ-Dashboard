// Zet het hele team in dienst.
//
//   npx tsx scripts/activeer-team.mts            (kijken wat er zou gebeuren)
//   npx tsx scripts/activeer-team.mts --doen     (echt uitvoeren)
//
// Per agent: pauze eraf, de signalen uit zijn functieprofiel installeren, en
// het gereedschap koppelen dat écht werkt. Gepland gereedschap wordt bewust
// niet gekoppeld — een koppeling die niets doet is erger dan geen koppeling.
//
// Idempotent en niet-destructief: bestaande vingerafdrukken, geheugen en
// instellingen blijven staan.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";
import { CHARTERS } from "../src/lib/ai/charters";
import { isGebouwd } from "../src/lib/ai/tool-keys";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });
const DOEN = process.argv.includes("--doen");

async function main() {
  console.log(DOEN ? "UITVOEREN\n" : "PROEFDRAAI — niets wordt gewijzigd\n");

  const ontbreekt: string[] = [];

  for (const charter of CHARTERS) {
    if (charter.status !== "actief") continue;

    const agent = await db.agent.findUnique({ where: { key: charter.agentKey } });
    if (!agent) {
      console.log(`  ⚠ geen agent met sleutel '${charter.agentKey}'`);
      continue;
    }

    console.log(`${agent.name} — ${agent.role}`);

    // 1. In dienst
    if (agent.paused) {
      if (DOEN) await db.agent.update({ where: { id: agent.id }, data: { paused: false } });
      console.log(`  in dienst   pauze eraf`);
    }

    // 2. Ingebouwde AI-agent. Op `manual` telt hij als losse registratie en
    //    doet hij niet mee aan proefdraaien of het ochtendoverleg.
    if (agent.adapterType === "manual") {
      if (DOEN) await db.agent.update({ where: { id: agent.id }, data: { adapterType: "builtin" } });
      console.log(`  koppeling   manual → builtin`);
    }

    // 3. Signalen uit zijn functieprofiel
    for (const [index, signaal] of charter.ritme.eventDriven.entries()) {
      const key = `${charter.agentKey}-signaal-${index + 1}`;
      const label = signaal.signaal.slice(0, 80);
      const bestaand = await db.agentWatch.findUnique({ where: { key } });

      if (bestaand) {
        if (bestaand.minIntervalMinutes !== signaal.minIntervalMinuten) {
          if (DOEN) {
            await db.agentWatch.update({
              where: { key },
              data: { minIntervalMinutes: signaal.minIntervalMinuten },
            });
          }
          console.log(`  signaal     ${label} — rem → ${signaal.minIntervalMinuten} min`);
        }
        continue;
      }

      // Draait er al een gelijkwaardig signaal voor deze agent op deze probe,
      // dan geen tweede aanmaken; anders krijgt hij dubbele analyses.
      const zelfdeProbe = await db.agentWatch.findFirst({
        where: { agentId: agent.id, probe: signaal.probe },
      });
      if (zelfdeProbe) {
        console.log(`  signaal     ${signaal.probe} — bestond al onder een andere naam`);
        continue;
      }

      if (DOEN) {
        await db.agentWatch.create({
          data: {
            agentId: agent.id,
            key,
            label,
            probe: signaal.probe,
            minIntervalMinutes: signaal.minIntervalMinuten,
          },
        });
      }
      console.log(`  signaal     ${label} (${signaal.probe}, ${signaal.minIntervalMinuten} min)`);
    }

    // 4. Gereedschap — alleen wat echt werkt
    for (const toolKey of charter.gereedschap) {
      if (!isGebouwd(toolKey)) {
        ontbreekt.push(`${agent.name}: ${toolKey}`);
        continue;
      }
      const bestaand = await db.agentTool.findUnique({
        where: { agentId_toolKey: { agentId: agent.id, toolKey } },
      });
      if (bestaand) continue;

      if (DOEN) {
        await db.agentTool.create({ data: { agentId: agent.id, toolKey, enabled: true } });
      }
      console.log(`  gereedschap ${toolKey} gekoppeld`);
    }

    console.log("");
  }

  if (ontbreekt.length) {
    console.log(`NOG NIET GEBOUWD — deze koppelingen vraagt een functieprofiel, maar ze bestaan nog niet:`);
    for (const regel of ontbreekt) console.log(`  ${regel}`);
    console.log(`\nDe agents werken wel; ze missen alleen dit gereedschap en zeggen dat er data ontbreekt.`);
  }

  if (!DOEN) console.log(`\nNiets gewijzigd. Draai met --doen om het echt te doen.`);

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
