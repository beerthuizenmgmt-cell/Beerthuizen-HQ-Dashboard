// Controleert of Daan technisch klaarstaat: signalen, gereedschap, geheugen,
// Telegram-lijn, kostenregistratie en de ochtendrapport-route.
//
//   npx tsx scripts/check-daan.mts
//
// Voert niets uit naar buiten. Toont nooit een geheime waarde.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });

const ok = (t: string) => console.log(`  🟢 ${t}`);
const wacht = (t: string) => console.log(`  🟡 ${t}`);
const stuk = (t: string) => console.log(`  🔴 ${t}`);

async function main() {
  const daan = await db.agent.findUnique({ where: { key: "chief" } });
  if (!daan) {
    stuk("Geen Head of Operations gevonden.");
    process.exit(1);
  }

  console.log(`\n${daan.name} — ${daan.role}\n`);

  // Identiteit
  console.log("IDENTITEIT");
  if (daan.avatarUrl) ok("gezicht ingesteld");
  else wacht("nog geen gezicht");
  if (daan.systemPrompt) ok("eigen profieltekst");
  else wacht("geen eigen profieltekst");
  ok(`autonomie via maxToolCalls: ${daan.maxToolCalls} denkbeurten per opdracht`);
  if (daan.paused) wacht("staat op pauze");
  else ok("niet gepauzeerd");

  // Signalen
  const watches = await db.agentWatch.findMany({ where: { agentId: daan.id } });
  console.log("\nEVENT-DRIVEN SIGNALEN");
  if (watches.length === 0) stuk("geen signalen ingericht");
  for (const watch of watches) {
    const stand =
      watch.dataHash === null
        ? "nog niet gemeten"
        : watch.dataHash === watch.analyzedHash
          ? "rustig — geen nieuwe analyse nodig"
          : "gewijzigd — analyse staat klaar";
    ok(`${watch.label} (${watch.probe}, max 1× per ${watch.minIntervalMinutes} min) — ${stand}`);
  }

  // Gereedschap
  const tools = await db.agentTool.findMany({ where: { agentId: daan.id } });
  console.log("\nGEREEDSCHAP");
  ok("ingebouwd: taken, kanalen, goedkeuring, bevinding, onthouden, collega bevragen");
  for (const tool of tools) {
    if (tool.enabled) ok(`gekoppeld: ${tool.label ?? tool.toolKey}`);
    else wacht(`uit: ${tool.toolKey}`);
  }

  // Geheugen
  const memories = await db.agentMemory.findMany({
    where: { agentId: daan.id, archivedAt: null },
  });
  console.log("\nGEHEUGEN");
  if (memories.length) ok(`${memories.length} herinneringen, waarvan ${memories.filter((m) => m.pinned).length} vastgezet`);
  else wacht("leeg");

  // Telegram
  console.log("\nTELEGRAM");
  const telegram = (await db.setting.findUnique({ where: { key: "telegram" } }))?.value as
    | Record<string, unknown>
    | undefined;
  const heeftToken = Boolean(telegram?.botToken);
  const heeftChat = Boolean(telegram?.chatId);
  if (heeftToken) ok("bottoken aanwezig");
  else wacht("bottoken ontbreekt — zelf invoeren via Instellingen");
  if (heeftChat) ok(`chat bekend (${telegram!.chatId})`);
  else wacht("chat-ID onbekend");
  if (telegram?.botUsername) ok(`bot: @${telegram.botUsername}`);
  if (heeftToken && heeftChat) ok("de lijn kan berichten versturen");
  else wacht("de lijn is nog niet compleet — het rapport blijft dan in het dashboard staan");

  // AI en kosten
  console.log("\nAI EN KOSTEN");
  const ai = (await db.setting.findUnique({ where: { key: "ai" } }))?.value as
    | Record<string, unknown>
    | undefined;
  if (ai?.apiKey) ok("API-sleutel aanwezig");
  else wacht("API-sleutel ontbreekt — zonder dit kan hij niet denken");
  ok(`aanbieder ${ai?.provider ?? "—"}, model ${ai?.defaultModel ?? "—"}`);

  const runs = await db.agentRun.findMany({
    where: { agentId: daan.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { trigger: true, costEur: true, costKnown: true, ok: true, createdAt: true },
  });
  if (runs.length === 0) {
    wacht("nog geen denkbeurt geregistreerd — kosten zijn pas te zien na de eerste run");
  } else {
    for (const run of runs) {
      const bedrag = run.costKnown ? `€${run.costEur.toFixed(4)}` : "tarief onbekend";
      ok(`${run.createdAt.toISOString().slice(0, 16)} ${run.trigger} — ${bedrag}${run.ok ? "" : " (fout)"}`);
    }
  }

  const prijzen = await db.modelPrice.count();
  if (prijzen > 0) ok(`${prijzen} modeltarieven bekend — kosten worden per run berekend`);
  else wacht("geen modeltarieven bekend; kosten komen dan van de aanbieder zelf of blijven onbekend");

  // Ochtendrapport
  console.log("\nOCHTENDRAPPORT");
  const laatste = (await db.setting.findUnique({ where: { key: "last_head_report" } }))?.value as
    | { at?: string; usedAi?: boolean }
    | undefined;
  if (laatste?.at) {
    const wanneer = new Date(laatste.at).toLocaleString("nl-NL");
    ok(`laatste rapport ${wanneer}${laatste.usedAi ? " (met AI)" : " (zonder AI — er was niets nieuws)"}`);
  } else {
    wacht("nog geen rapport gedraaid");
  }

  const cron = process.env.CRON_SECRET ? "beveiligd" : "GEEN CRON_SECRET";
  console.log(`  ${process.env.CRON_SECRET ? "🟢" : "🔴"} cron-route ${cron}`);

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
