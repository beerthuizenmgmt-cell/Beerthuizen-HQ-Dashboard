"use client";

import { useActionState, useState, useTransition } from "react";
import {
  fetchModels,
  refreshPrices,
  saveAiSettings,
  saveFinanceSettings,
  saveContext,
  type AiSettingsState,
} from "@/lib/actions/ai";
import type { ModelOption } from "@/lib/ai/provider";

const initial: AiSettingsState = {};

export function AiSettings({
  provider,
  defaultModel,
  fastModel,
  hasKey,
}: {
  provider: string;
  defaultModel: string;
  fastModel: string | null;
  hasKey: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveAiSettings, initial);
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();

  return (
    <form action={formAction} className="card space-y-4 p-5">
      <div
        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
        style={{
          borderColor: hasKey ? "color-mix(in srgb, var(--ok) 40%, transparent)" : "var(--border)",
          background: hasKey ? "color-mix(in srgb, var(--ok) 8%, transparent)" : "transparent",
        }}
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: hasKey ? "var(--ok)" : "var(--text-faint)" }}
        />
        <span className={hasKey ? "text-ok" : "text-text-muted"}>
          {provider}: {hasKey ? "verbonden" : "geen sleutel ingesteld"}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="provider">
            Aanbieder
          </label>
          <select id="provider" name="provider" className="input" defaultValue={provider}>
            <option value="openrouter">OpenRouter</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="apiKey">
            API-sleutel
          </label>
          <input
            id="apiKey"
            name="apiKey"
            type="password"
            className="input"
            autoComplete="off"
            placeholder={hasKey ? "Er staat een sleutel — leeg laten om te behouden" : "sk-... of vergelijkbaar"}
          />
          <p className="mt-1 text-xs text-text-faint">
            Wordt versleuteld opgeslagen en verlaat de server nooit. Ook niet naar dit scherm, de logs
            of de context van een agent.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="defaultModel">
            Standaardmodel <span className="font-normal text-text-faint">(denkwerk)</span>
          </label>
          <input
            id="defaultModel"
            name="defaultModel"
            className="input font-mono text-xs"
            defaultValue={defaultModel}
            list="model-options"
          />
        </div>

        <div>
          <label className="label" htmlFor="fastModel">
            Zuinig model <span className="font-normal text-text-faint">(repetitief werk, optioneel)</span>
          </label>
          <input
            id="fastModel"
            name="fastModel"
            className="input font-mono text-xs"
            defaultValue={fastModel ?? ""}
            list="model-options"
            placeholder="leeg = standaardmodel"
          />
        </div>
      </div>

      {models && (
        <datalist id="model-options">
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </datalist>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Bezig…" : "Opslaan"}
        </button>

        <button
          type="button"
          className="btn btn-ghost"
          disabled={loading || !hasKey}
          title={hasKey ? undefined : "Vul eerst een sleutel in"}
          onClick={() =>
            startLoading(async () => {
              setModelError(null);
              const result = await fetchModels();
              if (result.ok) setModels(result.models ?? []);
              else setModelError(result.error ?? "Ophalen mislukt.");
            })
          }
        >
          {loading ? "Ophalen…" : models ? `${models.length} modellen geladen` : "Modellen ophalen"}
        </button>

        <PriceRefresh disabled={!hasKey} />
      </div>

      {models && models.length > 0 && (
        <p className="text-xs text-text-muted">
          {models.some((model) => model.id === defaultModel) ? (
            <span className="text-ok">✓ &ldquo;{defaultModel}&rdquo; bestaat bij deze aanbieder.</span>
          ) : (
            <span className="text-warn">
              ⚠ &ldquo;{defaultModel}&rdquo; staat niet in de lijst van deze aanbieder. Kies er een uit
              het invulveld hierboven — het toont nu suggesties.
            </span>
          )}
        </p>
      )}

      {modelError && <p className="text-sm text-danger">{modelError}</p>}
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p className="text-sm text-ok">{state.ok}</p>}
    </form>
  );
}

function PriceRefresh({ disabled }: { disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={pending || disabled}
        onClick={() =>
          startTransition(async () => {
            const result = await refreshPrices();
            setMessage(result.message);
          })
        }
      >
        {pending ? "Bezig…" : "Tarieven ophalen"}
      </button>
      {message && <span className="text-xs text-text-muted">{message}</span>}
    </>
  );
}

export function FinanceSettings({
  monthlyBudgetEur,
  usdToEur,
  hourlyRateEur,
}: {
  monthlyBudgetEur: number | null;
  usdToEur: number;
  hourlyRateEur: number | null;
}) {
  const [state, formAction, pending] = useActionState(saveFinanceSettings, initial);

  return (
    <form action={formAction} className="card space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="monthlyBudgetEur">
            Maandbudget (€)
          </label>
          <input
            id="monthlyBudgetEur"
            name="monthlyBudgetEur"
            className="input"
            inputMode="decimal"
            defaultValue={monthlyBudgetEur ?? ""}
            placeholder="200"
          />
          <p className="mt-1 text-xs text-text-faint">Waarschuwing bij 50, 75, 90 en 100 procent.</p>
        </div>

        <div>
          <label className="label" htmlFor="usdToEur">
            Koers dollar → euro
          </label>
          <input
            id="usdToEur"
            name="usdToEur"
            className="input"
            inputMode="decimal"
            defaultValue={usdToEur}
          />
          <p className="mt-1 text-xs text-text-faint">
            Aanbieders rekenen vaak in dollars; hiermee zet ik het om.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="hourlyRateEur">
            Uurtarief team (€)
          </label>
          <input
            id="hourlyRateEur"
            name="hourlyRateEur"
            className="input"
            inputMode="decimal"
            defaultValue={hourlyRateEur ?? ""}
            placeholder="65"
          />
          <p className="mt-1 text-xs text-text-faint">
            Zonder dit getal reken ik bespaarde uren niet om naar euro&rsquo;s.
          </p>
        </div>
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Bezig…" : "Opslaan"}
      </button>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p className="text-sm text-ok">{state.ok}</p>}
    </form>
  );
}

export function ContextSettings({ context }: { context: string }) {
  const [state, formAction, pending] = useActionState(saveContext, initial);
  const [text, setText] = useState(context);

  return (
    <form action={formAction} className="card space-y-3 p-5">
      <textarea
        name="context"
        className="input min-h-64 resize-y font-mono text-xs leading-relaxed"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Bezig…" : "Opslaan"}
        </button>
        <span className="text-xs text-text-faint">
          ~{Math.round(text.length / 3.6).toLocaleString("nl-NL")} tokens — dit gaat bij élke aanroep
          mee, dus langer is duurder.
        </span>
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p className="text-sm text-ok">{state.ok}</p>}
    </form>
  );
}
