// Kleine grafieken zonder bibliotheek.
//
// Bewust in gewone SVG: een grafiekbibliotheek is honderden kilobytes voor wat
// hier neerkomt op een paar rechthoeken. Dit laadt meteen mee, werkt zonder
// javascript, en past zich aan de themakleuren aan.
//
// Alles hieronder toont alleen wat er echt in de database staat. Is er niets,
// dan zeggen we dat — een lege grafiek met een vloeiende lijn erdoorheen suggereert
// een verloop dat er niet is.

export type Staaf = { label: string; waarde: number; kleur?: string };

/// Staafjes naast elkaar. Voor verdelingen: taken per kolom, runs per agent.
export function Staafjes({
  data,
  eenheid = "",
  kleur = "var(--accent)",
  leeg = "Nog niets te tonen.",
}: {
  data: Staaf[];
  eenheid?: string;
  /// Eén kleur voor de hele grafiek. Staat er een kleur op een losse staaf —
  /// zoals bij taakstatussen — dan wint die.
  kleur?: string;
  leeg?: string;
}) {
  const hoogste = Math.max(...data.map((d) => d.waarde), 0);
  if (data.length === 0 || hoogste === 0) {
    return <p className="py-6 text-center text-xs text-text-faint">{leeg}</p>;
  }

  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-xs text-text-muted">{d.label}</span>
          {/* De grijze baan blijft zichtbaar onder de balk, zodat je ziet hoe
              groot het aandeel is en niet alleen hoe lang het balkje. */}
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-bg">
            <div
              className="groeit h-full rounded-full"
              style={{
                width: `${Math.max(3, (d.waarde / hoogste) * 100)}%`,
                background: d.kleur ?? kleur,
                boxShadow: `0 0 12px -4px ${d.kleur ?? kleur}`,
                // Van boven naar beneden, met een tel ertussen: zo lees je de
                // volgorde in plaats van dat alles tegelijk opspringt.
                animationDelay: `${i * 70}ms`,
              }}
            />
          </div>
          <span className="w-14 shrink-0 text-right text-xs font-medium tabular-nums">
            {d.waarde}
            {eenheid}
          </span>
        </div>
      ))}
    </div>
  );
}

/// Verloop over de tijd, als staafjes per dag. Geen vloeiende lijn: die
/// suggereert tussenliggende metingen die er niet zijn.
export function PerDag({
  data,
  kleur = "var(--ok)",
  leeg = "Nog geen verloop te zien.",
}: {
  data: { dag: string; waarde: number }[];
  kleur?: string;
  leeg?: string;
}) {
  const hoogste = Math.max(...data.map((d) => d.waarde), 0);
  if (data.length === 0 || hoogste === 0) {
    return <p className="py-6 text-center text-xs text-text-faint">{leeg}</p>;
  }

  return (
    <div className="flex h-28 items-stretch gap-1.5">
      {data.map((d, i) => (
        <div key={d.dag} className="flex flex-1 flex-col items-center gap-1.5">
          {/* De staaf staat absoluut in een vak met een vaste hoogte. Een
              percentage-hoogte rekent tegen de ouder, en een flexkolom zonder
              eigen hoogte is nul — dan zijn alle staven onzichtbaar terwijl de
              cijfers kloppen. */}
          <div className="relative w-full flex-1">
            <div
              className="rijst absolute bottom-0 w-full rounded-md"
              style={{
                height: `${Math.max(5, (d.waarde / hoogste) * 100)}%`,
                animationDelay: `${i * 60}ms`,
                background: kleur,
                // Vandaag staat rechts en is nog bezig; die dimmen we niet weg.
                opacity: d.waarde === 0 ? 0.18 : i === data.length - 1 ? 1 : 0.8,
                boxShadow: d.waarde > 0 ? `0 0 14px -6px ${kleur}` : undefined,
              }}
              title={`${d.dag}: ${d.waarde}`}
            />
          </div>
          <span
            className={`shrink-0 text-[10px] ${
              i === data.length - 1 ? "font-medium text-text-muted" : "text-text-faint"
            }`}
          >
            {d.dag}
            {d.waarde > 0 && <span className="ml-1 tabular-nums text-text">{d.waarde}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/// Voor wat er nog niet gekoppeld is. Eerlijker dan een lege grafiek: die ziet
/// eruit alsof er niets gebeurt, terwijl er in werkelijkheid niets gemeten wordt.
export function NogNietGekoppeld({ wat, watErMoet }: { wat: string; watErMoet: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
      <p className="text-sm text-text-muted">Nog geen {wat}.</p>
      <p className="mt-1 text-xs text-text-faint">{watErMoet}</p>
    </div>
  );
}

/// Een ring met het totaal in het midden.
///
/// Voor een verdeling waarvan het totaal net zo interessant is als de verhouding
/// — hoeveel taken er zijn én hoe ze verdeeld staan. Als staafjes zie je de
/// verhouding wel maar moet je optellen; zo staat het er allebei.
///
/// Getekend met stroke-dasharray op één cirkel: elk segment krijgt een stukje
/// van de omtrek en een verschuiving. Geen bibliotheek, geen javascript.
export function Ring({
  data,
  midden,
  onderschrift,
  leeg = "Nog niets te tonen.",
}: {
  data: Staaf[];
  midden?: string | number;
  onderschrift?: string;
  leeg?: string;
}) {
  const totaal = data.reduce((n, d) => n + d.waarde, 0);
  if (data.length === 0 || totaal === 0) {
    return <p className="py-6 text-center text-xs text-text-faint">{leeg}</p>;
  }

  const straal = 42;
  const omtrek = 2 * Math.PI * straal;

  // Een klein gaatje tussen de segmenten, zodat aangrenzende kleuren niet in
  // elkaar overlopen. Bij één segment slaan we dat over — anders zit er een
  // kier in een hele ring.
  const kier = data.length > 1 ? 1.5 : 0;

  let verstreken = 0;
  const segmenten = data.map((d, index) => {
    const lengte = (d.waarde / totaal) * omtrek;
    const segment = {
      key: d.label,
      beurt: index,
      kleur: d.kleur ?? "var(--accent)",
      streep: `${Math.max(0, lengte - kier)} ${omtrek - Math.max(0, lengte - kier)}`,
      verschuiving: -verstreken,
    };
    verstreken += lengte;
    return segment;
  });

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0">
        <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
          <circle cx="50" cy="50" r={straal} fill="none" stroke="var(--bg)" strokeWidth="11" />
          {segmenten.map((seg) => (
            <circle
              key={seg.key}
              cx="50"
              cy="50"
              r={straal}
              fill="none"
              stroke={seg.kleur}
              strokeWidth="11"
              strokeDasharray={seg.streep}
              strokeDashoffset={seg.verschuiving}
              strokeLinecap="butt"
            >
              {/* De ring tekent zichzelf, segment na segment. Van niets naar de
                  volle lengte, zodat je de verhouding ziet ontstaan in plaats
                  van dat er ineens een schijf staat. */}
              <animate
                attributeName="stroke-dasharray"
                from={`0 ${omtrek}`}
                to={seg.streep}
                dur="0.9s"
                begin={`${seg.beurt * 0.14}s`}
                fill="freeze"
                calcMode="spline"
                keySplines="0.16 1 0.3 1"
              />
            </circle>
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl leading-none font-semibold tabular-nums">
            {midden ?? totaal}
          </span>
          {onderschrift && (
            <span className="mt-0.5 text-[10px] text-text-faint">{onderschrift}</span>
          )}
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: d.kleur ?? "var(--accent)" }}
            />
            <span className="min-w-0 flex-1 truncate text-text-muted">{d.label}</span>
            <span className="shrink-0 tabular-nums">{d.waarde}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
