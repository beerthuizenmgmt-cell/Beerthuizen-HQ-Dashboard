import Link from "next/link";
import { requireOwner } from "@/lib/access";
import { db } from "@/lib/db";
import { SCENARIOS, tijdlijnVan, loopStatus } from "@/lib/scenarios";
import { ScenarioPaneel } from "@/components/scenario-paneel";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

// Een scenario laat de hele keten denken: Daan schakelt collega's in, en elk
// van hen doet er twintig tot zeventig seconden over. Vandaar het maximum dat
// het plan toestaat. Loopt het er alsnog overheen, dan blijft de run zichtbaar
// als afgebroken in plaats van te blijven hangen.
export const maxDuration = 300;

// Testscenario's: het bureau nabootsen en kijken wat er echt gebeurt.
//
// De tijdlijn is belangrijker dan het antwoord. Een agent die een mooi verhaal
// schrijft maar geen taak aanmaakt en niemand inschakelt, heeft de opdracht
// niet uitgevoerd — dat zie je niet aan zijn tekst, wel aan wat er in de
// tijdlijn gebeurde.

const SOORT_KLEUR: Record<string, string> = {
  denkbeurt: "text-text-muted",
  taak: "text-accent",
  vraag: "text-warn",
  telegram: "text-warn",
  goedkeuring: "text-danger",
};

export default async function ScenarioPagina() {
  await requireOwner();

  const runs = await db.testrun.findMany({ orderBy: { gestartOp: "desc" }, take: 20 });

  const keuzes = SCENARIOS.map((s) => {
    const eigen = runs.filter((r) => r.scenario === s.key);
    const metScore = eigen.find((r) => r.eindscore !== null);
    return {
      key: s.key,
      naam: s.naam,
      startAgent: s.startAgent,
      opdracht: s.opdracht,
      letOp: s.letOp,
      laatsteScore: metScore?.eindscore ?? null,
      aantalKeer: eigen.length,
    };
  });

  const laatste = runs[0] ? await tijdlijnVan(runs[0].id) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Testscenario&apos;s</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Acht opdrachten die het bureau nabootsen zoals het echt werkt. De agents draaien met hun echte
          gereedschap en maken dus echte taken aan — alleen wat naar buiten zou gaan blijft hangen in de
          goedkeuringen, precies zoals in het gewone werk.
        </p>
      </header>

      <ScenarioPaneel scenarios={keuzes} />

      {/* ── Wat er de laatste keer gebeurde ───────────────────────────── */}
      {laatste && (
        <section>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="eyebrow-rule start">Laatste run — {laatste.run.naam}</h2>
            <span className="text-xs text-text-faint">{timeAgo(laatste.run.gestartOp)}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "agents gebruikt", waarde: String(laatste.samenvatting.agentsGebruikt.length) },
              { label: "taken aangemaakt", waarde: String(laatste.samenvatting.takenAangemaakt) },
              { label: "vragen aan jou", waarde: String(laatste.samenvatting.vragenAanEnriqueo) },
              { label: "kosten", waarde: `€ ${laatste.samenvatting.kosten.toFixed(4)}` },
            ].map((tegel) => (
              <div key={tegel.label} className="card p-4">
                <p className="text-2xl font-semibold">{tegel.waarde}</p>
                <p className="mt-0.5 text-xs text-text-muted">{tegel.label}</p>
              </div>
            ))}
          </div>

          {laatste.run.fout && (
            <p className="mt-3 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
              {laatste.run.fout}
            </p>
          )}

          {/* Afgekapt halverwege. Het werk dat er staat is echt gebeurd; alleen
              de afronding ontbreekt. Dat verschil moet je kunnen zien. */}
          {loopStatus(laatste.run) === "afgebroken" && (
            <p className="mt-3 rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-xs text-warn">
              Deze run is halverwege afgebroken — het verzoek liep over de tijdslimiet. Wat je hieronder
              ziet is echt gebeurd; alleen de afronding van {laatste.run.naam.split(" ")[0]} ontbreekt.
            </p>
          )}
          {loopStatus(laatste.run) === "bezig" && (
            <p className="mt-3 verdiept px-3 py-2 text-xs text-text-muted">
              Loopt nog. Ververs deze pagina over een minuut.
            </p>
          )}

          {/* De tijdlijn: wat er werkelijk gebeurde, niet wat de agent zegt */}
          <div className="card mt-4 lijst">
            {laatste.tijdlijn.length === 0 ? (
              <p className="p-4 text-sm text-text-muted">
                Er is niets gebeurd. De agent heeft geantwoord zonder iets aan te maken of iemand in te
                schakelen — bij een opdracht als deze is dat op zichzelf een uitkomst.
              </p>
            ) : (
              laatste.tijdlijn.map((punt, index) => (
                <div key={index} className="flex gap-3 px-4 py-2 text-sm">
                  <span className="w-12 shrink-0 text-xs text-text-faint">
                    {punt.moment.toISOString().slice(11, 16)}
                  </span>
                  <span className="w-20 shrink-0 truncate font-medium">{punt.wie}</span>
                  <span className={`min-w-0 flex-1 ${SOORT_KLEUR[punt.soort] ?? ""}`}>{punt.wat}</span>
                </div>
              ))
            )}
          </div>

          {laatste.run.antwoord && (
            <details className="card mt-3 p-4">
              <summary className="cursor-pointer text-sm text-text-muted hover:text-text">
                Wat de agent antwoordde
              </summary>
              <p className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-sm leading-relaxed">
                {laatste.run.antwoord}
              </p>
            </details>
          )}
        </section>
      )}

      {runs.length > 1 && (
        <section>
          <h2 className="eyebrow-rule start mb-3">Eerdere runs</h2>
          <div className="card lijst">
            {runs.slice(1).map((run) => {
              const stand = loopStatus(run);
              return (
                <div key={run.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{run.naam}</span>
                  {run.eindscore !== null && (
                    <span className={run.eindscore >= 7 ? "text-success" : "text-warn"}>
                      {run.eindscore.toFixed(1)}/10
                    </span>
                  )}
                  {stand === "mislukt" && <span className="text-xs text-danger">mislukt</span>}
                  {stand === "afgebroken" && <span className="text-xs text-warn">afgebroken</span>}
                  {stand === "bezig" && <span className="text-xs text-text-muted">loopt nog</span>}
                  <span className="text-xs text-text-faint">{timeAgo(run.gestartOp)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <p className="text-xs text-text-faint">
        Losse opdrachten uitproberen kan bij{" "}
        <Link href="/proefdraaien" className="underline">
          Proefdraaien
        </Link>
        .
      </p>
    </div>
  );
}
