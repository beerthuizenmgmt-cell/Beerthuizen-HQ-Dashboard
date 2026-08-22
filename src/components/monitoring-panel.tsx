"use client";

import { useState, useTransition } from "react";
import {
  previewDetection,
  runDetection,
  runHeadReport,
  reportSignal,
} from "@/lib/actions/monitoring";
import { installDefaultWatches } from "@/lib/actions/setup-watches";
import type { DetectionOutcome } from "@/lib/ai/watch";

export function MonitoringPanel({
  hasWatches,
  signalAgents,
}: {
  hasWatches: boolean;
  signalAgents: { key: string; name: string; emoji: string | null }[];
}) {
  const [outcomes, setOutcomes] = useState<DetectionOutcome[] | null>(null);
  // Was dit een proefdraai of is het echt gebeurd? Bij een proefdraai staat
  // `activated` overal op onwaar — er is immers niemand wakker gemaakt — en dan
  // is "0 van 15 geactiveerd" precies het omgekeerde van wat er staat te
  // gebeuren. Je leest nul en concludeert dat er niets zou gebeuren, terwijl er
  // acht agents zouden aanslaan.
  const [wasProef, setWasProef] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-5">
        <div className="flex flex-wrap gap-2">
          {!hasWatches && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await installDefaultWatches();
                  setMessage(`${result.created} onderwerpen aangezet, ${result.total} in totaal.`);
                })
              }
            >
              Detectie aanzetten
            </button>
          )}

          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setMessage(null);
                setWasProef(true);
                setOutcomes(await previewDetection());
              })
            }
          >
            {pending ? "Bezig…" : "Kijk wat er zou gebeuren"}
          </button>

          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !hasWatches}
            onClick={() =>
              startTransition(async () => {
                setMessage(null);
                setWasProef(false);
                setOutcomes(await runDetection());
              })
            }
          >
            {pending ? "Bezig…" : "Detectie uitvoeren"}
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const report = await runHeadReport();
                setMessage(
                  report.usedAi
                    ? `Rapport gemaakt met een AI-aanroep — ${report.reason}.`
                    : `Geen AI-aanroep nodig: ${report.reason}.`,
                );
              })
            }
          >
            Ochtendrapport maken
          </button>
        </div>

        <p className="text-xs text-text-faint">
          &ldquo;Kijk wat er zou gebeuren&rdquo; laat geen enkele agent denken en kost dus niets.
        </p>

        {message && <p className="text-sm text-ok">{message}</p>}
      </div>

      {outcomes && (
        <div className="card lijst">
          <div className="px-4 py-2.5 text-xs font-semibold tracking-wide text-text-muted uppercase">
            {wasProef ? (
              <>
                Proefdraai — {outcomes.filter((outcome) => outcome.zouActiveren).length} van{" "}
                {outcomes.length} zouden activeren
              </>
            ) : (
              <>
                Uitkomst — {outcomes.filter((outcome) => outcome.activated).length} van{" "}
                {outcomes.length} geactiveerd
              </>
            )}
          </div>
          {outcomes.map((outcome) => (
            <div key={outcome.watch} className="flex items-start gap-3 px-4 py-3">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{
                  background: outcome.activated
                    ? "var(--ok)"
                    : outcome.changed
                      ? "var(--warn)"
                      : "var(--text-faint)",
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {outcome.label}{" "}
                  <span className="font-normal text-text-faint">— {outcome.agent}</span>
                </p>
                <p className="mt-0.5 text-xs text-text-muted">{outcome.reason}</p>
              </div>
              <span className="chip shrink-0 text-[10px]">
                {outcome.activated ? "geanalyseerd" : outcome.changed ? "gewijzigd" : "geen wijziging"}
              </span>
            </div>
          ))}
        </div>
      )}

      {signalAgents.length > 0 && <SignalForm agents={signalAgents} />}
    </div>
  );
}

/// Een ontwikkeling melden die het systeem zelf niet kan zien. Dit is wat
/// Research wakker maakt zolang er nog geen monitor op externe bronnen zit.
function SignalForm({ agents }: { agents: { key: string; name: string; emoji: string | null }[] }) {
  const [agentKey, setAgentKey] = useState(agents[0]?.key ?? "");
  const [text, setText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="card space-y-3 p-5">
      <div>
        <h2 className="text-sm font-semibold">Ontwikkeling melden</h2>
        <p className="mt-1 text-xs text-text-muted">
          Zie je iets bij een concurrent of in de markt? Meld het hier. Dat wordt een gebeurtenis, en
          bij de volgende detectieronde gaat de juiste agent ernaar kijken — gerichter dan hem elke dag
          ongericht laten zoeken.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          className="input w-auto"
          value={agentKey}
          onChange={(event) => setAgentKey(event.target.value)}
        >
          {agents.map((agent) => (
            <option key={agent.key} value={agent.key}>
              {agent.emoji ? `${agent.emoji} ` : ""}
              {agent.name}
            </option>
          ))}
        </select>
        <input
          className="input min-w-64 flex-1"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Bijvoorbeeld: bureau X in Londen begint met AI-creatorselectie"
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !text.trim()}
          onClick={() =>
            startTransition(async () => {
              const outcome = await reportSignal(agentKey, text);
              setResult(outcome.ok ? "Gemeld." : (outcome.error ?? "Mislukt."));
              if (outcome.ok) setText("");
            })
          }
        >
          {pending ? "…" : "Melden"}
        </button>
      </div>

      {result && <p className="text-sm text-ok">{result}</p>}
    </div>
  );
}
