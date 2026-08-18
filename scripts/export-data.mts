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
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";

// Via resolveDatabaseUrl en niet rechtstreeks via DATABASE_URL: productie werkt
// met POSTGRES_PRISMA_URL. Zonder dit draaide een export met
// DOTENV_CONFIG_PATH=.env.production niet — precies wanneer je hem nodig hebt.
const url = resolveDatabaseUrl();
if (!url) {
  console.error("Geen databaseverbinding gevonden. Zet DATABASE_URL, of draai met DOTENV_CONFIG_PATH=.env.production.");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(url)) });

/// Volgorde is de kern: een taak kan pas bestaan als zijn agent bestaat.
///
/// Deze lijst liep achter op het schema. Negen tabellen ontbraken — klanten,
/// facturen, betalingen, projecten, portaalaanvragen, het geheugen van de
/// agents, het onderzoeksarchief, de Telegram-gesprekken en de koppelingen.
/// Een export leek dus te lukken terwijl juist het waardevolste er niet in zat.
/// De controle onderaan dit bestand zorgt dat dat niet nog eens gebeurt.
export const TABLE_ORDER = [
  "user",
  "instance",
  "agent",
  "agentMemory",
  "channel",

  // Klant → portaalaanvraag → project → taak: elke stap leunt op de vorige.
  "client",
  "portalRequest",
  "project",

  // Een creator bestaat los van elke campagne; de koppeling en wat hij
  // aanleverde hangen aan creator, project en portaalaanvraag.
  "creator",
  "creatorCampagne",
  "creatorUpload",
  "task",
  "taskUpdate",
  "message",

  "meeting",
  "standupEntry",
  "meetingQuestion",
  "telegramThread",
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
  "toolIntegration",
  "researchEntry",

  "invoice",
  "incomingPayment",

  // Contracten en voorstellen hangen aan klant, project en creator, dus ze
  // komen na alle drie.
  "contract",
  "voorstel",
  "voorstelSectie",

  // Studio: de ruimte bestaat los, een boeking verwijst naar ruimte, klant en
  // eventueel een factuur.
  "studioruimte",
  "studioboeking",

  // Testruns staan op zichzelf; ze verwijzen nergens naar.
  "testrun",

  "valueEntry",
  "costEntry",
  "notification",
  "setting",
  "modelPrice",
  "auditLog",
] as const;

/// Staat er een tabel in het schema die niet in de export zit?
///
/// Zonder deze controle groeit het datamodel wél en de back-up niet, en merk je
/// dat pas op het moment dat je hem nodig hebt.
function controleerVolledigheid(): void {
  // Alles wat de Prisma-client aan modellen aanbiedt: dat zijn de eigenschappen
  // met een findMany erop.
  const client = db as unknown as Record<string, { findMany?: unknown }>;
  const modellen = Object.keys(client).filter(
    (key) => !key.startsWith("$") && !key.startsWith("_") && typeof client[key]?.findMany === "function",
  );

  const ontbreekt = modellen.filter((m) => !(TABLE_ORDER as readonly string[]).includes(m));
  if (ontbreekt.length === 0) return;

  console.error(
    `\nDeze tabellen staan in het schema maar niet in de export:\n` +
      ontbreekt.map((m) => `  - ${m}`).join("\n") +
      `\n\nVoeg ze toe aan TABLE_ORDER, op een plek waar hun verwijzingen al bestaan.` +
      `\nEen onvolledige back-up is gevaarlijker dan geen back-up.\n`,
  );
  process.exit(1);
}

async function main() {
  controleerVolledigheid();

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
