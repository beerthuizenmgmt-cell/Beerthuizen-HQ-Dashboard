"use client";

import { useActionState, useState } from "react";
import { savePlaybook, type PlaybookState } from "@/lib/actions/playbook";

// De werkinstructies van een agent.
//
// Bewust een grote, kale tekstbak in plaats van een formulier met velden: dit
// is een handleiding die je schrijft zoals je hem aan een nieuwe medewerker zou
// uitleggen. Elk veld dat ik erbij verzin zou die vrijheid inperken.

export function AgentPlaybook({
  agentId,
  agentName,
  playbook,
  canEdit,
}: {
  agentId: string;
  agentName: string;
  playbook: string | null;
  canEdit: boolean;
}) {
  const [bewerken, setBewerken] = useState(false);
  const [state, formAction, pending] = useActionState<PlaybookState, FormData>(
    savePlaybook.bind(null, agentId),
    {},
  );

  const tokens = playbook ? Math.round(playbook.length / 3.6) : 0;

  if (bewerken && canEdit) {
    return (
      <form action={formAction} className="space-y-3">
        <textarea
          name="playbook"
          className="input min-h-[28rem] font-mono text-xs leading-relaxed"
          defaultValue={playbook ?? ""}
          placeholder={`Hoe doet ${agentName} zijn werk? Schrijf het op zoals je het aan een nieuwe medewerker zou uitleggen: wat hij moet weten, hoe hij communiceert, waar hij op let, wanneer hij naar jou stapt.`}
        />

        <p className="text-xs text-text-muted">
          Dit gaat integraal mee in elke denkbeurt. Langer is niet beter: elke duizend tekens kosten
          ongeveer 280 tokens per aanroep.
        </p>

        {state.error && <p className="text-sm text-danger">{state.error}</p>}

        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary text-xs" disabled={pending}>
            {pending ? "Opslaan…" : "Opslaan"}
          </button>
          <button type="button" className="btn btn-ghost text-xs" onClick={() => setBewerken(false)}>
            Annuleren
          </button>
        </div>
      </form>
    );
  }

  return (
    <div>
      {playbook ? (
        <>
          <details className="group">
            <summary className="cursor-pointer text-sm text-text-muted hover:text-text">
              {playbook.split("\n").filter((r) => r.startsWith("# ")).length} onderdelen ·{" "}
              {tokens.toLocaleString("nl-NL")} tokens per denkbeurt — openklappen
            </summary>
            <div className="mt-3 max-h-[32rem] overflow-y-auto whitespace-pre-wrap verdiept p-4 text-sm leading-relaxed">
              {playbook}
            </div>
          </details>
        </>
      ) : (
        <p className="text-sm text-text-muted">
          {agentName} heeft nog geen werkinstructies. Zonder die instructies valt hij terug op zijn
          functieprofiel — dat zegt waar hij over gaat, maar niet hóé hij het doet.
        </p>
      )}

      {canEdit && (
        <button type="button" className="btn btn-ghost mt-4 text-xs" onClick={() => setBewerken(true)}>
          {playbook ? "Werkinstructies aanpassen" : "Werkinstructies schrijven"}
        </button>
      )}
    </div>
  );
}
