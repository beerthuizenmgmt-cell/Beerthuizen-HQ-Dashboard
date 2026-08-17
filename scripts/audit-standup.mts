// Leest het overleg-antwoord van een agent uit elkaar.
//
//   npx tsx scripts/audit-standup.mts
//
// Dit is de plek waar het misging: agents antwoorden in het dashboard zelf, en
// dat antwoord moet betrouwbaar uit elkaar te trekken zijn. Anders staat de
// briefing leeg terwijl iedereen wél gerapporteerd heeft.

import { parseStandup, splitQuestions } from "../src/lib/standup";

let goed = 0;
let fout = 0;

function toets(naam: string, gelukt: boolean, gezien = "") {
  console.log(`  ${gelukt ? "🟢" : "🔴"} ${naam}${gelukt ? "" : ` — kreeg: ${gezien}`}`);
  if (gelukt) goed += 1;
  else fout += 1;
}

console.log("\nANTWOORDEN UITLEZEN\n" + "─".repeat(64));

// ── De vorm die we nu vragen ───────────────────────────────────────────────
const netjes = parseStandup(
  "Gisteren: creatorlijst voor Nike afgerond | Vandaag: briefing aanvullen | Blokkades: budget ontbreekt | Vragen: Wat is het richtbudget?",
);
toets("gisteren", netjes.yesterday === "creatorlijst voor Nike afgerond", String(netjes.yesterday));
toets("vandaag", netjes.today === "briefing aanvullen", String(netjes.today));
toets("blokkades", netjes.blockers === "budget ontbreekt", String(netjes.blockers));
toets("vragen", (netjes.questions ?? "").includes("richtbudget"), String(netjes.questions));

// ── Zoals een taalmodel het in de praktijk schrijft ────────────────────────
const overRegels = parseStandup(
  ["Gisteren: drie campagnes gecontroleerd", "Vandaag: CPM-vergelijking afmaken", "Blokkades: geen", "Vragen: geen"].join("\n"),
);
toets("meerdere regels in plaats van streepjes", overRegels.today === "CPM-vergelijking afmaken", String(overRegels.today));
toets('"geen" blijft "geen"', overRegels.blockers === "geen", String(overRegels.blockers));
toets('"geen" levert geen vraag op', splitQuestions(overRegels.questions).length === 0);

// ── Genummerd, zoals de uitvraag het stelt ─────────────────────────────────
const genummerd = parseStandup(
  ["1. Concurrentieanalyse afgerond", "2. Verdiepen op TikTok-bureaus", "3. Twee tariefkaarten ontbreken", "4. Per bureau of per segment?"].join("\n"),
);
toets("genummerde antwoorden", genummerd.yesterday === "Concurrentieanalyse afgerond", String(genummerd.yesterday));
toets("genummerde blokkade", genummerd.blockers === "Twee tariefkaarten ontbreken", String(genummerd.blockers));

// ── Rommel eromheen ────────────────────────────────────────────────────────
const rommelig = parseStandup(
  ["Goedemorgen! Hier is mijn standup.", "", "Gisteren: facturen nagelopen", "Vandaag: herinneringen versturen", "Blokkades: geen", "", "Groet, Maud"].join("\n"),
);
toets("inleiding en afsluiting storen niet", rommelig.yesterday === "facturen nagelopen", String(rommelig.yesterday));

// ── Leeg antwoord ──────────────────────────────────────────────────────────
const leeg = parseStandup("");
toets("leeg antwoord geeft niets terug", !leeg.yesterday && !leeg.today && !leeg.blockers);

// ── Meerdere vragen ────────────────────────────────────────────────────────
const veelVragen = splitQuestions("Wat is het budget? Mag ik Rival IQ aanvragen?\n- Wanneer wil je het voorstel?");
toets("drie losse vragen herkend", veelVragen.length === 3, `${veelVragen.length}: ${veelVragen.join(" / ")}`);
toets("dubbele vragen worden samengevoegd", splitQuestions("Wat is het budget?\nWat is het budget?").length === 1);
toets("nooit meer dan tien vragen", splitQuestions(Array.from({ length: 30 }, (_, i) => `Vraag nummer ${i}?`).join("\n")).length === 10);

console.log(`\n${"─".repeat(64)}\n${goed} geslaagd, ${fout} mislukt.`);
if (fout > 0) process.exit(1);
