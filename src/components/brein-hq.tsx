import Link from "next/link";
import type { TeamRegel } from "@/lib/cockpit";
import { BreinCanvas } from "./brein-canvas";

// Het brein bovenaan HQ, met de bezetting ernaast.
//
// Links de negen wolken; rechts dezelfde negen als lijst, want een naam die
// over een wolk heen ligt lees je in één oogopslag niet terug. De lijst is de
// leesbare versie van hetzelfde beeld — en op een telefoon, waar het brein
// klein wordt, is die lijst waar je hem echt op naslaat.

export function BreinHQ({ team }: { team: TeamRegel[] }) {
  if (team.length === 0) return null;

  const actief = team.filter((l) => l.bezig).length;

  return (
    // Geen kader en geen eigen achtergrond: het brein zweeft op het dashboard
    // zelf, tussen de sterren. Een omlijnd vlak eromheen maakte er een plaatje
    // in een lijstje van, en juist het uitwaaieren van de zwermen naar het
    // donker is wat het ruimtelijk maakt.
    <section className="relative">
      <div className="flex flex-col lg:flex-row">
        {/* Het brein */}
        {/* Groter dan het eerst was. Het is het eerste wat je ziet en het moet
            iets voorstellen; op vierhonderd pixels hoog werd het een strookje
            tussen de kopregel en de cijfers. */}
        <div className="relative min-h-[380px] flex-1 sm:min-h-[480px] lg:min-h-[580px]">
          <BreinCanvas team={team} />

          <div className="pointer-events-none absolute top-4 left-5">
            <p className="font-mono text-[10px] tracking-[0.2em] text-white/40 uppercase">
              Beerthuizen · brein
            </p>
            <p className="mt-1 font-mono text-xs text-white/70">
              {actief > 0
                ? `${actief} van de ${team.length} ${actief === 1 ? "vuurt" : "vuren"} nu`
                : `${team.length} agents · in rust`}
            </p>
          </div>
        </div>

        {/* De bezetting */}
        <aside className="border-t border-white/5 p-4 lg:w-60 lg:shrink-0 lg:border-t-0 lg:border-l">
          <p className="mb-3 font-mono text-[10px] tracking-[0.2em] text-white/40 uppercase">
            Agents
          </p>

          <ul className="space-y-1">
            {team.map((lid) => {
              const kleur = lid.color ?? "#6366f1";
              const slaapt = lid.stand === "op pauze";
              return (
                <li key={lid.id}>
                  <Link
                    href={`/team/dm-${lid.sleutel}`}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/5"
                    style={{ opacity: slaapt ? 0.45 : 1 }}
                  >
                    {/* Het bolletje is de kleur van zijn wolk in het brein; zo
                        koppel je de lijst aan het beeld ernaast. */}
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        background: kleur,
                        boxShadow: lid.bezig ? `0 0 8px 1px ${kleur}` : "none",
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-xs text-white/90">
                        {lid.naam}
                      </span>
                      <span className="block truncate font-mono text-[10px] text-white/35">
                        {lid.rol}
                      </span>
                    </span>
                    {lid.bezig && (
                      <span
                        className="shrink-0 font-mono text-[9px] tracking-wider uppercase"
                        style={{ color: kleur }}
                      >
                        actief
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </section>
  );
}
