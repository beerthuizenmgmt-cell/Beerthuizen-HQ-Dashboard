"use client";

import { useActionState } from "react";
import { bewaarMailinstellingen, stuurProefmailNaar } from "@/lib/actions/mail";

const leeg: { ok?: boolean; message?: string } = {};

/// Uitgaande mail via Resend.
///
/// De sleutel wordt nooit teruggetoond. Laat je het veld leeg, dan blijft staan
/// wat er stond — dat is de normale toestand, niet een fout.
export function MailSettings({
  hasKey,
  afzender,
  antwoordNaar,
  ready,
  eigenEmail,
}: {
  hasKey: boolean;
  afzender: string | null;
  antwoordNaar: string | null;
  ready: boolean;
  eigenEmail: string;
}) {
  const [bewaarState, bewaarAction, bewaarBezig] = useActionState(bewaarMailinstellingen, leeg);
  const [proefState, proefAction, proefBezig] = useActionState(stuurProefmailNaar, leeg);

  return (
    <div className="card space-y-4 p-5">
      <p className="text-xs text-text-muted">
        {ready
          ? `Klaar om te versturen vanaf ${afzender}.`
          : hasKey
            ? "De sleutel staat er, maar er is nog geen afzenderadres ingesteld."
            : "Nog geen Resend-sleutel. Zolang die ontbreekt kan er geen mail de deur uit."}
      </p>

      <form action={bewaarAction} className="space-y-3">
        <div>
          <label htmlFor="afzender" className="mb-1 block text-xs text-text-muted">
            Afzender — moet op een domein staan dat je bij Resend geverifieerd hebt
          </label>
          <input
            id="afzender"
            name="afzender"
            className="input"
            defaultValue={afzender ?? ""}
            placeholder="Beerthuizen Management &lt;info@bhmanagement.nl&gt;"
          />
        </div>

        <div>
          <label htmlFor="antwoordNaar" className="mb-1 block text-xs text-text-muted">
            Antwoorden gaan naar (optioneel)
          </label>
          <input
            id="antwoordNaar"
            name="antwoordNaar"
            className="input"
            defaultValue={antwoordNaar ?? ""}
            placeholder={eigenEmail}
          />
        </div>

        <div>
          <label htmlFor="apiKey" className="mb-1 block text-xs text-text-muted">
            Resend API-sleutel {hasKey && "— er staat er al een; leeg laten houdt hem"}
          </label>
          <input
            id="apiKey"
            name="apiKey"
            type="password"
            className="input"
            placeholder={hasKey ? "••••••••••••" : "re_..."}
            autoComplete="off"
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={bewaarBezig}>
          {bewaarBezig ? "Bezig…" : "Opslaan"}
        </button>

        {bewaarState.message && (
          <p className={`text-xs ${bewaarState.ok ? "text-ok" : "text-danger"}`}>
            {bewaarState.message}
          </p>
        )}
      </form>

      <form action={proefAction} className="space-y-2 border-t border-border pt-4">
        <label htmlFor="naar" className="block text-xs text-text-muted">
          Proefmail naar jezelf — gaat nergens anders heen
        </label>
        <div className="flex flex-wrap gap-2">
          <input id="naar" name="naar" className="input flex-1" defaultValue={eigenEmail} />
          <button type="submit" className="btn btn-ghost" disabled={proefBezig || !ready}>
            {proefBezig ? "Bezig…" : "Stuur proefmail"}
          </button>
        </div>
        {proefState.message && (
          <p className={`text-xs ${proefState.ok ? "text-ok" : "text-danger"}`}>
            {proefState.message}
          </p>
        )}
      </form>
    </div>
  );
}
