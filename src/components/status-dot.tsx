import type { AgentStatus } from "@/generated/prisma/enums";

const STATUS: Record<AgentStatus, { color: string; label: string }> = {
  active: { color: "var(--ok)", label: "Actief" },
  idle: { color: "var(--info)", label: "Stand-by" },
  error: { color: "var(--danger)", label: "Fout" },
  offline: { color: "var(--text-faint)", label: "Offline" },
  paused: { color: "var(--warn)", label: "Gepauzeerd" },
};

export function statusLabel(status: AgentStatus): string {
  return STATUS[status].label;
}

export function StatusDot({ status, className = "" }: { status: AgentStatus; className?: string }) {
  const { color, label } = STATUS[status];
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${className}`}
      style={{
        background: color,
        // Actieve agents krijgen een subtiele halo, zodat je in één oogopslag
        // ziet wie er nu echt aan het werk is.
        boxShadow: status === "active" ? `0 0 0 3px color-mix(in srgb, ${color} 25%, transparent)` : undefined,
      }}
      title={label}
      aria-label={label}
    />
  );
}

export function StatusBadge({ status }: { status: AgentStatus }) {
  const { color, label } = STATUS[status];
  return (
    <span className="chip" style={{ color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)` }}>
      <StatusDot status={status} />
      {label}
    </span>
  );
}
