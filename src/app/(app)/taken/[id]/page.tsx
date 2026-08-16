import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getAdapter } from "@/lib/adapters";
import { TaskActions } from "@/components/task-actions";
import { TaskComment } from "@/components/task-comment";
import { formatDateTime, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  inbox: "Inbox",
  assigned: "Toegewezen",
  in_progress: "Bezig",
  blocked: "Vastgelopen",
  review: "Ter controle",
  done: "Klaar",
  cancelled: "Geannuleerd",
};

const KIND_LABEL: Record<string, string> = {
  comment: "notitie",
  status: "status",
  result: "resultaat",
  dispatch: "verstuurd",
  error: "fout",
};

export default async function TaskDetailPage({ params }: PageProps<"/taken/[id]">) {
  await requireUser();
  const { id } = await params;

  const [task, agents] = await Promise.all([
    db.task.findUnique({
      where: { id },
      include: {
        agent: true,
        createdByUser: { select: { name: true } },
        updates: {
          orderBy: { createdAt: "asc" },
          include: {
            authorUser: { select: { name: true } },
            authorAgent: { select: { name: true, emoji: true } },
          },
        },
      },
    }),
    db.agent.findMany({
      where: { paused: false },
      orderBy: [{ isChief: "desc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, emoji: true },
    }),
  ]);

  if (!task) notFound();

  const canSend = task.agent ? getAdapter(task.agent.adapterType).capabilities.send : false;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <Link href="/taken" className="text-xs text-text-muted hover:text-text">
          ← Taken
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{task.title}</h1>
        <p className="mt-1 text-sm text-text-muted">
          {STATUS_LABEL[task.status]} · aangemaakt door {task.createdByUser?.name ?? "systeem"}{" "}
          {timeAgo(task.createdAt)}
          {task.dueAt && ` · deadline ${task.dueAt.toLocaleDateString("nl-NL")}`}
        </p>
      </header>

      {task.description && (
        <div className="card p-5">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{task.description}</p>
        </div>
      )}

      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold">Uitbesteden</h2>
        <TaskActions
          taskId={task.id}
          status={task.status}
          agentId={task.agentId}
          agents={agents}
          canSend={canSend}
        />
        {task.dispatchedAt && (
          <p className="mt-3 border-t border-border pt-3 text-xs text-text-faint">
            Laatst verstuurd {timeAgo(task.dispatchedAt)}
          </p>
        )}
      </section>

      {task.result && (
        <section className="card border-ok/30 p-5">
          <h2 className="mb-2 text-sm font-semibold text-ok">Resultaat</h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{task.result}</p>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold">Verloop</h2>
        <div className="card divide-y divide-border">
          {task.updates.map((update) => (
            <div key={update.id} className="px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-text-faint">
                <span className="font-medium text-text-muted">
                  {update.authorAgent
                    ? `${update.authorAgent.emoji ?? ""} ${update.authorAgent.name}`
                    : (update.authorUser?.name ?? "Systeem")}
                </span>
                <span className="chip px-1.5 py-0 text-[10px]">{KIND_LABEL[update.kind] ?? update.kind}</span>
                <span className="ml-auto">{formatDateTime(update.createdAt)}</span>
              </div>
              <p className="mt-1.5 text-sm leading-snug whitespace-pre-wrap">{update.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-3">
          <TaskComment taskId={task.id} />
        </div>
      </section>
    </div>
  );
}
