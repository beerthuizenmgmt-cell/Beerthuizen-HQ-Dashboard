"use client";

import { useActionState, useState } from "react";
import { saveAgent, type SaveAgentState } from "@/lib/actions/agents";
import type { AdapterField } from "@/lib/adapters/types";

type CatalogEntry = {
  type: string;
  label: string;
  description: string;
  fields: AdapterField[];
  capabilities: { send: boolean; poll: boolean; receive: boolean };
};

const CATEGORIES = [
  { value: "ops", label: "Operations" },
  { value: "marketing", label: "Marketing" },
  { value: "ads", label: "Advertenties" },
  { value: "content", label: "Content" },
  { value: "analyse", label: "Analyse" },
  { value: "research", label: "Research" },
  { value: "bizdev", label: "Business development" },
  { value: "other", label: "Overig" },
];

const COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#22c55e", "#0ea5e9", "#a855f7", "#14b8a6", "#64748b"];

export type AgentFormValues = {
  id?: string;
  name?: string;
  role?: string;
  description?: string;
  emoji?: string;
  color?: string;
  category?: string;
  adapterType?: string;
  config?: Record<string, string>;
};

const initial: SaveAgentState = {};

export function AgentForm({
  catalog,
  values = {},
  submitLabel = "Opslaan",
}: {
  catalog: CatalogEntry[];
  values?: AgentFormValues;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(saveAgent, initial);
  const [adapterType, setAdapterType] = useState(values.adapterType ?? "telegram");
  const [color, setColor] = useState(values.color ?? COLORS[0]);

  const selected = catalog.find((entry) => entry.type === adapterType) ?? catalog[0];

  return (
    <form action={formAction} className="space-y-8">
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Wie is het?</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">
              Naam
            </label>
            <input
              id="name"
              name="name"
              className="input"
              required
              defaultValue={values.name}
              placeholder="Research Agent"
            />
          </div>

          <div>
            <label className="label" htmlFor="role">
              Rol
            </label>
            <input
              id="role"
              name="role"
              className="input"
              required
              defaultValue={values.role}
              placeholder="Onderzoek & marktverkenning"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="description">
            Wat doet hij? <span className="font-normal text-text-faint">(optioneel)</span>
          </label>
          <textarea
            id="description"
            name="description"
            className="input min-h-20 resize-y"
            defaultValue={values.description}
            placeholder="Onderzoekt concurrenten, trends, tools en nieuwe kansen."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="emoji">
              Icoon
            </label>
            <input
              id="emoji"
              name="emoji"
              className="input"
              maxLength={4}
              defaultValue={values.emoji}
              placeholder="🔎"
            />
          </div>

          <div>
            <label className="label" htmlFor="category">
              Categorie
            </label>
            <select id="category" name="category" className="input" defaultValue={values.category ?? "other"}>
              {CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="label">Kleur</span>
            <input type="hidden" name="color" value={color} />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setColor(option)}
                  aria-label={`Kleur ${option}`}
                  className={`h-6 w-6 rounded-full transition-transform ${
                    color === option ? "scale-110 ring-2 ring-white/60" : "hover:scale-105"
                  }`}
                  style={{ background: option }}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Hoe bereiken we hem?</h2>
          <p className="mt-1 text-xs text-text-muted">
            Weet je het nog niet? Kies &ldquo;Nog niet koppelen&rdquo; — je kunt dit later omzetten zonder
            de agent opnieuw aan te maken.
          </p>
        </div>

        <input type="hidden" name="adapterType" value={adapterType} />
        <div className="grid gap-2 sm:grid-cols-2">
          {catalog.map((entry) => {
            const active = entry.type === adapterType;
            return (
              <button
                key={entry.type}
                type="button"
                onClick={() => setAdapterType(entry.type)}
                className={`card p-3 text-left transition-colors ${
                  active ? "border-accent bg-accent/5" : "hover:bg-surface-hover"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{entry.label}</span>
                  {entry.capabilities.send && (
                    <span className="chip px-1.5 py-0 text-[10px]">kan taken ontvangen</span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-snug text-text-muted">{entry.description}</p>
              </button>
            );
          })}
        </div>

        {selected.fields.length > 0 && (
          <div className="card space-y-4 p-4">
            {selected.fields.map((field) => (
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
                  defaultValue={values.config?.[field.name] ?? ""}
                  autoComplete="off"
                />
                {field.help && <p className="mt-1 text-xs text-text-faint">{field.help}</p>}
                {field.secret && values.config?.[field.name] && (
                  <p className="mt-1 text-xs text-text-faint">
                    Er staat al een waarde. Laat leeg om die te behouden.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {state.error && (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">Opgeslagen.</p>
      )}

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Bezig…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
