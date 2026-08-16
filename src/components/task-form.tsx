"use client";

import { useActionState, useState } from "react";
import { createTask, type TaskState } from "@/lib/actions/tasks";

const initial: TaskState = {};

export type AgentOption = { id: string; name: string; emoji: string | null; canReceive: boolean };

export function TaskForm({ agents }: { agents: AgentOption[] }) {
  const [state, formAction, pending] = useActionState(createTask, initial);
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState("");

  const selected = agents.find((agent) => agent.id === agentId);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary">
        Taak uitbesteden
      </button>
    );
  }

  return (
    <form action={formAction} className="card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Nieuwe taak</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-text-muted hover:text-text">
          Sluiten
        </button>
      </div>

      <div>
        <label className="label" htmlFor="title">
          Wat moet er gebeuren?
        </label>
        <input
          id="title"
          name="title"
          className="input"
          required
          autoFocus
          placeholder="Concurrentieanalyse influencer-bureaus Nederland"
        />
      </div>

      <div>
        <label className="label" htmlFor="description">
          Toelichting <span className="font-normal text-text-faint">(optioneel)</span>
        </label>
        <textarea
          id="description"
          name="description"
          className="input min-h-24 resize-y"
          placeholder="Welke bureaus, welke cijfers, in welke vorm wil je het terug?"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="agentId">
            Wie doet het?
          </label>
          <select
            id="agentId"
            name="agentId"
            className="input"
            value={agentId}
            onChange={(event) => setAgentId(event.target.value)}
          >
            <option value="">Nog niemand (inbox)</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.emoji ? `${agent.emoji} ` : ""}
                {agent.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="priority">
            Prioriteit
          </label>
          <select id="priority" name="priority" className="input" defaultValue="normal">
            <option value="low">Laag</option>
            <option value="normal">Normaal</option>
            <option value="high">Hoog</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="dueAt">
            Deadline
          </label>
          <input id="dueAt" name="dueAt" type="date" className="input" />
        </div>
      </div>

      {selected && (
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="dispatch"
            defaultChecked={selected.canReceive}
            disabled={!selected.canReceive}
            className="mt-0.5"
          />
          <span>
            Meteen naar {selected.name} sturen
            {!selected.canReceive && (
              <span className="block text-xs text-warn">
                Kan niet: {selected.name} heeft geen koppeling die berichten ontvangt. De taak blijft
                klaarstaan tot je hem koppelt.
              </span>
            )}
          </span>
        </label>
      )}

      {state.error && (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">{state.ok}</p>
      )}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Bezig…" : "Taak aanmaken"}
      </button>
    </form>
  );
}
