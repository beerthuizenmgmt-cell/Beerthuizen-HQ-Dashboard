import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { TaskForm } from "@/components/task-form";
import { getAdapter } from "@/lib/adapters";
import { timeAgo } from "@/lib/format";
import { AgentAvatar } from "@/components/agent-avatar";
import type { TaskPriority, TaskStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "inbox", label: "Inbox" },
  { status: "assigned", label: "Toegewezen" },
  { status: "in_progress", label: "Bezig" },
  { status: "blocked", label: "Vastgelopen" },
  { status: "review", label: "Ter controle" },
  { status: "done", label: "Klaar" },
];

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low: "var(--text-faint)",
  normal: "var(--info)",
  high: "var(--warn)",
  urgent: "var(--danger)",
};

export default async function TasksPage() {
  await requireUser();

  const [tasks, agents] = await Promise.all([
    db.task.findMany({
      where: { status: { not: "cancelled" } },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      include: { agent: { select: { name: true, emoji: true, color: true, avatarUrl: true } } },
    }),
    db.agent.findMany({
      where: { paused: false },
      orderBy: [{ isChief: "desc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, emoji: true, adapterType: true },
    }),
  ]);

  const open = tasks.filter((task) => task.status !== "done").length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Taken</h1>
          <p className="mt-1 text-sm text-text-muted">
            {open} open · {tasks.length - open} afgerond
          </p>
        </div>
        <TaskForm
          agents={agents.map((agent) => ({
            id: agent.id,
            name: agent.name,
            emoji: agent.emoji,
            canReceive: getAdapter(agent.adapterType).capabilities.send,
          }))}
        />
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {COLUMNS.map((column) => {
          const columnTasks = tasks.filter((task) => task.status === column.status);
          return (
            <section key={column.status} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-semibold tracking-wide text-text-muted uppercase">
                  {column.label}
                </h2>
                <span className="text-xs text-text-faint">{columnTasks.length}</span>
              </div>

              <div className="space-y-2">
                {columnTasks.length === 0 && (
                  <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-text-faint">
                    leeg
                  </p>
                )}

                {columnTasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/taken/${task.id}`}
                    className="card block p-3 transition-colors hover:bg-surface-hover"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: PRIORITY_COLOR[task.priority] }}
                        title={task.priority}
                      />
                      <p className="flex-1 text-sm leading-snug font-medium">{task.title}</p>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-text-faint">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {task.agent ? (
                          <>
                            <AgentAvatar agent={task.agent} size="xs" />
                            <span className="truncate">{task.agent.name}</span>
                          </>
                        ) : (
                          <span className="truncate">niemand</span>
                        )}
                      </span>
                      <span className="shrink-0">{timeAgo(task.updatedAt)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
