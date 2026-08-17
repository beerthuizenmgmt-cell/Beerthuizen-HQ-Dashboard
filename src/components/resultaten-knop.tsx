"use client";

import { useState } from "react";
import { vraagCreatorResultaten } from "@/lib/actions/portaal";
import { useActie } from "./use-actie";
import { ActieFout } from "./actie-fout";

// Creators om hun resultaten vragen.
//
// De links gaan niet vanzelf de deur uit. Je krijgt ze hier te zien en stuurt
// ze zelf — net als bij een klantlink. Een systeem dat ongevraagd berichten
// naar creators stuurt is een systeem dat je niet meer vertrouwt.

export function ResultatenKnop({ creators }: { creators: { id: string; naam: string }[] }) {
  const [gekozen, setGekozen] = useState<string[]>(creators.map((c) => c.id));
  const [links, setLinks] = useState<{ creatorNaam: string; link: string; nieuw: boolean }[]>([]);
  const [gekopieerd, setGekopieerd] = useState<string | null>(null);
  const { bezig, fout, doe } = useActie();

  const wissel = (id: string) =>
    setGekozen(gekozen.includes(id) ? gekozen.filter((x) => x !== id) : [...gekozen, id]);

  return (
    <div className="card mt-3 p-4">
      <ActieFout fout={fout} />

      <p className="text-sm font-semibold">Resultaten opvragen</p>
      <p className="mt-1 text-xs text-text-muted">
        Elke creator krijgt een eigen link die al weet om welke campagne het gaat. Hij hoeft niet in te
        loggen en is in een paar minuten klaar.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {creators.map((creator) => (
          <button
            key={creator.id}
            type="button"
            onClick={() => wissel(creator.id)}
            className={`chip text-xs ${gekozen.includes(creator.id) ? "border-accent text-accent" : "text-text-faint"}`}
          >
            {gekozen.includes(creator.id) ? "✓ " : ""}
            {creator.naam}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="btn btn-primary mt-3 text-xs"
        disabled={bezig || gekozen.length === 0}
        onClick={() =>
          doe(async () => {
            const uitkomst = await vraagCreatorResultaten(gekozen);
            if (uitkomst.error) throw new Error(uitkomst.error);
            setLinks(uitkomst.links ?? []);
          })
        }
      >
        {bezig ? "Klaarzetten…" : `Link klaarzetten voor ${gekozen.length}`}
      </button>

      {links.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-border pt-3">
          <p className="text-xs text-success">Klaar. Stuur deze links naar je creators:</p>
          {links.map((rij) => (
            <div key={rij.link} className="flex flex-wrap items-center gap-2">
              <span className="w-32 shrink-0 truncate text-xs">{rij.creatorNaam}</span>
              <code className="min-w-0 flex-1 truncate rounded bg-bg px-2 py-1 text-xs">{rij.link}</code>
              {!rij.nieuw && <span className="text-xs text-text-faint">bestond al</span>}
              <button
                type="button"
                className="btn btn-ghost text-xs"
                onClick={() => {
                  void navigator.clipboard.writeText(rij.link);
                  setGekopieerd(rij.link);
                }}
              >
                {gekopieerd === rij.link ? "gekopieerd" : "kopieer"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
