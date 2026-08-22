"use client";

import { useEffect, useState } from "react";
import type { TeamRegel } from "@/lib/cockpit";

// De regels onder het brein.
//
// Ze rollen door en veranderen steeds, maar ze zijn niet verzonnen: elke regel
// gaat over een echte agent, met zijn echte stand en zijn echte werkvoorraad.
// Willekeurige tekens die technisch ogen zijn decoratie die doet alsof ze iets
// betekent — en dat is precies wat dit dashboard nergens doet.
//
// De vuurwaarde is het enige wat beweegt zonder dat er iets gebeurt: dat is een
// ritme, geen meting, en het staat er daarom als "0.42" achter de agent en niet
// als iets wat je kunt aflezen.

function regelVoor(lid: TeamRegel, tik: number): string {
  const sleutel = lid.sleutel.padEnd(10, " ");
  const staat = lid.bezig ? "ACTIEF" : lid.stand === "op pauze" ? "PAUZE " : "RUST  ";

  // Een ritme dat per agent verschilt, zodat de kolom niet in de pas loopt.
  const puls = (Math.sin(tik * 0.7 + lid.naam.length) + 1) / 2;
  const vuur = (lid.bezig ? 0.55 + puls * 0.45 : puls * 0.12).toFixed(2);

  return `${sleutel} ${staat}  vuur ${vuur}  ${lid.stand}`;
}

export function BreinCodestroom({
  team,
  groot = false,
}: {
  team: TeamRegel[];
  /// Op het volledige scherm mag de strook groter: daar sta je verder van af en
  /// is er ruimte zat.
  groot?: boolean;
}) {
  const [tik, setTik] = useState(0);

  useEffect(() => {
    // Wie beweging heeft uitgezet krijgt één stilstaande momentopname.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Elke seconde één stap. Sneller wordt geflikker dat je niet kunt lezen,
    // en dat is het tegenovergestelde van een afleesbare regel.
    const klok = setInterval(() => {
      // Niet doortellen als niemand kijkt; een dashboard staat de hele dag open.
      if (document.visibilityState === "visible") setTik((n) => n + 1);
    }, 1000);

    return () => clearInterval(klok);
  }, []);

  if (team.length === 0) return null;

  // Vier regels tegelijk, die door de ploeg heen rollen.
  const zichtbaar = Array.from({ length: 4 }, (_, i) => team[(tik + i) % team.length]);

  // Een eigen strook onder het brein, niet eroverheen. Over de zwermen heen
  // botsen de regels met de deeltjes en lees je geen van beide goed.
  return (
    <div className={`pointer-events-none ${groot ? "px-8 pb-6" : "px-5 pb-3"}`} aria-hidden>
      <div
        className={`font-mono leading-tight ${groot ? "space-y-1.5 text-sm sm:text-base" : "space-y-0.5 text-[10px]"}`}
      >
        {zichtbaar.map((lid, i) => (
          <p
            key={`${lid.id}-${i}`}
            className="truncate"
            style={{
              // De bovenste is het verst weg en het zwakst; de onderste net
              // binnengekomen. Zo lijkt het een stroom in plaats van vier
              // losse regels.
              color: lid.color ?? "var(--text-faint)",
              opacity: [0.22, 0.35, 0.5, 0.75][i],
            }}
          >
            {regelVoor(lid, tik + i)}
          </p>
        ))}
      </div>
    </div>
  );
}
