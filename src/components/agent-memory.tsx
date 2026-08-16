"use client";

import { useActionState, useState } from "react";
import { addMemory, forgetMemory, togglePinned, type MemoryState } from "@/lib/actions/memory";

// Het geheugen van een agent, zoals je het in zijn dossier ziet.
//
// Bewust geen vrije tekstbak: een herinnering krijgt een soort mee, zodat je
// later kunt zien of iets een besluit van jou was of iets wat de agent zelf
// opmerkte. Dat verschil telt als je je afvraagt waarom hij iets doet.

const SOORTEN = [
  { value: "besluit", label: "Besluit", hint: "Iets wat jij hebt bepaald, met de reden erbij" },
  { value: "voorkeur", label: "Voorkeur", hint: "Hoe je het liefst werkt" },
  { value: "afspraak", label: "Afspraak", hint: "Iets dat terugkeert" },
  { value: "leerpunt", label: "Leerpunt", hint: "Wat er eerder misging" },
  { value: "context", label: "Context", hint: "Achtergrond die hij moet kennen" },
];

export type MemoryItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  source: string;
  pinned: boolean;
  createdAt: string;
  lastUsed: string | null;
};

export function AgentMemoryPanel({
  agentId,
  agentName,
  canEdit,
  memories,
}: {
  agentId: string;
  agentName: string;
  canEdit: boolean;
  memories: MemoryItem[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<MemoryState, FormData>(
    addMemory.bind(null, agentId),
    {},
  );

  return (
    <div>
      {memories.length === 0 ? (
        <p className="text-sm text-text-muted">
          {agentName} heeft nog niets onthouden. Zodra hij aan het werk gaat legt hij hier besluiten en
          afspraken vast — en jij kunt hem alvast iets meegeven.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {memories.map((memory) => (
            <li key={memory.id} className="py-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="chip text-xs">{memory.kind}</span>
                <span className="text-sm font-medium">{memory.title}</span>
                {memory.pinned && <span className="text-xs text-accent">vastgezet</span>}
              </div>
              <p className="mt-1 text-sm text-text-muted">{memory.body}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-faint">
                <span>
                  {memory.source === "user" ? "door jou" : "door hemzelf"} · {memory.createdAt}
                </span>
                {memory.lastUsed && <span>laatst gebruikt {memory.lastUsed}</span>}
                {canEdit && (
                  <>
                    <form action={togglePinned.bind(null, agentId, memory.id)}>
                      <button type="submit" className="underline hover:text-text">
                        {memory.pinned ? "losmaken" : "vastzetten"}
                      </button>
                    </form>
                    <form action={forgetMemory.bind(null, agentId, memory.id)}>
                      <button type="submit" className="underline hover:text-danger">
                        vergeten
                      </button>
                    </form>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="mt-4 border-t border-border pt-4">
          {!open ? (
            <button type="button" className="btn btn-ghost text-xs" onClick={() => setOpen(true)}>
              Iets laten onthouden
            </button>
          ) : (
            <form action={formAction} className="space-y-3">
              <div>
                <label className="eyebrow mb-1 block" htmlFor="soort">
                  Soort
                </label>
                <select id="soort" name="soort" className="input" defaultValue="besluit">
                  {SOORTEN.map((soort) => (
                    <option key={soort.value} value={soort.value}>
                      {soort.label} — {soort.hint}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="eyebrow mb-1 block" htmlFor="titel">
                  Waar gaat het over
                </label>
                <input
                  id="titel"
                  name="titel"
                  className="input"
                  placeholder="Geen brand trips in december"
                  required
                />
              </div>

              <div>
                <label className="eyebrow mb-1 block" htmlFor="inhoud">
                  Wat moet hij precies weten
                </label>
                <textarea
                  id="inhoud"
                  name="inhoud"
                  className="input min-h-24"
                  placeholder="December is te druk bij creators en de kosten liggen hoger. Plan brand trips in januari of februari."
                  required
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-text-muted">
                <input type="checkbox" name="vastzetten" />
                Vastzetten — gaat altijd mee, ook als zijn geheugen langer wordt
              </label>

              {state.error && <p className="text-sm text-danger">{state.error}</p>}

              <div className="flex gap-2">
                <button type="submit" className="btn btn-primary text-xs" disabled={pending}>
                  {pending ? "Opslaan…" : "Onthouden"}
                </button>
                <button type="button" className="btn btn-ghost text-xs" onClick={() => setOpen(false)}>
                  Annuleren
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
