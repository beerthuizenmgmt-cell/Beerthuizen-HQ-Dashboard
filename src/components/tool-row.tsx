"use client";

import { useActionState, useState, useTransition } from "react";
import {
  koppelTool,
  setToolPermission,
  setToolKosten,
  zetToolActief,
  type IntegratieState,
} from "@/lib/actions/integrations";

// Eén tool in het overzicht: dichtgeklapt zie je de stand, opengeklapt regel je
// wie erbij mag en wat hij kost.
//
// Bewust uitklapbaar: veertig tools met alle details open is onleesbaar, en de
// vraag is meestal maar over één tegelijk.

type ToolAgent = {
  agentId: string;
  naam: string;
  permission: "lezen" | "voorstellen" | "schrijven";
  ingeschakeld: boolean;
  fout: string | null;
  laatstGebruikt: string | null;
  gebruikAantal: number;
};

export type ToolGegevens = {
  toolKey: string;
  naam: string;
  omschrijving: string;
  gebouwd: boolean;
  actief: boolean;
  verbinding: "gekoppeld" | "deels" | "niet gekoppeld" | "niet gebouwd";
  apiStatus: "werkt" | "fout" | "niet getest" | "geen api";
  maandkosten: string | null;
  maandkostenRuw: number | null;
  notities: string | null;
  laatstGebruikt: string | null;
  laatsteTest: { wanneer: string; ok: boolean } | null;
  ontbreekt: string[];
  agents: ToolAgent[];
};

const VERBINDING_STIJL: Record<ToolGegevens["verbinding"], string> = {
  gekoppeld: "text-success",
  deels: "text-warn",
  "niet gekoppeld": "text-text-faint",
  "niet gebouwd": "text-text-faint",
};

const API_STIJL: Record<ToolGegevens["apiStatus"], string> = {
  werkt: "text-success",
  fout: "text-danger",
  "niet getest": "text-text-faint",
  "geen api": "text-text-faint",
};

export function ToolRow({
  tool,
  alleAgents,
  permissieLabels,
}: {
  tool: ToolGegevens;
  alleAgents: { id: string; naam: string }[];
  permissieLabels: Record<string, { label: string; uitleg: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [bezig, start] = useTransition();
  const [kostenState, kostenAction, kostenBezig] = useActionState<IntegratieState, FormData>(
    setToolKosten.bind(null, tool.toolKey),
    {},
  );

  const nietGekoppeld = alleAgents.filter(
    (agent) => !tool.agents.some((rij) => rij.agentId === agent.id && rij.ingeschakeld),
  );

  return (
    <div className="p-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full flex-wrap items-center gap-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{tool.naam}</span>
            {!tool.gebouwd && <span className="chip text-xs text-text-faint">nog niet gebouwd</span>}
            {!tool.actief && <span className="chip text-xs text-danger">uitgezet</span>}
          </span>
          <span className="mt-0.5 block text-xs text-text-muted">{tool.omschrijving}</span>
        </span>

        <span className="flex shrink-0 items-center gap-4 text-xs">
          <span className="w-24 text-right">
            {tool.agents.filter((a) => a.ingeschakeld).length > 0 ? (
              <span className="text-text">
                {tool.agents.filter((a) => a.ingeschakeld).length} agent
                {tool.agents.filter((a) => a.ingeschakeld).length === 1 ? "" : "s"}
              </span>
            ) : (
              <span className="text-text-faint">niemand</span>
            )}
          </span>
          <span className={`w-24 text-right ${VERBINDING_STIJL[tool.verbinding]}`}>
            {tool.verbinding}
          </span>
          <span className={`w-20 text-right ${API_STIJL[tool.apiStatus]}`}>{tool.apiStatus}</span>
          <span className="w-20 text-right">
            {tool.maandkosten ?? <span className="text-text-faint">—</span>}
          </span>
          <span className="w-6 text-right text-text-faint">{open ? "−" : "+"}</span>
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-5 border-t border-border pt-4">
          {tool.ontbreekt.length > 0 && (
            <p className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-xs text-warn">
              Het functieprofiel van {tool.ontbreekt.join(", ")} vraagt deze tool, maar er ligt nog geen
              koppeling.
            </p>
          )}

          {/* Wie mag erbij, en wat mag hij */}
          <div>
            <p className="eyebrow mb-2">Gekoppelde agents en rechten</p>

            {tool.agents.filter((a) => a.ingeschakeld).length === 0 ? (
              <p className="text-sm text-text-muted">Nog aan niemand toegewezen.</p>
            ) : (
              <ul className="space-y-2">
                {tool.agents
                  .filter((a) => a.ingeschakeld)
                  .map((agent) => (
                    <li
                      key={agent.agentId}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 text-sm">{agent.naam}</span>

                      <select
                        className="input w-40 text-xs"
                        defaultValue={agent.permission}
                        disabled={bezig}
                        onChange={(event) =>
                          start(() =>
                            setToolPermission(agent.agentId, tool.toolKey, event.target.value),
                          )
                        }
                      >
                        {Object.entries(permissieLabels).map(([waarde, info]) => (
                          <option key={waarde} value={waarde} title={info.uitleg}>
                            {info.label}
                          </option>
                        ))}
                      </select>

                      <span className="w-32 text-right text-xs text-text-faint">
                        {agent.laatstGebruikt
                          ? `${agent.gebruikAantal}× · ${agent.laatstGebruikt}`
                          : "nog niet gebruikt"}
                      </span>

                      <button
                        type="button"
                        className="text-xs text-text-faint underline hover:text-danger"
                        disabled={bezig}
                        onClick={() => start(() => void koppelTool(agent.agentId, tool.toolKey, false))}
                      >
                        losmaken
                      </button>

                      {agent.fout && (
                        <p className="w-full text-xs text-danger">Laatste fout: {agent.fout}</p>
                      )}
                    </li>
                  ))}
              </ul>
            )}

            {nietGekoppeld.length > 0 && tool.actief && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-text-muted">Toevoegen:</span>
                {nietGekoppeld.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    className="chip text-xs hover:border-accent hover:text-accent"
                    disabled={bezig}
                    onClick={() => start(() => void koppelTool(agent.id, tool.toolKey, true))}
                  >
                    + {agent.naam}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Wat de rechten betekenen */}
          <details className="text-xs text-text-muted">
            <summary className="cursor-pointer">Wat betekenen deze rechten?</summary>
            <ul className="mt-2 space-y-1">
              {Object.entries(permissieLabels).map(([waarde, info]) => (
                <li key={waarde}>
                  <span className="font-medium">{info.label}</span> — {info.uitleg}
                </li>
              ))}
            </ul>
          </details>

          {/* Kosten en aantekeningen */}
          <form action={kostenAction} className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
            <div>
              <label className="eyebrow mb-1 block" htmlFor={`bedrag-${tool.toolKey}`}>
                Kosten per maand
              </label>
              <input
                id={`bedrag-${tool.toolKey}`}
                name="bedrag"
                className="input"
                placeholder="onbekend"
                defaultValue={tool.maandkostenRuw ?? ""}
                inputMode="decimal"
              />
            </div>
            <div>
              <label className="eyebrow mb-1 block" htmlFor={`notities-${tool.toolKey}`}>
                Aantekening
              </label>
              <input
                id={`notities-${tool.toolKey}`}
                name="notities"
                className="input"
                placeholder="Welk account, welk abonnement, wat er nog moet"
                defaultValue={tool.notities ?? ""}
              />
            </div>
            <button type="submit" className="btn btn-ghost text-xs" disabled={kostenBezig}>
              {kostenBezig ? "Opslaan…" : "Opslaan"}
            </button>
          </form>

          {kostenState.error && <p className="text-xs text-danger">{kostenState.error}</p>}
          {kostenState.ok && <p className="text-xs text-success">{kostenState.ok}</p>}

          {/* Stand van zaken */}
          <div className="flex flex-wrap gap-6 border-t border-border pt-3 text-xs text-text-muted">
            <span>
              Laatste test:{" "}
              {tool.laatsteTest ? (
                <span className={tool.laatsteTest.ok ? "text-success" : "text-danger"}>
                  {tool.laatsteTest.wanneer} {tool.laatsteTest.ok ? "geslaagd" : "mislukt"}
                </span>
              ) : (
                "nooit"
              )}
            </span>
            <span>Laatst gebruikt: {tool.laatstGebruikt ?? "nooit"}</span>
            <button
              type="button"
              className="underline hover:text-text"
              disabled={bezig}
              onClick={() => start(() => void zetToolActief(tool.toolKey, !tool.actief))}
            >
              {tool.actief ? "bedrijfsbreed uitzetten" : "weer aanzetten"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
