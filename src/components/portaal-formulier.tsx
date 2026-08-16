"use client";

import { useActionState } from "react";
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
            {sectie.velden.map((veld) => (
              <label key={veld.naam} className="block">
                <span className="mb-1 block text-sm">
                  {veld.label}
                  {!veld.verplicht && <span className="ml-2 text-xs text-text-faint">optioneel</span>}
                </span>

                {veld.type === "textarea" ? (
                  <textarea name={veld.naam} className="input min-h-20" required={veld.verplicht} />
                ) : (
                  <input
                    name={veld.naam}
                    type={veld.type}
                    className="input"
                    required={veld.verplicht}
                    autoComplete={autoComplete(veld)}
                  />
                )}

                {veld.hint && <span className="mt-1 block text-xs text-text-faint">{veld.hint}</span>}
              </label>
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
