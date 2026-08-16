// Schrijft de werkinstructies van alle agents naar één leesbaar document.
//
//   npx tsx scripts/export-playbooks.mts
//
// Leest uit de database, zodat het document altijd toont wat er echt geldt.

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });

async function main() {
  const agents = await db.agent.findMany({
    where: { adapterType: "builtin" },
    orderBy: [{ isChief: "desc" }, { sortOrder: "asc" }],
    select: { name: true, role: true, emoji: true, playbook: true, systemPrompt: true },
  });

  const delen: string[] = [
    `# Werkinstructies per agent`,
    ``,
    `Wat elke agent bij élke denkbeurt meekrijgt. Dit staat los van het geheugen:`,
    `geheugen is voor blijvende kernregels, dit is de handleiding bij de functie.`,
    ``,
    `Aanpassen kan in het dashboard, in het dossier van de agent onder`,
    `**Werkinstructies**. Wat je hier verandert, verandert direct zijn gedrag.`,
    ``,
    `| Agent | Functie | Omvang |`,
    `|---|---|---|`,
    ...agents.map(
      (a) =>
        `| ${a.emoji ?? ""} ${a.name} | ${a.role} | ${a.playbook ? `${Math.round(a.playbook.length / 3.6)} tokens` : "geen"} |`,
    ),
    ``,
  ];

  for (const agent of agents) {
    delen.push(`---`, ``, `# ${agent.emoji ?? ""} ${agent.name} — ${agent.role}`, ``);
    delen.push(agent.playbook?.trim() ?? "_Nog geen werkinstructies._", ``);
  }

  const doel = "docs/werkinstructies.md";
  writeFileSync(doel, delen.join("\n"));
  console.log(`${agents.length} agents weggeschreven naar ${doel}`);

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
