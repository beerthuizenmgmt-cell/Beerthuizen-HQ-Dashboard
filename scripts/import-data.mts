// Zet een export terug in de database waar DATABASE_URL naar wijst.
//
//   DATABASE_URL="postgres://…" npx tsx scripts/import-data.mts backups/export-….json
//
// Versleutelde waarden gaan bewust NIET mee. Ze zijn versleuteld met de
// APP_SECRET van de omgeving waar ze vandaan komen, en productie heeft een
// eigen sleutel. Ze overzetten zou een veld opleveren dat niet te ontcijferen
// is; dan liever een leeg veld met een duidelijke melding erbij.

import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig } from "../src/lib/db-url";

const db = new PrismaClient({
  adapter: new PrismaPg(poolConfig(process.env.DATABASE_URL!)),
});

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const ENCRYPTED = "enc:v1:";

const stripped: string[] = [];

/// Zet ISO-tekst terug om naar datums en haalt versleutelde waarden eruit.
function revive(value: unknown, path: string): unknown {
  if (typeof value === "string") {
    if (ISO.test(value)) return new Date(value);
    if (value.startsWith(ENCRYPTED)) {
      stripped.push(path);
      return undefined;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => revive(item, `${path}[${index}]`));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const revived = revive(item, `${path}.${key}`);
      if (revived !== undefined) out[key] = revived;
    }
    return out;
  }
  return value;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Gebruik: npx tsx scripts/import-data.mts <export.json>");
    process.exit(1);
  }

  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    exportedAt: string;
    order: string[];
    data: Record<string, Record<string, unknown>[]>;
  };

  console.log(`Import uit ${file} (geëxporteerd ${parsed.exportedAt})\n`);

  let total = 0;

  for (const table of parsed.order) {
    const rows = parsed.data[table] ?? [];
    if (rows.length === 0) continue;

    const prepared = rows.map((row, index) => revive(row, `${table}[${index}]`) as Record<string, unknown>);

    // createMany met skipDuplicates: opnieuw draaien voegt niets dubbel toe.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (db as any)[table].createMany({ data: prepared, skipDuplicates: true });
    total += result.count;
    console.log(`  ${table.padEnd(18)} ${result.count}/${rows.length}`);
  }

  console.log(`\n${total} rijen teruggezet.`);

  if (stripped.length) {
    console.log(`\n${stripped.length} versleutelde waarde(n) bewust NIET overgezet:`);
    for (const path of [...new Set(stripped.map((p) => p.replace(/\[\d+\]/g, "[]")))]) {
      console.log(`  ${path}`);
    }
    console.log("Die moeten in de nieuwe omgeving opnieuw ingevoerd worden.");
  }

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
