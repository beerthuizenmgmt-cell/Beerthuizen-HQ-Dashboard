"use client";

import { useActionState, useState } from "react";
import { werkCreatorBij, verwijderCreator, type CreatorState } from "@/lib/actions/creators";
import { useActie } from "@/components/use-actie";
import { ActieFout } from "@/components/actie-fout";

export type CreatorGegevens = {
  id: string;
  name: string;
  soort: string;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  niche: string[];
  land: string | null;
  agency: string | null;
  volgersInstagram: number | null;
  volgersTiktok: number | null;
  prijsindicatieEur: number | null;
};

const leeg: CreatorState = {};

/// Een creator corrigeren of weghalen.
///
/// Je kon een creator alleen toevoegen. Stond er een typefout in een naam of een
/// verouderd volgersaantal, dan bleef dat staan — en een register dat je niet
/// kunt corrigeren wordt vanzelf een register dat niemand vertrouwt.
export function CreatorBewerken({ creator }: { creator: CreatorGegevens }) {
  const [state, formAction, bezigMetOpslaan] = useActionState<CreatorState, FormData>(
    werkCreatorBij,
    leeg,
  );
  const { doe, fout, bezig } = useActie();
  const [open, setOpen] = useState(false);
  const [zekerWeten, setZekerWeten] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className="text-xs text-text-faint underline hover:text-text"
        onClick={() => setOpen(true)}
      >
        bewerken
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-3 space-y-3 rounded-xl border border-border bg-bg p-4">
      <input type="hidden" name="id" value={creator.id} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="eyebrow mb-1 block">Naam</span>
          <input name="name" className="input" defaultValue={creator.name} required />
        </label>
        <label className="block">
          <span className="eyebrow mb-1 block">Bureau</span>
          <input name="agency" className="input" defaultValue={creator.agency ?? ""} />
        </label>
        <label className="block">
          <span className="eyebrow mb-1 block">Instagram</span>
          <input name="instagram" className="input" defaultValue={creator.instagram ?? ""} />
        </label>
        <label className="block">
          <span className="eyebrow mb-1 block">TikTok</span>
          <input name="tiktok" className="input" defaultValue={creator.tiktok ?? ""} />
        </label>
        <label className="block">
          <span className="eyebrow mb-1 block">Volgers Instagram</span>
          <input
            name="volgersInstagram"
            className="input"
            defaultValue={creator.volgersInstagram ?? ""}
          />
        </label>
        <label className="block">
          <span className="eyebrow mb-1 block">Volgers TikTok</span>
          <input name="volgersTiktok" className="input" defaultValue={creator.volgersTiktok ?? ""} />
        </label>
        <label className="block">
          <span className="eyebrow mb-1 block">Niche — gescheiden door komma&apos;s</span>
          <input name="niche" className="input" defaultValue={creator.niche.join(", ")} />
        </label>
        <label className="block">
          <span className="eyebrow mb-1 block">Prijsindicatie in euro</span>
          <input
            name="prijsindicatieEur"
            className="input"
            defaultValue={creator.prijsindicatieEur ?? ""}
          />
        </label>
        <label className="block">
          <span className="eyebrow mb-1 block">Land</span>
          <input name="land" className="input" defaultValue={creator.land ?? ""} />
        </label>
      </div>

      {state.error && <p className="text-xs text-danger">{state.error}</p>}
      {state.ok && <p className="text-xs text-ok">{state.ok}</p>}
      <ActieFout fout={fout} />

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn btn-primary text-xs" disabled={bezigMetOpslaan}>
          {bezigMetOpslaan ? "Bezig…" : "Opslaan"}
        </button>
        <button type="button" className="btn btn-ghost text-xs" onClick={() => setOpen(false)}>
          Sluiten
        </button>

        {/* Weghalen vraagt eerst na, met zijn naam erbij: aan een creator hangen
            zijn campagnekoppelingen en aangeleverde resultaten. */}
        <span className="ml-auto">
          {zekerWeten ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-warn">{creator.name} uit het register halen?</span>
              <button
                type="button"
                className="text-xs text-danger underline"
                disabled={bezig}
                onClick={() => doe(() => verwijderCreator(creator.id))}
              >
                {bezig ? "bezig…" : "ja, weghalen"}
              </button>
              <button
                type="button"
                className="text-xs underline"
                onClick={() => setZekerWeten(false)}
              >
                toch niet
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="text-xs text-text-faint underline hover:text-danger"
              onClick={() => setZekerWeten(true)}
            >
              uit register halen
            </button>
          )}
        </span>
      </div>
    </form>
  );
}
