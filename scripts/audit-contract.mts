// Contractanalyse: is hij eerlijk over wat er níét in staat?
//
//   DOTENV_CONFIG_PATH=.env.production npx tsx scripts/audit-contract.mts
//
// Het gevaar bij contractanalyse is niet een verkeerd antwoord maar een te
// stellig antwoord. Een analyse die doet alsof alles helder is, is gevaarlijker
// dan geen analyse — dan tekent iemand in de veronderstelling dat het nagekeken
// is. Deze test levert daarom expres een halve analyse aan.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });
const MERK = "AUDIT-";
let goed = 0, fout = 0;
const toets = (n: string, ok: boolean, g = "") => {
  console.log(`  ${ok ? "🟢" : "🔴"} ${n}${g ? ` — ${g}` : ""}`);
  ok ? goed++ : fout++;
};

async function main() {
  console.log("\nCONTRACTANALYSE\n" + "═".repeat(70));

  const { runTool } = await import("../src/lib/ai/tools");
  const stefano = await db.agent.findUnique({ where: { key: "research" } });
  const alsStefano = { agentId: stefano!.id, agentName: stefano!.name, isChief: false };

  const contract = await db.contract.create({
    data: { naam: `${MERK}Samenwerking creator X`, brontekst: "Testdata — geen echt contract." },
  });
  toets("contract aangemaakt", Boolean(contract.id));

  // ── Een halve analyse: alleen het makkelijke ingevuld ────────────────────
  console.log("\nEen analyse die veel openlaat");
  const half = await runTool(
    "leg_contractanalyse_vast",
    {
      contract_id: contract.id,
      samenvatting: "Creator levert twee Reels voor een vast bedrag.",
      vergoeding_eur: 1500,
      deliverables: ["2 Reels"],
      advies: "Vergoeding is marktconform voor dit bereik.",
      // exclusiviteit, usage rights, looptijd, boetes: allemaal niet ingevuld
      // en ook niet als onduidelijk gemeld.
    },
    alsStefano,
  );
  toets("analyse vastgelegd", half.ok, half.message.slice(0, 60));

  const na = await db.contract.findUnique({ where: { id: contract.id } });
  toets("status op geanalyseerd", na?.status === "geanalyseerd");
  toets("vergoeding overgenomen", na?.vergoedingEur === 1500);
  toets("deliverables overgenomen", na?.deliverables.length === 1);

  console.log("\nWat er níét is ingevuld, wordt zelf gemeld");
  const punten = na?.onduidelijk ?? [];
  toets("er staat iets in onduidelijk", punten.length > 0, `${punten.length} punten`);
  for (const veld of ["exclusiviteit", "usageRights", "looptijd", "boetes", "concurrentiebeperking"]) {
    toets(
      `${veld} gemeld als niet vastgesteld`,
      punten.some((p) => p.toLowerCase().includes(veld.toLowerCase())),
    );
  }
  toets("geen valse melding over vergoeding", !punten.some((p) => p.startsWith("vergoeding:")));

  // ── Een volledige analyse ────────────────────────────────────────────────
  console.log("\nEen volledige analyse");
  const tweede = await db.contract.create({ data: { naam: `${MERK}Volledig contract` } });
  await runTool(
    "leg_contractanalyse_vast",
    {
      contract_id: tweede.id,
      samenvatting: "Volledig uitgewerkte samenwerking.",
      vergoeding_eur: 3000,
      betaaltermijn: "30 dagen na oplevering",
      deliverables: ["3 Reels", "5 Stories"],
      usage_rights: "6 maanden, organisch en paid",
      exclusiviteit: "3 maanden binnen de categorie sportvoeding",
      looptijd: "1 september tot 1 december",
      annulering: "Kosteloos tot 14 dagen voor start",
      boetes: "Geen",
      whitelisting: "Toegestaan, 3 maanden",
      paid_usage: "Inbegrepen",
      contentrechten: "Blijven bij de creator, merk krijgt licentie",
      revisies: "Twee rondes",
      concurrentiebeperking: "Geen samenwerking met directe concurrenten tijdens looptijd",
      voordelen: ["Ruime usage rights", "Duidelijke annuleringsregeling"],
      nadelen: ["Exclusiviteit van 3 maanden is lang"],
      risicos: ["Bij uitloop van de campagne vervalt de licentie eerder dan de content leeft"],
      advies: "Tekenen, maar onderhandel de exclusiviteit terug naar 6 weken.",
    },
    alsStefano,
  );
  const volledig = await db.contract.findUnique({ where: { id: tweede.id } });
  toets("alles overgenomen", volledig?.exclusiviteit !== null && volledig?.usageRights !== null);
  toets("geen onterechte onduidelijkheden", (volledig?.onduidelijk.length ?? 0) === 0, (volledig?.onduidelijk ?? []).join(" · "));
  toets("advies vastgelegd", (volledig?.advies ?? "").includes("exclusiviteit"));
  toets("risico vastgelegd", (volledig?.risicos.length ?? 0) === 1);

  console.log("\nFoute invoer");
  const zonderId = await runTool("leg_contractanalyse_vast", { samenvatting: "x", advies: "y" }, alsStefano);
  toets("zonder contract-ID geweigerd", !zonderId.ok, zonderId.message.slice(0, 50));
  const onbekend = await runTool(
    "leg_contractanalyse_vast",
    { contract_id: "bestaat-niet", samenvatting: "x", advies: "y" },
    alsStefano,
  );
  toets("onbekend contract geweigerd", !onbekend.ok, onbekend.message.slice(0, 50));

  await db.contract.deleteMany({ where: { naam: { startsWith: MERK } } });
  console.log(`\n${"═".repeat(70)}\n${goed} geslaagd, ${fout} mislukt. Testdata opgeruimd.`);
  await db.$disconnect();
  if (fout > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
