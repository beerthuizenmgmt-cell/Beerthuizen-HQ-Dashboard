// Antwoorden die nooit bij de agent zijn aangekomen.
//
//   DOTENV_CONFIG_PATH=.env.production npx tsx scripts/vastgelopen-antwoorden.mts
//
// Alleen kijken. Het nasturen zelf gebeurt op de server, aan het begin van het
// ochtendoverleg (bezorgOpenAntwoorden in src/lib/standup.ts) — daar is de
// AI-sleutel wél te lezen. Dit script laat zien wat daar zou gebeuren, zodat je
// het vooraf kunt nalopen en achteraf kunt controleren.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";
import { getAdapter } from "../src/lib/adapters";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });

/// Gelijk aan ANTWOORD_VERJARING_DAGEN in src/lib/standup.ts.
const VERJARINGSDAGEN = 2;

async function main() {
  const vragen = await db.meetingQuestion.findMany({
    where: { answer: { not: null }, deliveredAt: null },
    include: {
      agent: { select: { name: true, adapterType: true, paused: true } },
      meeting: { select: { date: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (vragen.length === 0) {
    console.log("Geen vastgelopen antwoorden. Niets blijft hangen.");
    await db.$disconnect();
    return;
  }

  console.log(`${vragen.length} antwoord(en) die nooit zijn aangekomen\n${"─".repeat(70)}`);

  for (const vraag of vragen) {
    const dagenOud = Math.floor((Date.now() - vraag.meeting.date.getTime()) / 864e5);
    const bereikbaar =
      getAdapter(vraag.agent.adapterType).capabilities.send && !vraag.agent.paused;

    console.log(
      `\n  ${vraag.agent.name} · overleg van ${vraag.meeting.date.toISOString().slice(0, 10)} (${dagenOud} dagen oud)`,
    );
    console.log(`    vraag:    ${vraag.body.slice(0, 80)}`);
    console.log(`    antwoord: ${(vraag.answer ?? "").slice(0, 80)}`);
    console.log(`    toen:     ${vraag.deliveryError ?? "onbekende fout"}`);
    console.log(
      `    nu:       ${
        dagenOud > VERJARINGSDAGEN
          ? "verouderd → wordt afgesloten met reden"
          : bereikbaar
            ? "bereikbaar → wordt nagestuurd bij het eerstvolgende overleg"
            : "nog steeds onbereikbaar → blijft wachten"
      }`,
    );
  }

  console.log(`\n${"─".repeat(70)}`);
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
