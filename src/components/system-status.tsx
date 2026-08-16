export type StatusLevel = "live" | "wacht" | "deels" | "niet";

const STYLE: Record<StatusLevel, { label: string; color: string }> = {
  live: { label: "operationeel", color: "var(--ok)" },
  deels: { label: "deels", color: "var(--warn)" },
  wacht: { label: "wacht op jou", color: "var(--info)" },
  niet: { label: "nog niet gebouwd", color: "var(--text-faint)" },
};

export type StatusItem = {
  name: string;
  level: StatusLevel;
  detail: string;
};

/// Eerlijk overzicht van wat er werkt. Bewust expliciet over wat er nog niet is:
/// een dashboard dat doet alsof alles af is, is erger dan een lege plek.
export function SystemStatus({ items }: { items: StatusItem[] }) {
  return (
    <div className="card divide-y divide-border">
      {items.map((item) => {
        const style = STYLE[item.level];
        return (
          <div key={item.name} className="flex items-start gap-3 px-4 py-3">
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              style={{ background: style.color }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{item.name}</p>
              <p className="mt-0.5 text-xs text-text-muted">{item.detail}</p>
            </div>
            <span className="chip shrink-0" style={{ color: style.color }}>
              {style.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
