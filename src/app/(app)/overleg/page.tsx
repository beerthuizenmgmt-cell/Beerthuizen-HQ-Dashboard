import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { meetingDate } from "@/lib/standup";
import { getAdapter } from "@/lib/adapters";
import { StandupControls } from "@/components/standup-controls";
import { closeMeeting, refreshSummary, taskFromBlocker } from "@/lib/actions/standup";
import { formatDayLong, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

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
          include: { agent: { select: { id: true, name: true, emoji: true, color: true } } },
        },
      },
    }),
    db.agent.findMany({ where: { paused: false }, select: { adapterType: true } }),
  ]);

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
        <StandupControls hasMeeting={Boolean(meeting)} reachable={reachable} />
      </header>

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
        <section className="card border-accent/30 bg-accent/5 p-5">
          <h2 className="mb-2 text-sm font-semibold">De korte versie</h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{meeting.summaryMd}</p>
        </section>
      )}

      {meeting && (
        <>
          {received.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">Wat het team meldt</h2>

              {received.map((entry) => {
                const accent = entry.agent.color ?? "#6366f1";
                const hasBlocker = entry.blockers && !NO_BLOCKER.test(entry.blockers.trim());

                return (
                  <article key={entry.id} className="card p-4">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-base"
                        style={{ background: `color-mix(in srgb, ${accent} 18%, transparent)` }}
                      >
                        {entry.agent.emoji ?? "◉"}
                      </span>
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

                    {hasBlocker && (
                      <form action={taskFromBlocker.bind(null, entry.id)} className="mt-3">
                        <button type="submit" className="btn btn-ghost text-xs">
                          Maak hier een taak van
                        </button>
                      </form>
                    )}

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
              <h2 className="mb-2 text-sm font-semibold">Nog niet gereageerd</h2>
              <div className="card divide-y divide-border">
                {waiting.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span>{entry.agent.emoji ?? "◉"}</span>
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
            <div className="flex gap-2">
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
