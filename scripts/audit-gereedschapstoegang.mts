// Welke agent kan wat?
//
//   npx tsx scripts/audit-gereedschapstoegang.mts
//
// Elke agent krijgt een eigen set gereedschap. Dat is bewust: de administratie
// is niet voor iedereen, en negen agents die allemaal zelf vragen mogen stellen
// is precies waar dit systeem vanaf moet.
//
// Deze test kijkt of die verdeling klopt met wat er bedoeld is, en of er niemand
// tussen zit die iets kan wat hij niet hoort te kunnen — of andersom, iets mist
// dat hij nodig heeft om zijn werk te doen.

import "dotenv/config";
import { db } from "../src/lib/db";
import { gereedschapVoorAgent } from "../src/lib/ai/run";

let goed = 0;
let fout = 0;

function toets(naam: string, gelukt: boolean, uitleg = "") {
  console.log(`  ${gelukt ? "🟢" : "🔴"} ${naam}${uitleg ? ` — ${uitleg}` : ""}`);
  if (gelukt) goed += 1;
  else fout += 1;
}

/// Wat elke agent minstens moet kunnen, en wat hij juist niet mag.
const VERWACHT: Record<string, { moet: string[]; magNiet: string[] }> = {
  chief: {
    moet: [
      "maak_taak",
      "vraag_aan_enriqueo",
      "briefing_stand",
      "vraag_briefing",
      "leg_gespreksverslag_vast",
      "stel_samenwerking_op",
      "zoek_creators",
      "vraag_agent",
    ],
    magNiet: ["lees_facturen"],
  },
  influencer: {
    moet: ["zoek_creators", "leg_creator_vast", "zoek_onderzoek", "onthoud"],
    magNiet: ["vraag_briefing", "stel_samenwerking_op", "lees_facturen", "vraag_agent"],
  },
  research: {
    moet: ["zoek_creators", "leg_creator_vast", "leg_onderzoek_vast", "leg_contractanalyse_vast"],
    magNiet: ["vraag_briefing", "stel_samenwerking_op", "lees_facturen"],
  },
  finance: {
    moet: ["lees_facturen", "vraag_goedkeuring"],
    magNiet: ["vraag_briefing", "leg_creator_vast", "stel_samenwerking_op"],
  },
  social: {
    moet: ["zoek_creators", "rapporteer_in_kanaal"],
    magNiet: ["lees_facturen", "vraag_briefing"],
  },
  creative: {
    moet: ["maak_taak", "vul_voorstel_sectie"],
    magNiet: ["lees_facturen", "zoek_creators", "vraag_briefing"],
  },
  analytics: { moet: ["noteer_bevinding"], magNiet: ["lees_facturen", "vraag_briefing"] },
  operations: { moet: ["maak_taak"], magNiet: ["lees_facturen", "vraag_briefing"] },
  bizdev: { moet: ["zoek_onderzoek"], magNiet: ["lees_facturen", "vraag_briefing"] },
};

async function main() {
  console.log("\nWIE KAN WAT\n" + "─".repeat(70));

  const agents = await db.agent.findMany({
    where: { adapterType: { not: "reader_ingest" } },
    orderBy: [{ isChief: "desc" }, { sortOrder: "asc" }],
  });

  for (const agent of agents) {
    const verwacht = VERWACHT[agent.key];
    if (!verwacht) continue;

    const namen = (await gereedschapVoorAgent(agent.id)).map((t) => t.name);
    console.log(`\n${agent.name} (${agent.key}) — ${namen.length} stuks gereedschap`);

    const mist = verwacht.moet.filter((n) => !namen.includes(n));
    toets("heeft alles wat hij nodig heeft", mist.length === 0, mist.length ? `mist ${mist.join(", ")}` : "");

    const teveel = verwacht.magNiet.filter((n) => namen.includes(n));
    toets("kan niets wat hij niet hoort te kunnen", teveel.length === 0, teveel.length ? `heeft ${teveel.join(", ")}` : "");
  }

  console.log(`\n${"─".repeat(70)}\n${goed} geslaagd, ${fout} mislukt.`);
  await db.$disconnect();
  if (fout > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
