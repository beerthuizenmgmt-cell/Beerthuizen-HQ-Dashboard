// Demotaken en spooktaken van het bord halen.
//
//   DOTENV_CONFIG_PATH=.env.production npx tsx scripts/opruimen-taken.mts
//   DOTENV_CONFIG_PATH=.env.production npx tsx scripts/opruimen-taken.mts --doen
//
// Zet ze op "geannuleerd" met een regel erbij waarom — niet verwijderen. Een
// takenbord waar dingen zomaar van verdwijnen is net zo onbetrouwbaar als een
// bord vol taken die nergens over gaan. Zo blijft het terug te draaien.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });
const DOEN = process.argv.includes("--doen");

/// De vier demotaken uit de opzet van 16 augustus, op titel. Bewust een vaste
/// lijst en geen slimme regel: dan kan er niets anders per ongeluk in vallen.
const DEMOTAKEN = [
  "Contentkalender september opzetten",
  "Weekrapportage campagnes versturen",
  "Concurrentieanalyse presenteren",
  "Social posts week 34 inplannen",
];

async function annuleer(id: string, titel: string, reden: string) {
  console.log(`  ${DOEN ? "geannuleerd" : "zou annuleren"}: ${titel.slice(0, 56)}`);
  console.log(`     ${reden}`);
  if (!DOEN) return;

  await db.task.update({ where: { id }, data: { status: "cancelled" } });
  await db.taskUpdate.create({
    data: { taskId: id, authorType: "system", kind: "status", body: reden },
  });
}

async function main() {
  console.log("OPRUIMEN\n" + "─".repeat(66));

  const demo = await db.task.findMany({
    where: { title: { in: DEMOTAKEN }, status: { notIn: ["done", "cancelled"] } },
    select: { id: true, title: true },
  });
  console.log(`\nDemotaken uit de opzet (${demo.length})`);
  for (const taak of demo) {
    await annuleer(taak.id, taak.title, "Opgeruimd: demotaak uit de opzet van 16 augustus, geen echt werk.");
  }

  // Taken die ontstonden doordat "geen." als blokkade werd gelezen. De knop kan
  // dit sinds vandaag niet meer, maar wat er staat moet er nog af.
  const spook = await db.task.findMany({
    where: {
      source: "standup",
      status: { notIn: ["done", "cancelled"] },
      OR: [
        { title: { contains: "Blokkade oplossen: geen" } },
        { title: { contains: "Blokkade oplossen: nee" } },
        { title: { contains: "Blokkade oplossen: n.v.t" } },
      ],
    },
    select: { id: true, title: true },
  });
  console.log(`\nSpooktaken uit het overleg (${spook.length})`);
  for (const taak of spook) {
    await annuleer(taak.id, taak.title, 'Opgeruimd: ontstaan doordat "geen" als blokkade werd gelezen. Er was niets om op te lossen.');
  }

  const over = await db.task.count({ where: { status: { notIn: ["done", "cancelled"] } } });
  console.log(`\n${"─".repeat(66)}`);
  console.log(DOEN ? `Klaar. ${over} taken staan nog open.` : "Niets gewijzigd. Draai met --doen om het echt te doen.");

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
