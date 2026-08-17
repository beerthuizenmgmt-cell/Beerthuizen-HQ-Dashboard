// Wie mag waar komen.
//
//   npx tsx scripts/audit-rechten.mts
//
// Legt de afspraak vast in plaats van hem te onthouden. Verschuift er ooit iets
// in de toegangslijst, dan valt deze test om in plaats van dat Vonneke stilletjes
// bij de facturen kan.

import { mayAccess, areasFor } from "../src/lib/access-areas";

const VONNEKE_MAG = [
  "/hq",
  "/overleg",
  "/agenda",
  "/taken",
  "/projecten",
  "/campagnes",
  "/rapportages",
  "/team",
  "/team/algemeen",
  "/agents",
  "/agents/willekeurig-id",
  "/kennis",
  "/activiteit",
  "/meldingen",
  "/klanten",
];

const VONNEKE_MAG_NIET = [
  "/goedkeuringen",
  "/opbouw",
  "/facturen",
  "/tools",
  "/monitoring",
  "/financien",
  "/proefdraaien",
  "/instellingen",
];

let goed = 0;
let fout = 0;

function toets(naam: string, gelukt: boolean) {
  console.log(`  ${gelukt ? "🟢" : "🔴"} ${naam}`);
  if (gelukt) goed += 1;
  else fout += 1;
}

console.log("\nTOEGANG\n" + "─".repeat(60));

console.log("\nVonneke mag hier komen");
for (const pad of VONNEKE_MAG) toets(pad, mayAccess("member", pad));

console.log("\nVonneke mag hier niet komen");
for (const pad of VONNEKE_MAG_NIET) toets(pad, !mayAccess("member", pad));

console.log("\nEnriqueo mag overal komen");
for (const pad of [...VONNEKE_MAG, ...VONNEKE_MAG_NIET]) {
  if (!mayAccess("owner", pad)) toets(pad, false);
}
toets("alle schermen", [...VONNEKE_MAG, ...VONNEKE_MAG_NIET].every((p) => mayAccess("owner", p)));

console.log("\nHet menu klopt met de rechten");
const menuLid = areasFor("member").map((a) => a.path);
toets(
  "geen enkel eigenaarsscherm in Vonneke's menu",
  menuLid.every((pad) => mayAccess("member", pad)),
);
toets("Klanten staat in haar menu", menuLid.includes("/klanten"));
toets("Facturen staat niet in haar menu", !menuLid.includes("/facturen"));
toets("Instellingen staat niet in haar menu", !menuLid.includes("/instellingen"));
toets("Enriqueo ziet meer schermen dan Vonneke", areasFor("owner").length > menuLid.length);

console.log(`\n${"─".repeat(60)}\n${goed} geslaagd, ${fout} mislukt.`);
if (fout > 0) process.exit(1);
