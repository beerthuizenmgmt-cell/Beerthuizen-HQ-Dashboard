// Zet de toolstack per agent klaar zoals Enriqueo hem heeft beschreven.
//
//   npx tsx scripts/koppel-toolstack.mts           (kijken)
//   npx tsx scripts/koppel-toolstack.mts --doen    (uitvoeren)
//
// Koppelt tools aan agents met een recht erbij. Ook tools die nog niet gebouwd
// zijn worden gekoppeld: dan staat vast wie er straks bij mag, en zie je in het
// overzicht wat er nog moet. De agent krijgt ze pas echt in handen zodra de
// koppeling werkt — dat bewaakt toolsForAgent().
//
// Niet-destructief: bestaande koppelingen en rechten blijven staan.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";
import type { ToolPermission } from "../src/generated/prisma/enums";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });
const DOEN = process.argv.includes("--doen");

// lezen       — ophalen en bekijken
// voorstellen — mag klaarzetten, gaat pas door na akkoord
// schrijven   — mag zelfstandig wijzigen binnen die tool
type Koppeling = { tool: string; recht: ToolPermission };

const STACK: Record<string, Koppeling[]> = {
  // Daan — coördineert en leest mee. Nergens schrijfrechten: hij stuurt aan,
  // hij voert niet zelf uit.
  chief: [
    { tool: "browse_ai", recht: "lezen" },
    { tool: "brand24", recht: "lezen" },
    { tool: "fullstory", recht: "lezen" },
    { tool: "automations", recht: "voorstellen" },
    { tool: "hubspot_ai", recht: "lezen" },
    { tool: "userbot_ai", recht: "lezen" },
  ],

  // Sanne — onderzoek. Leest overal, verandert niets.
  research: [
    { tool: "surfer", recht: "lezen" },
    { tool: "semrush", recht: "lezen" },
    { tool: "ahrefs", recht: "lezen" },
    { tool: "brand24", recht: "lezen" },
    { tool: "browse_ai", recht: "lezen" },
    { tool: "paradigma_ai", recht: "lezen" },
    { tool: "google_search", recht: "lezen" },
    { tool: "meta", recht: "lezen" },
    { tool: "contentshake", recht: "voorstellen" },
  ],

  // Mila — analyse. Uitdrukkelijk read-only, zoals afgesproken.
  analytics: [
    { tool: "meta", recht: "lezen" },
    { tool: "instagram", recht: "lezen" },
    { tool: "tiktok", recht: "lezen" },
    { tool: "youtube", recht: "lezen" },
    { tool: "google_analytics", recht: "lezen" },
    { tool: "ahrefs", recht: "lezen" },
    { tool: "semrush", recht: "lezen" },
    { tool: "brand24", recht: "lezen" },
    { tool: "fullstory", recht: "lezen" },
    { tool: "influencity", recht: "lezen" },
    { tool: "algolia", recht: "lezen" },
    { tool: "campaign_intelligence", recht: "lezen" },
  ],

  // Fleur — campagnes van briefing tot rapport.
  influencer: [
    { tool: "influencity", recht: "voorstellen" },
    { tool: "campaign_intelligence", recht: "schrijven" },
    { tool: "canva", recht: "voorstellen" },
    { tool: "brand24", recht: "lezen" },
    { tool: "meta", recht: "lezen" },
    { tool: "instagram", recht: "lezen" },
    { tool: "browse_ai", recht: "lezen" },
    { tool: "crm", recht: "voorstellen" },
  ],

  // Jesse — creatief. Maken mag; publiceren nooit.
  creative: [
    { tool: "canva", recht: "schrijven" },
    { tool: "photoroom", recht: "schrijven" },
    { tool: "kling_ai", recht: "schrijven" },
    { tool: "v0", recht: "schrijven" },
    { tool: "lexica", recht: "schrijven" },
    { tool: "midjourney", recht: "schrijven" },
    { tool: "higgsfield", recht: "schrijven" },
    { tool: "ai_arcade", recht: "schrijven" },
    { tool: "brandwell", recht: "schrijven" },
    { tool: "writer_com", recht: "schrijven" },
    { tool: "jasper", recht: "schrijven" },
    { tool: "grammarly", recht: "schrijven" },
    { tool: "copy_ai", recht: "schrijven" },
    { tool: "contentshake", recht: "schrijven" },
  ],

  // Noor — social. Voorbereiden mag, publiceren is approval.
  social: [
    { tool: "canva", recht: "schrijven" },
    { tool: "photoroom", recht: "schrijven" },
    { tool: "kling_ai", recht: "schrijven" },
    { tool: "higgsfield", recht: "schrijven" },
    { tool: "midjourney", recht: "schrijven" },
    { tool: "brand24", recht: "lezen" },
    { tool: "meta", recht: "voorstellen" },
    { tool: "instagram", recht: "voorstellen" },
    { tool: "tiktok", recht: "voorstellen" },
    { tool: "youtube", recht: "voorstellen" },
    { tool: "grammarly", recht: "schrijven" },
    { tool: "jasper", recht: "schrijven" },
    { tool: "copy_ai", recht: "schrijven" },
    { tool: "contentshake", recht: "schrijven" },
  ],

  // Bram — interne processen en automatisering.
  operations: [
    { tool: "automations", recht: "voorstellen" },
    { tool: "browse_ai", recht: "schrijven" },
    { tool: "fullstory", recht: "lezen" },
    { tool: "algolia", recht: "schrijven" },
    { tool: "v0", recht: "schrijven" },
  ],

  // Lars — commercie. Alles voorbereiden, niets versturen.
  bizdev: [
    { tool: "hubspot_ai", recht: "voorstellen" },
    { tool: "reply_io", recht: "voorstellen" },
    { tool: "albert_ai", recht: "lezen" },
    { tool: "influencity", recht: "lezen" },
    { tool: "browse_ai", recht: "lezen" },
    { tool: "brand24", recht: "lezen" },
    { tool: "linkedin", recht: "lezen" },
    { tool: "google_search", recht: "lezen" },
    { tool: "jasper", recht: "voorstellen" },
    { tool: "writer_com", recht: "voorstellen" },
    { tool: "grammarly", recht: "schrijven" },
    { tool: "copy_ai", recht: "voorstellen" },
    { tool: "email", recht: "voorstellen" },
  ],
};

async function main() {
  console.log(DOEN ? "UITVOEREN\n" : "PROEFDRAAI — niets wordt gewijzigd\n");

  let nieuw = 0;
  let bijgewerkt = 0;

  for (const [agentKey, koppelingen] of Object.entries(STACK)) {
    const agent = await db.agent.findUnique({ where: { key: agentKey } });
    if (!agent) {
      console.log(`⚠ geen agent '${agentKey}' — overgeslagen`);
      continue;
    }

    console.log(`${agent.name}`);

    for (const { tool, recht } of koppelingen) {
      const bestaand = await db.agentTool.findUnique({
        where: { agentId_toolKey: { agentId: agent.id, toolKey: tool } },
      });

      if (bestaand) {
        if (bestaand.permission !== recht) {
          if (DOEN) {
            await db.agentTool.update({ where: { id: bestaand.id }, data: { permission: recht } });
          }
          console.log(`  ${tool.padEnd(22)} recht ${bestaand.permission} → ${recht}`);
          bijgewerkt += 1;
        }
        continue;
      }

      if (DOEN) {
        await db.agentTool.create({
          data: { agentId: agent.id, toolKey: tool, permission: recht, enabled: true },
        });
      }
      console.log(`  ${tool.padEnd(22)} ${recht}`);
      nieuw += 1;
    }

    console.log("");
  }

  console.log(`${nieuw} koppelingen erbij, ${bijgewerkt} rechten bijgesteld.`);
  if (!DOEN) console.log(`\nNiets gewijzigd. Draai met --doen om het echt te doen.`);

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
