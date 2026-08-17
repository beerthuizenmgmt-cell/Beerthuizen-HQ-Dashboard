import { notFound } from "next/navigation";
import { bouwKlantPortal, klantVoorPortalToken } from "@/lib/klantportal";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// Wat de klant ziet.
//
// In de lichte huisstijl van beerthuizenmanagement.nl, want dit is de kant die
// naar buiten kijkt. Zodra er een logo en een kleur van de klant zelf bekend
// zijn, neemt de pagina die over — daarom staan ze als CSS-variabele en niet
// hard in de opmaak.
//
// Er staat hier geen enkel intern gegeven: geen marges, geen notities, geen
// creatorbeoordelingen, geen agents, geen kosten. Dat is geen instelling maar
// een eigenschap van wat bouwKlantPortal teruggeeft.

const STATUS_LABEL: Record<string, string> = {
  nieuw: "In voorbereiding",
  info_nodig: "In voorbereiding",
  in_voorbereiding: "In voorbereiding",
  loopt: "Loopt",
  afgerond: "Afgerond",
};

function getal(waarde: number | null): string {
  return waarde === null ? "—" : waarde.toLocaleString("nl-NL");
}

export default async function KlantPortalPagina({ params }: PageProps<"/klant/[token]">) {
  const { token } = await params;

  const clientId = await klantVoorPortalToken(token);
  if (!clientId) notFound();

  const portal = await bouwKlantPortal(clientId);
  if (!portal) notFound();

  const { klant, campagnes, facturen } = portal;

  return (
    <div
      className="klantpagina min-h-screen px-5 py-10 sm:py-14"
      style={klant.kleur ? ({ "--accent": klant.kleur } as React.CSSProperties) : undefined}
    >
      <div className="mx-auto max-w-3xl">
        <header className="mb-10">
          {klant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={klant.logoUrl} alt={klant.naam} className="mb-4 h-10 w-auto" />
          ) : (
            <p className="eyebrow">Beerthuizen Management</p>
          )}
          <h1 className="mt-2 text-3xl">{klant.naam}</h1>
          <p className="mt-2 text-sm text-text-muted">
            Hier vind je je campagnes, de creators die eraan werkten, de resultaten en je facturen.
          </p>
        </header>

        {campagnes.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-text-muted">
              Er staan nog geen campagnes klaar. Zodra we beginnen verschijnen ze hier.
            </p>
          </div>
        ) : (
          <section className="space-y-4">
            <h2 className="eyebrow-rule start">Campagnes</h2>

            {campagnes.map((campagne) => (
              <article key={campagne.id} className="card p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-lg font-semibold">{campagne.naam}</h3>
                  <span className="chip text-xs">
                    {STATUS_LABEL[campagne.status] ?? campagne.status}
                  </span>
                </div>
                {campagne.deadline && (
                  <p className="mt-1 text-xs text-text-muted">
                    Oplevering {formatDate(campagne.deadline)}
                  </p>
                )}

                {campagne.resultaten && (
                  <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
                    {[
                      ["Bereik", campagne.resultaten.bereik],
                      ["Weergaven", campagne.resultaten.views],
                      ["Interacties", campagne.resultaten.interacties],
                    ].map(([label, waarde]) => (
                      <div key={String(label)}>
                        <dt className="text-xs text-text-muted">{label}</dt>
                        <dd className="text-xl font-semibold">{getal(waarde as number | null)}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {campagne.creators.length > 0 && (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="eyebrow mb-2">Creators</p>
                    <ul className="space-y-1.5 text-sm">
                      {campagne.creators.map((creator) => (
                        <li key={creator.naam} className="flex flex-wrap items-baseline gap-2">
                          <span className="font-medium">{creator.naam}</span>
                          {creator.kanalen.length > 0 && (
                            <span className="text-xs text-text-muted">
                              {creator.kanalen.join(" · ")}
                            </span>
                          )}
                          {creator.deliverables.length > 0 && (
                            <span className="text-xs text-text-faint">
                              {creator.deliverables.join(", ")}
                            </span>
                          )}
                          {creator.geleverd && <span className="text-xs text-success">geleverd</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            ))}
          </section>
        )}

        {facturen.length > 0 && (
          <section className="mt-10">
            <h2 className="eyebrow-rule start mb-3">Facturen</h2>
            <div className="card divide-y divide-border">
              {facturen.map((factuur) => (
                <div key={factuur.nummer} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{factuur.nummer}</p>
                    {factuur.omschrijving && (
                      <p className="text-xs text-text-muted">{factuur.omschrijving}</p>
                    )}
                  </div>
                  <span className="text-sm font-medium">
                    €{factuur.bedragEur.toLocaleString("nl-NL")}
                  </span>
                  <span className={`text-xs ${factuur.betaald ? "text-success" : "text-text-muted"}`}>
                    {factuur.betaald ? "voldaan" : `vervalt ${formatDate(factuur.vervaldatum)}`}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-14 border-t border-border pt-6 text-xs text-text-faint">
          Beerthuizen Management · Blaricum
          <span className="mt-1 block">
            Vragen over deze pagina? Neem contact op met je contactpersoon.
          </span>
        </footer>
      </div>
    </div>
  );
}
