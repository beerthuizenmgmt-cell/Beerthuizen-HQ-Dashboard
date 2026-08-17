"use client";

import { useActionState, useState } from "react";
import { maakCreator, koppelCreatorAanCampagne, type CreatorState } from "@/lib/actions/creators";
import { ActieFout } from "./actie-fout";
import { useActie } from "./use-actie";

// Een creator toevoegen, en hem aan een campagne hangen.
//
// Bewust weinig verplichte velden: alleen de naam. Al het andere weet je vaak
// pas later, en een formulier dat cijfers eist die je nog niet hebt, levert
// verzonnen cijfers op.

export function CreatorPaneel({ campagnes }: { campagnes: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, bezigMetToevoegen] = useActionState<CreatorState, FormData>(maakCreator, {});
  const { bezig, fout, doe } = useActie();
  const [koppel, setKoppel] = useState<{ creatorId: string; projectId: string }>({
    creatorId: "",
    projectId: "",
  });

  return (
    <div className="card p-5">
      <ActieFout fout={fout} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Creator toevoegen</h2>
          <p className="mt-1 text-xs text-text-muted">
            Alleen de naam is verplicht. Cijfers die je nog niet hebt laat je leeg — leeg betekent
            &ldquo;niet gemeten&rdquo;, en daar rekent niemand mee.
          </p>
        </div>
        <button type="button" className="btn btn-primary text-xs" onClick={() => setOpen(!open)}>
          {open ? "Sluiten" : "+ Creator"}
        </button>
      </div>

      {open && (
        <form action={formAction} className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
          <label className="block sm:col-span-2">
            <span className="eyebrow mb-1 block">Naam</span>
            <input name="name" className="input" required placeholder="Voor- en achternaam" />
          </label>

          <label className="block">
            <span className="eyebrow mb-1 block">Soort</span>
            <select name="soort" className="input" defaultValue="extern">
              <option value="eigen">Eigen creator</option>
              <option value="via_agency">Via een ander bureau</option>
              <option value="extern">Extern</option>
            </select>
          </label>

          <label className="block">
            <span className="eyebrow mb-1 block">Instagram</span>
            <input name="instagram" className="input" placeholder="zonder @" />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">TikTok</span>
            <input name="tiktok" className="input" placeholder="zonder @" />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">YouTube</span>
            <input name="youtube" className="input" />
          </label>

          <label className="block">
            <span className="eyebrow mb-1 block">Niche</span>
            <input name="niche" className="input" placeholder="fitness, voeding" />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">Land</span>
            <input name="land" className="input" placeholder="Nederland" />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">Bureau</span>
            <input name="agency" className="input" placeholder="alleen bij via een bureau" />
          </label>

          <label className="block">
            <span className="eyebrow mb-1 block">Volgers Instagram</span>
            <input name="volgersInstagram" className="input" placeholder="84.2k mag ook" />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">Volgers TikTok</span>
            <input name="volgersTiktok" className="input" />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">Richtprijs in euro&apos;s</span>
            <input name="prijsindicatieEur" className="input" placeholder="1250" />
          </label>

          <div className="sm:col-span-3">
            {state.error && <p className="mb-2 text-sm text-danger">{state.error}</p>}
            {state.ok && <p className="mb-2 text-sm text-success">{state.ok}</p>}
            <button type="submit" className="btn btn-primary text-xs" disabled={bezigMetToevoegen}>
              {bezigMetToevoegen ? "Toevoegen…" : "Toevoegen"}
            </button>
          </div>
        </form>
      )}

      {campagnes.length > 0 && (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
          <label className="block">
            <span className="eyebrow mb-1 block">Creator-ID</span>
            <input
              className="input w-64 text-xs"
              placeholder="plak het ID van de creator"
              value={koppel.creatorId}
              onChange={(e) => setKoppel({ ...koppel, creatorId: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">Aan campagne</span>
            <select
              className="input w-64 text-xs"
              value={koppel.projectId}
              onChange={(e) => setKoppel({ ...koppel, projectId: e.target.value })}
            >
              <option value="">Kies een campagne…</option>
              {campagnes.map((campagne) => (
                <option key={campagne.id} value={campagne.id}>
                  {campagne.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-ghost text-xs"
            disabled={bezig || !koppel.creatorId || !koppel.projectId}
            onClick={() => doe(() => koppelCreatorAanCampagne(koppel.creatorId, koppel.projectId))}
          >
            Koppelen
          </button>
        </div>
      )}
    </div>
  );
}
