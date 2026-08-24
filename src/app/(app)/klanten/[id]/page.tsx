import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";

// Alles van één klant op één plek.
//
// Hiervoor stond er alleen een lijst met namen. Wilde je weten wat er speelde
// voordat je iemand belde, dan moest je vier schermen langs: campagnes, taken,
// facturen, contracten. Precies op het moment dat je het minst tijd hebt.
//
// Dit scherm is de voorbereiding op een klantgesprek. Wat loopt er, wat staat
// er open, wat is er getekend, wat is er gefactureerd.

export const dynamic = "force-dynamic";

const euro = (bedrag: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(bedrag);

export default async function KlantPage({ params }: PageProps<"/klanten/[id]">) {
  await requireUser();
  const { id } = await params;

  const klant = await db.client.findUnique({
    where: { id },
    include: {
      projects: { orderBy: { createdAt: "desc" }, include: { _count: { select: { tasks: true } } } },
      invoices: { orderBy: { issuedOn: "desc" } },
      samenwerkingen: { orderBy: { createdAt: "desc" } },
      contracten: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!klant) notFound();

  // Wat er nog binnen moet komen. Een oninbare of vervallen verklaarde factuur
  // telt niet mee: die komt niet meer.
  const AFGESLOTEN = ["betaald", "oninbaar", "vervallen_verklaard"];
  const openstaand = klant.invoices
    .filter((f) => !AFGESLOTEN.includes(f.status))
    .reduce((n, f) => n + f.amountEur, 0);

  // En wat er ooit de deur uit ging. Concepten tellen niet: die zijn nog niet
  // verstuurd en zeggen dus niets over wat deze klant heeft afgenomen.
  const gefactureerd = klant.invoices
    .filter((f) => f.status !== "concept")
    .reduce((n, f) => n + f.amountEur, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <Link href="/klanten" className="text-xs text-text-muted hover:text-text">
          ← Klanten
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{klant.name}</h1>
        <p className="mt-1 text-sm text-text-muted">
          {[klant.contactName, klant.city, klant.email].filter(Boolean).join(" · ") ||
            "Geen contactgegevens vastgelegd"}
        </p>
      </header>

      {/* De cijfers waar je in een gesprek naar gevraagd wordt. */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { getal: klant.projects.length, label: "campagnes" },
          { getal: klant.samenwerkingen.length, label: "overeenkomsten" },
          { getal: euro(gefactureerd), label: "gefactureerd" },
          { getal: euro(openstaand), label: "staat open", nadruk: openstaand > 0 },
        ].map((k) => (
          <div key={k.label} className="card p-4">
            <p className={`text-xl font-semibold ${k.nadruk ? "text-warn" : ""}`}>{k.getal}</p>
            <p className="mt-0.5 text-xs text-text-muted">{k.label}</p>
          </div>
        ))}
      </section>

      <Blok titel="Campagnes" leeg="Nog geen campagnes voor deze klant.">
        {klant.projects.map((p) => (
          <Link
            key={p.id}
            href={`/projecten/${p.id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{p.name}</span>
              <span className="block text-xs text-text-muted">
                {p.status} · {p._count.tasks} taken
                {p.deadline ? ` · deadline ${formatDate(p.deadline)}` : ""}
              </span>
            </span>
          </Link>
        ))}
      </Blok>

      <Blok titel="Overeenkomsten" leeg="Er is nog niets getekend met deze klant.">
        {klant.samenwerkingen.map((s) => (
          <Link
            key={s.id}
            href={`/samenwerkingen/${s.id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {s.afspraken.length} afspraak/afspraken
              </span>
              <span className="block text-xs text-text-muted">
                {s.status} · opgesteld {formatDate(s.createdAt)}
                {s.verstuurdOp ? ` · verstuurd ${formatDate(s.verstuurdOp)}` : ""}
              </span>
            </span>
          </Link>
        ))}
      </Blok>

      <Blok titel="Contracten" leeg="Er zijn geen contracten van deze klant vastgelegd.">
        {klant.contracten.map((c) => (
          <div key={c.id} className="px-4 py-3">
            <p className="truncate font-medium">{c.naam}</p>
            <p className="text-xs text-text-muted">
              {c.status}
              {c.vergoedingEur ? ` · ${euro(c.vergoedingEur)}` : ""}
              {c.looptijd ? ` · ${c.looptijd}` : ""}
            </p>
          </div>
        ))}
      </Blok>

      <Blok titel="Facturen" leeg="Er is nog niets gefactureerd.">
        {klant.invoices.map((f) => (
          <div key={f.id} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{f.number}</span>
              <span className="block text-xs text-text-muted">
                {f.status}
                {f.issuedOn ? ` · ${formatDate(f.issuedOn)}` : ""}
                {f.dueOn ? ` · vervalt ${formatDate(f.dueOn)}` : ""}
              </span>
            </span>
            <span className="shrink-0 text-sm tabular-nums">{euro(f.amountEur)}</span>
          </div>
        ))}
      </Blok>

      {klant.notes && (
        <section>
          <h2 className="eyebrow-rule start mb-3">Notities</h2>
          <div className="card p-4 text-sm whitespace-pre-wrap">{klant.notes}</div>
        </section>
      )}

      <p className="text-xs text-text-faint">
        Klant sinds {formatDateTime(klant.createdAt)}
      </p>
    </div>
  );
}

/// Eén onderdeel van het dossier. Altijd zichtbaar, ook als het leeg is: dat er
/// niets is gefactureerd is zelf ook informatie, en een blok dat verdwijnt laat
/// je twijfelen of je het over het hoofd zag.
function Blok({
  titel,
  leeg,
  children,
}: {
  titel: string;
  leeg: string;
  children: React.ReactNode[];
}) {
  return (
    <section>
      <h2 className="eyebrow-rule start mb-3">{titel}</h2>
      {children.length === 0 ? (
        <p className="card px-4 py-6 text-center text-xs text-text-faint">{leeg}</p>
      ) : (
        <div className="card divide-y divide-border">{children}</div>
      )}
    </section>
  );
}
