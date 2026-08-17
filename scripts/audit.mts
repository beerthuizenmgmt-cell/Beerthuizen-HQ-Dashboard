// Volledige controle van de database en de configuratie.
//
//   npx tsx scripts/audit.mts
//
// Leest alleen; verandert niets. Bedoeld om in één keer te zien of alles wat
// gebouwd is ook daadwerkelijk staat zoals bedoeld — en waar het niet klopt.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";
import { CHARTERS } from "../src/lib/ai/charters";
import { isGebouwd, GEBOUWD_GEREEDSCHAP } from "../src/lib/ai/tool-keys";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });

const bevindingen: { ernst: "rood" | "geel"; waar: string; wat: string }[] = [];
const meld = (ernst: "rood" | "geel", waar: string, wat: string) =>
  bevindingen.push({ ernst, waar, wat });

const kop = (titel: string) => console.log(`\n${"─".repeat(64)}\n${titel}\n${"─".repeat(64)}`);

async function main() {
  // ── Gebruikers en toegang ────────────────────────────────────────────────
  kop("GEBRUIKERS");
  const users = await db.user.findMany({ select: { email: true, name: true, role: true, passwordHash: true } });
  for (const u of users) {
    const geldig = u.passwordHash.startsWith("$2") && u.passwordHash.length === 60;
    console.log(`  ${u.role.padEnd(7)} ${u.name.padEnd(12)} ${u.email.padEnd(26)} ${geldig ? "wachtwoord ok" : "HASH ONGELDIG"}`);
    if (!geldig) meld("rood", `gebruiker ${u.email}`, "wachtwoordhash is ongeldig");
  }
  if (!users.some((u) => u.role === "owner")) meld("rood", "gebruikers", "er is geen eigenaar");
  if (!users.some((u) => u.role === "member")) meld("geel", "gebruikers", "er is geen teamlid");

  // ── Agents ───────────────────────────────────────────────────────────────
  kop("AGENTS");
  const agents = await db.agent.findMany({
    orderBy: [{ isChief: "desc" }, { sortOrder: "asc" }],
    include: {
      _count: { select: { memories: true, tools: true, watches: true, runs: true, tasks: true } },
    },
  });

  const medewerkers = agents.filter((a) => a.adapterType !== "reader_ingest");
  console.log(`  ${medewerkers.length} medewerkers, ${agents.length - medewerkers.length} technische koppelingen\n`);

  for (const agent of medewerkers) {
    const charter = CHARTERS.find((c) => c.agentKey === agent.key);
    const gebreken: string[] = [];

    if (!agent.avatarUrl) gebreken.push("geen portret");
    if (!agent.playbook?.trim()) gebreken.push("geen werkinstructies");
    if (!agent.systemPrompt?.trim()) gebreken.push("geen profieltekst");
    if (!charter) gebreken.push("geen functieprofiel");
    if (charter?.status !== "actief") gebreken.push("profiel niet actief");
    if (agent._count.memories === 0) gebreken.push("leeg geheugen");
    if (agent._count.watches === 0) gebreken.push("geen signalen");
    if (agent.paused) gebreken.push("gepauzeerd");
    if (agent.adapterType !== "builtin") gebreken.push(`koppeltype ${agent.adapterType}`);

    const kosten = await db.agentRun.aggregate({
      where: { agentId: agent.id, costKnown: true },
      _sum: { costEur: true },
    });

    console.log(
      `  ${gebreken.length === 0 ? "🟢" : "🔴"} ${agent.name.padEnd(9)} ${(charter?.autonomie ? `niveau ${charter.autonomie}` : "—").padEnd(9)} ` +
        `${String(agent._count.memories).padStart(2)} herinn · ${String(agent._count.watches)} signalen · ` +
        `${String(agent._count.tools).padStart(2)} tools · ${String(agent._count.runs).padStart(2)} runs · €${(kosten._sum.costEur ?? 0).toFixed(5)}`,
    );
    for (const gebrek of gebreken) {
      console.log(`       ↳ ${gebrek}`);
      meld(gebrek === "gepauzeerd" || gebrek.startsWith("koppeltype") ? "rood" : "geel", agent.name, gebrek);
    }

    // Communicatielijn met de Head
    if (charter && !agent.isChief) {
      const naarHead = charter.communicatielijnen.some((l) => l.agentKey === "chief");
      if (!naarHead) meld("rood", agent.name, "geen communicatielijn met Daan");
    }

    // Verwijzen zijn lijnen naar bestaande agents?
    for (const lijn of charter?.communicatielijnen ?? []) {
      if (lijn.agentKey && !agents.some((a) => a.key === lijn.agentKey)) {
        meld("rood", agent.name, `communicatielijn naar onbekende agent "${lijn.agentKey}"`);
      }
    }
  }

  // ── Signalen ─────────────────────────────────────────────────────────────
  kop("EVENT-DRIVEN SIGNALEN");
  const watches = await db.agentWatch.findMany({ include: { agent: { select: { name: true } } } });
  const probes = new Set(watches.map((w) => w.probe));
  console.log(`  ${watches.length} signalen over ${probes.size} soorten bronnen`);
  for (const watch of watches) {
    if (watch.minIntervalMinutes === 0) {
      meld("rood", watch.agent.name, `signaal "${watch.label}" heeft geen rem (0 minuten)`);
    }
    const rustig = watch.dataHash !== null && watch.dataHash === watch.analyzedHash;
    console.log(
      `  ${watch.agent.name.padEnd(9)} ${watch.probe.padEnd(14)} ${String(watch.minIntervalMinutes).padStart(3)} min · ` +
        `${watch.dataHash === null ? "nog niet gemeten" : rustig ? "rustig" : "gewijzigd"}`,
    );
  }

  // ── Gereedschap ──────────────────────────────────────────────────────────
  kop("GEREEDSCHAP");
  const koppelingen = await db.agentTool.groupBy({ by: ["toolKey"], _count: true });
  const gebouwd = koppelingen.filter((k) => isGebouwd(k.toolKey));
  const wacht = koppelingen.filter((k) => !isGebouwd(k.toolKey));
  console.log(`  ${koppelingen.length} verschillende tools toegewezen`);
  console.log(`  werkend: ${gebouwd.map((k) => k.toolKey).join(", ") || "geen"}`);
  console.log(`  wacht op koppeling: ${wacht.length} platformen`);
  console.log(`  in de code gebouwd: ${GEBOUWD_GEREEDSCHAP.join(", ")}`);

  // ── Instellingen en sleutels ─────────────────────────────────────────────
  kop("INSTELLINGEN");
  const lees = async (key: string) =>
    ((await db.setting.findUnique({ where: { key } }))?.value ?? {}) as Record<string, unknown>;
  const ai = await lees("ai");
  const tg = await lees("telegram");
  const fin = await lees("finance");

  console.log(`  AI-sleutel        ${ai.apiKey ? "aanwezig" : "ONTBREEKT"}`);
  console.log(`  aanbieder/model   ${ai.provider} · ${ai.defaultModel}`);
  console.log(`  Telegram-token    ${tg.botToken ? "aanwezig" : "ONTBREEKT"}`);
  console.log(`  Telegram-chat     ${tg.chatId ?? "onbekend"}`);
  console.log(`  maandbudget       €${fin.monthlyBudgetEur ?? "niet ingesteld"}`);
  console.log(`  modeltarieven     ${await db.modelPrice.count()}`);
  if (!ai.apiKey) meld("rood", "instellingen", "geen AI-sleutel; geen enkele agent kan denken");
  if (!tg.botToken) meld("rood", "instellingen", "geen Telegram-token");
  if (!fin.monthlyBudgetEur) meld("geel", "instellingen", "geen maandbudget ingesteld");

  // ── Data-integriteit ─────────────────────────────────────────────────────
  kop("DATA-INTEGRITEIT");

  const wezen = {
    "taken zonder agent én zonder gebruiker": await db.task.count({
      where: { agentId: null, createdByUserId: null, createdByAgentId: null },
    }),
    "taken met een deadline in het verleden die nog open staan": await db.task.count({
      where: { dueAt: { lt: new Date() }, status: { notIn: ["done", "cancelled"] } },
    }),
    "goedkeuringen zonder beslissing ouder dan 7 dagen": await db.approval.count({
      where: { status: "pending", createdAt: { lt: new Date(Date.now() - 7 * 864e5) } },
    }),
    "facturen zonder klantkoppeling": await db.invoice.count({ where: { clientId: null } }),
    "projecten zonder taken": (
      await db.project.findMany({ include: { _count: { select: { tasks: true } } } })
    ).filter((p) => p._count.tasks === 0).length,
    "portaalaanvragen verlopen en niet ingevuld": await db.portalRequest.count({
      where: { expiresAt: { lt: new Date() }, submittedAt: null },
    }),
    "onbeantwoorde Telegram-vragen": await db.telegramThread.count({ where: { answeredAt: null } }),
    "runs met onbekende kosten": await db.agentRun.count({ where: { costKnown: false, ok: true } }),
  };

  for (const [wat, aantal] of Object.entries(wezen)) {
    console.log(`  ${String(aantal).padStart(3)}  ${wat}`);
  }

  // Dubbele klanten op naam
  const klanten = await db.client.findMany({ select: { name: true } });
  const namen = klanten.map((k) => k.name.toLowerCase().trim());
  const dubbel = namen.filter((n, i) => namen.indexOf(n) !== i);
  if (dubbel.length) meld("geel", "klanten", `dubbele namen: ${[...new Set(dubbel)].join(", ")}`);

  // Dubbele factuurnummers binnen dezelfde bron
  const facturen = await db.invoice.findMany({ select: { number: true, source: true } });
  const sleutels = facturen.map((f) => `${f.source}:${f.number}`);
  const dubbeleFacturen = sleutels.filter((s, i) => sleutels.indexOf(s) !== i);
  if (dubbeleFacturen.length) meld("rood", "facturen", `dubbele nummers: ${[...new Set(dubbeleFacturen)].join(", ")}`);

  // ── Kosten ───────────────────────────────────────────────────────────────
  kop("KOSTEN");
  const totaal = await db.agentRun.aggregate({
    where: { costKnown: true },
    _sum: { costEur: true, promptTokens: true, completionTokens: true },
    _count: true,
  });
  const mislukt = await db.agentRun.count({ where: { ok: false } });
  console.log(`  ${totaal._count} geslaagde runs · €${(totaal._sum.costEur ?? 0).toFixed(5)}`);
  console.log(`  ${totaal._sum.promptTokens} tokens in / ${totaal._sum.completionTokens} uit`);
  console.log(`  ${mislukt} mislukte runs`);
  if (mislukt > 0) {
    const laatste = await db.agentRun.findMany({
      where: { ok: false },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { error: true, createdAt: true },
    });
    for (const run of laatste) console.log(`     ${run.createdAt.toISOString().slice(0, 16)} ${run.error?.slice(0, 90)}`);
  }

  // ── Uitkomst ─────────────────────────────────────────────────────────────
  kop("BEVINDINGEN");
  const rood = bevindingen.filter((b) => b.ernst === "rood");
  const geel = bevindingen.filter((b) => b.ernst === "geel");

  if (bevindingen.length === 0) console.log("  geen");
  for (const b of rood) console.log(`  🔴 ${b.waar}: ${b.wat}`);
  for (const b of geel) console.log(`  🟡 ${b.waar}: ${b.wat}`);
  console.log(`\n  ${rood.length} blokkerend, ${geel.length} aandachtspunten`);

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
