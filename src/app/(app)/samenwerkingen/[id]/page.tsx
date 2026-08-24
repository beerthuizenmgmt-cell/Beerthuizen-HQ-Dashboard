import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/access";
import { db } from "@/lib/db";
import { SamenwerkingActies } from "@/components/samenwerking-acties";

export const dynamic = "force-dynamic";

export default async function SamenwerkingPage({ params }: PageProps<"/samenwerkingen/[id]">) {
  await requireOwner();
  const { id } = await params;

  const overeenkomst = await db.samenwerking.findUnique({
    where: { id },
    include: { agent: { select: { name: true } } },
  });
  if (!overeenkomst) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="print:hidden">
        <Link href="/samenwerkingen" className="text-xs text-text-muted hover:text-text">
          ← Samenwerkingen
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{overeenkomst.bedrijf}</h1>
        <p className="mt-1 text-sm text-text-muted">
          Opgesteld door {overeenkomst.agent?.name ?? "het team"} ·{" "}
          {overeenkomst.afspraken.length} afspraak/afspraken
        </p>
      </header>

      <SamenwerkingActies id={overeenkomst.id} status={overeenkomst.status} />

      {/* Het document zelf. Bij afdrukken valt de rest van het scherm weg, zodat
          wat er op papier komt precies de overeenkomst is en niet het dashboard
          eromheen. */}
      <article className="card p-8 leading-relaxed whitespace-pre-wrap print:border-0 print:p-0">
        {overeenkomst.tekst}
      </article>
    </div>
  );
}
