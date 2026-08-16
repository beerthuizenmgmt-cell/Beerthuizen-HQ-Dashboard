// Maakt de Finance & Debiteuren Manager aan — agent 9.
//
//   npx tsx scripts/maak-finance-agent.mts           (kijken)
//   npx tsx scripts/maak-finance-agent.mts --doen    (uitvoeren)
//
// Bestaat hij al, dan verandert er niets aan wat er staat. Het portret komt
// later: dat vraagt een werkende beeldsleutel.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";
import type { ToolPermission } from "../src/generated/prisma/enums";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });
const DOEN = process.argv.includes("--doen");

const SLEUTEL = "finance";

const PROFIEL = `
Jij bent Maud, Finance & Debiteuren Manager bij Beerthuizen Management.

Je houdt bij wat er uitstaat, wie te laat is en wat er binnenkort vervalt. Je werkt uitsluitend met
geregistreerde gegevens: staat een bedrag nergens vast, dan noem je het niet. Een geschat bedrag in
een financieel overzicht is erger dan een leeg vakje.

Je stelt herinneringen en aanmaningen volledig op — ontvanger, toon, bedrag, termijn — en biedt ze
daarna ter goedkeuring aan. Versturen doe je nooit zelf. Hetzelfde geldt voor facturen, creditnota's,
betaalregelingen en elke wijziging in de administratie.

Schrijf zakelijk maar niet kil. Een herinnering aan een klant die verder goed betaalt hoort anders te
klinken dan de derde aanmaning aan iemand die structureel te laat is — en dat verschil ken je, want je
onthoudt betaalgedrag per klant.

Zolang er geen boekhoud- of facturatiekoppeling is, heb je geen bronnen. Zeg dat dan ook: benoem wat
je zou willen zien en waarom, in plaats van te werken met aannames.
`.trim();

const SIGNALEN = [
  {
    key: "finance-signaal-1",
    label: "Een factuur verstrijkt of een betaling komt binnen",
    probe: "manual_signal",
    interval: 120,
  },
  {
    key: "finance-signaal-2",
    label: "Een financiële goedkeuring is beslist",
    probe: "approvals",
    interval: 180,
  },
];

const TOOLS: { tool: string; recht: ToolPermission }[] = [
  { tool: "boekhouding", recht: "lezen" },
  { tool: "facturatie", recht: "voorstellen" },
  { tool: "crm", recht: "lezen" },
  { tool: "automations", recht: "voorstellen" },
];

const GEHEUGEN = [
  {
    kind: "besluit",
    title: "Financiële acties gaan altijd langs Enriqueo",
    body:
      "Nooit zelf betalen, factureren, crediteren, herinneren of een betaalregeling toezeggen. Alles volledig voorbereiden en ter goedkeuring aanbieden — zo compleet dat er alleen nog ja of nee hoeft.",
  },
  {
    kind: "besluit",
    title: "Alleen bedragen die ergens vastliggen",
    body:
      "Gebruik uitsluitend geregistreerde of door Enriqueo ingevoerde gegevens. Geen geschatte bedragen, geen afgeronde aannames, geen plausibele getallen. Ontbreekt de bron, zeg dan welke bron je nodig hebt.",
  },
];

async function main() {
  console.log(DOEN ? "UITVOEREN\n" : "PROEFDRAAI — niets wordt gewijzigd\n");

  const bestaand = await db.agent.findUnique({ where: { key: SLEUTEL } });
  if (bestaand) {
    console.log(`${bestaand.name} bestaat al — alleen aanvullen wat ontbreekt.\n`);
  }

  const aantal = await db.agent.count();

  const agent =
    bestaand ??
    (DOEN
      ? await db.agent.create({
          data: {
            key: SLEUTEL,
            name: "Maud",
            role: "Finance & Debiteuren Manager",
            description:
              "Bewaakt openstaande facturen, vervaldatums en betaalgedrag. Bereidt herinneringen en rapportages voor; versturen gaat via jouw akkoord.",
            emoji: "💰",
            color: "#22c55e",
            category: "finance",
            adapterType: "builtin",
            systemPrompt: PROFIEL,
            maxToolCalls: 6,
            sortOrder: aantal,
            status: "idle",
          },
        })
      : null);

  if (!agent) {
    console.log("  agent    Maud — Finance & Debiteuren Manager (zou aangemaakt worden)");
    for (const s of SIGNALEN) console.log(`  signaal  ${s.label}`);
    for (const t of TOOLS) console.log(`  tool     ${t.tool} (${t.recht})`);
    for (const g of GEHEUGEN) console.log(`  geheugen ${g.title}`);
    console.log("\nNiets gewijzigd. Draai met --doen om het echt te doen.");
    await db.$disconnect();
    return;
  }

  console.log(`${agent.name} — ${agent.role}`);

  // Eigen gesprekskanaal, net als de rest.
  const kanaal = await db.channel.findFirst({ where: { agentId: agent.id } });
  if (!kanaal) {
    await db.channel.create({
      data: {
        key: `dm-${SLEUTEL}`,
        name: agent.name,
        kind: "dm",
        agentId: agent.id,
        purpose: `Rechtstreeks gesprek met ${agent.name}`,
      },
    });
    console.log(`  kanaal   dm-${SLEUTEL} aangemaakt`);
  }

  for (const signaal of SIGNALEN) {
    const er = await db.agentWatch.findUnique({ where: { key: signaal.key } });
    if (er) continue;
    await db.agentWatch.create({
      data: {
        agentId: agent.id,
        key: signaal.key,
        label: signaal.label,
        probe: signaal.probe,
        minIntervalMinutes: signaal.interval,
      },
    });
    console.log(`  signaal  ${signaal.label}`);
  }

  for (const { tool, recht } of TOOLS) {
    const er = await db.agentTool.findUnique({
      where: { agentId_toolKey: { agentId: agent.id, toolKey: tool } },
    });
    if (er) continue;
    await db.agentTool.create({
      data: { agentId: agent.id, toolKey: tool, permission: recht, enabled: true },
    });
    console.log(`  tool     ${tool} (${recht})`);
  }

  for (const item of GEHEUGEN) {
    const er = await db.agentMemory.findFirst({
      where: { agentId: agent.id, title: item.title, archivedAt: null },
    });
    if (er) continue;
    await db.agentMemory.create({
      data: {
        agentId: agent.id,
        kind: item.kind,
        title: item.title,
        body: item.body,
        source: "user",
        pinned: true,
      },
    });
    console.log(`  geheugen ${item.title}`);
  }

  console.log(`\nKlaar. Het portret volgt zodra de beeldsleutel werkt.`);
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
