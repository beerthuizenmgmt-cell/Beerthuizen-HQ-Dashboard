import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { meetingDate } from "@/lib/standup";
import { startCall } from "@/lib/actions/call";
import { CallRoom } from "@/components/call-room";
import { formatDayLong, formatDateTime } from "@/lib/format";
import { AgentAvatar } from "@/components/agent-avatar";

export const dynamic = "force-dynamic";

export default async function CallPage() {
  await requireUser();

  const date = meetingDate();
  const meeting = await db.meeting.findUnique({
    where: { date },
    include: {
      questions: {
        orderBy: { sortOrder: "asc" },
        include: { agent: { select: { id: true, name: true, emoji: true, color: true, avatarUrl: true } } },
      },
      entries: {
        orderBy: { agent: { sortOrder: "asc" } },
        include: { agent: { select: { name: true, emoji: true, avatarUrl: true } } },
      },
    },
  });

  if (!meeting) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Ochtendcall</h1>
        <div className="card p-8">
          <p className="text-sm text-text-muted">
            Er staat vandaag nog geen overleg klaar. Het team wordt om 09:45 uitgevraagd, zodat om 10:00
            alles er ligt.
          </p>
          <Link href="/overleg" className="btn btn-primary mt-5">
            Naar het overleg
          </Link>
        </div>
      </div>
    );
  }

  const planning = meeting.entries.filter((entry) => entry.receivedAt && entry.today);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Ochtendcall</h1>
          <p className="mt-1 text-sm text-text-muted">
            {formatDayLong(date)}
            {meeting.callStartedAt && ` · begonnen om ${formatDateTime(meeting.callStartedAt)}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/overleg" className="btn btn-ghost">
            Briefing lezen
          </Link>
          {!meeting.callStartedAt && (
            <form action={startCall}>
              <button type="submit" className="btn btn-primary">
                Call starten
              </button>
            </form>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <CallRoom
          questions={meeting.questions.map((question) => ({
            id: question.id,
            body: question.body,
            answer: question.answer,
            answered: Boolean(question.answeredAt),
            skipped: Boolean(question.skippedAt),
            deliveryError: question.deliveryError,
            agent: question.agent,
          }))}
        />

        <aside className="space-y-4">
          <section>
            <h2 className="mb-2 text-sm font-semibold">De planning van vandaag</h2>
            <div className="card divide-y divide-border">
              {planning.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-text-faint">
                  Nog niemand heeft doorgegeven wat hij vandaag oppakt.
                </p>
              )}
              {planning.map((entry) => (
                <div key={entry.id} className="px-4 py-3">
                  <p className="text-xs font-medium text-text-muted">
                    <AgentAvatar agent={entry.agent} size="xs" /> {entry.agent.name}
                  </p>
                  <p className="mt-1 text-sm leading-snug">{entry.today}</p>
                  {entry.blockers && (
                    <p className="mt-1.5 text-xs text-warn">Loopt vast: {entry.blockers}</p>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold">Al beantwoord</h2>
            <div className="card divide-y divide-border">
              {meeting.questions.filter((q) => q.answeredAt).length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-text-faint">Nog niets.</p>
              )}
              {meeting.questions
                .filter((question) => question.answeredAt)
                .map((question) => (
                  <div key={question.id} className="px-4 py-3">
                    <p className="text-xs text-text-faint">
                      <AgentAvatar agent={question.agent} size="xs" /> {question.agent.name}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{question.body}</p>
                    <p className="mt-1 line-clamp-3 text-sm">{question.answer}</p>
                    {question.deliveryError && (
                      <p className="mt-1 text-xs text-warn">Niet bezorgd: {question.deliveryError}</p>
                    )}
                  </div>
                ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
