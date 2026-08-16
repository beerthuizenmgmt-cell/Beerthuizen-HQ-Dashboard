import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { AgentCard } from "@/components/agent-card";
import { ActivityList } from "@/components/activity-list";
import { AgentAvatar } from "@/components/agent-avatar";
import { formatDayLong, hourInTimezone } from "@/lib/format";

export const dynamic = "force-dynamic";

function greeting(): string {
  const hour = hourInTimezone();
  if (hour < 6) return "Goedenacht";
  if (hour < 12) return "Goedemorgen";
  if (hour < 18) return "Goedemiddag";
  return "Goedenavond";
}

export default async function HQPage() {
  const user = await requireUser();

  const [agents, activity, unread, instances, openTasks, recentTasks] = await Promise.all([
    db.agent.findMany({ orderBy: [{ isChief: "desc" }, { sortOrder: "asc" }] }),
    db.activityEvent.findMany({
      orderBy: { occurredAt: "desc" },
      take: 12,
      include: { agent: { select: { name: true, emoji: true, color: true, avatarUrl: true } } },
    }),
    db.notification.count({ where: { readAt: null } }),
    db.instance.count({ where: { active: true } }),
    db.task.count({ where: { status: { notIn: ["done", "cancelled"] } } }),
    db.task.findMany({
      where: { status: { notIn: ["done", "cancelled"] } },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 5,
      include: { agent: { select: { name: true, emoji: true, avatarUrl: true } } },
    }),
  ]);

  // Een reader-koppeling is geen collega. Hij levert data uit de OpenClaw-
  // omgeving aan en hoort daarom bij de techniek, niet bij het team — anders
  // klopt de telling van je medewerkers niet.
  const medewerkers = agents.filter((a) => a.adapterType !== "reader_ingest");
  const koppelingen = agents.filter((a) => a.adapterType === "reader_ingest");

  const connected = medewerkers.filter((a) => a.adapterType !== "manual").length;
  const problems = medewerkers.filter((a) => a.status === "error" || (a.lastError && !a.paused)).length;

  const stats = [
    { label: "AI-medewerkers", value: medewerkers.length },
    { label: "Gekoppeld", value: `${connected}/${medewerkers.length}` },
    { label: "Open taken", value: openTasks },
    { label: "Aandacht nodig", value: problems, alert: problems > 0 },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">
            {greeting()}, <span className="accent-serif">{user.name}</span>
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {formatDayLong(new Date())}
            {unread > 0 && ` · ${unread} nieuwe melding${unread === 1 ? "" : "en"}`}
          </p>
        </div>
        <Link href="/agents/nieuw" className="btn btn-primary">
          Agent toevoegen
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-4">
            <p className={`text-2xl font-semibold ${stat.alert ? "text-danger" : ""}`}>{stat.value}</p>
            <p className="mt-0.5 text-xs text-text-muted">{stat.label}</p>
          </div>
        ))}
      </section>

      {connected === 0 && (
        <div className="card-cream p-6">
          <p className="eyebrow-rule start">Aan de slag</p>
          <h2 className="mt-2 text-2xl">Je team staat klaar, maar praat nog nergens mee</h2>
          <p className="muted mt-2 max-w-xl text-sm">
            De agents staan in het overzicht, maar zijn nog niet gekoppeld. Open een agent en kies een
            koppeling — ingebouwd werkt meteen, Telegram als je ze op je telefoon wilt.
          </p>
          <Link href={`/agents/${agents[0]?.id ?? ""}`} className="btn btn-primary mt-5">
            Eerste agent koppelen
          </Link>
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow-rule start">Het team</h2>
          <Link href="/agents" className="text-xs text-text-muted hover:text-text">
            Alles beheren →
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {medewerkers.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </section>

      {koppelingen.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="eyebrow-rule start">Technische koppelingen</h2>
            <span className="text-xs text-text-faint">geen medewerkers</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {koppelingen.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </section>
      )}

      {recentTasks.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="eyebrow-rule start">Loopt nu</h2>
            <Link href="/taken" className="text-xs text-text-muted hover:text-text">
              Takenbord →
            </Link>
          </div>
          <div className="card divide-y divide-border">
            {recentTasks.map((task) => (
              <Link
                key={task.id}
                href={`/taken/${task.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                {task.agent ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-text-faint">
                    <AgentAvatar agent={task.agent} size="xs" />
                    {task.agent.name}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-text-faint">niemand</span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow-rule start">Laatste activiteit</h2>
          <Link href="/activiteit" className="text-xs text-text-muted hover:text-text">
            Alles bekijken →
          </Link>
        </div>
        <div className="card divide-y divide-border">
          <ActivityList
            events={activity}
            emptyMessage={
              instances === 0
                ? "Nog geen activiteit. Koppel een reader bij Instellingen om de verrichtingen van je agents binnen te halen."
                : "Nog geen activiteit binnengekomen."
            }
          />
        </div>
      </section>
    </div>
  );
}
