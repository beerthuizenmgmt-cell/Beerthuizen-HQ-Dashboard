// De Nike- en Rituals-testcampagnes eruit halen.
//
//   npx tsx scripts/opruimen-testcampagnes.mts            toont wat er weg zou gaan
//   npx tsx scripts/opruimen-testcampagnes.mts --doen     haalt het er echt uit
//
// Deze twee kwamen uit de scenariotests en zijn nooit echte campagnes geweest.
// Ze bleven wel rondzingen: agents zagen openstaande Nike-taken, meldden die als
// blokkade, en stelden er vragen over die nergens toe leidden.
//
// Standaard toont dit script alleen. Weggooien doe je met --doen, want er is
// geen weg terug en een tikfout in een zoekterm raakt hier zo tweehonderd rijen.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });
const echtDoen = process.argv.includes("--doen");

/// Waar we op zoeken. Bewust twee losse woorden en geen bredere term: "test"
/// zou half de administratie meenemen.
const MERKEN = ["nike", "rituals"];

function bevat(velden: string[]) {
  return {
    OR: MERKEN.flatMap((merk) =>
      velden.map((veld) => ({ [veld]: { contains: merk, mode: "insensitive" as const } })),
    ),
  };
}

async function main() {
  console.log(`\n${echtDoen ? "OPRUIMEN" : "WAT ER WEG ZOU GAAN"}\n${"─".repeat(60)}`);

  // Volgorde telt: eerst wat aan iets anders hangt, dan pas dat andere.
  const stappen: { naam: string; tel: () => Promise<number>; weg: () => Promise<{ count: number }> }[] = [
    {
      naam: "taakregels",
      tel: () => db.taskUpdate.count({ where: bevat(["body"]) }),
      weg: () => db.taskUpdate.deleteMany({ where: bevat(["body"]) }),
    },
    {
      naam: "taakregels bij die taken",
      tel: () => db.taskUpdate.count({ where: { task: bevat(["title", "description"]) } }),
      weg: () => db.taskUpdate.deleteMany({ where: { task: bevat(["title", "description"]) } }),
    },
    {
      naam: "taken",
      tel: () => db.task.count({ where: bevat(["title", "description"]) }),
      weg: () => db.task.deleteMany({ where: bevat(["title", "description"]) }),
    },
    {
      naam: "berichten",
      tel: () => db.message.count({ where: bevat(["body"]) }),
      weg: () => db.message.deleteMany({ where: bevat(["body"]) }),
    },
    {
      naam: "goedkeuringen",
      tel: () => db.approval.count({ where: bevat(["title", "summary"]) }),
      weg: () => db.approval.deleteMany({ where: bevat(["title", "summary"]) }),
    },
    {
      naam: "voorstellen",
      tel: () => db.voorstel.count({ where: bevat(["naam"]) }),
      weg: () => db.voorstel.deleteMany({ where: bevat(["naam"]) }),
    },
    {
      naam: "vragen via Telegram",
      tel: () => db.telegramThread.count({ where: bevat(["question"]) }),
      weg: () => db.telegramThread.deleteMany({ where: bevat(["question"]) }),
    },
    {
      naam: "standupregels",
      tel: () => db.standupEntry.count({ where: bevat(["today", "yesterday", "blockers"]) }),
      weg: () => db.standupEntry.deleteMany({ where: bevat(["today", "yesterday", "blockers"]) }),
    },
    {
      naam: "activiteit",
      tel: () => db.activityEvent.count({ where: bevat(["message"]) }),
      weg: () => db.activityEvent.deleteMany({ where: bevat(["message"]) }),
    },
    {
      naam: "meldingen",
      tel: () => db.notification.count({ where: bevat(["title", "body"]) }),
      weg: () => db.notification.deleteMany({ where: bevat(["title", "body"]) }),
    },
    {
      naam: "onderzoek",
      tel: () => db.researchEntry.count({ where: bevat(["question", "about", "findings"]) }),
      weg: () => db.researchEntry.deleteMany({ where: bevat(["question", "about", "findings"]) }),
    },
    {
      naam: "projecten",
      tel: () => db.project.count({ where: bevat(["name"]) }),
      weg: () => db.project.deleteMany({ where: bevat(["name"]) }),
    },
  ];

  let totaal = 0;
  for (const stap of stappen) {
    const aantal = echtDoen ? (await stap.weg()).count : await stap.tel();
    totaal += aantal;
    if (aantal > 0) console.log(`  ${echtDoen ? "weg" : "  "} ${String(aantal).padStart(4)} ${stap.naam}`);
  }

  console.log(`${"─".repeat(60)}`);
  console.log(
    echtDoen
      ? `${totaal} regels verwijderd.`
      : `${totaal} regels zouden verdwijnen. Draai opnieuw met --doen om het echt te doen.`,
  );

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
