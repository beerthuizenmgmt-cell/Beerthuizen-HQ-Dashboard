import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { AgentCard } from "@/components/agent-card";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  await requireUser();
  const agents = await db.agent.findMany({ orderBy: [{ isChief: "desc" }, { sortOrder: "asc" }] });

  const unconnected = agents.filter((agent) => agent.adapterType === "manual").length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Agents</h1>
          <p className="mt-1 text-sm text-text-muted">
            {agents.length} in dienst
            {unconnected > 0 && ` · ${unconnected} nog niet gekoppeld`}
          </p>
        </div>
        <Link href="/agents/nieuw" className="btn btn-primary">
          Agent toevoegen
        </Link>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}
