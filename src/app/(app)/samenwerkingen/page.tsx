import Link from "next/link";
import { requireOwner } from "@/lib/access";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; kleur: string }> = {
  concept: { label: "nakijken", kleur: "var(--warn)" },
  goedgekeurd: { label: "akkoord", kleur: "var(--ok)" },
  verstuurd: { label: "verstuurd", kleur: "var(--text-faint)" },
};

export default async function SamenwerkingenPage() {
  await requireOwner();

  const alles = await db.samenwerking.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { agent: { select: { name: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Samenwerkingen</h1>
        <p className="mt-1 text-sm text-text-muted">
          Overeenkomsten die het team voor je heeft opgesteld. Jij kijkt na en stuurt door.
        </p>
      </header>

      {alles.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-text-muted">Er staat nog geen overeenkomst klaar.</p>
          <p className="mt-2 text-xs text-text-faint">
            Geef Daan een bedrijfsnaam en wat je hebt afgesproken, dan stelt hij hem op.
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-border">
          {alles.map((s) => {
            const stand = STATUS[s.status] ?? { label: s.status, kleur: "var(--text-faint)" };
            return (
              <Link
                key={s.id}
                href={`/samenwerkingen/${s.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: stand.kleur }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.bedrijf}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {s.afspraken.length} afspraak/afspraken · opgesteld door {s.agent?.name ?? "het team"}
                  </span>
                </span>
                <span className="shrink-0 text-xs" style={{ color: stand.kleur }}>
                  {stand.label}
                </span>
                <span className="hidden shrink-0 text-xs text-text-faint sm:block">
                  {formatDateTime(s.createdAt)}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
