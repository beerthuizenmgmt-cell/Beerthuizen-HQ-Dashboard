import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { markNotificationsRead } from "@/lib/actions/notifications";
import { timeAgo } from "@/lib/format";
import { AgentAvatar } from "@/components/agent-avatar";
import type { ActivityLevel } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

const LEVEL_COLOR: Record<ActivityLevel, string> = {
  info: "var(--info)",
  success: "var(--ok)",
  warn: "var(--warn)",
  error: "var(--danger)",
};

export default async function NotificationsPage() {
  await requireUser();

  const [notifications, unread] = await Promise.all([
    db.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { agent: { select: { name: true, emoji: true, avatarUrl: true } } },
    }),
    db.notification.count({ where: { readAt: null } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Meldingen</h1>
          <p className="mt-1 text-sm text-text-muted">
            {unread > 0 ? `${unread} ongelezen` : "Alles gelezen"}
          </p>
        </div>
        {unread > 0 && (
          <form action={markNotificationsRead}>
            <button type="submit" className="btn btn-ghost">
              Alles als gelezen markeren
            </button>
          </form>
        )}
      </header>

      <div className="card lijst">
        {notifications.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-text-faint">
            Nog geen meldingen. Zodra een agent iets afrondt of vastloopt, staat het hier.
          </p>
        )}

        {notifications.map((notification) => {
          const content = (
            <div className={`flex items-start gap-3 px-4 py-3 ${notification.readAt ? "opacity-60" : ""}`}>
              {notification.agent ? (
                <AgentAvatar agent={notification.agent} size="sm" className="mt-0.5" />
              ) : (
                <span
                  className="mt-2 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: LEVEL_COLOR[notification.level] }}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{notification.title}</p>
                {notification.body && (
                  <p className="mt-0.5 line-clamp-2 text-sm text-text-muted">{notification.body}</p>
                )}
                <p className="mt-1 text-xs text-text-faint">
                  {notification.agent ? ` · ` : ""}
                  {timeAgo(notification.createdAt)}
                  {notification.pushedAt && " · ook naar Telegram"}
                </p>
              </div>
            </div>
          );

          return notification.link ? (
            <Link key={notification.id} href={notification.link} className="block hover:bg-surface-hover">
              {content}
            </Link>
          ) : (
            <div key={notification.id}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}
