// Volledige export van de database naar één JSON-bestand.
//
// Werkt zonder pg_dump en is bewust portable: dezelfde volgorde wordt bij het
// importeren aangehouden, zodat verwijzingen tussen tabellen kloppen.
//
//   npx tsx scripts/export-data.mts [bestandsnaam]

import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/// Volgorde is de kern: een taak kan pas bestaan als zijn agent bestaat.
export const TABLE_ORDER = [
  "user",
  "instance",
  "agent",
  "channel",
  "task",
  "taskUpdate",
  "message",
  "meeting",
  "standupEntry",
  "meetingQuestion",
  "activityEvent",
  "skill",
  "modelInfo",
  "adAccount",
  "adCampaign",
  "adCreative",
  "adMetric",
  "adAdvice",
  "approval",
  "agentRun",
  "agentWatch",
  "agentInsight",
  "agentTool",
  "valueEntry",
  "costEntry",
  "notification",
  "setting",
  "modelPrice",
  "auditLog",
] as const;

async function main() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const target = process.argv[2] ?? `backups/export-${stamp}.json`;

  const data: Record<string, unknown[]> = {};
  let total = 0;

  for (const table of TABLE_ORDER) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (db as any)[table].findMany();
    data[table] = rows;
    total += rows.length;
    if (rows.length) console.log(`  ${table.padEnd(18)} ${rows.length}`);
  }

  mkdirSync("backups", { recursive: true });
  writeFileSync(
    target,
    JSON.stringify({ exportedAt: new Date().toISOString(), order: TABLE_ORDER, data }, null, 2),
  );

  console.log(`\n${total} rijen weggeschreven naar ${target}`);
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
