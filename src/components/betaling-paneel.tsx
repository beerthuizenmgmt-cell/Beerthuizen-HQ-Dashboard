"use client";

import { useActionState, useState, useTransition } from "react";
import {
  bevestigKoppeling,
  negeerBetaling,
  registreerBetaling,
  type FactuurState,
} from "@/lib/actions/facturen";

// Binnengekomen betalingen die nog niet zeker aan een factuur hangen.
//
// Dit paneel bestaat omdat het systeem bij twijfel niets koppelt. Liever een
// vraag aan jou dan een factuur die op betaald staat terwijl het geld ergens
// anders vandaan kwam — dat merk je pas als de klant belt.

export type OpenBetaling = {
  id: string;
  bedragLabel: string;
  ontvangenLabel: string;
  omschrijving: string | null;
  tegenpartij: string | null;
  reden: string;
  bron: string;
  /// De factuur die het systeem vermoedde, als die er was.
  vermoeden: { id: string; label: string } | null;
};

export function BetalingPaneel({
  betalingen,
  facturen,
}: {
  betalingen: OpenBetaling[];
  facturen: { id: string; label: string }[];
}) {
  const [bezig, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FactuurState, FormData>(registreerBetaling, {});
  const [keuze, setKeuze] = useState<Record<string, string>>({});

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">
            Ontvangen betalingen
            {betalingen.length > 0 && (
              <span className="ml-2 chip border-warn/40 text-warn">{betalingen.length} te koppelen</span>
            )}
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            Bij een zekere match wordt de factuur meteen op betaald gezet en krijg je een Telegram-melding.
            Twijfelt het systeem, dan koppelt het niets en komt de betaling hier te staan.
          </p>
        </div>
        <button type="button" className="btn btn-ghost text-xs" onClick={() => setOpen(!open)}>
          {open ? "Sluiten" : "Betaling invoeren"}
        </button>
      </div>

      {open && (
        <form action={formAction} className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-5 sm:items-end">
          <label className="block">
            <span className="eyebrow mb-1 block">Bedrag</span>
            <input name="bedrag" className="input" placeholder="2500,00" required />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">Ontvangen op</span>
            <input name="ontvangen" type="date" className="input" required />
          </label>
          <label className="block sm:col-span-2">
            <span className="eyebrow mb-1 block">Omschrijving</span>
            <input name="omschrijving" className="input" placeholder="Factuur 2026-041" />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">Van wie</span>
            <input name="tegenpartij" className="input" placeholder="Klant A" />
          </label>

          <div className="sm:col-span-5">
            {state.error && <p className="mb-2 text-sm text-warn">{state.error}</p>}
            {state.ok && <p className="mb-2 text-sm text-success">{state.ok}</p>}
            <button type="submit" className="btn btn-primary text-xs" disabled={pending}>
              {pending ? "Verwerken…" : "Verwerken"}
            </button>
          </div>
        </form>
      )}

      {betalingen.length > 0 && (
        <ul className="mt-4 space-y-3 border-t border-border pt-4">
          {betalingen.map((betaling) => (
            <li key={betaling.id} className="rounded-lg border border-warn/30 bg-warn/5 p-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium">{betaling.bedragLabel}</span>
                <span className="text-xs text-text-muted">
                  {betaling.ontvangenLabel}
                  {betaling.tegenpartij && ` · van ${betaling.tegenpartij}`}
                  {betaling.omschrijving && ` · "${betaling.omschrijving}"`}
                  {` · via ${betaling.bron}`}
                </span>
              </div>

              <p className="mt-1 text-xs text-warn">{betaling.reden}</p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  className="input w-72 text-xs"
                  value={keuze[betaling.id] ?? betaling.vermoeden?.id ?? ""}
                  onChange={(event) => setKeuze({ ...keuze, [betaling.id]: event.target.value })}
                >
                  <option value="">Kies een factuur…</option>
                  {facturen.map((factuur) => (
                    <option key={factuur.id} value={factuur.id}>
                      {factuur.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="btn btn-primary text-xs"
                  disabled={bezig || !(keuze[betaling.id] ?? betaling.vermoeden?.id)}
                  onClick={() =>
                    start(() =>
                      void bevestigKoppeling(
                        betaling.id,
                        keuze[betaling.id] ?? betaling.vermoeden!.id,
                      ),
                    )
                  }
                >
                  Koppelen
                </button>

                <button
                  type="button"
                  className="text-xs text-text-faint underline hover:text-text"
                  disabled={bezig}
                  onClick={() => start(() => void negeerBetaling(betaling.id))}
                >
                  hoort nergens bij
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
