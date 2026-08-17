// Is deze agent uitgerust voor zijn testopdracht?
//
//   DOTENV_CONFIG_PATH=.env.production npx tsx scripts/agent-gereedheid.mts
//
// Dit vervangt de echte test niet. Het beantwoordt de vraag ervóór: heeft hij
// de instructies, het geheugen, de bevoegdheid en het gereedschap om die
// opdracht überhaupt te kunnen halen? Zakt hij hier, dan hoef je de dure test
// niet te draaien — dan weet je al wat eruit komt.
//
// Leest alleen. Draait geen agents en kost niets.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";
import { activeCharterFor } from "../src/lib/ai/charters";
import { isGebouwd } from "../src/lib/ai/tool-keys";
import { TESTS } from "./testprogramma.mjs";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });

/// Gereedschap dat elke agent standaard in de code heeft. Staat niet in
/// AgentTool, want het hoort bij het vak en niet bij een koppeling.
const INGEBOUWD: Record<string, string[]> = {
  iedereen: [
    "maak_taak",
    "werk_taak_bij",
    "rapporteer_in_kanaal",
    "vraag_aan_enriqueo",
    "vraag_goedkeuring",
    "noteer_bevinding",
    "zoek_onderzoek",
    "onthoud",
  ],
  chief: ["bericht_enriqueo", "vraag_agent"],
  finance: ["lees_facturen"],
  research: ["leg_onderzoek_vast"],
};

function gereedschapVan(agentKey: string, isChief: boolean): string[] {
  return [
    ...INGEBOUWD.iedereen,
    ...(isChief ? INGEBOUWD.chief : []),
    ...(INGEBOUWD[agentKey] ?? []),
  ];
}

async function main() {
  const agents = await db.agent.findMany({
    where: { adapterType: { not: "reader_ingest" } },
    orderBy: [{ isChief: "desc" }, { sortOrder: "asc" }],
    include: {
      memories: { select: { kind: true, pinned: true, title: true } },
      tools: { select: { toolKey: true, enabled: true, permission: true } },
    },
  });

  const namen = Object.fromEntries(agents.map((a) => [a.key, a.name]));
  const ontbreekt: { agent: string; tools: string[] }[] = [];

  for (const test of TESTS) {
    const agent = agents.find((a) => a.key === test.agentKey);
    if (!agent) {
      console.log(`\n🔴 ${test.naam} — bestaat niet in het systeem`);
      continue;
    }

    const charter = activeCharterFor(agent.key);
    const eigen = gereedschapVan(agent.key, agent.isChief);
    const gekoppeld = agent.tools.filter((t) => t.enabled).map((t) => t.toolKey);
    const beschikbaar = new Set([...eigen, ...gekoppeld.filter(isGebouwd)]);

    const heeft = test.nodig.filter((n) => beschikbaar.has(n));
    const mist = test.nodig.filter((n) => !beschikbaar.has(n));
    if (mist.length) ontbreekt.push({ agent: test.naam, tools: mist });

    // Kan hij bij Daan en bij Enriqueo?
    const naarDaan = agent.isChief
      ? "is Daan zelf"
      : charter?.communicatielijnen.some((l) => l.agentKey === "chief")
        ? "ja"
        : "GEEN LIJN";
    const naarEnriqueo = agent.isChief
      ? "bericht_enriqueo — direct via Telegram"
      : "vraag_aan_enriqueo — komt in de wachtrij van de ochtendcall";

    console.log(`\n${"═".repeat(72)}`);
    console.log(`${test.naam.toUpperCase()} — ${agent.role}`);
    console.log("═".repeat(72));

    const regel = (label: string, waarde: string, goed: boolean) =>
      console.log(`  ${goed ? "🟢" : "🔴"} ${label.padEnd(22)} ${waarde}`);

    regel("profieltekst", agent.systemPrompt?.trim() ? `${agent.systemPrompt.trim().length} tekens` : "ONTBREEKT", Boolean(agent.systemPrompt?.trim()));
    regel("werkinstructies", agent.playbook?.trim() ? `${agent.playbook.trim().length} tekens` : "ONTBREEKT", Boolean(agent.playbook?.trim()));
    regel("functieprofiel", charter ? `actief · autonomieniveau ${charter.autonomie}` : "ONTBREEKT", Boolean(charter));
    regel(
      "geheugen",
      `${agent.memories.length} herinneringen (${agent.memories.filter((m) => m.pinned).length} vastgezet)`,
      agent.memories.length > 0,
    );
    regel("lijn naar Daan", naarDaan, naarDaan !== "GEEN LIJN");
    regel("lijn naar Enriqueo", naarEnriqueo, true);
    regel("doorgeven aan collega", agent.isChief ? "vraag_agent én maak_taak" : "maak_taak met toewijzing", true);
    regel("op pauze", agent.paused ? "JA" : "nee", !agent.paused);

    console.log(`\n  Wat deze opdracht vraagt`);
    for (const nodig of test.nodig) {
      const aanwezig = beschikbaar.has(nodig);
      const wachtend = gekoppeld.includes(nodig) && !isGebouwd(nodig);
      console.log(
        `    ${aanwezig ? "🟢" : wachtend ? "🔌" : "🔴"} ${nodig.padEnd(20)} ` +
          `${aanwezig ? "werkt" : wachtend ? "toegewezen, wacht op koppeling" : "niet toegewezen"}`,
      );
    }

    const oordeel =
      mist.length === 0
        ? "🟢 kan deze opdracht volledig uitvoeren"
        : heeft.length > 0
          ? `🟡 kan denken en adviseren, maar mist ${mist.length} koppeling(en) voor echt werk`
          : `🔴 mist alles wat deze opdracht nodig heeft`;
    console.log(`\n  ${oordeel}`);

    if (agent.memories.length) {
      console.log(`\n  In zijn geheugen`);
      for (const m of agent.memories.slice(0, 6)) {
        console.log(`    ${m.pinned ? "📌" : "·"} [${m.kind}] ${m.title.slice(0, 58)}`);
      }
      if (agent.memories.length > 6) console.log(`    … en nog ${agent.memories.length - 6}`);
    }
  }

  // ── Wat moet er gekoppeld worden per agent ───────────────────────────────
  console.log(`\n\n${"═".repeat(72)}`);
  console.log("WAT ER PER AGENT GEKOPPELD MOET WORDEN");
  console.log("═".repeat(72));
  if (ontbreekt.length === 0) {
    console.log("  niets — iedereen heeft wat zijn opdracht vraagt");
  }
  for (const rij of ontbreekt) {
    console.log(`  ${rij.agent.padEnd(10)} ${rij.tools.join(", ")}`);
  }

  console.log(`\n  ${namen.chief ?? "Daan"} en de rest kunnen zonder koppeling wél denken, adviseren,`);
  console.log(`  taken maken en elkaar inschakelen. Wat ze niet kunnen is iets aanraken.`);

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
