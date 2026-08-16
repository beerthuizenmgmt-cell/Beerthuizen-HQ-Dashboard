// Richt Daan in als volwaardig medewerker.
//
//   npx tsx scripts/configure-daan.mts
//   (productie: eerst .env.production inlezen, DATABASE_URL leegmaken)
//
// Idempotent: opnieuw draaien verandert niets aan wat al goed staat. Bewust
// géén verwijderacties — bestaande gegevens blijven staan.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });

/// Zijn eigen signalen: waarop hij wakker wordt. Zonder een van deze drie moet
/// hij wachten tot iemand hem aanstoot.
const WATCHES = [
  { key: "chief-teamwerk", label: "Werk van het team", probe: "team_tasks", interval: 60 },
  { key: "chief-goedkeuringen", label: "Openstaande goedkeuringen", probe: "approvals", interval: 240 },
  { key: "chief-storingen", label: "Fouten en stilgevallen agents", probe: "activity", interval: 120 },
];

/// Wat hij van meet af aan hoort te weten. Dit zijn geen verzinsels: het zijn
/// besluiten die Enriqueo zelf heeft vastgelegd. Ze staan op `user` als bron en
/// vastgezet, zodat ze altijd meegaan.
const GEHEUGEN = [
  {
    kind: "besluit",
    title: "Externe acties gaan altijd langs Enriqueo",
    body:
      "Nooit zonder expliciet akkoord: klanten, influencers of externe partijen berichten, commerciële afspraken maken, geld uitgeven, budgetten wijzigen, campagnes of advertenties publiceren, belangrijke systemen wijzigen, of namens Beerthuizen Management toezeggingen doen. Voorbereiden mag altijd — zo compleet dat er alleen nog ja of nee hoeft.",
  },
  {
    kind: "besluit",
    title: "Geen analyse zonder nieuwe informatie",
    body:
      "Is er geen nieuwe data, taak, wijziging of gebeurtenis sinds de vorige analyse, dan draait er geen nieuwe AI-analyse. Vraag eerst: is er iets nieuws sinds mijn vorige keer? Zo niet, gebruik dan het bestaande resultaat. Een rustige dag hoort niets te kosten.",
  },
  {
    kind: "besluit",
    title: "Nooit financiële cijfers verzinnen",
    body:
      "Gebruik uitsluitend geregistreerde of door Enriqueo ingevoerde gegevens. Geen geschatte besparingen, geen aangenomen bedragen, geen plausibele getallen. Ontbreekt data, zeg dan dat die ontbreekt en waarom die relevant is.",
  },
  {
    kind: "afspraak",
    title: "Telegram is de lijn met Enriqueo",
    body:
      "Jij bent de enige agent die rechtstreeks met Enriqueo schakelt via Telegram. Het ochtendrapport gaat daarheen, en escalaties die niet tot de volgende ochtend kunnen wachten. Andere agents bereiken hem via jou.",
  },
  {
    kind: "afspraak",
    title: "Gefaseerd live, één agent tegelijk",
    body:
      "Het team gaat niet in één keer aan. Elke agent wordt eerst volledig ingericht en getest, daarna pas actief. Ga er niet van uit dat een collega al operationeel is; controleer het.",
  },
];

async function main() {
  const daan = await db.agent.findUnique({ where: { key: "chief" } });
  if (!daan) {
    console.error("Geen agent met sleutel 'chief' gevonden. Draai eerst de seed.");
    process.exit(1);
  }

  console.log(`${daan.name} — ${daan.role}\n`);

  // 1. Signalen
  let nieuweWatches = 0;
  for (const watch of WATCHES) {
    const bestaand = await db.agentWatch.findUnique({ where: { key: watch.key } });
    if (bestaand) {
      // De rem mag niet op nul staan. Zonder minimuminterval kan hij bij elke
      // kleine wijziging opnieuw draaien, en dan is "event-driven" alsnog een
      // dure lus. De vingerafdrukken laten we met rust.
      if (bestaand.minIntervalMinutes !== watch.interval) {
        await db.agentWatch.update({
          where: { key: watch.key },
          data: { minIntervalMinutes: watch.interval },
        });
        console.log(
          `  signaal    ${watch.label} — rem bijgesteld ${bestaand.minIntervalMinutes} → ${watch.interval} min`,
        );
      } else {
        console.log(`  signaal    ${watch.label} — stond er al`);
      }
      continue;
    }
    await db.agentWatch.create({
      data: {
        agentId: daan.id,
        key: watch.key,
        label: watch.label,
        probe: watch.probe,
        minIntervalMinutes: watch.interval,
      },
    });
    nieuweWatches += 1;
    console.log(`  signaal    ${watch.label} — aangezet`);
  }

  // 2. Gereedschap. web_fetch heeft geen sleutel nodig en werkt meteen; hij
  //    gebruikt het om een pagina te lezen waar iemand naar verwijst.
  const bestaandeTool = await db.agentTool.findUnique({
    where: { agentId_toolKey: { agentId: daan.id, toolKey: "web_fetch" } },
  });
  if (bestaandeTool) {
    console.log(`  gereedschap web_fetch — stond er al`);
  } else {
    await db.agentTool.create({
      data: { agentId: daan.id, toolKey: "web_fetch", label: "Pagina lezen", enabled: true },
    });
    console.log(`  gereedschap web_fetch — gekoppeld`);
  }

  // 3. Geheugen
  let nieuweHerinneringen = 0;
  for (const item of GEHEUGEN) {
    const bestaand = await db.agentMemory.findFirst({
      where: { agentId: daan.id, title: item.title, archivedAt: null },
    });
    if (bestaand) {
      console.log(`  geheugen   ${item.title} — stond er al`);
      continue;
    }
    await db.agentMemory.create({
      data: {
        agentId: daan.id,
        kind: item.kind,
        title: item.title,
        body: item.body,
        source: "user",
        pinned: true,
      },
    });
    nieuweHerinneringen += 1;
    console.log(`  geheugen   ${item.title} — vastgelegd`);
  }

  // 4. Koppeltype. Een ingebouwde AI-agent hoort op `builtin` te staan; op
  //    `manual` telt hij als losse registratie en verschijnt hij niet in het
  //    proefdraaischerm. We corrigeren alleen vanuit `manual`, zodat een
  //    bewuste keuze voor telegram of gateway blijft staan.
  if (daan.adapterType === "manual") {
    await db.agent.update({ where: { id: daan.id }, data: { adapterType: "builtin" } });
    console.log(`  koppeling  manual → builtin (anders niet te proefdraaien)`);
  }

  // 5. Ruimte om te denken. Hij coördineert en bevraagt collega's; met te weinig
  //    beurten breekt hij middenin een keten af.
  if (daan.maxToolCalls < 8) {
    await db.agent.update({ where: { id: daan.id }, data: { maxToolCalls: 8 } });
    console.log(`  ruimte     maxToolCalls ${daan.maxToolCalls} → 8`);
  }

  console.log(
    `\n${nieuweWatches} signalen en ${nieuweHerinneringen} herinneringen toegevoegd. Niets verwijderd.`,
  );

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
