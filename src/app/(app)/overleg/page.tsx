import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { meetingDate } from "@/lib/standup";
import { getAdapter } from "@/lib/adapters";
import { StandupControls } from "@/components/standup-controls";
import { closeMeeting, refreshSummary, taskFromBlocker } from "@/lib/actions/standup";
import { formatDayLong, formatDateTime } from "@/lib/format";
import { AgentAvatar } from "@/components/agent-avatar";

export const dynamic = "force-dynamic";

// Het overleg bevraagt negen agents. Ze werken parallel, maar de traagste
// bepaalt de duur en dat is meer dan de zestig seconden die Vercel een server
// action standaard geeft.
export const maxDuration = 300;

const NO_BLOCKER = /^(geen|nee|niets|n\.?v\.?t\.?|-)$/i;

export default async function StandupPage() {
  await requireUser();

  const date = meetingDate();
  const [meeting, agents] = await Promise.all([
    db.meeting.findUnique({
      where: { date },
      include: {
        entries: {
          orderBy: { agent: { sortOrder: "asc" } },
          include: { agent: { select: { id: true, name: true, emoji: true, color: true, avatarUrl: true } } },
        },
        questions: { select: { answeredAt: true, skippedAt: true } },
      },
    }),
    db.agent.findMany({ where: { paused: false }, select: { adapterType: true } }),
  ]);

  const openQuestions =
    meeting?.questions.filter((question) => !question.answeredAt && !question.skippedAt).length ?? 0;

  const reachable = agents.filter((agent) => getAdapter(agent.adapterType).capabilities.send).length;
  const received = meeting?.entries.filter((entry) => entry.receivedAt) ?? [];
  const waiting = meeting?.entries.filter((entry) => !entry.receivedAt) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Ochtendoverleg</h1>
          <p className="mt-1 text-sm text-text-muted">
            {formatDayLong(date)}
            {meeting && ` · ${received.length} van ${meeting.entries.length} gerapporteerd`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {meeting && (
            <Link href="/overleg/call" className="btn btn-primary">
              {openQuestions > 0 ? `Naar de call · ${openQuestions} vragen` : "Naar de call"}
            </Link>
          )}
          <StandupControls hasMeeting={Boolean(meeting)} reachable={reachable} />
        </div>
      </header>

      {openQuestions > 0 && (
        <div className="card border-accent/30 bg-accent/5 p-4">
          <p className="text-sm">
            Het team heeft <strong>{openQuestions} vraag/vragen</strong> voor je liggen. In de call loop
            je ze één voor één af en spreek je je antwoord in.
          </p>
        </div>
      )}

      {!meeting && (
        <div className="card p-6 text-center">
          <p className="text-sm text-text-muted">
            Het overleg van vandaag is nog niet gestart.
            {reachable === 0
              ? " Koppel eerst een agent — zonder verbinding kan er niemand rapporteren."
              : " Elke werkdag om 08:00 gebeurt dit automatisch; je kunt het ook nu starten."}
          </p>
        </div>
      )}

      {meeting?.summaryMd && (
        <section className="card-cream p-6">
          <p className="eyebrow-rule start">De korte versie</p>
          <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap">{meeting.summaryMd}</p>
        </section>
      )}

      {meeting && (
        <>
          {received.length > 0 && (
            <section className="space-y-3">
              <h2 className="eyebrow-rule start">Wat het team meldt</h2>

              {received.map((entry) => {
                const hasBlocker = entry.blockers && !NO_BLOCKER.test(entry.blockers.trim());

                return (
                  <article key={entry.id} className="card p-4">
                    <div className="flex items-center gap-2.5">
                      <AgentAvatar agent={entry.agent} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{entry.agent.name}</p>
                        <p className="text-[11px] text-text-faint">
                          {entry.receivedAt && formatDateTime(entry.receivedAt)}
                        </p>
                      </div>
                    </div>

                    <dl className="mt-3 space-y-2 text-sm">
                      <div>
                        <dt className="text-xs text-text-faint">Gisteren</dt>
                        <dd className="leading-snug">{entry.yesterday ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-text-faint">Vandaag</dt>
                        <dd className="leading-snug">{entry.today ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-text-faint">Blokkades</dt>
                        <dd className={`leading-snug ${hasBlocker ? "text-warn" : ""}`}>
                          {entry.blockers ?? "—"}
                        </dd>
                      </div>
                    </dl>

                    {hasBlocker &&
                      (entry.taskId ? (
                        <Link
                          href={`/taken/${entry.taskId}`}
                          className="mt-3 inline-block text-xs text-text-muted hover:text-text"
                        >
                          ✓ Staat op het takenbord
                        </Link>
                      ) : (
                        <form action={taskFromBlocker.bind(null, entry.id)} className="mt-3">
                          <button type="submit" className="btn btn-ghost text-xs">
                            Maak hier een taak van
                          </button>
                        </form>
                      ))}

                    {entry.rawReply && entry.yesterday === null && entry.today === null && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs text-text-faint">
                          Antwoord kon niet worden opgedeeld — toon origineel
                        </summary>
                        <p className="mt-2 text-sm whitespace-pre-wrap">{entry.rawReply}</p>
                      </details>
                    )}
                  </article>
                );
              })}
            </section>
          )}

          {waiting.length > 0 && (
            <section>
              <h2 className="eyebrow-rule start mb-2">Nog niet gereageerd</h2>
              <div className="card divide-y divide-border">
                {waiting.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <AgentAvatar agent={entry.agent} size="xs" />
                    <span className="flex-1">{entry.agent.name}</span>
                    <span className={`text-xs ${entry.error ? "text-danger" : "text-text-faint"}`}>
                      {entry.error ?? "wachten op antwoord"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-xs text-text-muted">
              {meeting.status === "closed"
                ? "Dit overleg is afgesloten."
                : "Samenvatting bijwerken of het overleg afsluiten."}
            </p>
            {/* Zonder wrap staken deze twee knoppen samen veertien pixels
                buiten een telefoonscherm, en schoof de hele pagina zijwaarts. */}
            <div className="flex flex-wrap gap-2">
              <form action={refreshSummary.bind(null, meeting.id)}>
                <button type="submit" className="btn btn-ghost text-xs" disabled={received.length === 0}>
                  Samenvatting bijwerken
                </button>
              </form>
              {meeting.status !== "closed" && (
                <form action={closeMeeting.bind(null, meeting.id)}>
                  <button type="submit" className="btn btn-ghost text-xs">
                    Overleg afsluiten
                  </button>
                </form>
              )}
            </div>
          </section>
        </>
      )}

      <p className="text-center text-xs text-text-faint">
        Blokkades worden taken op het <Link href="/taken" className="underline">takenbord</Link>.
      </p>
    </div>
  );
}
