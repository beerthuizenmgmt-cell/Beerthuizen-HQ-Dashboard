import Link from "next/link";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/access";
import { getAiStatus } from "@/lib/ai/provider";
import { getFinanceSettings, monthRange, providerBalance } from "@/lib/ai/cost";
import { dayKey, fromDayKey, startOfWeek, formatEuro } from "@/lib/format";

export const dynamic = "force-dynamic";

const euro = formatEuro;

const TRIGGER_LABELS: Record<string, string> = {
  manual: "Proefopdrachten",
  task: "Taken",
  message: "Gesprekken",
  standup: "Ochtendstandup",
  chief_cycle: "Ochtendcyclus",
  call: "Ochtendcall",
};

export default async function FinancePage() {
  await requireOwner();

  const { start: monthStart, end: monthEnd, label: monthLabel } = monthRange();
  const todayStart = fromDayKey(dayKey(new Date()));
  const weekStart = fromDayKey(startOfWeek(dayKey(new Date())));

  const [config, finance, balance] = await Promise.all([
    getAiStatus(),
    getFinanceSettings(),
    providerBalance(),
  ]);

  const spendWhere = { createdAt: { gte: monthStart, lt: monthEnd } };

  const [
    monthAgg,
    todayAgg,
    weekAgg,
    unknownCount,
    byAgent,
    byModel,
    byProvider,
    byTrigger,
    agents,
    valueEntries,
  ] = await Promise.all([
    db.agentRun.aggregate({
      where: spendWhere,
      _sum: { costEur: true, promptTokens: true, completionTokens: true },
      _count: true,
    }),
    db.agentRun.aggregate({ where: { createdAt: { gte: todayStart } }, _sum: { costEur: true }, _count: true }),
    db.agentRun.aggregate({ where: { createdAt: { gte: weekStart } }, _sum: { costEur: true }, _count: true }),
    db.agentRun.count({ where: { ...spendWhere, costKnown: false } }),
    db.agentRun.groupBy({
      by: ["agentId"],
      where: spendWhere,
      _sum: { costEur: true, promptTokens: true, completionTokens: true },
      _count: true,
    }),
    db.agentRun.groupBy({ by: ["model"], where: spendWhere, _sum: { costEur: true }, _count: true }),
    db.agentRun.groupBy({ by: ["provider"], where: spendWhere, _sum: { costEur: true }, _count: true }),
    db.agentRun.groupBy({ by: ["trigger"], where: spendWhere, _sum: { costEur: true }, _count: true }),
    db.agent.findMany({ select: { id: true, name: true, emoji: true, modelId: true, paused: true } }),
    db.valueEntry.findMany({ where: { date: { gte: monthStart, lt: monthEnd } } }),
  ]);

  // Gemiddelde kosten per taak: alleen runs die aan een taak hangen tellen mee,
  // anders vertekenen losse gesprekken het beeld.
  const taskRuns = await db.agentRun.groupBy({
    by: ["taskId"],
    where: { ...spendWhere, taskId: { not: null } },
    _sum: { costEur: true },
  });

  const agentById = new Map(agents.map((agent) => [agent.id, agent]));

  const spentMonth = monthAgg._sum.costEur ?? 0;
  const spentToday = todayAgg._sum.costEur ?? 0;
  const spentWeek = weekAgg._sum.costEur ?? 0;

  // Prognose op basis van het gemiddelde tot nu toe. Alleen zinvol als er al
  // een paar dagen gedraaid is.
  const now = new Date();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const dayOfMonth = now.getUTCDate();
  const forecast = dayOfMonth > 0 ? (spentMonth / dayOfMonth) * daysInMonth : 0;

  const budget = finance.monthlyBudgetEur;
  const usedPercentage = budget && budget > 0 ? (spentMonth / budget) * 100 : null;

  // Waarde: bevestigd telt mee, geschat staat er los naast.
  const confirmed = valueEntries.filter((entry) => entry.confirmedAt);
  const estimated = valueEntries.filter((entry) => !entry.confirmedAt);
  const sumHours = (entries: typeof valueEntries) =>
    entries.filter((entry) => entry.kind === "hours_saved").reduce((total, entry) => total + entry.amount, 0);
  const confirmedHours = sumHours(confirmed);
  const estimatedHours = sumHours(estimated);
  const confirmedValueEur = finance.hourlyRateEur ? confirmedHours * finance.hourlyRateEur : null;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">AI Finance</h1>
          <p className="mt-1 text-sm text-text-muted">
            {monthLabel} · aanbieder <strong>{config.provider}</strong> · standaardmodel{" "}
            <code className="font-mono text-xs">{config.defaultModel}</code>
          </p>
        </div>
        <Link href="/instellingen" className="btn btn-ghost">
          Budget en tarieven
        </Link>
      </header>

      {monthAgg._count === 0 && (
        <div className="card border-accent/30 bg-accent/5 p-5">
          <h2 className="text-sm font-semibold">Er is deze maand nog niets uitgegeven</h2>
          <p className="mt-1.5 text-sm text-text-muted">
            {config.connected
              ? "Er is een sleutel ingesteld, maar nog geen enkele agent heeft gedraaid. Doe een proefopdracht om de eerste cijfers te zien."
              : "Er is nog geen API-sleutel ingesteld, dus er kan nog niets draaien en er is €0 uitgegeven."}
          </p>
          <Link href="/proefdraaien" className="btn btn-primary mt-4">
            Proefdraaien
          </Link>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Deze maand" value={euro(spentMonth)} sub={`${monthAgg._count} aanroepen`} />
        <Stat label="Vandaag" value={euro(spentToday)} sub={`${todayAgg._count} aanroepen`} />
        <Stat label="Deze week" value={euro(spentWeek)} sub={`${weekAgg._count} aanroepen`} />
        <Stat
          label="Verwacht einde maand"
          value={euro(forecast)}
          sub={monthAgg._count === 0 ? "nog geen basis" : `op basis van ${dayOfMonth} dagen`}
          muted
        />
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="AI-aanroepen deze maand"
          value={monthAgg._count.toLocaleString("nl-NL")}
          sub={`${taskRuns.length} daarvan aan een taak gekoppeld`}
        />
        <Stat
          label="Invoertokens"
          value={(monthAgg._sum.promptTokens ?? 0).toLocaleString("nl-NL")}
          sub="wat de agents lazen"
        />
        <Stat
          label="Uitvoertokens"
          value={(monthAgg._sum.completionTokens ?? 0).toLocaleString("nl-NL")}
          sub="wat ze schreven"
        />
        <Stat
          label="Gemiddeld per taak"
          value={
            taskRuns.length
              ? euro(taskRuns.reduce((total, row) => total + (row._sum.costEur ?? 0), 0) / taskRuns.length)
              : "—"
          }
          sub={
            monthAgg._count > 0
              ? `${euro(spentMonth / monthAgg._count)} per aanroep`
              : "nog geen basis"
          }
        />
      </section>

      {balance.supported && balance.remaining !== undefined && (
        <div
          className={`card p-4 text-sm ${
            balance.remaining <= 0 ? "border-danger/40 bg-danger/5" : ""
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Saldo bij {config.provider}:{" "}
              <strong>${balance.remaining.toFixed(2)}</strong>
              <span className="text-text-faint">
                {" "}
                · ${(balance.used ?? 0).toFixed(2)} verbruikt
              </span>
            </span>
            {balance.remaining <= 0 && (
              <span className="chip text-danger">saldo op — agents kunnen niet draaien</span>
            )}
          </div>
          {balance.remaining <= 0 && (
            <p className="mt-2 text-xs text-text-muted">
              Dit is het saldo bij je aanbieder, niet je maandbudget hierboven. Waardeer je account op
              en alles werkt meteen weer — er is niets kapot en niets verloren.
            </p>
          )}
        </div>
      )}

      {unknownCount > 0 && (
        <div className="card border-warn/40 bg-warn/5 p-4 text-sm">
          <strong className="text-warn">{unknownCount} aanroepen zonder bekend bedrag.</strong> De
          aanbieder gaf geen kosten terug en er staat geen tarief voor dat model. Die aanroepen tellen
          niet mee in de bedragen hierboven — het werkelijke bedrag ligt dus hoger. Haal de tarieven op
          bij Instellingen om dit te sluiten.
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold">Budget</h2>
        {budget && budget > 0 ? (
          <div className="card p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-2xl font-semibold">{(usedPercentage ?? 0).toFixed(1)}%</p>
                <p className="text-xs text-text-muted">
                  {euro(spentMonth)} van {euro(budget)} · nog {euro(Math.max(budget - spentMonth, 0))} over
                </p>
              </div>
              <span
                className="chip"
                style={{
                  color:
                    (usedPercentage ?? 0) >= 90
                      ? "var(--danger)"
                      : (usedPercentage ?? 0) >= 75
                        ? "var(--warn)"
                        : "var(--ok)",
                }}
              >
                {(usedPercentage ?? 0) >= 100
                  ? "budget op"
                  : (usedPercentage ?? 0) >= 90
                    ? "bijna op"
                    : "binnen budget"}
              </span>
            </div>

            <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-bg-elevated">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(usedPercentage ?? 0, 100)}%`,
                  background:
                    (usedPercentage ?? 0) >= 90
                      ? "var(--danger)"
                      : (usedPercentage ?? 0) >= 75
                        ? "var(--warn)"
                        : "var(--ok)",
                }}
              />
              {[50, 75, 90].map((mark) => (
                <span
                  key={mark}
                  className="absolute top-0 h-full w-px bg-bg"
                  style={{ left: `${mark}%` }}
                  title={`${mark}%`}
                />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-text-faint">
              Je krijgt een melding bij 50, 75, 90 en 100 procent. Vanaf 90 procent ook via Telegram.
            </p>
          </div>
        ) : (
          <div className="card p-5 text-sm text-text-muted">
            Er is nog geen maandbudget ingesteld, dus er wordt ook nergens voor gewaarschuwd.{" "}
            <Link href="/instellingen" className="underline">
              Stel er een in
            </Link>
            .
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Breakdown
          title="Per agent"
          rows={byAgent
            .map((row) => {
              const agent = agentById.get(row.agentId);
              return {
                key: row.agentId,
                label: `${agent?.emoji ?? "◉"} ${agent?.name ?? "onbekend"}`,
                note: agent?.modelId ?? "standaardmodel",
                count: row._count,
                amount: row._sum.costEur ?? 0,
              };
            })
            .sort((a, b) => b.amount - a.amount)}
          total={spentMonth}
        />

        <Breakdown
          title="Per model"
          rows={byModel
            .map((row) => ({
              key: row.model,
              label: row.model,
              note: "",
              count: row._count,
              amount: row._sum.costEur ?? 0,
            }))
            .sort((a, b) => b.amount - a.amount)}
          total={spentMonth}
          mono
        />

        <Breakdown
          title="Per aanbieder"
          rows={byProvider
            .map((row) => ({
              key: row.provider,
              label: row.provider,
              note: "",
              count: row._count,
              amount: row._sum.costEur ?? 0,
            }))
            .sort((a, b) => b.amount - a.amount)}
          total={spentMonth}
        />

        <Breakdown
          title="Per type activiteit"
          rows={byTrigger
            .map((row) => ({
              key: row.trigger,
              label: TRIGGER_LABELS[row.trigger] ?? row.trigger,
              note: "",
              count: row._count,
              amount: row._sum.costEur ?? 0,
            }))
            .sort((a, b) => b.amount - a.amount)}
          total={spentMonth}
        />
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold">Kosten tegenover waarde</h2>
        <p className="mb-3 text-xs text-text-muted">
          Links wat je écht betaalt. Rechts wat het oplevert — en alleen wat jij hebt bevestigd telt
          als waarde. Schattingen van agents staan er apart onder en tellen nergens in mee.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="card p-5">
            <p className="text-xs text-text-faint">AI-kosten deze maand</p>
            <p className="mt-1 text-2xl font-semibold">{euro(spentMonth)}</p>
            <p className="mt-1 text-xs text-text-muted">
              {monthAgg._count} aanroepen · gemeten, niet geschat
            </p>
          </div>

          <div className="card p-5">
            <p className="text-xs text-text-faint">Bevestigde waarde</p>
            <p className="mt-1 text-2xl font-semibold">
              {confirmedValueEur !== null ? euro(confirmedValueEur) : `${confirmedHours} uur`}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {confirmedHours} uur bespaard, door jou bevestigd
              {finance.hourlyRateEur
                ? ` · gerekend met ${euro(finance.hourlyRateEur)} per uur`
                : " · stel een uurtarief in om dit in euro's te zien"}
            </p>
            {estimatedHours > 0 && (
              <p className="mt-2 border-t border-border pt-2 text-xs text-warn">
                Daarnaast {estimatedHours} uur ingeschat door agents, nog niet bevestigd. Telt niet mee.
              </p>
            )}
          </div>
        </div>

        {valueEntries.length === 0 && (
          <p className="mt-3 text-xs text-text-faint">
            Nog geen waarderegels. Die ontstaan zodra agents besparingen voorstellen of jij ze zelf
            invoert — er wordt niets automatisch verzonnen.
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  muted = false,
}: {
  label: string;
  value: string;
  sub?: string;
  muted?: boolean;
}) {
  return (
    <div className="card p-4">
      <p className={`text-xl font-semibold ${muted ? "text-text-muted" : ""}`}>{value}</p>
      <p className="mt-0.5 text-xs text-text-muted">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-text-faint">{sub}</p>}
    </div>
  );
}

function Breakdown({
  title,
  rows,
  total,
  mono = false,
}: {
  title: string;
  rows: { key: string; label: string; note: string; count: number; amount: number }[];
  total: number;
  mono?: boolean;
}) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <div className="card divide-y divide-border">
        {rows.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-text-faint">Nog geen gegevens.</p>
        )}
        {rows.map((row) => (
          <div key={row.key} className="px-4 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className={`truncate text-sm ${mono ? "font-mono text-xs" : ""}`}>{row.label}</span>
              <span className="shrink-0 text-sm font-medium">{euro(row.amount)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-bg-elevated">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: total > 0 ? `${(row.amount / total) * 100}%` : "0%" }}
                />
              </div>
              <span className="shrink-0 text-[11px] text-text-faint">
                {row.count}× {row.note && `· ${row.note}`}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
