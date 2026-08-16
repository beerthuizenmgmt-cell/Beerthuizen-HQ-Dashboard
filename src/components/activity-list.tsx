import type { ActivityLevel } from "@/generated/prisma/enums";
import { timeAgo } from "@/lib/format";

const LEVEL_COLOR: Record<ActivityLevel, string> = {
  info: "var(--text-faint)",
  success: "var(--ok)",
  warn: "var(--warn)",
  error: "var(--danger)",
};

export type ActivityRow = {
  id: string;
  occurredAt: Date;
  kind: string;
  level: ActivityLevel;
  message: string;
  agent: { name: string; emoji: string | null; color: string | null } | null;
};

export function ActivityList({
  events,
  emptyMessage = "Nog geen activiteit.",
}: {
  events: ActivityRow[];
  emptyMessage?: string;
}) {
  if (events.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-text-faint">{emptyMessage}</p>;
  }

  return (
    <>
      {events.map((event) => (
        <div key={event.id} className="flex items-start gap-3 px-4 py-3">
          <span
            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: LEVEL_COLOR[event.level] }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug">{event.message}</p>
            <p className="mt-0.5 text-xs text-text-faint">
              {event.agent ? `${event.agent.emoji ?? ""} ${event.agent.name} · ` : ""}
              {event.kind}
            </p>
          </div>
          <span className="shrink-0 text-xs text-text-faint">{timeAgo(event.occurredAt)}</span>
        </div>
      ))}
    </>
  );
}
