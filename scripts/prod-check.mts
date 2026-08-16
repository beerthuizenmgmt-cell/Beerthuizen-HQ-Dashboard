// Leest de productiedatabase uit en meldt wat er staat en wat ontbreekt.
//
//   npx dotenv -e .env.production -- npx tsx scripts/prod-check.mts
//
// Toont nooit een geheime waarde — alleen of hij aanwezig is.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDirectUrl } from "../src/lib/db-url";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDirectUrl()!)) });

async function main() {
  const [users, agents, tasks, runs, approvals, notifications] = await Promise.all([
    db.user.findMany({ select: { email: true, name: true, role: true } }),
    db.agent.count(),
    db.task.count(),
    db.agentRun.count(),
    db.approval.count({ where: { status: "pending" } }),
    db.notification.count({ where: { readAt: null } }),
  ]);

  console.log("ACCOUNTS");
  for (const u of users) console.log(`  ${u.role.padEnd(7)} ${u.name} — ${u.email}`);

  console.log(`\nINHOUD\n  agents ${agents} · taken ${tasks} · AI-runs ${runs}`);
  console.log(`  openstaande goedkeuringen ${approvals} · ongelezen meldingen ${notifications}`);

  const recent = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { action: true, detail: true, createdAt: true },
  });
  console.log("\nLAATSTE HANDELINGEN");
  for (const a of recent) {
    console.log(`  ${a.createdAt.toISOString().slice(0, 16)}  ${a.action.padEnd(8)} ${a.detail ?? ""}`);
  }

  // Instellingen staan als JSON-blok per onderwerp. Geheimen zijn versleuteld;
  // we melden alleen of ze ingevuld zijn, nooit wat erin staat.
  const blokken = await db.setting.findMany({ where: { key: { in: ["ai", "telegram"] } } });
  const lees = (key: string) =>
    (blokken.find((s) => s.key === key)?.value ?? {}) as Record<string, unknown>;

  const ai = lees("ai");
  const telegram = lees("telegram");

  console.log("\nINSTELLINGEN");
  console.log(`  ${ai.apiKey ? "✓" : "✗"} OpenRouter-sleutel${ai.apiKey ? "" : "  — zelf invoeren via Instellingen → AI"}`);
  console.log(`  ${telegram.botToken ? "✓" : "✗"} Telegram-bottoken${telegram.botToken ? "" : "  — zelf invoeren via Instellingen → Telegram"}`);
  console.log(`  aanbieder ${ai.provider ?? "—"} · model ${ai.defaultModel ?? "—"}`);

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
