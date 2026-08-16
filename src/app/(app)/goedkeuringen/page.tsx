import Link from "next/link";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/access";
import { ApprovalCard } from "@/components/approval-card";
import { AgentAvatar } from "@/components/agent-avatar";
import { formatDateTime, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  approved: { label: "akkoord", color: "var(--ok)" },
  rejected: { label: "afgewezen", color: "var(--danger)" },
  executed: { label: "uitgevoerd", color: "var(--ok)" },
  failed: { label: "mislukt", color: "var(--danger)" },
};

export default async function ApprovalsPage() {
  await requireOwner();

  const agentSelect = { name: true, emoji: true, color: true, avatarUrl: true } as const;

  const [pending, decided] = await Promise.all([
    db.approval.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      include: { agent: { select: agentSelect } },
    }),
    db.approval.findMany({
      where: { status: { not: "pending" } },
      orderBy: { decidedAt: "desc" },
      take: 20,
      include: {
        agent: { select: agentSelect },
        decidedByUser: { select: { name: true } },
        linkedTask: { select: { id: true, title: true, status: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl">Goedkeuringen</h1>
        <p className="mt-1 text-sm text-text-muted">
          Alles wat naar buiten gaat, geld kost of de reputatie raakt komt hier eerst langs. De agent
          bereidt het volledig voor; jij beslist.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="eyebrow-rule start">
          {pending.length > 0 ? `${pending.length} wacht op jou` : "Niets in de wachtrij"}
        </h2>

        {pending.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-text-muted">
              Geen openstaande verzoeken. Zodra een agent iets wil versturen, publiceren of uitgeven,
              staat het hier — en niet eerder dan dat.
            </p>
          </div>
        ) : (
          pending.map((approval) => <ApprovalCard key={approval.id} approval={approval} />)
        )}
      </section>

      {decided.length > 0 && (
        <section>
          <h2 className="eyebrow-rule start mb-3">Eerder beslist</h2>
          <div className="card divide-y divide-border">
            {decided.map((approval) => {
              const style = STATUS_STYLE[approval.status] ?? {
                label: approval.status,
                color: "var(--text-faint)",
              };

              return (
                <div key={approval.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <AgentAvatar agent={approval.agent} size="xs" />
                    <span className="font-medium">{approval.agent.name}</span>
                    <span className="chip px-1.5 py-0 text-[10px]" style={{ color: style.color }}>
                      {style.label}
                    </span>
                    <span className="ml-auto text-text-faint">
                      {approval.decidedAt ? formatDateTime(approval.decidedAt) : timeAgo(approval.createdAt)}
                    </span>
                  </div>

                  <p className="mt-1 text-sm">{approval.title}</p>

                  {approval.decisionNote && (
                    <p className="mt-1 text-xs text-text-muted">
                      Jouw opmerking: {approval.decisionNote}
                    </p>
                  )}

                  {approval.linkedTask && (
                    <Link
                      href={`/taken/${approval.linkedTask.id}`}
                      className="mt-1 inline-block text-xs text-accent hover:underline"
                    >
                      Taak: {approval.linkedTask.title} ({approval.linkedTask.status})
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <p className="text-xs text-text-faint">
        Akkoord geven voert de actie hier niet zelf uit — er is nog geen koppeling die namens het bureau
        kan mailen of publiceren. Het akkoord wordt vastgelegd als taak bij de agent, zodat het niet
        verdwijnt. Zodra zo&rsquo;n koppeling er is, voert die het uit.
      </p>
    </div>
  );
}
