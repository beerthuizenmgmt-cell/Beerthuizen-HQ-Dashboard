"use client";

import { useState } from "react";
import { deleteAgent } from "@/lib/actions/agents";
import { useActie } from "@/components/use-actie";
import { ActieFout } from "@/components/actie-fout";

/// Een agent weggooien vraagt eerst na, met zijn naam erbij.
///
/// De knop stond naast "pauzeren" en verwijderde met één klik. Aan een agent
/// hangen zijn taken, zijn geheugen, zijn gereedschap en alles wat hij ooit
/// gezegd heeft; dat is geen knop die je per ongeluk aanraakt. Zijn naam moet
/// je zien voordat je bevestigt, anders bevestig je alleen dat je iets weggooit
/// zonder te weten wát.
export function AgentVerwijderen({ agentId, naam }: { agentId: string; naam: string }) {
  const { doe, fout, bezig } = useActie();
  const [zekerWeten, setZekerWeten] = useState(false);

  if (!zekerWeten) {
    return (
      <div>
        <button type="button" className="btn btn-danger" onClick={() => setZekerWeten(true)}>
          Verwijderen
        </button>
        <ActieFout fout={fout} />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-warn">
        {naam} verwijderen, met zijn taken en geheugen?
      </span>
      <button
        type="button"
        className="btn btn-danger"
        disabled={bezig}
        onClick={() => doe(() => deleteAgent(agentId))}
      >
        {bezig ? "Bezig…" : "Ja, verwijderen"}
      </button>
      <button type="button" className="btn btn-ghost" onClick={() => setZekerWeten(false)}>
        Toch niet
      </button>
      <ActieFout fout={fout} />
    </div>
  );
}
