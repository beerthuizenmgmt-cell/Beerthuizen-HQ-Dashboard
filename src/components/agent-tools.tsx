"use client";

import { useActionState, useState } from "react";
import { useActie } from "@/components/use-actie";
import { ActieFout } from "@/components/actie-fout";
import { attachTool, detachTool, toggleTool, type ToolState } from "@/lib/actions/agent-tools";
import type { ToolField } from "@/lib/ai/toolkit";

const initial: ToolState = {};

export type CatalogItem = {
  key: string;
  name: string;
  category: string;
  description: string;
  suggestedFor: string[];
  fields: ToolField[];
  implemented: boolean;
};

export type AttachedTool = {
  id: string;
  toolKey: string;
  label: string;
  enabled: boolean;
  implemented: boolean;
  lastError: string | null;
  config: Record<string, string>;
};

const CATEGORY_LABELS: Record<string, string> = {
  creatief: "Creatief",
  data: "Data",
  onderzoek: "Onderzoek",
  communicatie: "Communicatie",
  overig: "Overig",
};

export function AgentTools({
  agentId,
  agentKey,
  agentName,
  catalog,
  attached,
}: {
  agentId: string;
  agentKey: string;
  agentName: string;
  catalog: CatalogItem[];
  attached: AttachedTool[];
}) {
  const [adding, setAdding] = useState<CatalogItem | null>(null);
  const attachedKeys = new Set(attached.map((tool) => tool.toolKey));

  const available = catalog.filter((item) => !attachedKeys.has(item.key));
  const suggested = available.filter((item) => item.suggestedFor.includes(agentKey));
  const rest = available.filter((item) => !item.suggestedFor.includes(agentKey));

  return (
    <div className="space-y-5">
      {attached.length > 0 && (
        <div className="space-y-2">
          {attached.map((tool) => (
            <AttachedRow key={tool.id} tool={tool} />
          ))}
        </div>
      )}

      {attached.length === 0 && (
        <p className="text-sm text-text-muted">
          {agentName} heeft nog geen koppelingen. Wat je hier toevoegt geldt alleen voor hem — een tool
          bij een collega komt niet vanzelf hier terecht.
        </p>
      )}

      {adding ? (
        <AddForm
          agentId={agentId}
          item={adding}
          onClose={() => setAdding(null)}
        />
      ) : (
        <div className="space-y-3 border-t border-border pt-4">
          {suggested.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold tracking-wide text-text-muted uppercase">
                Ligt voor de hand bij {agentName}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggested.map((item) => (
                  <ToolChip key={item.key} item={item} onClick={() => setAdding(item)} />
                ))}
              </div>
            </div>
          )}

          {rest.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs text-text-muted hover:text-text">
                Alle koppelingen ({rest.length})
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {rest.map((item) => (
                  <ToolChip key={item.key} item={item} onClick={() => setAdding(item)} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function ToolChip({ item, onClick }: { item: CatalogItem; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="chip hover:border-accent/40 hover:text-text"
      title={item.description}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: item.implemented ? "var(--ok)" : "var(--text-faint)" }}
      />
      {item.name}
      {!item.implemented && <span className="text-text-faint">· nog niet gebouwd</span>}
    </button>
  );
}

function AttachedRow({ tool }: { tool: AttachedTool }) {
  const { doe, fout, bezig: pending } = useActie();

  return (
    <div className="card p-3">
      <ActieFout fout={fout} />
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{
            background: !tool.enabled
              ? "var(--text-faint)"
              : tool.lastError
                ? "var(--danger)"
                : tool.implemented
                  ? "var(--ok)"
                  : "var(--warn)",
          }}
        />
        <span className="text-sm font-medium">{tool.label}</span>
        <span className="chip px-1.5 py-0 text-[10px]">
          {!tool.implemented
            ? "vastgelegd, nog niet gebouwd"
            : tool.enabled
              ? "in gebruik"
              : "uitgezet"}
        </span>

        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            className="btn btn-ghost px-2 py-1 text-xs"
            disabled={pending}
            onClick={() => doe(() => toggleTool(tool.id, !tool.enabled))}
          >
            {tool.enabled ? "Uitzetten" : "Aanzetten"}
          </button>
          <button
            type="button"
            className="btn btn-ghost px-2 py-1 text-xs"
            disabled={pending}
            onClick={() => doe(() => detachTool(tool.id))}
          >
            Verwijderen
          </button>
        </div>
      </div>

      {Object.keys(tool.config).length > 0 && (
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2 text-[11px] text-text-faint">
          {Object.entries(tool.config).map(([key, value]) => (
            <div key={key} className="flex gap-1">
              <dt>{key}:</dt>
              <dd className="font-mono">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {tool.lastError && <p className="mt-2 text-xs text-danger">{tool.lastError}</p>}

      {!tool.implemented && (
        <p className="mt-2 text-xs text-warn">
          De gegevens staan opgeslagen, maar deze koppeling is nog niet gebouwd. De agent krijgt hem
          dus niet in handen — beter een zichtbare lege plek dan een knop die niets doet.
        </p>
      )}
    </div>
  );
}

function AddForm({
  agentId,
  item,
  onClose,
}: {
  agentId: string;
  item: CatalogItem;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(attachTool, initial);

  return (
    <form action={formAction} className="card space-y-3 border-accent/30 p-4">
      <input type="hidden" name="agentId" value={agentId} />
      <input type="hidden" name="toolKey" value={item.key} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">
            {item.name}{" "}
            <span className="font-normal text-text-faint">· {CATEGORY_LABELS[item.category]}</span>
          </p>
          <p className="mt-1 text-xs text-text-muted">{item.description}</p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-text-muted hover:text-text">
          Sluiten
        </button>
      </div>

      {!item.implemented && (
        <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          Deze koppeling is nog niet gebouwd. Je kunt de gegevens vast opslaan, maar de agent kan er nog
          niets mee.
        </p>
      )}

      <div>
        <label className="label" htmlFor="label">
          Naam van deze koppeling
        </label>
        <input id="label" name="label" className="input" defaultValue={item.name} />
      </div>

      {item.fields.map((field) => (
        <div key={field.name}>
          <label className="label" htmlFor={`config.${field.name}`}>
            {field.label}
            {!field.required && <span className="font-normal text-text-faint"> (optioneel)</span>}
          </label>
          <input
            id={`config.${field.name}`}
            name={`config.${field.name}`}
            type={field.type === "password" ? "password" : "text"}
            className="input"
            placeholder={field.placeholder}
            autoComplete="off"
          />
          {field.help && <p className="mt-1 text-xs text-text-faint">{field.help}</p>}
        </div>
      ))}

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p className="text-sm text-ok">{state.ok}</p>}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Bezig…" : "Koppelen"}
      </button>
    </form>
  );
}
