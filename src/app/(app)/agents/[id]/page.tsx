import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { adapterCatalog, publicConfig, getAdapter } from "@/lib/adapters";
import { AgentForm } from "@/components/agent-form";
import { ConnectionTestButton } from "@/components/connection-test";
import { InboundSetup } from "@/components/inbound-setup";
import { ActivityList } from "@/components/activity-list";
import { StatusBadge } from "@/components/status-dot";
import { deleteAgent, togglePause } from "@/lib/actions/agents";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AgentDetailPage({ params }: PageProps<"/agents/[id]">) {
  await requireUser();
  const { id } = await params;

  const agent = await db.agent.findUnique({
    where: { id },
    include: {
      activityEvents: {
        orderBy: { occurredAt: "desc" },
        take: 10,
        include: { agent: { select: { name: true, emoji: true, color: true } } },
      },
    },
  });
  if (!agent) notFound();

  const adapter = getAdapter(agent.adapterType);
  const accent = agent.color ?? "#6366f1";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <Link href="/agents" className="text-xs text-text-muted hover:text-text">
          ← Agents
        </Link>

        <div className="mt-3 flex flex-wrap items-start gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl"
            style={{ background: `color-mix(in srgb, ${accent} 18%, transparent)` }}
          >
            {agent.emoji ?? "◉"}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{agent.name}</h1>
              {agent.isChief && <span className="chip border-accent/40 text-accent">Chief</span>}
              <StatusBadge status={agent.paused ? "paused" : agent.status} />
            </div>
            <p className="mt-1 text-sm text-text-muted">{agent.role}</p>
            {agent.description && <p className="mt-2 text-sm text-text-muted">{agent.description}</p>}
          </div>
        </div>
      </header>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Koppeling — {adapter.label}</h2>
            <p className="mt-1 text-xs text-text-muted">
              Laatst gecontroleerd: {timeAgo(agent.lastCheckedAt)}
              {agent.lastActiveAt && ` · laatste activiteit ${timeAgo(agent.lastActiveAt)}`}
            </p>
          </div>
          <ConnectionTestButton agentId={agent.id} />
        </div>

        {agent.lastError && (
          <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {agent.lastError}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-4 border-t border-border pt-4 text-xs text-text-muted">
          <span>Taken versturen: {adapter.capabilities.send ? "ja" : "nee"}</span>
          <span>Status ophalen: {adapter.capabilities.poll ? "ja" : "nee"}</span>
          <span>Ontvangt push: {adapter.capabilities.receive ? "ja" : "nee"}</span>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold">Terugpraten</h2>
        <InboundSetup
          agentId={agent.id}
          token={agent.inboundToken}
          appUrl={(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}
          isTelegram={agent.adapterType === "telegram"}
        />
      </section>

      <section className="card p-6">
        <h2 className="mb-5 text-sm font-semibold">Instellingen</h2>
        <AgentForm
          catalog={adapterCatalog()}
          values={{
            id: agent.id,
            name: agent.name,
            role: agent.role,
            description: agent.description ?? undefined,
            emoji: agent.emoji ?? undefined,
            color: agent.color ?? undefined,
            category: agent.category,
            adapterType: agent.adapterType,
            config: publicConfig(agent.adapterType, agent.adapterConfig),
          }}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Activiteit</h2>
        <div className="card divide-y divide-border">
          <ActivityList
            events={agent.activityEvents}
            emptyMessage={`Nog niets binnengekomen van ${agent.name}.`}
          />
        </div>
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-sm font-semibold">{agent.paused ? "Weer aan het werk zetten" : "Op pauze zetten"}</h2>
          <p className="mt-1 text-xs text-text-muted">
            {agent.paused
              ? "Deze agent krijgt nu geen taken en wordt niet uitgevraagd bij het ochtendoverleg."
              : "Tijdelijk buiten dienst: geen taken, geen standup, blijft wel in het overzicht staan."}
          </p>
        </div>
        <div className="flex gap-2">
          <form action={togglePause.bind(null, agent.id)}>
            <button type="submit" className="btn btn-ghost">
              {agent.paused ? "Hervatten" : "Pauzeren"}
            </button>
          </form>
          <form action={deleteAgent.bind(null, agent.id)}>
            <button type="submit" className="btn btn-danger">
              Verwijderen
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
