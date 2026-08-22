"use client";

import Link from "next/link";
import { useState } from "react";
import { moveTaskToDay, planOnDay, type QuickPlanState } from "@/lib/actions/agenda";
import { useActionState } from "react";
import { useActie } from "@/components/use-actie";
import { ActieFout } from "@/components/actie-fout";

export type AgendaTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  done: boolean;
  agent: { name: string; emoji: string | null; color: string | null } | null;
};

export type AgendaDay = {
  key: string;
  label: { short: string; day: string; month: string };
  isToday: boolean;
  isWeekend: boolean;
  hasMeeting: boolean;
  callDone: boolean;
  tasks: AgendaTask[];
  activities: { agent: string; emoji: string | null; text: string; blocked: string | null }[];
};

const PRIORITY_COLOR: Record<string, string> = {
  low: "var(--text-faint)",
  normal: "var(--info)",
  high: "var(--warn)",
  urgent: "var(--danger)",
};

export function WeekBoard({
  days,
  unplanned,
  agents,
}: {
  days: AgendaDay[];
  unplanned: AgendaTask[];
  agents: { id: string; name: string; emoji: string | null }[];
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const { doe, fout } = useActie();

  function drop(dayKey: string | null) {
    const taskId = dragging;
    setDragging(null);
    setOver(null);
    if (!taskId) return;
    // Mislukt het verplaatsen, dan springt de kaart terug naar zijn oude dag en
    // gebeurt er verder niets zichtbaars. Dat is niet te onderscheiden van "het
    // is gelukt maar de pagina liep achter", dus de reden hoort in beeld.
    doe(() => moveTaskToDay(taskId, dayKey));
  }

  return (
    <div className="space-y-4">
      <ActieFout fout={fout} />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        {days.map((day) => (
          <section
            key={day.key}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(day.key);
            }}
            onDragLeave={() => setOver((current) => (current === day.key ? null : current))}
            onDrop={() => drop(day.key)}
            className={`card flex min-h-52 flex-col p-2.5 transition-colors ${
              over === day.key ? "border-accent bg-accent/5" : ""
            } ${day.isToday ? "border-accent/50" : ""} ${day.isWeekend ? "opacity-70" : ""}`}
          >
            <header className="mb-2 flex items-baseline justify-between">
              <div>
                <p className={`text-xs ${day.isToday ? "font-semibold text-accent" : "text-text-muted"}`}>
                  {day.label.short}
                </p>
                <p className="text-lg leading-none font-semibold">{day.label.day}</p>
              </div>
              {day.hasMeeting && (
                <span className="chip px-1.5 py-0 text-[10px]" title="Er was een ochtendoverleg">
                  {day.callDone ? "call ✓" : "overleg"}
                </span>
              )}
            </header>

            {day.activities.length > 0 && (
              <div className="mb-2 space-y-1.5 border-b border-border pb-2">
                {day.activities.map((activity, index) => (
                  <div key={index} className="text-[11px] leading-snug">
                    <span className="text-text-faint">
                      {activity.emoji ?? "◉"} {activity.agent}
                    </span>
                    <p className="text-text-muted">{activity.text}</p>
                    {activity.blocked && <p className="text-warn">vast: {activity.blocked}</p>}
                  </div>
                ))}
              </div>
            )}

            <div className="flex-1 space-y-1.5">
              {day.tasks.map((task) => (
                <TaskChip
                  key={task.id}
                  task={task}
                  onDragStart={() => setDragging(task.id)}
                  onDragEnd={() => setDragging(null)}
                />
              ))}

              {day.tasks.length === 0 && day.activities.length === 0 && (
                <p className="py-4 text-center text-[11px] text-text-faint">niets gepland</p>
              )}
            </div>

            <QuickPlan day={day.key} agents={agents} />
          </section>
        ))}
      </div>

      <section
        onDragOver={(event) => {
          event.preventDefault();
          setOver("unplanned");
        }}
        onDragLeave={() => setOver((current) => (current === "unplanned" ? null : current))}
        onDrop={() => drop(null)}
        className={`card p-3 transition-colors ${over === "unplanned" ? "border-accent bg-accent/5" : ""}`}
      >
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-text-muted uppercase">
          Nog geen dag ({unplanned.length})
        </h2>
        {unplanned.length === 0 ? (
          <p className="py-2 text-center text-[11px] text-text-faint">
            Alles staat ingepland. Sleep een taak hierheen om hem los te maken van een dag.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {unplanned.map((task) => (
              <TaskChip
                key={task.id}
                task={task}
                compact
                onDragStart={() => setDragging(task.id)}
                onDragEnd={() => setDragging(null)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TaskChip({
  task,
  compact = false,
  onDragStart,
  onDragEnd,
}: {
  task: AgendaTask;
  compact?: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <Link
      href={`/taken/${task.id}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`card block cursor-grab rounded-lg px-2 py-1.5 transition-colors hover:brightness-125 active:cursor-grabbing ${
        compact ? "max-w-64" : ""
      } ${task.done ? "opacity-50" : ""}`}
    >
      <div className="flex items-start gap-1.5">
        <span
          className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: PRIORITY_COLOR[task.priority] ?? "var(--info)" }}
        />
        <span className={`text-[11px] leading-snug ${task.done ? "line-through" : ""}`}>
          {task.title}
        </span>
      </div>
      {task.agent && (
        <p className="mt-0.5 pl-3 text-[10px] text-text-faint">
          {task.agent.emoji ?? ""} {task.agent.name}
        </p>
      )}
    </Link>
  );
}

const initialPlan: QuickPlanState = {};

function QuickPlan({ day, agents }: { day: string; agents: { id: string; name: string; emoji: string | null }[] }) {
  const [state, formAction, pending] = useActionState(planOnDay, initialPlan);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 w-full rounded-lg border border-dashed border-border py-1 text-[11px] text-text-faint transition-colors hover:border-border-strong hover:text-text-muted"
      >
        + inplannen
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-2 space-y-1.5">
      <input type="hidden" name="day" value={day} />
      <input
        name="title"
        className="input px-2 py-1 text-[11px]"
        placeholder="Wat moet er gebeuren?"
        autoFocus
        required
      />
      <select name="agentId" className="input px-2 py-1 text-[11px]" defaultValue="">
        <option value="">Niemand</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.emoji ? `${agent.emoji} ` : ""}
            {agent.name}
          </option>
        ))}
      </select>
      <div className="flex gap-1">
        <button type="submit" className="btn btn-primary flex-1 px-2 py-1 text-[11px]" disabled={pending}>
          {pending ? "…" : "Plannen"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn btn-ghost px-2 py-1 text-[11px]"
        >
          ✕
        </button>
      </div>
      {state.error && <p className="text-[10px] text-danger">{state.error}</p>}
    </form>
  );
}
