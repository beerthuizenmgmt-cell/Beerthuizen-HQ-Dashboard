// Klopt de bewaking op elke pagina met de rechtenlijst?
//
//   npx tsx scripts/audit-bewaking.mts
//
// De rechtenlijst in access-areas.ts stuurt het menu. De pagina zelf roept
// requireOwner() of requireUser(), en dát is wat werkelijk tegenhoudt. Lopen die
// twee uit elkaar, dan staat een scherm wél in iemands menu maar gooit het hem
// er alsnog uit — of, veel erger, andersom.
//
// Zo bleek /agents/nieuw open te staan voor het hele team: de pagina viel onder
// /agents, dat mag iedereen zien, maar erachter zit het koppelformulier met
// tokens erin. Deze test bestaat om dat niet nog eens te laten gebeuren.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { findArea } from "../src/lib/access-areas";

const WORTEL = "src/app/(app)";

/// Pagina's die strenger zijn dan het scherm waar ze onder vallen. Het dossier
/// van een agent mag iedereen inzien; bepalen wat hij mág is iets anders.
const ALLEEN_EIGENAAR = ["/agents/nieuw", "/agents/[id]/instellingen"];

let goed = 0;
let fout = 0;

function toets(naam: string, gelukt: boolean, uitleg = "") {
  console.log(`  ${gelukt ? "🟢" : "🔴"} ${naam}${uitleg ? ` — ${uitleg}` : ""}`);
  if (gelukt) goed += 1;
  else fout += 1;
}

/// Alle page.tsx onder (app), met hun route-pad.
function paginas(map: string, pad = ""): { route: string; bestand: string }[] {
  const gevonden: { route: string; bestand: string }[] = [];
  for (const naam of readdirSync(map)) {
    const vol = join(map, naam);
    if (statSync(vol).isDirectory()) {
      // Routegroepen — (app) — tellen niet mee in het pad.
      gevonden.push(...paginas(vol, naam.startsWith("(") ? pad : `${pad}/${naam}`));
    } else if (naam === "page.tsx") {
      gevonden.push({ route: pad || "/", bestand: vol });
    }
  }
  return gevonden;
}

console.log("\nBEWAKING PER PAGINA\n" + "─".repeat(72));

const gevonden = paginas(WORTEL).sort((a, b) => a.route.localeCompare(b.route));
console.log(`  ${gevonden.length} pagina's\n`);

for (const { route, bestand } of gevonden) {
  const bron = readFileSync(bestand, "utf8");
  const heeftOwner = /\brequireOwner\s*\(/.test(bron);
  const heeftUser = /\brequireUser\s*\(/.test(bron);

  // Zoals de app het doet: langste match wint, dynamische stukken eruit.
  const area = findArea(route.replace(/\/\[[^\]]+\]/g, ""));
  if (!area) {
    toets(`${route} valt onder geen enkel scherm`, false, "voeg het toe aan access-areas.ts");
    continue;
  }

  const moetEigenaar =
    ALLEEN_EIGENAAR.includes(route) || Boolean(area.roles?.length === 1 && area.roles[0] === "owner");

  if (moetEigenaar) {
    toets(`${route.padEnd(32)} eigenaar`, heeftOwner, heeftOwner ? "" : "mist requireOwner()");
  } else {
    toets(
      `${route.padEnd(32)} iedereen die inlogt`,
      heeftUser && !heeftOwner,
      heeftOwner ? "sluit het team buiten terwijl de lijst het openzet" : heeftUser ? "" : "mist requireUser()",
    );
  }
}

// ── Serveracties ──────────────────────────────────────────────────────────
//
// Een pagina afschermen is niets waard als de knop eronder nog wel luistert:
// serveracties zijn los aan te roepen. Deze bestanden mogen géén requireUser
// meer bevatten.
console.log("\nSERVERACTIES DIE VAN DE EIGENAAR MOETEN ZIJN\n" + "─".repeat(72));

const STRENG = [
  ["ai.ts", "sleutels, budget en modelkeuze"],
  ["agent-tools.ts", "koppelingen en hun configuratie"],
  ["agents.ts", "wie er in het team zit"],
  ["approvals.ts", "beslissen namens Enriqueo"],
  ["instances.ts", "sleutels voor inkomende data"],
  ["integrations.ts", "rechten per koppeling"],
  ["telegram.ts", "bot-token en de lijn naar zijn telefoon"],
  ["monitoring.ts", "agents activeren, kost geld"],
  ["setup-watches.ts", "waar agents wakker van worden"],
  ["testrun.ts", "proefopdrachten kosten geld"],
  ["facturen.ts", "financiële administratie"],
  ["memory.ts", "wat een agent blijvend onthoudt"],
  ["playbook.ts", "werkinstructies van een agent"],
];

for (const [bestand, waarom] of STRENG) {
  const bron = readFileSync(join("src/lib/actions", bestand), "utf8");
  const losseUser = /\brequireUser\s*\(\s*\)/.test(bron);
  toets(`${bestand.padEnd(20)} ${waarom}`, !losseUser, losseUser ? "bevat nog requireUser()" : "");
}

console.log(`\n${"─".repeat(72)}\n${goed} geslaagd, ${fout} mislukt.`);
if (fout > 0) process.exit(1);
