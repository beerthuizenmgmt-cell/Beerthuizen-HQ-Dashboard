"use client";

import { useActionState, useState } from "react";
import { verwerkFormulier, type PortaalState } from "@/lib/actions/portaal";
import type { Veld } from "@/lib/portaal";

// Het formulier zoals de klant het invult.
//
// Bewust kaal: één kolom, duidelijke labels, geen slimmigheden. Iemand die dit
// tussen twee afspraken door invult moet in één blik zien wat er van hem
// gevraagd wordt.

export function PortaalFormulier({
  token,
  secties,
}: {
  token: string;
  secties: { kop: string; velden: Veld[] }[];
}) {
  const [state, formAction, pending] = useActionState<PortaalState, FormData>(
    verwerkFormulier.bind(null, token),
    {},
  );

  // Antwoorden bijhouden zodat vervolgvragen alleen verschijnen wanneer ze
  // ergens over gaan. Wie geen budget heeft vastgesteld hoeft geen bedrag te
  // zien, en dat scheelt een derde van het formulier.
  const [antwoorden, setAntwoorden] = useState<Record<string, string>>({});

  const zichtbaar = (veld: Veld) =>
    !veld.toonAls || veld.toonAls.waarden.includes(antwoorden[veld.toonAls.veld] ?? "");

  if (state.ok) {
    return (
      <div className="card p-8 text-center">
        <p className="text-4xl">✅</p>
        <h2 className="mt-4 text-xl">Bedankt. Je gegevens zijn ontvangen.</h2>
        <p className="muted mt-2 text-sm">
          We nemen contact op als er nog iets ontbreekt. Je kunt dit venster sluiten.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-8">
      {secties.map((sectie) => (
        <fieldset key={sectie.kop} className="card p-6">
          <legend className="eyebrow px-2">{sectie.kop}</legend>

          <div className="mt-4 space-y-4">
            {sectie.velden.filter(zichtbaar).map((veld) => (
              <div key={veld.naam}>
                <label className="block">
                  <span className="mb-1 block text-sm">
                    {veld.label}
                    {!veld.verplicht && <span className="ml-2 text-xs text-text-faint">optioneel</span>}
                  </span>

                  {veld.type === "textarea" ? (
                    <textarea name={veld.naam} className="input min-h-20" required={veld.verplicht} />
                  ) : veld.type === "select" ? (
                    <select
                      name={veld.naam}
                      className="input"
                      required={veld.verplicht}
                      defaultValue=""
                      onChange={(event) =>
                        setAntwoorden({ ...antwoorden, [veld.naam]: event.target.value })
                      }
                    >
                      <option value="" disabled>
                        Kies…
                      </option>
                      {(veld.opties ?? []).map((optie) => (
                        <option key={optie} value={optie}>
                          {optie}
                        </option>
                      ))}
                    </select>
                  ) : veld.type === "multi" ? (
                    <span className="mt-1 flex flex-wrap gap-2">
                      {(veld.opties ?? []).map((optie) => (
                        <label
                          key={optie}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:border-accent"
                        >
                          <input type="checkbox" name={veld.naam} value={optie} />
                          {optie}
                        </label>
                      ))}
                    </span>
                  ) : (
                    <input
                      name={veld.naam}
                      type={veld.type}
                      className="input"
                      required={veld.verplicht}
                      autoComplete={autoComplete(veld)}
                    />
                  )}
                </label>

                {veld.hint && <span className="mt-1 block text-xs text-text-faint">{veld.hint}</span>}
              </div>
            ))}
          </div>
        </fieldset>
      ))}

      {state.error && (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {state.error}
        </p>
      )}

      <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={pending}>
        {pending ? "Versturen…" : "Gegevens verzenden"}
      </button>
    </form>
  );
}

/// Laat de browser meehelpen met invullen. Scheelt de klant werk en levert ons
/// nettere gegevens op dan wat iemand met de hand overtypt.
function autoComplete(veld: Veld): string | undefined {
  const map: Record<string, string> = {
    bedrijfsnaam: "organization",
    contactpersoon: "name",
    email: "email",
    telefoon: "tel",
    adres: "street-address",
    postcode: "postal-code",
    plaats: "address-level2",
    land: "country-name",
    factuurEmail: "email",
  };
  return map[veld.naam];
}
