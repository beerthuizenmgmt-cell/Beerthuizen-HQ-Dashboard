"use client";

import { useActie } from "@/components/use-actie";
import { ActieFout } from "@/components/actie-fout";
import { keurSamenwerkingGoed, markeerSamenwerkingVerstuurd } from "@/lib/actions/samenwerking";

// Wat je met een overeenkomst kunt doen.
//
// Versturen doet het systeem níét. Dit is een document met de naam van het
// bureau eronder; dat gaat de deur uit als jij het doorstuurt, niet als een
// agent besluit dat het klaar is. Hier leg je alleen vast wat je ermee gedaan
// hebt, zodat je later kunt terugzien wat er wanneer is verstuurd.

export function SamenwerkingActies({ id, status }: { id: string; status: string }) {
  const { doe, fout, bezig } = useActie();

  return (
    <div className="print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
          Afdrukken of opslaan als pdf
        </button>

        {status === "concept" && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={bezig}
            onClick={() => doe(() => keurSamenwerkingGoed(id))}
          >
            {bezig ? "Bezig…" : "Nagekeken en akkoord"}
          </button>
        )}

        {status === "goedgekeurd" && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={bezig}
            onClick={() => doe(() => markeerSamenwerkingVerstuurd(id))}
          >
            {bezig ? "Bezig…" : "Ik heb hem verstuurd"}
          </button>
        )}

        {status === "verstuurd" && (
          <span className="text-xs text-text-muted">Verstuurd naar de klant.</span>
        )}
      </div>

      <ActieFout fout={fout} />
    </div>
  );
}
