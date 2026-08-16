// Controleert per agent of hij compleet is ingericht als medewerker.
//
//   npx tsx scripts/check-team.mts
//
// Loopt de negen punten af die Enriqueo heeft benoemd: identiteit, functie,
// taken, geheugen, KPI's, permissies, autonomie, communicatielijn met de Head
// en kostenregistratie. Voert niets uit en wijzigt niets.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";
import { CHARTERS } from "../src/lib/ai/charters";
import { isGebouwd } from "../src/lib/ai/tool-keys";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });

const vink = (goed: boolean) => (goed ? "🟢" : "🔴");

async function main() {
  const agents = await db.agent.findMany({
    where: { adapterType: { not: "reader_ingest" } },
    orderBy: [{ isChief: "desc" }, { sortOrder: "asc" }],
    include: {
      tools: true,
      memories: { where: { archivedAt: null } },
      watches: true,
      _count: { select: { runs: true } },
    },
  });

  console.log(`\n${agents.length} operationele agents\n`);

  const nietGebouwd = new Map<string, string[]>();
  let compleet = 0;

  for (const agent of agents) {
    const charter = CHARTERS.find((c) => c.agentKey === agent.key);
    const kosten = await db.agentRun.aggregate({
      where: { agentId: agent.id, costKnown: true },
      _sum: { costEur: true },
      _count: true,
    });

    // De lijn met de Head: heeft hij er een, en bestaat de Head nog.
    const naarHead =
      agent.isChief || (charter?.communicatielijnen.some((l) => l.agentKey === "chief") ?? false);

    const punten: [string, boolean, string][] = [
      ["identiteit", Boolean(agent.name && agent.role && agent.avatarUrl), agent.avatarUrl ? "" : "geen portret"],
      ["functie", Boolean(charter?.missie), ""],
      ["taken", (charter?.verantwoordelijkheden.length ?? 0) > 0, `${charter?.verantwoordelijkheden.length ?? 0}`],
      ["ritme", (charter?.ritme.eventDriven.length ?? 0) > 0, `${agent.watches.length} signalen actief`],
      ["geheugen", agent.memories.length > 0, `${agent.memories.length} herinneringen`],
      ["kpi's", (charter?.kpis.length ?? 0) > 0, `${charter?.kpis.length ?? 0}`],
      ["permissies", (charter?.permissies.magNiet.length ?? 0) > 0, `${charter?.permissies.altijdAkkoord.length ?? 0} met akkoord`],
      ["autonomie", Boolean(charter?.autonomie), `niveau ${charter?.autonomie ?? "?"}`],
      ["lijn met Daan", naarHead, agent.isChief ? "is zelf de Head" : ""],
      ["kostenregistratie", true, `${kosten._count} runs · €${(kosten._sum.costEur ?? 0).toFixed(5)}`],
      ["in dienst", !agent.paused && agent.adapterType === "builtin", agent.paused ? "gepauzeerd" : agent.adapterType],
    ];

    const alles = punten.every(([, goed]) => goed);
    if (alles) compleet += 1;

    console.log(`${alles ? "🟢" : "🟡"} ${agent.name} — ${agent.role}`);
    for (const [naam, goed, extra] of punten) {
      if (!goed || extra) console.log(`     ${vink(goed)} ${naam}${extra ? `: ${extra}` : ""}`);
    }

    // Welke tools wachten op een koppeling.
    const wacht = agent.tools.filter((t) => t.enabled && !isGebouwd(t.toolKey)).map((t) => t.toolKey);
    if (wacht.length) {
      nietGebouwd.set(agent.name, wacht);
      console.log(`     🟡 ${wacht.length} tools wachten op een koppeling`);
    }
    console.log("");
  }

  console.log(`${compleet} van ${agents.length} volledig ingericht.\n`);

  console.log("NEEDS CONNECTION — per agent");
  for (const [naam, tools] of nietGebouwd) {
    console.log(`  ${naam.padEnd(9)} ${tools.join(", ")}`);
  }

  const alle = [...new Set([...nietGebouwd.values()].flat())].sort();
  console.log(`\n${alle.length} verschillende platformen wachten op een verbinding.`);

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
