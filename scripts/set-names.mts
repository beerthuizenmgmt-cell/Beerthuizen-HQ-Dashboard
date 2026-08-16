// Geeft elke agent een eigen voornaam naast zijn functietitel.
//
// Waarom: "Research Manager" is een functie, geen collega. Met een naam ervoor
// praat je over Sanne die iets uitzocht, niet over de research-agent. Dat is
// precies wat een team een team maakt.
//
//   npx tsx scripts/set-names.mts

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig } from "../src/lib/db-url";

const db = new PrismaClient({
  adapter: new PrismaPg(poolConfig(process.env.DATABASE_URL!)),
});

/// Nederlandse voornamen, kort en uitspreekbaar, met de functie als titel.
const NAMES: { key: string; name: string; role: string }[] = [
  { key: "chief", name: "Daan", role: "Head of Operations" },
  { key: "influencer", name: "Fleur", role: "Influencer Campaign Manager" },
  { key: "analytics", name: "Mila", role: "Analytics Manager" },
  { key: "research", name: "Sanne", role: "Research Manager" },
  { key: "creative", name: "Jesse", role: "Creative Director" },
  { key: "social", name: "Noor", role: "Social Media Manager" },
  { key: "operations", name: "Bram", role: "Operations Manager" },
  { key: "bizdev", name: "Lars", role: "Business Development Manager" },
];

async function main() {
  for (const entry of NAMES) {
    const agent = await db.agent.findUnique({ where: { key: entry.key } });
    if (!agent) continue;

    await db.agent.update({
      where: { key: entry.key },
      data: { name: entry.name, role: entry.role },
    });

    // De naam staat ook op zijn eigen gesprekskanaal.
    await db.channel.updateMany({ where: { agentId: agent.id }, data: { name: entry.name } });

    console.log(`  ${entry.name.padEnd(8)} — ${entry.role}`);
  }

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
