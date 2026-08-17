// Wat hebben de agents in productie daadwerkelijk gedaan?
//
//   DOTENV_CONFIG_PATH=.env.production npx tsx scripts/audit-bewijs.mts
//
// Niet: "de knop bestaat". Wel: "deze agent heeft dit gereedschap gebruikt, op
// dit moment, met dit resultaat". Leest alleen.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });

const kop = (t: string) => console.log(`\n${"─".repeat(66)}\n${t}\n${"─".repeat(66)}`);
const dag = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

async function main() {
  const agents = await db.agent.findMany({ select: { id: true, key: true, name: true } });
  const naam = (id: string | null) => agents.find((a) => a.id === id)?.name ?? "—";

  // ── Wat heeft elke agent gedraaid ────────────────────────────────────────
  kop("DRAAIBEURTEN PER AGENT");
  for (const agent of agents) {
    const runs = await db.agentRun.findMany({
      where: { agentId: agent.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, trigger: true, ok: true, error: true, toolCalls: true, costEur: true },
    });
    if (runs.length === 0) {
      console.log(`  ${agent.name.padEnd(9)} nog nooit gedraaid`);
      continue;
    }
    const gelukt = runs.filter((r) => r.ok).length;
    const triggers = [...new Set(runs.map((r) => r.trigger))];
    console.log(
      `  ${agent.name.padEnd(9)} ${String(runs.length).padStart(2)} beurten · ${gelukt} geslaagd · ` +
        `laatst ${dag(runs[0].createdAt)} · aanleidingen: ${triggers.join(", ")}`,
    );
    const stuk = runs.filter((r) => !r.ok);
    for (const r of stuk.slice(0, 2)) console.log(`       🔴 ${dag(r.createdAt)} ${r.error?.slice(0, 80)}`);
  }

  // ── Welk gereedschap is echt aangeroepen ─────────────────────────────────
  kop("GEREEDSCHAP DAT ÉCHT IS GEBRUIKT");
  const alleRuns = await db.agentRun.findMany({
    select: { agentId: true, toolCalls: true, createdAt: true },
  });
  const gebruik = new Map<string, { aantal: number; door: Set<string>; laatst: Date }>();
  for (const run of alleRuns) {
    const calls = (run.toolCalls ?? []) as unknown as { name?: string }[];
    if (!Array.isArray(calls)) continue;
    for (const call of calls) {
      if (!call?.name) continue;
      const huidig = gebruik.get(call.name) ?? { aantal: 0, door: new Set<string>(), laatst: run.createdAt };
      huidig.aantal += 1;
      huidig.door.add(naam(run.agentId));
      if (run.createdAt > huidig.laatst) huidig.laatst = run.createdAt;
      gebruik.set(call.name, huidig);
    }
  }
  if (gebruik.size === 0) console.log("  nog geen enkele gereedschapsaanroep geregistreerd");
  for (const [tool, info] of [...gebruik].sort((a, b) => b[1].aantal - a[1].aantal)) {
    console.log(
      `  🟢 ${tool.padEnd(22)} ${String(info.aantal).padStart(3)}× · door ${[...info.door].join(", ")} · laatst ${dag(info.laatst)}`,
    );
  }

  // ── Samenwerking: wie heeft voor wie gewerkt ─────────────────────────────
  kop("SAMENWERKING");

  const doorAgent = await db.task.findMany({
    where: { createdByAgentId: { not: null } },
    select: { title: true, createdByAgentId: true, agentId: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  console.log(`  ${doorAgent.length} taken door een agent aangemaakt`);
  for (const t of doorAgent.slice(0, 12)) {
    console.log(`     ${naam(t.createdByAgentId).padEnd(9)} → ${naam(t.agentId).padEnd(9)} ${t.status.padEnd(11)} ${t.title.slice(0, 46)}`);
  }

  const berichten = await db.message.findMany({
    where: { fromAgentId: { not: null } },
    select: { fromAgentId: true, toAgentId: true, channelId: true, createdAt: true, body: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const paren = new Map<string, number>();
  for (const m of berichten) {
    if (!m.toAgentId) continue;
    const sleutel = `${naam(m.fromAgentId)} → ${naam(m.toAgentId)}`;
    paren.set(sleutel, (paren.get(sleutel) ?? 0) + 1);
  }
  console.log(`\n  ${berichten.length} berichten van agents · ${paren.size} gerichte lijnen gebruikt`);
  for (const [paar, aantal] of [...paren].sort((a, b) => b[1] - a[1])) {
    console.log(`     ${paar.padEnd(24)} ${aantal}×`);
  }

  const kanalen = await db.channel.findMany({
    select: { key: true, kind: true, _count: { select: { messages: true } } },
  });
  console.log("");
  for (const k of kanalen) console.log(`     #${k.key.padEnd(14)} ${k.kind.padEnd(6)} ${k._count.messages} berichten`);

  // ── Daan als rechterhand ─────────────────────────────────────────────────
  kop("DAAN ALS RECHTERHAND");
  const draden = await db.telegramThread.findMany({
    orderBy: { askedAt: "desc" },
    select: {
      askedAt: true, level: true, question: true, answer: true, answeredAt: true,
      taskId: true, projectId: true, clientId: true, telegramMessageId: true,
    },
  });
  console.log(`  ${draden.length} Telegram-gesprekken`);
  for (const d of draden.slice(0, 10)) {
    const context = [d.taskId && "taak", d.projectId && "project", d.clientId && "klant"].filter(Boolean).join("+") || "geen context";
    console.log(
      `     ${dag(d.askedAt)} ${d.level.padEnd(10)} ${d.answeredAt ? "🟢 beantwoord" : "🟡 open      "} · ${context} · msg ${d.telegramMessageId ?? "—"}`,
    );
    console.log(`        vraag: ${(d.question ?? "").slice(0, 70)}`);
    if (d.answer) console.log(`        antwoord: ${d.answer.slice(0, 70)}`);
  }

  const meldingen = await db.notification.groupBy({ by: ["level"], _count: true });
  const ongelezen = await db.notification.count({ where: { readAt: null } });
  const gepusht = await db.notification.count({ where: { pushedAt: { not: null } } });
  console.log(`\n  meldingen: ${meldingen.map((m) => `${m.level} ${m._count}`).join(" · ") || "geen"}`);
  console.log(`  ${ongelezen} ongelezen · ${gepusht} ook naar Telegram gestuurd`);

  // ── Overleg ──────────────────────────────────────────────────────────────
  kop("OCHTENDOVERLEG");
  const meetings = await db.meeting.findMany({
    orderBy: { date: "desc" },
    take: 5,
    include: { _count: { select: { entries: true, questions: true } } },
  });
  for (const m of meetings) {
    console.log(
      `  ${m.date.toISOString().slice(0, 10)} · ${m.status.padEnd(10)} · ${m._count.entries} inbreng · ` +
        `${m._count.questions} vragen · briefing ${m.summaryMd ? `${m.summaryMd.length} tekens` : "ONTBREEKT"}`,
    );
  }
  if (meetings.length === 0) console.log("  nog geen overleg gedraaid");

  // ── Goedkeuringen ────────────────────────────────────────────────────────
  kop("GOEDKEURINGEN");
  const app = await db.approval.findMany({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, status: true, kind: true, summary: true, agentId: true, decidedAt: true },
  });
  console.log(`  ${app.length} aanvragen`);
  for (const a of app.slice(0, 10)) {
    console.log(`     ${dag(a.createdAt)} ${a.status.padEnd(9)} ${naam(a.agentId).padEnd(9)} ${a.kind.padEnd(14)} ${a.summary.slice(0, 46)}`);
  }

  // ── Portaal ──────────────────────────────────────────────────────────────
  kop("KLANTPORTAAL");
  const aanvragen = await db.portalRequest.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      type: true, label: true, status: true, openedAt: true, submittedAt: true,
      supplementsId: true, missingFields: true, project: { select: { name: true } },
    },
  });
  console.log(`  ${aanvragen.length} links`);
  for (const a of aanvragen) {
    console.log(
      `     ${a.type.padEnd(18)} ${a.status.padEnd(11)} ${a.openedAt ? "geopend" : "       "} ${a.submittedAt ? "ingevuld" : "        "} ${a.project ? "→ project" : "         "} ${a.supplementsId ? "aanvulling" : ""} ${a.label ?? ""}`,
    );
  }

  const projecten = await db.project.findMany({
    select: { name: true, status: true, missingInfo: true, _count: { select: { tasks: true } } },
  });
  console.log("");
  for (const p of projecten) {
    console.log(`     ${p.status.padEnd(16)} ${String(p._count.tasks).padStart(2)} taken · ${p.missingInfo.length} gaten · ${p.name.slice(0, 40)}`);
  }

  // ── Facturen ─────────────────────────────────────────────────────────────
  kop("FACTUREN");
  const facturen = await db.invoice.findMany({
    orderBy: { issuedOn: "desc" },
    select: { number: true, clientName: true, amountEur: true, status: true, followUp: true, paidAt: true, clientId: true },
  });
  console.log(`  ${facturen.length} facturen`);
  for (const f of facturen.slice(0, 12)) {
    console.log(
      `     ${f.number.padEnd(14)} €${String(f.amountEur).padStart(9)} ${f.status.padEnd(14)} ${f.followUp.padEnd(12)} ${f.clientId ? "gekoppeld" : "LOS"} ${f.clientName.slice(0, 24)}`,
    );
  }

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
