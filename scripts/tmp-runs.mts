import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";
const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });
const rs = await db.agentRun.findMany({ where: { trigger: "manual" }, orderBy: { createdAt: "desc" }, take: 8, include: { agent: { select: { name: true } } } });
for (const r of rs.reverse()) {
  console.log(`${r.createdAt.toISOString().slice(11,19)} ${r.agent.name.padEnd(9)} ok=${r.ok} ${String(r.promptTokens).padStart(5)}in/${String(r.completionTokens).padStart(4)}uit €${r.costEur.toFixed(5)} ${(r.durationMs/1000).toFixed(1)}s`);
  if (!r.ok) console.log(`    FOUT: ${r.error}`);
}
await db.$disconnect();
