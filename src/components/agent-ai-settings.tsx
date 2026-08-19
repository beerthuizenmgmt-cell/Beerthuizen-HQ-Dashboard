"use client";

import { useState } from "react";
import { useActie } from "@/components/use-actie";
import { ActieFout } from "@/components/actie-fout";
import { setAgentModel, setAgentPaused } from "@/lib/actions/ai";

/// Model per agent. Leeg betekent: gebruik het standaardmodel uit de
/// instellingen. Zo kun je de Head zwaar laten denken en eenvoudig werk
/// goedkoop laten draaien, zonder dat er iets aan de agentlogica verandert.
export function AgentAiSettings({
  agentId,
  modelId,
  defaultModel,
  paused,
}: {
  agentId: string;
  modelId: string | null;
  defaultModel: string;
  paused: boolean;
}) {
  const [value, setValue] = useState(modelId ?? "");
  const [saved, setSaved] = useState(false);
  const { doe, fout, bezig: pending } = useActie();

  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="modelId">
          Model voor deze agent
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="modelId"
            className="input flex-1 font-mono text-xs"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setSaved(false);
            }}
            placeholder={`leeg = standaardmodel (${defaultModel})`}
          />
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending}
            onClick={() =>
              doe(async () => {
                await setAgentModel(agentId, value);
                setSaved(true);
              })
            }
          >
            {pending ? "…" : "Opslaan"}
          </button>
        </div>
        {saved && <p className="mt-1 text-xs text-ok">Opgeslagen.</p>}
        <ActieFout fout={fout} />
        <p className="mt-1 text-xs text-text-faint">
          Kies zwaar denkwerk voor analyses en advies, en iets goedkopers voor repetitief werk.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div>
          <p className="text-sm font-medium">{paused ? "Staat op pauze" : "Actief"}</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {paused
              ? "Deze agent denkt niet mee en kost dus niets."
              : "Deze agent kan opdrachten krijgen en denkt mee in het ochtendoverleg."}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={pending}
          onClick={() => doe(() => setAgentPaused(agentId, !paused))}
        >
          {paused ? "Activeren" : "Pauzeren"}
        </button>
      </div>
    </div>
  );
}
