import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";
const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });
const r = await db.agentRun.findFirst({ where: { trigger: "manual" }, orderBy: { createdAt: "desc" }, include: { agent: { select: { name: true, status: true, lastError: true } } } });
if (r) {
  console.log(`STAMP   ${r.createdAt.toISOString()}`);
  console.log(`AGENT   ${r.agent.name} · status ${r.agent.status} · fout: ${r.agent.lastError ?? "geen"}`);
  console.log(`RUN     ok=${r.ok} model=${r.model}`);
  console.log(`TOKENS  ${r.promptTokens} in / ${r.completionTokens} uit`);
  console.log(`KOSTEN  €${r.costEur.toFixed(6)} (bekend: ${r.costKnown}) · ${(r.durationMs/1000).toFixed(1)}s`);
  console.log(`\n${(r.error ?? r.output ?? "(leeg)").slice(0, 2600)}`);
}
await db.$disconnect();
