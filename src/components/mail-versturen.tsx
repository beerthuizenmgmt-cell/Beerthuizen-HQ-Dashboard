"use client";

import { useState } from "react";
import { verstuurMailNu } from "@/lib/actions/mail";
import { useActie } from "@/components/use-actie";
import { ActieFout } from "@/components/actie-fout";

/// De laatste stap: de goedgekeurde mail echt de deur uit doen.
///
/// Bewust een aparte handeling en niet iets dat vanzelf gebeurt bij "akkoord".
/// Akkoord geven bekijk je op je telefoon tussendoor; versturen naar een klant
/// is onomkeerbaar. Wat verstuurd wordt is exact wat je hebt goedgekeurd — de
/// tekst komt uit het verzoek zelf, niet uit een nieuwe ronde van de agent.
export function MailVersturen({ approvalId, ontvanger }: { approvalId: string; ontvanger: string }) {
  const { doe, fout, bezig } = useActie();
  const [uitkomst, setUitkomst] = useState<{ ok: boolean; message: string } | null>(null);
  const [zekerWeten, setZekerWeten] = useState(false);

  if (uitkomst?.ok) {
    return <p className="mt-2 text-xs text-ok">✓ {uitkomst.message}</p>;
  }

  return (
    <div className="mt-2">
      {!zekerWeten ? (
        <button type="button" className="btn btn-ghost text-xs" onClick={() => setZekerWeten(true)}>
          Nu versturen
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-warn">Versturen naar {ontvanger}?</span>
          <button
            type="button"
            className="btn btn-primary text-xs"
            disabled={bezig}
            onClick={() => doe(async () => setUitkomst(await verstuurMailNu(approvalId)))}
          >
            {bezig ? "Bezig…" : "Ja, verstuur"}
          </button>
          <button
            type="button"
            className="btn btn-ghost text-xs"
            onClick={() => setZekerWeten(false)}
          >
            Toch niet
          </button>
        </div>
      )}

      {uitkomst && !uitkomst.ok && (
        <p className="mt-2 text-xs text-danger">{uitkomst.message}</p>
      )}
      <ActieFout fout={fout} />
    </div>
  );
}
