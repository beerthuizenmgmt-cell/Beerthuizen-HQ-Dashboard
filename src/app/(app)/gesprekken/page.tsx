import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function GesprekkenPage() {
  await requireUser();

  const gesprekken = await db.klantgesprek.findMany({
    orderBy: { gevoerdOp: "desc" },
    take: 50,
    include: { agent: { select: { name: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Gesprekken</h1>
        <p className="mt-1 text-sm text-text-muted">
          Wat je met klanten besproken hebt, uitgeschreven en uitgeplozen. Het team werkt hiermee
          verder.
        </p>
      </header>

      {gesprekken.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-text-muted">Er staat nog geen gesprek.</p>
          <p className="mt-2 text-xs text-text-faint">
            Druk linksonder op &ldquo;Notuleren starten&rdquo; voordat je met een klant gaat zitten.
            Er verandert niets op je scherm; als je stopt staat het verslag hier.
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-border">
          {gesprekken.map((g) => (
            <Link
              key={g.id}
              href={`/gesprekken/${g.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: g.status === "verwerkt" ? "var(--ok)" : "var(--warn)" }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{g.bedrijf}</span>
                <span className="block truncate text-xs text-text-muted">
                  {g.status === "verwerkt"
                    ? `${g.afspraken.length} afspraak/afspraken · ${g.vervolgstappen.length} vervolgstap(pen)` +
                      (g.ontbreekt.length ? ` · ${g.ontbreekt.length} nog onbekend` : "")
                    : "wordt uitgeplozen…"}
                </span>
              </span>
              <span className="hidden shrink-0 text-xs text-text-faint sm:block">
                {formatDateTime(g.gevoerdOp)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
