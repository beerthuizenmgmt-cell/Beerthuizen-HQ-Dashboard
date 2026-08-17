// Wat is er gekoppeld, wat werkt er, en wat moet jij nog doen?
//
//   DOTENV_CONFIG_PATH=.env.production npx tsx scripts/audit-koppelingen.mts
//
// Per tool: wie hem heeft, of hij echt werkt, en zo niet welke stap ontbreekt.
// Leest alleen.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";
import { isGebouwd } from "../src/lib/ai/tool-keys";
import { TOOL_CATALOG } from "../src/lib/ai/toolkit";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });

async function main() {
  const agents = await db.agent.findMany({ select: { id: true, name: true } });
  const naam = (id: string) => agents.find((a) => a.id === id)?.name ?? "?";

  const koppelingen = await db.agentTool.findMany({
    select: { toolKey: true, agentId: true, permission: true, lastUsedAt: true },
  });

  const perTool = new Map<string, { agenten: string[]; permissies: Set<string>; laatst: Date | null }>();
  for (const k of koppelingen) {
    const huidig = perTool.get(k.toolKey) ?? { agenten: [], permissies: new Set<string>(), laatst: null };
    huidig.agenten.push(naam(k.agentId));
    huidig.permissies.add(k.permission);
    if (k.lastUsedAt && (!huidig.laatst || k.lastUsedAt > huidig.laatst)) huidig.laatst = k.lastUsedAt;
    perTool.set(k.toolKey, huidig);
  }

  const werkt: string[] = [];
  const wacht: { tool: string; categorie: string; agenten: string[]; nodig: string; uitleg: string }[] = [];

  for (const [sleutel, info] of [...perTool].sort()) {
    const meta = TOOL_CATALOG.find((t) => t.key === sleutel);
    if (isGebouwd(sleutel)) {
      werkt.push(
        `  🟢 ${(meta?.name ?? sleutel).padEnd(22)} ${info.agenten.join(", ")}` +
          (info.laatst ? ` · laatst gebruikt ${info.laatst.toISOString().slice(0, 10)}` : " · nog niet gebruikt"),
      );
    } else {
      wacht.push({
        tool: meta?.name ?? sleutel,
        categorie: meta?.category ?? "onbekend",
        agenten: info.agenten,
        nodig:
          meta?.fields.length
            ? meta.fields.map((f) => f.label).join(" + ")
            : "nog geen koppelvelden vastgelegd",
        uitleg: meta?.description ?? "",
      });
    }
  }

  console.log("\nWERKT NU\n" + "─".repeat(70));
  console.log(werkt.join("\n") || "  geen");

  console.log("\n\nWACHT OP EEN KOPPELING\n" + "─".repeat(70));
  const perCategorie = new Map<string, typeof wacht>();
  for (const w of wacht) {
    perCategorie.set(w.categorie, [...(perCategorie.get(w.categorie) ?? []), w]);
  }
  for (const [categorie, items] of [...perCategorie].sort()) {
    console.log(`\n  ${categorie.toUpperCase()}`);
    for (const item of items.sort((a, b) => a.tool.localeCompare(b.tool))) {
      console.log(`    🔌 ${item.tool.padEnd(24)} ${item.agenten.join(", ")}`);
      console.log(`       nodig: ${item.nodig}`);
    }
  }

  console.log(`\n\n${werkt.length} werkend · ${wacht.length} wachten op jou\n`);

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
