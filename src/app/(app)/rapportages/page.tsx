import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { AgentAvatar } from "@/components/agent-avatar";
import { getLastReport } from "@/lib/ai/head";
import { formatDateTime, formatDayLong, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

const RELEVANCE_COLOR: Record<string, string> = {
  high: "var(--danger)",
  medium: "var(--warn)",
  low: "var(--text-faint)",
};

/// Wat het team heeft opgeleverd: het laatste ochtendrapport, de samenvattingen
/// van eerdere overleggen en de inzichten van de agents.
export default async function ReportsPage() {
  await requireUser();

  const [lastReport, meetings, insights] = await Promise.all([
    getLastReport(),
    db.meeting.findMany({
      where: { summaryMd: { not: null } },
      orderBy: { date: "desc" },
      take: 14,
      include: { _count: { select: { entries: true, questions: true } } },
    }),
    db.agentInsight.findMany({
      orderBy: [{ relevance: "desc" }, { createdAt: "desc" }],
      take: 20,
      include: { agent: { select: { name: true, emoji: true, color: true, avatarUrl: true } } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl">Rapportages</h1>
        <p className="mt-1 text-sm text-text-muted">
          Wat het team heeft opgeleverd: het ochtendrapport, eerdere overleggen en de inzichten van de
          agents.
        </p>
      </header>

      {lastReport ? (
        <section className="card-cream p-6">
          <p className="eyebrow-rule start">Laatste ochtendrapport</p>
          <p className="muted mt-2 text-xs">
            {formatDateTime(lastReport.at)}
            {lastReport.usedAi ? "" : " · zonder AI-aanroep, er was niets nieuws"}
          </p>
          <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap">{lastReport.text}</p>
        </section>
      ) : (
        <div className="card p-6">
          <p className="text-sm text-text-muted">
            Er is nog geen ochtendrapport gemaakt. Dat gebeurt elke werkdag automatisch zodra het
            dashboard online staat.
          </p>
        </div>
      )}

      <section>
        <h2 className="eyebrow-rule start mb-3">Inzichten van de agents</h2>
        <div className="card divide-y divide-border">
          {insights.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-text-faint">
              Nog geen inzichten. Die ontstaan zodra een agent iets opmerkt dat de moeite waard is.
            </p>
          )}
          {insights.map((insight) => (
            <div key={insight.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-text-faint">
                <AgentAvatar agent={insight.agent} size="xs" />
                <span className="font-medium text-text-muted">{insight.agent.name}</span>
                <span
                  className="chip px-1.5 py-0 text-[10px]"
                  style={{ color: RELEVANCE_COLOR[insight.relevance] }}
                >
                  {insight.relevance === "high"
                    ? "hoog"
                    : insight.relevance === "medium"
                      ? "gemiddeld"
                      : "laag"}
                </span>
                <span className="ml-auto">{timeAgo(insight.createdAt)}</span>
              </div>
              <p className="mt-1 text-sm font-semibold">{insight.title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-text-muted">{insight.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="eyebrow-rule start mb-3">Eerdere overleggen</h2>
        <div className="card divide-y divide-border">
          {meetings.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-text-faint">
              Nog geen samenvattingen van overleggen.
            </p>
          )}
          {meetings.map((meeting) => (
            <div key={meeting.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-2 text-xs text-text-faint">
                <span className="font-medium text-text-muted">{formatDayLong(meeting.date)}</span>
                <span>
                  {meeting._count.entries} rapportages · {meeting._count.questions} vragen
                </span>
              </div>
              <p className="mt-1 line-clamp-3 text-sm leading-relaxed">{meeting.summaryMd}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
