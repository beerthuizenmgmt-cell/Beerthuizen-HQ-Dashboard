import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ActivityList } from "@/components/activity-list";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  await requireUser();

  const events = await db.activityEvent.findMany({
    orderBy: { occurredAt: "desc" },
    take: 100,
    include: { agent: { select: { name: true, emoji: true, color: true, avatarUrl: true } } },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Activiteit</h1>
        <p className="mt-1 text-sm text-text-muted">
          Alles wat je agents hebben gedaan, nieuwste eerst.
        </p>
      </header>

      <div className="card lijst">
        <ActivityList
          events={events}
          emptyMessage="Nog geen activiteit. Koppel een reader bij Instellingen, of test een agentverbinding."
        />
      </div>
    </div>
  );
}
