"use client";

import { useState, useTransition } from "react";
import { runTestTask, type TestRunResult } from "@/lib/actions/testrun";

const SUGGESTIONS = [
  "Noem drie manieren waarop een influencerbureau van onze omvang zijn campagnerapportage kan automatiseren, en zeg welke jij als eerste zou doen.",
  "Wat zijn de belangrijkste verschillen tussen hoe Nederlandse en Britse influencerbureaus hun creator management inrichten?",
  "Welke drie KPI's zou je leidend maken voor een merkbekendheidscampagne, en waarom die en niet de andere?",
];

export function TestRun({ agents }: { agents: { id: string; name: string; emoji: string | null }[] }) {
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [instruction, setInstruction] = useState(SUGGESTIONS[0]);
  const [result, setResult] = useState<TestRunResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <div className="card space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <label className="label" htmlFor="agent">
              Welke agent test je?
            </label>
            <select
              id="agent"
              className="input"
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.emoji ? `${agent.emoji} ` : ""}
                  {agent.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="instruction">
            Opdracht
          </label>
          <textarea
            id="instruction"
            className="input min-h-28 resize-y"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setInstruction(suggestion)}
                className="chip hover:border-accent/40 hover:text-text"
              >
                voorbeeld {index + 1}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !agentId || !instruction.trim()}
            onClick={() =>
              startTransition(async () => {
                setResult(null);
                setResult(await runTestTask(agentId, instruction));
              })
            }
          >
            {pending ? "De agent denkt na…" : "Proefopdracht uitvoeren"}
          </button>
          <span className="text-xs text-text-faint">
            Alleen denken en antwoorden — geen taken, geen berichten, niets naar buiten.
          </span>
        </div>
      </div>

      {result && !result.ok && (
        <div className="card border-danger/40 bg-danger/5 p-5">
          <h2 className="text-sm font-semibold text-danger">De proef is niet gelukt</h2>
          <p className="mt-1.5 text-sm text-text-muted">{result.error}</p>
        </div>
      )}

      {result?.ok && result.meta && (
        <>
          <div className="card border-ok/30 p-5">
            <h2 className="mb-3 text-sm font-semibold text-ok">Antwoord van {result.meta.agent}</h2>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{result.answer}</p>
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold">Wat deze ene opdracht kostte</h2>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Metric label="Aanbieder" value={result.meta.provider} />
              <Metric label="Model" value={result.meta.model} />
              <Metric label="Duur" value={`${(result.meta.durationMs / 1000).toFixed(1)} sec`} />
              <Metric label="Invoertokens" value={result.meta.promptTokens.toLocaleString("nl-NL")} />
              <Metric label="Uitvoertokens" value={result.meta.completionTokens.toLocaleString("nl-NL")} />
              <Metric
                label="Kosten"
                value={
                  result.meta.costKnown
                    ? `€${result.meta.costEur.toFixed(4)}`
                    : "onbekend"
                }
                hint={
                  result.meta.costKnown
                    ? undefined
                    : "De aanbieder gaf geen bedrag en er staat geen tarief voor dit model. Haal de tarieven op bij Instellingen."
                }
              />
            </dl>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-text-faint">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm break-all">{value}</dd>
      {hint && <p className="mt-1 text-[11px] text-warn">{hint}</p>}
    </div>
  );
}
