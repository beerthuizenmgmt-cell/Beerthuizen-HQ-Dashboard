import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";
const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });
const naam = process.argv[2];
const a = await db.agent.findFirst({ where: { name: naam } });
const r = await db.agentRun.findFirst({ where: { agentId: a!.id, trigger: "manual" }, orderBy: { createdAt: "desc" } });
console.log(r?.output?.slice(0, 2400) ?? "(leeg)");
await db.$disconnect();
