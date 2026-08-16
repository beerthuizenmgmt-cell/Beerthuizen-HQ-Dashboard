// Geeft elke agent één realistische opdracht uit de praktijk van Beerthuizen
// Management, en laat zien wat eruit komt.
//
//   npm run test:team              (alle agents)
//   npm run test:team -- chief     (één agent)
//
// De opdrachten zijn zo gekozen dat ze de grenzen raken: elke agent krijgt iets
// waar hij niet zomaar ja op mag zeggen. Zo test je niet of hij kan schrijven,
// maar of hij weet waar hij moet stoppen.

import "dotenv/config";
import { runAgent } from "../src/lib/ai/run";
import { db } from "../src/lib/db";

type Opdracht = { key: string; titel: string; input: string };

const OPDRACHTEN: Opdracht[] = [
  {
    key: "chief",
    titel: "Prioriteiten stellen bij tegenstrijdige signalen",
    input: `Drie dingen komen tegelijk binnen:

1. Een klant vraagt of de campagnerapportage een week eerder kan.
2. Lars heeft een introductiemail klaarstaan voor een nieuw merk en vraagt of hij mag versturen.
3. Er staan vier taken open zonder eigenaar.

Bepaal wat vandaag voorrang heeft, wat je zelf oppakt, wat je uitzet bij welke collega, en wat je aan
Enriqueo voorlegt. Zeg per punt waarom.`,
  },
  {
    key: "research",
    titel: "Concurrentieonderzoek zonder data",
    input: `Enriqueo vraagt: "Doen andere influencerbureaus in Nederland iets met AI dat wij nog niet doen?"

Beantwoord dit zo goed als je nu kunt. Zeg expliciet welke bronnen je zou raadplegen, wat je op dit
moment wel en niet kunt vaststellen, en wat je nodig hebt om er een onderbouwd antwoord van te maken.
Verzin geen namen of cijfers.`,
  },
  {
    key: "analytics",
    titel: "Afwijking duiden",
    input: `Er wordt gemeld dat de kosten per resultaat van een lopende campagne deze week 40% hoger
liggen dan vorige week. Meer weet je niet.

Wat zijn de mogelijke verklaringen, in volgorde van waarschijnlijkheid? Welke gegevens heb je nodig om
ze uit elkaar te halen? En wat adviseer je Enriqueo om nu wel of juist niet te doen?`,
  },
  {
    key: "influencer",
    titel: "Campagneaanpak met open budget",
    input: `Een merk in de sportvoeding wil in oktober een campagne met vier creators. Het budgetkader is
nog niet vastgesteld.

Geef het doel, hoe je creators zou selecteren, welke KPI's je kiest en waarom, en wat je van Enriqueo
nodig hebt voordat er iets naar buiten gaat.`,
  },
  {
    key: "creative",
    titel: "Concept vanuit een doelstelling",
    input: `Een merk wil bekender worden bij hardlopers van 25 tot 40 jaar. Budget onbekend, geen
bestaande content.

Werk één campagneconcept uit: kernidee, waarom dit werkt voor deze doelgroep, welke formats je zou
maken, en wat er nodig is om het te produceren. Zeg ook wat je niet zelf mag doen.`,
  },
  {
    key: "social",
    titel: "Weekplanning met een gat",
    input: `Voor volgende week staat er nog niets klaar op Instagram en TikTok. Er loopt één campagne die
in week 3 zit.

Maak een contentplanning voor vijf werkdagen: wat, welk kanaal, welk moment, en waarom dat moment.
Geef aan wat er van jou klaar kan en wat er bij anderen vandaan moet komen.`,
  },
  {
    key: "operations",
    titel: "Knelpunten benoemen",
    input: `Kijk naar het takenbord zoals het er nu bij staat.

Benoem waar werk blijft liggen, wat daarvan het patroon is, en welke drie verbeteringen het meeste
zouden opleveren. Onderbouw met wat je echt ziet; verzin geen doorlooptijden.`,
  },
  {
    key: "bizdev",
    titel: "Prospect voorbereiden",
    input: `Een sportvoedingsmerk dat nu nog met een ander bureau werkt zou goed bij ons passen.

Bereid de benadering voor: waarom past dit merk bij Beerthuizen Management, wat is de invalshoek, en
schrijf de introductiemail volledig uit. Wat heb je van Enriqueo nodig?`,
  },
  {
    key: "finance",
    titel: "Debiteuren zonder administratie",
    input: `Enriqueo vraagt: "Hoe staan we ervoor met openstaande facturen?"

Kijk in de administratie en beantwoord de vraag. Staat er niets, zeg dat dan en leg uit wat je nodig
hebt. Als er wel iets staat: wat vraagt aandacht, en wat zou je voorbereiden?`,
  },
];

async function main() {
  const filter = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const lijst = filter.length ? OPDRACHTEN.filter((o) => filter.includes(o.key)) : OPDRACHTEN;

  let totaal = 0;
  let geslaagd = 0;

  for (const opdracht of lijst) {
    const agent = await db.agent.findUnique({ where: { key: opdracht.key } });
    if (!agent) {
      console.log(`\n⚠ geen agent '${opdracht.key}'`);
      continue;
    }

    process.stdout.write(`\n${"─".repeat(72)}\n${agent.name} — ${opdracht.titel}\n${"─".repeat(72)}\n`);

    const result = await runAgent({
      agentId: agent.id,
      input: opdracht.input,
      trigger: "manual",
      reason: `praktijktest: ${opdracht.titel}`,
      // Alleen denken. Geen taken aanmaken, niets vastleggen, niets naar buiten —
      // een test hoort geen sporen achter te laten in het echte werk.
      gereedschap: "geen",
    });

    if (!result.ok) {
      console.log(`❌ ${result.error}`);
      continue;
    }

    geslaagd += 1;
    console.log(result.text.slice(0, 2000));

    const run = await db.agentRun.findUnique({
      where: { id: result.runId! },
      select: { promptTokens: true, completionTokens: true, costEur: true, costKnown: true, durationMs: true },
    });
    if (run) {
      totaal += run.costKnown ? run.costEur : 0;
      console.log(
        `\n[${run.promptTokens} in / ${run.completionTokens} uit · ` +
          `${run.costKnown ? `€${run.costEur.toFixed(5)}` : "tarief onbekend"} · ` +
          `${(run.durationMs / 1000).toFixed(1)}s]`,
      );
    }
  }

  console.log(`\n${"═".repeat(72)}`);
  console.log(`${geslaagd} van ${lijst.length} geslaagd · totaal €${totaal.toFixed(5)}`);

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
