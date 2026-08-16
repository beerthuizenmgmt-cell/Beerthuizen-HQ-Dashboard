"use client";

import { useActionState, useState, useTransition } from "react";
import { makePortrait, saveIdentity, type IdentityState } from "@/lib/actions/agent-tools";
import { AgentAvatar } from "./agent-avatar";

const initial: IdentityState = {};

export function AgentIdentity({
  agentId,
  name,
  role,
  description,
  emoji,
  color,
  avatarUrl,
}: {
  agentId: string;
  name: string;
  role: string;
  description: string | null;
  emoji: string | null;
  color: string | null;
  avatarUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(saveIdentity, initial);
  const [preview, setPreview] = useState<string | null>(null);
  const [draftName, setDraftName] = useState(name);
  const [draftEmoji, setDraftEmoji] = useState(emoji ?? "");
  const [portraitMessage, setPortraitMessage] = useState<string | null>(null);
  const [portraitPending, startPortrait] = useTransition();

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="agentId" value={agentId} />

      <div className="flex flex-wrap items-start gap-5">
        <div className="space-y-2 text-center">
          <AgentAvatar
            agent={{ name: draftName, emoji: draftEmoji, color, avatarUrl: preview ?? avatarUrl }}
            size="xl"
            className="mx-auto"
          />
          <button
            type="button"
            className="btn btn-ghost w-full px-2 py-1 text-[10px]"
            disabled={portraitPending}
            onClick={() =>
              startPortrait(async () => {
                setPortraitMessage(null);
                const result = await makePortrait(agentId);
                setPortraitMessage(result.message);
                if (result.ok) setPreview(null);
              })
            }
          >
            {portraitPending ? "Bezig…" : "Portret laten maken"}
          </button>
          <p className="text-[11px] text-text-faint">zo ziet hij eruit</p>
        </div>

        <div className="min-w-56 flex-1 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="name">
                Naam
              </label>
              <input
                id="name"
                name="name"
                className="input"
                required
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="role">
                Functietitel
              </label>
              <input id="role" name="role" className="input" required defaultValue={role} />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="description">
              Korte beschrijving
            </label>
            <textarea
              id="description"
              name="description"
              className="input min-h-20 resize-y"
              defaultValue={description ?? ""}
              placeholder="Waar deze agent over gaat, in één of twee zinnen."
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-[6rem_1fr]">
        <div>
          <label className="label" htmlFor="emoji">
            Emoji
          </label>
          <input
            id="emoji"
            name="emoji"
            className="input"
            maxLength={4}
            value={draftEmoji}
            onChange={(event) => setDraftEmoji(event.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="avatarFile">
            Gezicht
          </label>
          <input
            id="avatarFile"
            name="avatarFile"
            type="file"
            accept="image/*"
            className="input py-1.5 text-xs"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return setPreview(null);
              const reader = new FileReader();
              reader.onload = () => setPreview(String(reader.result));
              reader.readAsDataURL(file);
            }}
          />
          <input
            name="avatarUrl"
            className="input mt-2 text-xs"
            defaultValue={avatarUrl?.startsWith("data:") ? "" : (avatarUrl ?? "")}
            placeholder="…of plak een adres van een afbeelding"
          />
          <p className="mt-1 text-xs text-text-faint">
            Upload een AI-portret of plak een adres. Zonder afbeelding valt hij terug op de emoji, en
            zonder emoji op zijn initialen.
          </p>
          {avatarUrl && (
            <label className="mt-2 flex items-center gap-2 text-xs text-text-muted">
              <input type="checkbox" name="removeAvatar" />
              Huidige afbeelding verwijderen
            </label>
          )}
        </div>
      </div>

      {portraitMessage && <p className="text-sm text-text-muted">{portraitMessage}</p>}
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p className="text-sm text-ok">{state.ok}</p>}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Bezig…" : "Identiteit opslaan"}
      </button>
    </form>
  );
}
