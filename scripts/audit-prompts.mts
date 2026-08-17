// Wat krijgt een agent precies mee voordat hij nadenkt?
//
//   DOTENV_CONFIG_PATH=.env.production npx tsx scripts/audit-prompts.mts
//
// Dit voorspelt hoe de scenario's morgen gaan lopen. Een agent met een prompt
// van vijftienduizend tokens denkt trager, kost meer per beurt, en raakt eerder
// de draad kwijt tussen zijn functieprofiel en zijn werkinstructies. Een agent
// met tegenstrijdige instructies doet iets anders dan je verwacht en je ziet
// niet waarom.
//
// Leest alleen; draait geen agents en kost niets.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";
import { activeCharterFor, charterAsPrompt } from "../src/lib/ai/charters";
import { werkafsprakenAlsPrompt } from "../src/lib/ai/werkafspraken";
import { SHARED_FRAMEWORK, DEFAULT_COMPANY_CONTEXT } from "../src/lib/ai/profiles";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });

/// Ruwe schatting: ongeveer 3,6 tekens per token voor Nederlands.
const tokens = (tekst: string) => Math.round(tekst.length / 3.6);

let waarschuwingen = 0;
const meld = (agent: string, wat: string) => {
  console.log(`     ⚠️  ${wat}`);
  waarschuwingen += 1;
  void agent;
};

async function main() {
  console.log("\nWAT ELKE AGENT MEEKRIJGT\n" + "═".repeat(74));

  const agents = await db.agent.findMany({
    where: { adapterType: { not: "reader_ingest" } },
    orderBy: [{ isChief: "desc" }, { sortOrder: "asc" }],
    include: { memories: { select: { title: true, body: true, pinned: true } } },
  });

  const namen = Object.fromEntries(agents.map((a) => [a.key, a.name]));
  const contextRij = await db.setting.findUnique({ where: { key: "company_context" } });
  const bedrijfscontext =
    ((contextRij?.value as { text?: string } | undefined)?.text?.trim() || DEFAULT_COMPANY_CONTEXT);

  const totalen: { naam: string; tokens: number; kostenPerBeurt: number }[] = [];

  // Wat het model kost. Uit de tarieventabel als die er is; anders een
  // gangbaar tarief, duidelijk als schatting gemarkeerd.
  const prijzen = await db.modelPrice.findMany();
  const perMiljoenIn = prijzen[0]?.inputPerMillion ?? 2.5;
  const geschat = prijzen.length === 0;

  for (const agent of agents) {
    const charter = activeCharterFor(agent.key);
    const werkafspraken = werkafsprakenAlsPrompt(agent.key, namen);
    const geheugen = agent.memories
      .map((m) => `- ${m.title}: ${m.body}`)
      .join("\n");

    const blokken: { naam: string; tekst: string }[] = [
      { naam: "profieltekst", tekst: agent.systemPrompt?.trim() ?? "" },
      { naam: "gedeeld kader", tekst: SHARED_FRAMEWORK },
      { naam: "functieprofiel", tekst: charter ? charterAsPrompt(charter, namen) : "" },
      { naam: "werkafspraken", tekst: werkafspraken },
      { naam: "werkinstructies", tekst: agent.playbook?.trim() ?? "" },
      { naam: "bedrijfscontext", tekst: bedrijfscontext },
      { naam: "geheugen", tekst: geheugen },
    ];

    const totaal = blokken.reduce((n, b) => n + b.tekst.length, 0);
    const totaalTokens = tokens(blokken.map((b) => b.tekst).join("\n"));
    const kosten = (totaalTokens / 1_000_000) * perMiljoenIn;
    totalen.push({ naam: agent.name, tokens: totaalTokens, kostenPerBeurt: kosten });

    console.log(`\n${agent.name.toUpperCase()} — ${agent.role}`);
    console.log("─".repeat(74));

    for (const blok of blokken) {
      const aandeel = totaal > 0 ? Math.round((blok.tekst.length / totaal) * 100) : 0;
      const balk = "█".repeat(Math.max(0, Math.round(aandeel / 3)));
      console.log(
        `  ${blok.naam.padEnd(16)} ${String(tokens(blok.tekst)).padStart(5)} tokens ${String(aandeel).padStart(3)}%  ${balk}`,
      );
    }
    console.log(`  ${"TOTAAL".padEnd(16)} ${String(totaalTokens).padStart(5)} tokens          ≈ €${kosten.toFixed(4)} per denkbeurt`);

    // ── Waar het mis kan gaan ──────────────────────────────────────────────
    if (totaalTokens > 12_000) {
      meld(agent.name, `Erg lang. Boven ongeveer 12.000 tokens raakt een model eerder de draad kwijt tussen profiel en instructies.`);
    }
    if (!agent.systemPrompt?.trim()) meld(agent.name, "Geen profieltekst; hij valt terug op een standaardregel.");
    if (!agent.playbook?.trim()) meld(agent.name, "Geen werkinstructies.");
    if (!charter) meld(agent.name, "Geen actief functieprofiel.");
    if (!werkafspraken) meld(agent.name, "Geen werkafspraken — hij weet niet waar hij eigenaar van is.");
    if (agent.memories.length === 0) meld(agent.name, "Leeg geheugen.");

    // Het playbook mag niet groter zijn dan al het andere samen: dan is het
    // geen handleiding meer maar de hoofdmoot, en verdwijnt het functieprofiel
    // erin.
    const playbookTokens = tokens(agent.playbook ?? "");
    if (playbookTokens > totaalTokens * 0.55) {
      meld(agent.name, `De werkinstructies zijn ${Math.round((playbookTokens / totaalTokens) * 100)}% van alles wat hij meekrijgt.`);
    }

    // Dubbelingen: staat dezelfde regel in zowel het geheugen als het playbook?
    for (const herinnering of agent.memories) {
      const kern = herinnering.title.toLowerCase();
      if (kern.length > 12 && (agent.playbook ?? "").toLowerCase().includes(kern)) {
        meld(agent.name, `"${herinnering.title}" staat zowel in zijn geheugen als in zijn werkinstructies.`);
      }
    }
  }

  // ── Wat een scenario gaat kosten ─────────────────────────────────────────
  console.log(`\n\n${"═".repeat(74)}\nWAT DE SCENARIO'S GAAN KOSTEN`);
  console.log("═".repeat(74));

  const gemiddeld = totalen.reduce((n, t) => n + t.tokens, 0) / totalen.length;
  console.log(`  gemiddeld ${Math.round(gemiddeld)} tokens per agent, alleen de vaste tekst`);
  console.log(`  langste: ${totalen.sort((a, b) => b.tokens - a.tokens)[0].naam} met ${totalen[0].tokens} tokens`);
  if (geschat) {
    console.log(`\n  ⚠️  Er staan geen modeltarieven in de database, dus de bedragen hierboven`);
    console.log(`      zijn gerekend met €${perMiljoenIn} per miljoen tokens. Zet de echte tarieven bij`);
    console.log(`      Instellingen, anders klopt je budgetrem niet.`);
    waarschuwingen += 1;
  }

  // Een scenario waarin Daan drie collega's inschakelt: vier denkbeurten, elk
  // met hun eigen vaste tekst plus het gesprek eromheen.
  const daan = totalen.find((t) => t.naam === "Daan")?.tokens ?? gemiddeld;
  const perScenario = ((daan + gemiddeld * 3) / 1_000_000) * perMiljoenIn * 2;
  const achtSamen = perScenario * 8;
  console.log(`\n  Ruwe schatting voor één scenario waarin Daan drie collega's inschakelt:`);
  console.log(`  ongeveer €${perScenario.toFixed(3)}. De acht scenario's samen: €${achtSamen.toFixed(2)}.`);
  console.log(`  Twee rondes — testen, verbeteren, opnieuw testen — komt op ongeveer €${(achtSamen * 2).toFixed(2)}.`);
  console.log(`  Je maandbudget staat op €25, dus daar zit ruimte in.`);

  console.log(`\n${"═".repeat(74)}`);
  console.log(waarschuwingen === 0 ? "Geen aandachtspunten." : `${waarschuwingen} aandachtspunt(en).`);

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
