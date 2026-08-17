"use client";

import { useState } from "react";
import { draaiScenario } from "@/lib/actions/scenarios";
import { useActie } from "./use-actie";
import { ActieFout } from "./actie-fout";

// De testscenario's afvuren.
//
// Eén scenario tegelijk, en de knop blijft vastzitten zolang hij loopt: negen
// agents die door elkaar heen denken maken een tijdlijn onleesbaar, en de
// tijdlijn is het hele punt.

export type ScenarioKeuze = {
  key: string;
  naam: string;
  startAgent: string;
  opdracht: string;
  letOp: string[];
  laatsteScore: number | null;
  aantalKeer: number;
};

export function ScenarioPaneel({ scenarios }: { scenarios: ScenarioKeuze[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const { bezig, fout, doe } = useActie();

  return (
    <div className="space-y-3">
      <ActieFout fout={fout} />

      {scenarios.map((s) => (
        <div key={s.key} className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium">{s.naam}</h3>
                {s.laatsteScore !== null && (
                  <span
                    className={`chip text-xs ${
                      s.laatsteScore >= 7 ? "border-success/40 text-success" : "border-warn/40 text-warn"
                    }`}
                  >
                    {s.laatsteScore.toFixed(1)}/10
                  </span>
                )}
                {s.aantalKeer > 0 && <span className="text-xs text-text-faint">{s.aantalKeer}× gedraaid</span>}
              </div>
              <p className="mt-1 text-xs text-text-muted">begint bij {s.startAgent}</p>
            </div>

            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="btn btn-ghost text-xs"
                onClick={() => setOpen(open === s.key ? null : s.key)}
              >
                {open === s.key ? "Verbergen" : "Opdracht"}
              </button>
              <button
                type="button"
                className="btn btn-primary text-xs"
                disabled={bezig}
                onClick={() =>
                  doe(async () => {
                    const uitkomst = await draaiScenario(s.key);
                    if (uitkomst.error) throw new Error(uitkomst.error);
                  })
                }
              >
                {bezig ? "Draait…" : "▶ Uitvoeren"}
              </button>
            </div>
          </div>

          {open === s.key && (
            <div className="mt-3 space-y-3 border-t border-border pt-3">
              <div>
                <p className="eyebrow mb-1">De opdracht, letterlijk</p>
                <p className="whitespace-pre-wrap rounded-lg bg-bg px-3 py-2 text-xs">{s.opdracht}</p>
              </div>
              <div>
                <p className="eyebrow mb-1">Waar je op let</p>
                <ul className="space-y-0.5 text-xs text-text-muted">
                  {s.letOp.map((punt, index) => (
                    <li key={index}>· {punt}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      ))}

      <p className="text-xs text-text-faint">
        De opdrachten staan vast. Een herhaling stelt exact dezelfde vraag, zodat een betere uitkomst aan
        de verbetering ligt en niet aan een makkelijkere vraag.
      </p>
    </div>
  );
}
