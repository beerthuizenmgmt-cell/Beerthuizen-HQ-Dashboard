import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { WeekBoard, type AgendaDay, type AgendaTask } from "@/components/week-board";
import { AutoRefresh } from "@/components/auto-refresh";
import { addDays, dayKey, formatWeekday, fromDayKey, startOfWeek } from "@/lib/format";

export const dynamic = "force-dynamic";

function toAgendaTask(task: {
  id: string;
  title: string;
  status: string;
  priority: string;
  agent: { name: string; emoji: string | null; color: string | null } | null;
}): AgendaTask {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    done: task.status === "done",
    agent: task.agent,
  };
}

export default async function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  await requireUser();

  const params = await searchParams;
  const requested = typeof params.week === "string" ? params.week : null;

  const today = dayKey(new Date());
  const weekStart = startOfWeek(requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today);
  const keys = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  const rangeStart = fromDayKey(weekStart);
  const rangeEnd = fromDayKey(addDays(weekStart, 7));

  const [planned, unplanned, meetings, agents] = await Promise.all([
    db.task.findMany({
      where: { dueAt: { gte: rangeStart, lt: rangeEnd }, status: { not: "cancelled" } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      include: { agent: { select: { name: true, emoji: true, color: true, avatarUrl: true } } },
    }),
    db.task.findMany({
      where: { dueAt: null, status: { notIn: ["done", "cancelled"] } },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 30,
      include: { agent: { select: { name: true, emoji: true, color: true, avatarUrl: true } } },
    }),
    db.meeting.findMany({
      where: { date: { gte: rangeStart, lt: rangeEnd } },
      include: {
        entries: {
          where: { today: { not: null } },
          orderBy: { agent: { sortOrder: "asc" } },
          include: { agent: { select: { name: true, emoji: true, avatarUrl: true } } },
        },
      },
    }),
    db.agent.findMany({
      where: { paused: false },
      orderBy: [{ isChief: "desc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, emoji: true, avatarUrl: true },
    }),
  ]);

  const tasksByDay = new Map<string, AgendaTask[]>();
  for (const task of planned) {
    if (!task.dueAt) continue;
    const key = dayKey(task.dueAt);
    tasksByDay.set(key, [...(tasksByDay.get(key) ?? []), toAgendaTask(task)]);
  }

  const meetingsByDay = new Map(meetings.map((meeting) => [dayKey(meeting.date), meeting]));

  const days: AgendaDay[] = keys.map((key) => {
    const meeting = meetingsByDay.get(key);
    const weekday = fromDayKey(key).getUTCDay();

    return {
      key,
      label: formatWeekday(key),
      isToday: key === today,
      isWeekend: weekday === 0 || weekday === 6,
      hasMeeting: Boolean(meeting),
      callDone: Boolean(meeting?.callEndedAt),
      tasks: tasksByDay.get(key) ?? [],
      activities: (meeting?.entries ?? []).map((entry) => ({
        agent: entry.agent.name,
        emoji: entry.agent.emoji,
        text: entry.today ?? "",
        blocked: entry.blockers && !/^(geen|nee|niets|n\.?v\.?t\.?|-)\.?$/i.test(entry.blockers.trim())
          ? entry.blockers
          : null,
      })),
    };
  });

  const plannedCount = planned.filter((task) => task.status !== "done").length;
  const doneCount = planned.filter((task) => task.status === "done").length;
  const isCurrentWeek = weekStart === startOfWeek(today);

  return (
    <div className="mx-auto max-w-[100rem] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Agenda</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-text-muted">
            <span>
              {formatWeekday(weekStart).day} {formatWeekday(weekStart).month} —{" "}
              {formatWeekday(addDays(weekStart, 6)).day} {formatWeekday(addDays(weekStart, 6)).month}
            </span>
            <span className="text-text-faint">·</span>
            <span>
              {plannedCount} te doen, {doneCount} afgerond
            </span>
            <span className="text-text-faint">·</span>
            <AutoRefresh seconds={60} />
          </p>
        </div>

        <nav className="flex gap-2">
          <Link href={`/agenda?week=${addDays(weekStart, -7)}`} className="btn btn-ghost">
            ← Vorige
          </Link>
          {!isCurrentWeek && (
            <Link href="/agenda" className="btn btn-ghost">
              Deze week
            </Link>
          )}
          <Link href={`/agenda?week=${addDays(weekStart, 7)}`} className="btn btn-ghost">
            Volgende →
          </Link>
        </nav>
      </header>

      <WeekBoard days={days} unplanned={unplanned.map(toAgendaTask)} agents={agents} />

      <p className="text-center text-xs text-text-faint">
        Sleep een taak naar een andere dag om hem te verplaatsen. Wat een agent die ochtend zei op te
        pakken staat bovenaan de dag.
      </p>
    </div>
  );
}
