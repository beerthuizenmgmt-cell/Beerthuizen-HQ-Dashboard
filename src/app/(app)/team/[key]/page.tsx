import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getAdapter } from "@/lib/adapters";
import { MessageComposer } from "@/components/message-composer";
import { formatDateTime } from "@/lib/format";
import { AgentAvatar } from "@/components/agent-avatar";

export const dynamic = "force-dynamic";

const DELIVERY_NOTE: Record<string, string> = {
  pending: "wordt bezorgd…",
  sent: "bezorgd",
  delivered: "gelezen",
  failed: "niet bezorgd",
  local: "alleen hier",
};

export default async function ChannelPage({ params }: PageProps<"/team/[key]">) {
  await requireUser();
  const { key } = await params;

  const [channel, channels, agents] = await Promise.all([
    db.channel.findUnique({
      where: { key },
      include: {
        agent: true,
        messages: {
          // Nieuwste 200 ophalen en pas daarna omdraaien voor weergave. Met
          // "asc" zou je in een vol kanaal alleen de oudste berichten zien.
          orderBy: { createdAt: "desc" },
          take: 200,
          include: {
            fromUser: { select: { name: true } },
            fromAgent: { select: { name: true, emoji: true, color: true, avatarUrl: true } },
            toAgent: { select: { name: true } },
          },
        },
      },
    }),
    db.channel.findMany({
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
      include: { agent: { select: { name: true, emoji: true, color: true, avatarUrl: true, paused: true } } },
    }),
    db.agent.findMany({ orderBy: { sortOrder: "asc" }, select: { key: true, name: true } }),
  ]);

  if (!channel) notFound();

  const canSend = channel.agent ? getAdapter(channel.agent.adapterType).capabilities.send : true;

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-6xl gap-5">
      <aside className="hidden w-52 shrink-0 space-y-4 overflow-y-auto lg:block">
        <div>
          <p className="mb-1.5 px-2 text-xs font-semibold tracking-wide text-text-faint uppercase">
            Kanalen
          </p>
          {channels
            .filter((entry) => entry.kind === "team")
            .map((entry) => (
              <Link
                key={entry.id}
                href={`/team/${entry.key}`}
                className={`block rounded-lg px-2 py-1.5 text-sm ${
                  entry.key === key ? "bg-surface font-medium" : "text-text-muted hover:bg-surface-hover"
                }`}
              >
                # {entry.name}
              </Link>
            ))}
        </div>

        <div>
          <p className="mb-1.5 px-2 text-xs font-semibold tracking-wide text-text-faint uppercase">
            Rechtstreeks
          </p>
          {channels
            .filter((entry) => entry.kind === "dm")
            .map((entry) => (
              <Link
                key={entry.id}
                href={`/team/${entry.key}`}
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm ${
                  entry.key === key ? "bg-surface font-medium" : "text-text-muted hover:bg-surface-hover"
                } ${entry.agent?.paused ? "opacity-50" : ""}`}
              >
                {entry.agent ? (
                  <AgentAvatar agent={entry.agent} size="xs" />
                ) : (
                  <span>◉</span>
                )}
                <span className="truncate">{entry.name}</span>
              </Link>
            ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border pb-3">
          <h1 className="text-lg font-semibold">
            {channel.kind === "team" ? (
              `# `
            ) : (
              <span className="flex items-center gap-2">
                {channel.agent && <AgentAvatar agent={channel.agent} size="sm" />}
                {channel.name}
              </span>
            )}
          </h1>
          {channel.purpose && <p className="mt-0.5 text-xs text-text-muted">{channel.purpose}</p>}
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto py-4">
          {channel.messages.length === 0 && (
            <p className="py-12 text-center text-sm text-text-faint">
              Nog geen berichten.
              {channel.kind === "team" && " Noem een agent met @naam om hem mee te laten lezen."}
            </p>
          )}

          {channel.messages.toReversed().map((message) => {
            const isUser = message.fromType === "user";
            const author = isUser ? (message.fromUser?.name ?? "Jij") : (message.fromAgent?.name ?? "Systeem");

            return (
              <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-xl px-3.5 py-2.5 ${
                    isUser ? "bg-accent/15 border border-accent/25" : "card"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {!isUser && message.fromAgent && (
                      <AgentAvatar agent={message.fromAgent} size="xs" />
                    )}
                    <span className="text-xs font-medium">{author}</span>
                    <span className="text-[11px] text-text-faint">{formatDateTime(message.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{message.body}</p>

                  {message.delivery !== "local" && (
                    <p
                      className={`mt-1.5 text-[11px] ${
                        message.delivery === "failed" ? "text-danger" : "text-text-faint"
                      }`}
                    >
                      {DELIVERY_NOTE[message.delivery]}
                      {message.toAgent && ` → ${message.toAgent.name}`}
                      {message.deliveryError && ` · ${message.deliveryError}`}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-border pt-3">
          <MessageComposer
            channelId={channel.id}
            channelKey={channel.key}
            agentNames={agents.map((agent) => agent.name)}
            hint={
              channel.kind === "dm"
                ? canSend
                  ? `Bericht naar ${channel.name}`
                  : `${channel.name} is niet gekoppeld — je bericht blijft hier staan`
                : "Bericht aan het team — noem een agent met @naam"
            }
          />
        </div>
      </div>
    </div>
  );
}
