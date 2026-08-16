import Link from "next/link";
import type { AdapterType, AgentCategory, AgentStatus } from "@/generated/prisma/enums";
import { StatusDot, statusLabel } from "./status-dot";
import { AgentAvatar } from "./agent-avatar";
import { categoryLabel, timeAgo } from "@/lib/format";

const ADAPTER_LABELS: Record<AdapterType, string> = {
  builtin: "AI-agent",
  openclaw_gateway: "Gateway",
  telegram: "Telegram",
  reader_ingest: "Reader",
  manual: "Niet gekoppeld",
};

export type AgentCardData = {
  id: string;
  name: string;
  role: string;
  emoji: string | null;
  color: string | null;
  avatarUrl: string | null;
  category: AgentCategory;
  status: AgentStatus;
  statusText: string | null;
  isChief: boolean;
  paused: boolean;
  adapterType: AdapterType;
  lastActiveAt: Date | null;
  lastError: string | null;
};

export function AgentCard({ agent }: { agent: AgentCardData }) {
  const accent = agent.color ?? "#6366f1";

  return (
    <Link
      href={`/agents/${agent.id}`}
      className="card group relative flex flex-col gap-3 p-4 transition-colors hover:bg-surface-hover"
    >
      {/* Kleuraccent per agent — maakt het team herkenbaar op kleur */}
      <span
        className="absolute inset-x-0 top-0 h-0.5 rounded-t-[0.875rem]"
        style={{ background: accent, opacity: agent.paused ? 0.3 : 0.8 }}
      />

      <div className="flex items-start gap-3">
        <AgentAvatar agent={agent} size="md" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <p className="text-sm leading-tight font-semibold">{agent.name}</p>
            {agent.isChief && (
              <span className="chip border-accent/40 px-1.5 py-0 text-[10px] text-accent">Chief</span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-text-muted">{agent.role}</p>
        </div>

        <StatusDot status={agent.paused ? "paused" : agent.status} className="mt-1.5" />
      </div>

      <p className="line-clamp-1 text-xs text-text-faint">
        {agent.lastError ?? agent.statusText ?? categoryLabel(agent.category)}
      </p>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2.5 text-[11px] text-text-faint">
        <span className={agent.adapterType === "manual" ? "text-warn" : ""}>
          {ADAPTER_LABELS[agent.adapterType]}
        </span>
        <span>
          {agent.paused ? statusLabel("paused") : agent.lastActiveAt ? timeAgo(agent.lastActiveAt) : "geen activiteit"}
        </span>
      </div>
    </Link>
  );
}
