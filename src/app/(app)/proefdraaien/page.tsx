import Link from "next/link";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/access";
import { getAiStatus } from "@/lib/ai/provider";
import { TestRun } from "@/components/test-run";
import { timeAgo } from "@/lib/format";
import { AgentAvatar } from "@/components/agent-avatar";

export const dynamic = "force-dynamic";

export default async function TestRunPage() {
  await requireOwner();

  const [agents, config, recent] = await Promise.all([
    db.agent.findMany({
      where: { adapterType: "builtin" },
      orderBy: [{ isChief: "desc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, emoji: true, avatarUrl: true, paused: true },
    }),
    getAiStatus(),
    db.agentRun.findMany({
      where: { trigger: "manual" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { agent: { select: { name: true, emoji: true, avatarUrl: true } } },
    }),
  ]);

  const active = agents.filter((agent) => !agent.paused);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Proefdraaien</h1>
        <p className="mt-1 text-sm text-text-muted">
          Eén opdracht, één agent, echt via de aanbieder. Zo zie je of de keten werkt en wat het kost
          voordat je het hele team aanzet.
        </p>
      </header>

      {!config.connected ? (
        <div className="card border-warn/40 bg-warn/5 p-5">
          <h2 className="text-sm font-semibold text-warn">Er is nog geen API-sleutel</h2>
          <p className="mt-1.5 text-sm text-text-muted">
            Zonder sleutel kan er niets draaien en is er ook nog niets uitgegeven. Vul er een in, dan
            kun je hier meteen proefdraaien.
          </p>
          <Link href="/instellingen" className="btn btn-primary mt-4">
            Naar Instellingen → Taalmodel
          </Link>
        </div>
      ) : (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-accent/30 bg-accent/5 p-4 text-sm">
          <span>
            Klaar om te draaien via <strong>{config.provider}</strong>, standaardmodel{" "}
            <code className="font-mono text-xs">{config.defaultModel}</code>
          </span>
          <span className="text-xs text-text-muted">
            {active.length} van {agents.length} agents actief
          </span>
        </div>
      )}

      <TestRun agents={agents} />

      {recent.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Eerdere proeven</h2>
          <div className="card lijst">
            {recent.map((run) => (
              <div key={run.id} className="px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-text-faint">
                  <AgentAvatar agent={run.agent} size="xs" />
                  <span className="font-medium text-text-muted">{run.agent.name}</span>
                  <code className="font-mono">{run.model}</code>
                  <span className="ml-auto">{timeAgo(run.createdAt)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm">{run.output ?? run.error ?? "—"}</p>
                <p className="mt-1 text-[11px] text-text-faint">
                  {run.promptTokens.toLocaleString("nl-NL")} in ·{" "}
                  {run.completionTokens.toLocaleString("nl-NL")} uit ·{" "}
                  {run.costKnown ? `€${run.costEur.toFixed(4)}` : "kosten onbekend"} ·{" "}
                  {(run.durationMs / 1000).toFixed(1)}s
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
