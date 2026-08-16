import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { AgentAvatar } from "@/components/agent-avatar";
import { formatDate, formatDateTime, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

/// Alles rond campagnes op één plek: het werk dat eraan hangt, wat het team
/// erover zegt, en de cijfers zodra de advertentiekoppeling er is.
export default async function CampaignsPage() {
  await requireUser();

  const [campaigns, tasks, channel, adviceItems] = await Promise.all([
    db.adCampaign.findMany({
      include: { account: true, creatives: true },
      orderBy: { name: "asc" },
    }),
    db.task.findMany({
      where: {
        status: { not: "cancelled" },
        OR: [
          { agent: { key: { in: ["influencer", "social", "creative"] } } },
          { title: { contains: "campagne", mode: "insensitive" } },
        ],
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 25,
      include: { agent: { select: { name: true, emoji: true, color: true, avatarUrl: true } } },
    }),
    db.channel.findUnique({
      where: { key: "campagnes" },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 8,
          include: {
            fromUser: { select: { name: true } },
            fromAgent: { select: { name: true, emoji: true, color: true, avatarUrl: true } },
          },
        },
      },
    }),
    db.adAdvice.findMany({
      where: { status: "open" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { agent: { select: { name: true, emoji: true, color: true, avatarUrl: true } } },
    }),
  ]);

  const open = tasks.filter((task) => task.status !== "done");

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="text-2xl">Campagnes</h1>
        <p className="mt-1 text-sm text-text-muted">
          Wat er loopt, wie eraan werkt en wat het team erover meldt.
        </p>
      </header>

      <section>
        <h2 className="eyebrow-rule start mb-3">Lopende campagnes</h2>
        {campaigns.length === 0 ? (
          <div className="card p-6">
            <p className="text-sm text-text-muted">
              Er zijn nog geen campagnecijfers binnengekomen. Die komen er zodra de
              advertentiekoppeling gebouwd is — tot dan staat hier niets verzonnen.
            </p>
          </div>
        ) : (
          <div className="card divide-y divide-border">
            {campaigns.map((campaign) => (
              <div key={campaign.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{campaign.name}</span>
                  {campaign.status && <span className="chip px-1.5 py-0 text-[10px]">{campaign.status}</span>}
                  <span className="ml-auto text-xs text-text-faint">
                    {campaign.account.platform} · {campaign.creatives.length} creatives
                  </span>
                </div>
                {campaign.startedAt && (
                  <p className="mt-0.5 text-xs text-text-faint">gestart {formatDate(campaign.startedAt)}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {adviceItems.length > 0 && (
        <section>
          <h2 className="eyebrow-rule start mb-3">Advies dat op je wacht</h2>
          <div className="card divide-y divide-border">
            {adviceItems.map((advice) => (
              <div key={advice.id} className="px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-text-faint">
                  <AgentAvatar agent={advice.agent ?? { name: "?" }} size="xs" />
                  <span>{advice.agent?.name}</span>
                  <span className="ml-auto">{timeAgo(advice.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm font-medium">{advice.title}</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-text-muted">{advice.bodyMd}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow-rule start">Werk aan campagnes</h2>
          <Link href="/taken" className="text-xs text-text-muted hover:text-text">
            Takenbord →
          </Link>
        </div>
        <div className="card divide-y divide-border">
          {open.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-text-faint">
              Geen open campagnetaken.
            </p>
          )}
          {open.map((task) => (
            <Link
              key={task.id}
              href={`/taken/${task.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover"
            >
              {task.agent && <AgentAvatar agent={task.agent} size="xs" />}
              <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
              <span className="shrink-0 text-xs text-text-faint">{task.status}</span>
            </Link>
          ))}
        </div>
      </section>

      {channel && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="eyebrow-rule start">Uit het campagnekanaal</h2>
            <Link href="/team/campagnes" className="text-xs text-text-muted hover:text-text">
              Naar het gesprek →
            </Link>
          </div>
          <div className="card divide-y divide-border">
            {channel.messages.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-text-faint">Nog niets besproken.</p>
            )}
            {channel.messages.toReversed().map((message) => (
              <div key={message.id} className="px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-text-faint">
                  {message.fromAgent && <AgentAvatar agent={message.fromAgent} size="xs" />}
                  <span className="font-medium text-text-muted">
                    {message.fromAgent?.name ?? message.fromUser?.name ?? "Systeem"}
                  </span>
                  <span className="ml-auto">{formatDateTime(message.createdAt)}</span>
                </div>
                <p className="mt-1 line-clamp-3 text-sm">{message.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
