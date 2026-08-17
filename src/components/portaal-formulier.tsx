"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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

  // Alle antwoorden in één state. Dat moet: zodra een keuze een vervolgvraag
  // laat verschijnen tekent React het formulier opnieuw, en dan zouden losse
  // velden hun inhoud kwijtraken. Iemand die halverwege een keuze aanpast mag
  // niet opeens het halve formulier opnieuw hoeven invullen.
  const [antwoorden, setAntwoorden] = useState<Record<string, string>>({});
  const wijzig = (naam: string, waarde: string) =>
    setAntwoorden((vorige) => ({ ...vorige, [naam]: waarde }));

  const zichtbaar = (veld: Veld) =>
    !veld.toonAls || veld.toonAls.waarden.includes(antwoorden[veld.toonAls.veld] ?? "");

  // Bij acht blokken weet je zonder dit niet of je op een derde of op
  // driekwart zit. Puur visueel: het verandert niets aan wat er gevraagd wordt.
  const [blok, setBlok] = useState(1);
  const blokken = useRef<(HTMLFieldSetElement | null)[]>([]);

  useEffect(() => {
    const kijker = new IntersectionObserver(
      (waarnemingen) => {
        const bovenste = waarnemingen
          .filter((w) => w.isIntersecting)
          .map((w) => blokken.current.indexOf(w.target as HTMLFieldSetElement))
          .filter((index) => index >= 0)
          .sort((a, b) => a - b)[0];
        if (bovenste !== undefined) setBlok(bovenste + 1);
      },
      // Alleen wat echt in beeld is telt; de bovenrand van het scherm bepaalt
      // waar je bent.
      { rootMargin: "-20% 0px -60% 0px" },
    );

    for (const element of blokken.current) if (element) kijker.observe(element);
    return () => kijker.disconnect();
  }, [secties.length]);

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
      {secties.length > 1 && (
        <div className="sticky top-0 z-10 -mx-1 bg-bg/90 px-1 py-3 backdrop-blur">
          <div className="flex items-baseline justify-between text-xs text-text-muted">
            <span>
              Blok {blok} van {secties.length}
            </span>
            <span>{secties[blok - 1]?.kop}</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${(blok / secties.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {secties.map((sectie, index) => (
        <fieldset
          key={sectie.kop}
          ref={(element) => {
            blokken.current[index] = element;
          }}
          className="card p-6"
        >
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
                    <textarea
                      name={veld.naam}
                      className="input min-h-20"
                      required={veld.verplicht}
                      value={antwoorden[veld.naam] ?? ""}
                      onChange={(event) => wijzig(veld.naam, event.target.value)}
                    />
                  ) : veld.type === "select" ? (
                    <select
                      name={veld.naam}
                      className="input"
                      required={veld.verplicht}
                      value={antwoorden[veld.naam] ?? ""}
                      onChange={(event) => wijzig(veld.naam, event.target.value)}
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
                      value={antwoorden[veld.naam] ?? ""}
                      onChange={(event) => wijzig(veld.naam, event.target.value)}
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
