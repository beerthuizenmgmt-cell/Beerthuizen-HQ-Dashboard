"use client";

import { useActionState, useState } from "react";
import { useActie } from "./use-actie";
import { ActieFout } from "./actie-fout";
import {
  bewaarFactuur,
  markeerBetaald,
  markeerVerstuurd,
  verwijderFactuur,
  type FactuurState,
} from "@/lib/actions/facturen";

// De facturenlijst met het invoerformulier eronder.
//
// De knoppen heten "vastleggen dat ...", niet "versturen". Dat is geen
// woordspel: de app stuurt niets. Je legt vast wat jij hebt gedaan, zodat Maud
// weet waar een factuur staat.

export type FactuurRij = {
  id: string;
  nummer: string;
  richting: string;
  klant: string;
  email: string | null;
  factuurdatum: string;
  factuurdatumLabel: string;
  vervaldatum: string;
  vervaldatumLabel: string;
  bedrag: number;
  bedragLabel: string;
  openstaandLabel: string;
  status: string;
  statusLabel: string;
  opvolgingLabel: string;
  verzonden: string;
  verzondenLabel: string | null;
  betaaldatum: string;
  betaaldatumLabel: string | null;
  herinnering1: string | null;
  herinnering2: string | null;
  dagen: number;
  teLaat: boolean;
  notities: string | null;
  volgendeStap: string;
  bron: string;
};

const STATUSSEN = [
  ["concept", "Concept"],
  ["verzonden", "Verzonden"],
  ["deels_betaald", "Deels betaald"],
  ["betaald", "Betaald"],
  ["oninbaar", "Oninbaar"],
  ["vervallen_verklaard", "Vervallen verklaard"],
];

export function FactuurTabel({ facturen }: { facturen: FactuurRij[] }) {
  const [bewerken, setBewerken] = useState<FactuurRij | null>(null);
  const [nieuw, setNieuw] = useState(false);
  const [teWissen, setTeWissen] = useState<string | null>(null);
  const { bezig, fout, doe } = useActie();
  const [state, formAction, opslaan] = useActionState<FactuurState, FormData>(bewaarFactuur, {});

  const open = bewerken ?? (nieuw ? null : undefined);

  return (
    <div className="space-y-4">
      <ActieFout fout={fout} />
      <div className="flex items-center justify-between">
        <h2 className="eyebrow">De administratie</h2>
        <button
          type="button"
          className="btn btn-primary text-xs"
          onClick={() => {
            setBewerken(null);
            setNieuw(true);
          }}
        >
          Factuur toevoegen
        </button>
      </div>

      {open !== undefined && (
        // De sleutel dwingt een nieuw formulier af zodra je een andere factuur
        // opent.
        //
        // Zonder dat hergebruikt React hetzelfde formulier: de tekstvelden
        // werken dan wel bij, maar een keuzelijst niet — defaultValue geldt
        // alleen bij het opbouwen. Wie eerst "factuur toevoegen" opende en
        // daarna "bewerken", kreeg een betaalde factuur te zien met status
        // "concept", en sloeg die met één klik ook zo op. Een betaalde factuur
        // werd zo stilletjes weer een concept en dook terug op in je
        // openstaande debiteuren.
        <form key={open?.id ?? "nieuw"} action={formAction} className="card space-y-4 p-5">
          <input type="hidden" name="id" value={bewerken?.id ?? ""} />

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="eyebrow mb-1 block">Factuurnummer</span>
              <input name="nummer" className="input" defaultValue={bewerken?.nummer} required />
            </label>
            <label className="block sm:col-span-2">
              <span className="eyebrow mb-1 block">Klant</span>
              <input name="klant" className="input" defaultValue={bewerken?.klant} required />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <label className="block">
              <span className="eyebrow mb-1 block">Factuurdatum</span>
              <input name="factuurdatum" type="date" className="input" defaultValue={bewerken?.factuurdatum} required />
            </label>
            <label className="block">
              <span className="eyebrow mb-1 block">Vervaldatum</span>
              <input name="vervaldatum" type="date" className="input" defaultValue={bewerken?.vervaldatum} required />
            </label>
            <label className="block">
              <span className="eyebrow mb-1 block">Bedrag incl. btw</span>
              <input name="bedrag" className="input" placeholder="1250,00" defaultValue={bewerken?.bedrag} required />
            </label>
            <label className="block">
              <span className="eyebrow mb-1 block">Status</span>
              <select name="status" className="input" defaultValue={bewerken?.status ?? "concept"}>
                {STATUSSEN.map(([waarde, label]) => (
                  <option key={waarde} value={waarde}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <label className="block">
              <span className="eyebrow mb-1 block">Verzonden op</span>
              <input name="verzonden" type="date" className="input" defaultValue={bewerken?.verzonden} />
            </label>
            <label className="block">
              <span className="eyebrow mb-1 block">Betaald op</span>
              <input name="betaaldatum" type="date" className="input" defaultValue={bewerken?.betaaldatum} />
            </label>
            <label className="block">
              <span className="eyebrow mb-1 block">Betaald bedrag</span>
              <input name="betaald" className="input" placeholder="leeg = niets" />
            </label>
            <label className="block">
              <span className="eyebrow mb-1 block">E-mail klant</span>
              <input name="email" type="email" className="input" defaultValue={bewerken?.email ?? ""} />
            </label>
          </div>

          <label className="block">
            <span className="eyebrow mb-1 block">Interne notities</span>
            <textarea
              name="notities"
              className="input min-h-20"
              placeholder="Afspraken, betaalgedrag, wat er speelt. Maud leest dit mee."
              defaultValue={bewerken?.notities ?? ""}
            />
          </label>

          {state.error && <p className="text-sm text-danger">{state.error}</p>}
          {state.ok && <p className="text-sm text-success">{state.ok}</p>}

          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary text-xs" disabled={opslaan}>
              {opslaan ? "Opslaan…" : "Opslaan"}
            </button>
            <button
              type="button"
              className="btn btn-ghost text-xs"
              onClick={() => {
                setBewerken(null);
                setNieuw(false);
              }}
            >
              Sluiten
            </button>
          </div>
        </form>
      )}

      {facturen.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-text-muted">
            Nog geen facturen. Voeg er een toe, of importeer ze straks uit je boekhouding — Maud werkt
            met wat hier staat en verzint niets erbij.
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[64rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-3 py-3 font-medium">Factuur</th>
                <th className="px-3 py-3 font-medium">Klant / leverancier</th>
                <th className="px-3 py-3 font-medium">Vervalt</th>
                <th className="px-3 py-3 text-right font-medium">Bedrag</th>
                <th className="px-3 py-3 text-right font-medium">Open</th>
                <th className="px-3 py-3 text-right font-medium">Dagen</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Volgende stap</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {facturen.map((factuur) => (
                <tr key={factuur.id} className={factuur.teLaat ? "bg-danger/5" : ""}>
                  <td className="px-3 py-3 font-medium">{factuur.nummer}</td>
                  <td className="px-3 py-3">
                    {factuur.klant}
                    {factuur.richting === "inkomend" && (
                      <span className="ml-2 chip text-xs">inkomend</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs">{factuur.vervaldatumLabel}</td>
                  <td className="px-3 py-3 text-right">{factuur.bedragLabel}</td>
                  <td className="px-3 py-3 text-right">{factuur.openstaandLabel}</td>
                  <td className={`px-3 py-3 text-right ${factuur.teLaat ? "text-danger" : "text-text-faint"}`}>
                    {factuur.dagen > 0 ? `+${factuur.dagen}` : factuur.dagen}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {factuur.statusLabel}
                    <span className="block text-text-faint">{factuur.opvolgingLabel}</span>
                  </td>
                  <td className="px-3 py-3 text-xs">{factuur.volgendeStap}</td>
                  <td className="px-3 py-3 text-right text-xs">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        className="underline hover:text-text"
                        onClick={() => {
                          setNieuw(false);
                          setBewerken(factuur);
                        }}
                      >
                        bewerken
                      </button>
                      {!factuur.verzondenLabel && (
                        <button
                          type="button"
                          className="underline hover:text-text"
                          disabled={bezig}
                          onClick={() => doe(() => markeerVerstuurd(factuur.id, "factuur"))}
                        >
                          verstuurd
                        </button>
                      )}
                      {factuur.status !== "betaald" && (
                        <button
                          type="button"
                          className="underline hover:text-success"
                          disabled={bezig}
                          onClick={() => doe(() => markeerBetaald(factuur.id))}
                        >
                          betaald
                        </button>
                      )}
                      {/* Wissen vraagt eerst na.

                          De knop stond pal naast "betaald" en "verstuurd", en
                          één klik was genoeg om een factuur voorgoed weg te
                          gooien. Bij financiële administratie is dat het soort
                          knop dat je één keer per ongeluk aanraakt en daarna
                          niet meer terug kunt draaien. */}
                      {teWissen === factuur.id ? (
                        <>
                          <button
                            type="button"
                            className="underline text-danger"
                            disabled={bezig}
                            onClick={() =>
                              doe(async () => {
                                await verwijderFactuur(factuur.id);
                                setTeWissen(null);
                              })
                            }
                          >
                            {bezig ? "bezig…" : "ja, wissen"}
                          </button>
                          <button
                            type="button"
                            className="underline"
                            onClick={() => setTeWissen(null)}
                          >
                            toch niet
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="underline hover:text-danger"
                          disabled={bezig}
                          onClick={() => setTeWissen(factuur.id)}
                        >
                          wissen
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
