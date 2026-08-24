import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

function Blok({ kop, items }: { kop: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="card p-5">
      <h2 className="eyebrow-rule start mb-3">{kop}</h2>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-text-faint" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function GesprekPage({ params }: PageProps<"/gesprekken/[id]">) {
  await requireUser();
  const { id } = await params;

  const gesprek = await db.klantgesprek.findUnique({
    where: { id },
    include: { agent: { select: { name: true } } },
  });
  if (!gesprek) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <Link href="/gesprekken" className="text-xs text-text-muted hover:text-text">
          ← Gesprekken
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{gesprek.bedrijf}</h1>
        <p className="mt-1 text-sm text-text-muted">
          {formatDateTime(gesprek.gevoerdOp)}
          {gesprek.aanwezig ? ` · ${gesprek.aanwezig}` : ""}
          {gesprek.agent ? ` · uitgeplozen door ${gesprek.agent.name}` : ""}
        </p>
      </header>

      {gesprek.status !== "verwerkt" && (
        <div className="card border-warn/30 bg-warn/5 p-4">
          <p className="text-sm">
            Het team is dit gesprek nog aan het uitpluizen. Ververs over een halve minuut.
          </p>
        </div>
      )}

      {gesprek.verwachtingen && (
        <section className="card-cream p-5">
          <p className="eyebrow-rule start">Wat de klant verwacht</p>
          <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{gesprek.verwachtingen}</p>
        </section>
      )}

      <Blok kop="Wat er is afgesproken" items={gesprek.afspraken} />
      <Blok kop="Wat er moet gebeuren" items={gesprek.vervolgstappen} />

      {/* Wat er niet besproken is. Bewust apart en met nadruk: dit is wat je bij
          het volgende gesprek nodig hebt, en het is het enige dat je nergens
          anders terugvindt. */}
      {gesprek.ontbreekt.length > 0 && (
        <section className="card border-warn/30 p-5">
          <h2 className="eyebrow-rule start mb-3">Dit is niet besproken</h2>
          <p className="mb-3 text-xs text-text-muted">
            Zonder deze punten kan het team geen voorstel afmaken. Vraag ze bij het volgende
            contact.
          </p>
          <ul className="space-y-2">
            {gesprek.ontbreekt.map((item, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-warn" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Het origineel blijft altijd bewaard. Een samenvatting waarvan je het
          origineel niet meer hebt is niet na te kijken, en juist bij een
          klantgesprek wil je terug kunnen naar wat er letterlijk gezegd is. */}
      <details className="card p-5">
        <summary className="cursor-pointer text-sm text-text-muted hover:text-text">
          Het hele gesprek teruglezen
        </summary>
        <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap text-text-muted">
          {gesprek.ruweTekst}
        </p>
      </details>
    </div>
  );
}
