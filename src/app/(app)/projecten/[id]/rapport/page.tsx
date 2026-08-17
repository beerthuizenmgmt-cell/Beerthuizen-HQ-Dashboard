import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { bouwCampagnerapport, type Meting } from "@/lib/rapportage";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// Het campagnerapport zoals het naar de klant zou gaan.
//
// In de lichte huisstijl, want dit is wat naar buiten kijkt. Zodra er een logo
// en kleur van de klant bekend zijn neemt het rapport die over.
//
// Boven het rapport staat wat er nog ontbreekt — voor jou, niet voor de klant.
// Dat blok verdwijnt zodra alles binnen is, en pas dan is het rapport klaar om
// te versturen.

function getal(waarde: number | null): string {
  return waarde === null ? "—" : waarde.toLocaleString("nl-NL");
}

/// Een cijfer met de basis eronder. "84.200" is iets anders dan "84.200, van
/// drie van de vijf creators", en dat verschil hoort zichtbaar te zijn.
function Cijfer({ label, meting, achtervoegsel = "" }: { label: string; meting: Meting; achtervoegsel?: string }) {
  const onvolledig = meting.vanHoeveel > 0 && meting.vanHoeveel < meting.vanTotaal;

  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-2xl font-semibold">
        {getal(meting.waarde)}
        {meting.waarde !== null && achtervoegsel}
      </p>
      {onvolledig && (
        <p className="text-xs text-warn">
          van {meting.vanHoeveel} van de {meting.vanTotaal} creators
        </p>
      )}
      {meting.waarde === null && <p className="text-xs text-text-faint">nog niet gemeten</p>}
    </div>
  );
}

export default async function RapportPagina({ params }: PageProps<"/projecten/[id]/rapport">) {
  await requireUser();
  const { id } = await params;

  const rapport = await bouwCampagnerapport(id);
  if (!rapport) notFound();

  const { campagne, opzet, totalen, perCreator, gaten, compleet } = rapport;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/projecten/${id}`} className="text-xs text-text-muted hover:text-text">
          ← Terug naar de campagne
        </Link>
        <span className={`chip text-xs ${compleet ? "border-success/40 text-success" : "border-warn/40 text-warn"}`}>
          {compleet ? "Klaar om te versturen" : "Nog niet compleet"}
        </span>
      </div>

      {/* Voor jou, niet voor de klant */}
      {gaten.length > 0 && (
        <section className="card border border-warn/40 bg-warn/5 p-4">
          <p className="text-sm font-semibold text-warn">
            Dit ontbreekt nog — de klant ziet dit blok niet
          </p>
          <ul className="mt-2 space-y-0.5 text-xs text-text-muted">
            {gaten.map((gat, index) => (
              <li key={index}>· {gat}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Het rapport zelf */}
      <div className="klantpagina rounded-2xl p-8">
        <header className="mb-8">
          <p className="eyebrow">Beerthuizen Management</p>
          <h1 className="mt-2 text-3xl">{campagne.naam}</h1>
          <p className="mt-2 text-sm text-text-muted">
            {campagne.klant ?? "klant onbekend"}
            {campagne.periodeVan && campagne.periodeTot
              ? ` · ${formatDate(campagne.periodeVan)} tot ${formatDate(campagne.periodeTot)}`
              : campagne.deadline
                ? ` · oplevering ${formatDate(campagne.deadline)}`
                : ""}
          </p>
        </header>

        {(opzet.doel || opzet.doelgroep || opzet.budget) && (
          <dl className="mb-8 grid gap-4 border-y border-border py-5 sm:grid-cols-3">
            {[
              ["Doel", opzet.doel],
              ["Doelgroep", opzet.doelgroep],
              ["Budget", opzet.budget],
            ]
              .filter(([, waarde]) => waarde)
              .map(([label, waarde]) => (
                <div key={String(label)}>
                  <dt className="text-xs text-text-muted">{label}</dt>
                  <dd className="mt-0.5 text-sm">{waarde}</dd>
                </div>
              ))}
          </dl>
        )}

        <section className="mb-8">
          <h2 className="eyebrow-rule start mb-4">Resultaten</h2>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <div>
              <p className="text-xs text-text-muted">Creators</p>
              <p className="text-2xl font-semibold">{totalen.creators}</p>
              <p className="text-xs text-text-faint">{totalen.contentstukken} contentstukken</p>
            </div>
            <Cijfer label="Bereik" meting={totalen.bereik} />
            <Cijfer label="Weergaven" meting={totalen.views} />
            <Cijfer label="Interacties" meting={totalen.interacties} />
          </div>

          {totalen.engagementRate.waarde !== null && (
            <p className="mt-4 text-sm text-text-muted">
              Engagement:{" "}
              <span className="font-semibold text-text">{totalen.engagementRate.waarde}%</span>
              {totalen.engagementRate.vanHoeveel < totalen.engagementRate.vanTotaal &&
                ` — gerekend over ${totalen.engagementRate.vanHoeveel} van de ${totalen.engagementRate.vanTotaal} creators`}
            </p>
          )}
        </section>

        <section>
          <h2 className="eyebrow-rule start mb-4">Per creator</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-muted">
                  <th className="pb-2 pr-4 font-normal">Creator</th>
                  <th className="pb-2 pr-4 font-normal">Kanaal</th>
                  <th className="pb-2 pr-4 text-right font-normal">Content</th>
                  <th className="pb-2 pr-4 text-right font-normal">Bereik</th>
                  <th className="pb-2 pr-4 text-right font-normal">Weergaven</th>
                  <th className="pb-2 pr-4 text-right font-normal">Interacties</th>
                  <th className="pb-2 text-right font-normal">Engagement</th>
                </tr>
              </thead>
              <tbody>
                {perCreator.map((creator) => (
                  <tr key={creator.naam} className="border-b border-border/50">
                    <td className="py-2.5 pr-4 font-medium">{creator.naam}</td>
                    <td className="py-2.5 pr-4 text-text-muted">{creator.kanaal}</td>
                    <td className="py-2.5 pr-4 text-right">{creator.contentstukken}</td>
                    <td className="py-2.5 pr-4 text-right">{getal(creator.bereik)}</td>
                    <td className="py-2.5 pr-4 text-right">{getal(creator.views)}</td>
                    <td className="py-2.5 pr-4 text-right">{getal(creator.interacties)}</td>
                    <td className="py-2.5 text-right">
                      {creator.engagementRate !== null ? `${creator.engagementRate}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {perCreator.some((c) => c.ontbreekt.length > 0) && (
            <p className="mt-3 text-xs text-text-faint">
              Een streepje betekent dat dit cijfer niet is aangeleverd. We vullen niets in wat we niet
              gemeten hebben.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
