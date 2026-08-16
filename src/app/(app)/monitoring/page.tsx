import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { MonitoringPanel } from "@/components/monitoring-panel";
import { getLastReport } from "@/lib/ai/head";
import { formatDateTime, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MonitoringPage() {
  await requireUser();

  const [watches, runs, insights, lastReport, signalAgents] = await Promise.all([
    db.agentWatch.findMany({
      orderBy: { key: "asc" },
      include: { agent: { select: { name: true, emoji: true, paused: true } } },
    }),
    db.agentRun.findMany({
      where: { trigger: { in: ["watch", "chief_cycle"] } },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { agent: { select: { name: true, emoji: true } } },
    }),
    db.agentInsight.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { agent: { select: { name: true, emoji: true } } },
    }),
    getLastReport(),
    db.agent.findMany({
      where: { adapterType: "builtin" },
      orderBy: { sortOrder: "asc" },
      select: { key: true, name: true, emoji: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Monitoring</h1>
        <p className="mt-1 text-sm text-text-muted">
          Agents worden alleen wakker als er iets veranderd is. Zolang de vingerafdruk van de data
          gelijk blijft, gebeurt er niets en kost het niets.
        </p>
      </header>

      <MonitoringPanel hasWatches={watches.length > 0} signalAgents={signalAgents} />

      <section>
        <h2 className="mb-3 text-sm font-semibold">Bewaakte onderwerpen</h2>
        {watches.length === 0 ? (
          <div className="card p-6 text-center text-sm text-text-muted">
            Detectie staat nog uit. Zet hem aan met de knop hierboven — daarna wordt er per onderwerp
            bijgehouden wanneer de data veranderde en wanneer er voor het laatst naar gekeken is.
          </div>
        ) : (
          <div className="space-y-2">
            {watches.map((watch) => {
              const pendingChange = Boolean(watch.dataHash && watch.dataHash !== watch.analyzedHash);
              return (
                <article key={watch.id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {watch.label}{" "}
                        <span className="font-normal text-text-faint">
                          — {watch.agent.emoji ?? ""} {watch.agent.name}
                          {watch.agent.paused && " (op pauze)"}
                        </span>
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-text-faint">
                        probe: {watch.probe} · versie {watch.dataVersion}
                      </p>
                    </div>
                    <span
                      className="chip"
                      style={{
                        color: pendingChange
                          ? "var(--warn)"
                          : watch.lastAnalyzedAt
                            ? "var(--ok)"
                            : "var(--text-faint)",
                      }}
                    >
                      {pendingChange ? "wijziging wacht" : watch.lastAnalyzedAt ? "actueel" : "nog niet bekeken"}
                    </span>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-xs sm:grid-cols-4">
                    <div>
                      <dt className="text-text-faint">Data gewijzigd</dt>
                      <dd>{watch.lastDataChangeAt ? timeAgo(watch.lastDataChangeAt) : "nooit"}</dd>
                    </div>
                    <div>
                      <dt className="text-text-faint">Laatst geanalyseerd</dt>
                      <dd>{watch.lastAnalyzedAt ? timeAgo(watch.lastAnalyzedAt) : "nooit"}</dd>
                    </div>
                    <div>
                      <dt className="text-text-faint">Weer toegestaan</dt>
                      <dd>
                        {watch.nextEligibleAt ? formatDateTime(watch.nextEligibleAt) : "direct"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-text-faint">Minimuminterval</dt>
                      <dd>{watch.minIntervalMinutes} min</dd>
                    </div>
                  </dl>

                  {watch.lastReason && (
                    <p className="mt-2 text-xs text-text-muted">
                      <span className="text-text-faint">Reden laatste beslissing:</span> {watch.lastReason}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {insights.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">Opgeslagen inzichten</h2>
          <div className="card divide-y divide-border">
            {insights.map((insight) => (
              <div key={insight.id} className="px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-text-faint">
                  <span className="font-medium text-text-muted">
                    {insight.agent.emoji ?? ""} {insight.agent.name}
                  </span>
                  <span className="chip px-1.5 py-0 text-[10px]">{insight.relevance}</span>
                  <span className="ml-auto">
                    {insight.reportedAt ? "in rapport verwerkt" : "nog niet gerapporteerd"} ·{" "}
                    {timeAgo(insight.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium">{insight.title}</p>
                <p className="mt-0.5 line-clamp-3 text-sm text-text-muted">{insight.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold">Activeringen</h2>
        <div className="card divide-y divide-border">
          {runs.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-text-faint">
              Nog geen agent geactiveerd door detectie.
            </p>
          )}
          {runs.map((run) => (
            <div key={run.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium">
                  {run.agent.emoji ?? ""} {run.agent.name}
                </span>
                <span className="chip px-1.5 py-0 text-[10px]">{run.trigger}</span>
                <code className="font-mono text-[10px] text-text-faint">{run.model}</code>
                <span className="ml-auto text-text-faint">{formatDateTime(run.createdAt)}</span>
              </div>
              {run.reason && <p className="mt-1 text-xs text-text-muted">{run.reason}</p>}
              <p className="mt-1 text-[11px] text-text-faint">
                {run.promptTokens.toLocaleString("nl-NL")} in ·{" "}
                {run.completionTokens.toLocaleString("nl-NL")} uit ·{" "}
                {run.costKnown ? `€${run.costEur.toFixed(4)}` : "kosten onbekend"} ·{" "}
                {(run.durationMs / 1000).toFixed(1)}s · {run.ok ? "geslaagd" : `fout: ${run.error}`}
              </p>
            </div>
          ))}
        </div>
      </section>

      {lastReport && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Laatste ochtendrapport</h2>
          <div className="card p-5">
            <p className="mb-3 text-xs text-text-faint">
              {formatDateTime(lastReport.at)} ·{" "}
              {lastReport.usedAi ? "met AI-aanroep" : "zonder AI-aanroep — er was niets nieuws"}
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{lastReport.text}</p>
          </div>
        </section>
      )}
    </div>
  );
}
