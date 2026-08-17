"use client";

import { useActionState, useState, useTransition } from "react";
import {
  maakKlantlink,
  markeerVerstuurd,
  markeerVerwerkt,
  verwijderAanvraag,
  type PortaalState,
} from "@/lib/actions/portaal";

// Links aanmaken en volgen waar een klant staat.
//
// De statusregel is het hele punt: je ziet of een klant de link geopend heeft.
// Zonder dat blijf je gissen of iemand hem gemist heeft of gewoon nog niet
// toegekomen is.

export type Aanvraag = {
  id: string;
  naam: string;
  type: string;
  status: string;
  statusLabel: string;
  statusStijl: string;
  link: string;
  aangemaakt: string;
  geopend: string | null;
  ingevuld: string | null;
  verloopt: string;
  ingestuurd: Record<string, string> | null;
};

const TYPES = [
  ["klantgegevens", "Klantgegevens — voor administratie en facturatie"],
  ["campagnebriefing", "Campagnebriefing — voor een nieuwe campagne"],
  ["contentaanlevering", "Contentaanlevering — bestanden en materiaal"],
  ["projectinformatie", "Projectinformatie — nog niet beschikbaar"],
];

export function KlantPaneel({
  klanten,
  aanvragen,
}: {
  klanten: { id: string; naam: string }[];
  aanvragen: Aanvraag[];
}) {
  const [open, setOpen] = useState(false);
  const [bezig, start] = useTransition();
  const [gekopieerd, setGekopieerd] = useState<string | null>(null);
  const [uitgeklapt, setUitgeklapt] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<PortaalState, FormData>(maakKlantlink, {});

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Gegevens opvragen</h2>
            <p className="mt-1 text-xs text-text-muted">
              Eén link, één formulier, één klant. Dertig dagen geldig, daarna doet hij niets meer.
            </p>
          </div>
          <button type="button" className="btn btn-primary text-xs" onClick={() => setOpen(!open)}>
            {open ? "Sluiten" : "+ Klantgegevens opvragen"}
          </button>
        </div>

        {open && (
          <form action={formAction} className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3 sm:items-end">
            <label className="block">
              <span className="eyebrow mb-1 block">Bestaande klant</span>
              <select name="clientId" className="input">
                <option value="">— nieuwe klant —</option>
                {klanten.map((klant) => (
                  <option key={klant.id} value={klant.id}>
                    {klant.naam}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="eyebrow mb-1 block">Of naam nieuwe klant</span>
              <input name="label" className="input" placeholder="Naam van het bedrijf" />
            </label>

            <label className="block">
              <span className="eyebrow mb-1 block">Welk formulier</span>
              <select name="type" className="input" defaultValue="klantgegevens">
                {TYPES.map(([waarde, label]) => (
                  <option
                    key={waarde}
                    value={waarde}
                    disabled={waarde === "projectinformatie"}
                  >
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <div className="sm:col-span-3">
              {state.error && <p className="mb-2 text-sm text-danger">{state.error}</p>}
              {state.link && (
                <div className="mb-3 rounded-lg border border-success/40 bg-success/5 p-3">
                  <p className="text-xs text-success">Klaar. Stuur deze link naar je klant:</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded bg-bg px-2 py-1 text-xs">
                      {state.link}
                    </code>
                    <button
                      type="button"
                      className="btn btn-ghost text-xs"
                      onClick={() => {
                        void navigator.clipboard.writeText(state.link!);
                        setGekopieerd(state.link!);
                      }}
                    >
                      {gekopieerd === state.link ? "gekopieerd" : "kopieer"}
                    </button>
                  </div>
                </div>
              )}
              <button type="submit" className="btn btn-primary text-xs" disabled={pending}>
                {pending ? "Aanmaken…" : "Link aanmaken"}
              </button>
            </div>
          </form>
        )}
      </div>

      {aanvragen.length > 0 && (
        <div className="card divide-y divide-border">
          {aanvragen.map((aanvraag) => (
            <div key={aanvraag.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{aanvraag.naam}</p>
                  <p className="text-xs text-text-faint">
                    {aanvraag.type} · aangemaakt {aanvraag.aangemaakt}
                    {aanvraag.geopend && ` · geopend ${aanvraag.geopend}`}
                    {aanvraag.ingevuld && ` · ingevuld ${aanvraag.ingevuld}`}
                    {` · verloopt ${aanvraag.verloopt}`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className={aanvraag.statusStijl}>{aanvraag.statusLabel}</span>

                  <button
                    type="button"
                    className="underline hover:text-text"
                    onClick={() => {
                      void navigator.clipboard.writeText(aanvraag.link);
                      setGekopieerd(aanvraag.id);
                    }}
                  >
                    {gekopieerd === aanvraag.id ? "gekopieerd" : "kopieer link"}
                  </button>

                  {aanvraag.status === "aangemaakt" && (
                    <button
                      type="button"
                      className="underline hover:text-text"
                      disabled={bezig}
                      onClick={() => start(() => void markeerVerstuurd(aanvraag.id))}
                    >
                      verstuurd
                    </button>
                  )}

                  {aanvraag.ingestuurd && (
                    <button
                      type="button"
                      className="underline hover:text-text"
                      onClick={() => setUitgeklapt(uitgeklapt === aanvraag.id ? null : aanvraag.id)}
                    >
                      {uitgeklapt === aanvraag.id ? "verbergen" : "bekijk gegevens"}
                    </button>
                  )}

                  {aanvraag.status === "ingevuld" && (
                    <button
                      type="button"
                      className="btn btn-ghost text-xs"
                      disabled={bezig}
                      onClick={() => start(() => void markeerVerwerkt(aanvraag.id))}
                    >
                      gecontroleerd
                    </button>
                  )}

                  <button
                    type="button"
                    className="underline hover:text-danger"
                    disabled={bezig}
                    onClick={() => start(() => void verwijderAanvraag(aanvraag.id))}
                  >
                    intrekken
                  </button>
                </div>
              </div>

              {uitgeklapt === aanvraag.id && aanvraag.ingestuurd && (
                <dl className="mt-3 grid gap-x-6 gap-y-1 border-t border-border pt-3 text-xs sm:grid-cols-2">
                  {Object.entries(aanvraag.ingestuurd).map(([sleutel, waarde]) => (
                    <div key={sleutel} className="flex gap-2">
                      <dt className="text-text-faint">{sleutel}</dt>
                      <dd>{waarde}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
