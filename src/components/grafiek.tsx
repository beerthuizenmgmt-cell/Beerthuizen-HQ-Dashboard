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
  leeg = "Nog niets te tonen.",
}: {
  data: Staaf[];
  eenheid?: string;
  leeg?: string;
}) {
  const hoogste = Math.max(...data.map((d) => d.waarde), 0);
  if (data.length === 0 || hoogste === 0) {
    return <p className="py-6 text-center text-xs text-text-faint">{leeg}</p>;
  }

  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs text-text-muted">{d.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, (d.waarde / hoogste) * 100)}%`,
                background: d.kleur ?? "var(--accent)",
              }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-xs tabular-nums">
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
  leeg = "Nog geen verloop te zien.",
}: {
  data: { dag: string; waarde: number }[];
  leeg?: string;
}) {
  const hoogste = Math.max(...data.map((d) => d.waarde), 0);
  if (data.length === 0 || hoogste === 0) {
    return <p className="py-6 text-center text-xs text-text-faint">{leeg}</p>;
  }

  return (
    <div className="flex h-28 items-stretch gap-1.5">
      {data.map((d) => (
        <div key={d.dag} className="flex flex-1 flex-col items-center gap-1.5">
          {/* De staaf staat absoluut in een vak met een vaste hoogte. Een
              percentage-hoogte rekent tegen de ouder, en een flexkolom zonder
              eigen hoogte is nul — dan zijn alle staven onzichtbaar terwijl de
              cijfers kloppen. */}
          <div className="relative w-full flex-1">
            <div
              className="absolute bottom-0 w-full rounded-t bg-accent/70"
              style={{ height: `${Math.max(4, (d.waarde / hoogste) * 100)}%` }}
              title={`${d.dag}: ${d.waarde}`}
            />
          </div>
          <span className="shrink-0 text-[10px] text-text-faint">
            {d.dag}
            <span className="ml-1 tabular-nums text-text-muted">{d.waarde || ""}</span>
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
