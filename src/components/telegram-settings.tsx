"use client";

import { useActionState, useState, useTransition } from "react";
import { useActie } from "@/components/use-actie";
import { ActieFout } from "@/components/actie-fout";
import {
  checkTelegram,
  zetInkomendeLijnAan,
  zetInkomendeLijnUit,
  connectBot,
  findMyChat,
  sendTestMessage,
  type TelegramState,
} from "@/lib/actions/telegram";

const initial: TelegramState = {};

export function TelegramSettings({
  hasToken,
  webhook,
  botUsername,
  chatId,
  ready,
}: {
  hasToken: boolean;
  webhook: { aan: boolean; url: string | null; wachtrij: number; laatsteFout: string | null };
  botUsername: string | null;
  chatId: string | null;
  ready: boolean;
}) {
  const [state, formAction, pending] = useActionState(connectBot, initial);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const { doe, fout, bezig: busy } = useActie();

  return (
    <div className="card space-y-4 p-5">
      <div
        className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm"
        style={{
          borderColor: ready ? "color-mix(in srgb, var(--ok) 40%, transparent)" : "var(--border)",
          background: ready ? "color-mix(in srgb, var(--ok) 8%, transparent)" : "transparent",
        }}
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: ready ? "var(--ok)" : hasToken ? "var(--warn)" : "var(--text-faint)" }}
        />
        <span className={ready ? "text-ok" : hasToken ? "text-warn" : "text-text-muted"}>
          {ready
            ? `Verbonden met @${botUsername} — chat ${chatId}`
            : hasToken
              ? `Bot @${botUsername} gekoppeld, maar hij kent je chat nog niet`
              : "Nog geen bot gekoppeld"}
        </span>
      </div>

      {!hasToken && (
        <form action={formAction} className="space-y-2">
          <label className="label" htmlFor="botToken">
            Bot-token van @BotFather
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="botToken"
              name="botToken"
              type="password"
              className="input flex-1 font-mono text-xs"
              autoComplete="off"
              placeholder="123456789:AAF..."
            />
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Controleren…" : "Koppelen"}
            </button>
          </div>
          <p className="text-xs text-text-faint">
            Wordt versleuteld opgeslagen en komt nooit terug naar dit scherm.
          </p>
        </form>
      )}

      {hasToken && !ready && (
        <div className="space-y-3">
          <ol className="space-y-1.5 text-sm text-text-muted">
            <li>
              1. Open Telegram en zoek{" "}
              <a
                href={`https://t.me/${botUsername}`}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline"
              >
                @{botUsername}
              </a>
            </li>
            <li>2. Druk op <strong>Start</strong> en stuur één bericht, bijvoorbeeld &ldquo;hoi&rdquo;</li>
            <li>3. Klik hieronder — dan zoek ik je chat op</li>
          </ol>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              doe(async () => {
                setFeedback(await findMyChat());
              })
            }
          >
            {busy ? "Zoeken…" : "Zoek mijn chat"}
          </button>
          <p className="text-xs text-text-faint">
            Telegram geeft een bot pas toegang tot een gesprek nadat jij zelf begint. Daarom deze stap.
          </p>
        </div>
      )}

      {ready && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() =>
                doe(async () => {
                  setFeedback(await sendTestMessage());
                })
              }
            >
              {busy ? "Bezig…" : "Stuur een proefbericht"}
            </button>

            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                doe(async () => {
                  setFeedback(await checkTelegram());
                })
              }
            >
              {busy ? "Bezig…" : "Nieuwe berichten ophalen"}
            </button>
          </div>

          {/* De inkomende lijn.

              Hiervoor kwam een bericht pas binnen als iemand op "ophalen" drukte.
              Stuurde je de bot iets, dan bleef het liggen. Met de webhook duwt
              Telegram elk bericht meteen door en is het een gesprek in plaats van
              een postbus die je zelf moet legen. */}
          <div className="rounded-xl border border-border bg-bg p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: webhook.aan ? "var(--ok)" : "var(--warn)" }}
              />
              <span className={`text-sm ${webhook.aan ? "text-ok" : "text-warn"}`}>
                {webhook.aan
                  ? "De lijn staat open — berichten komen direct binnen"
                  : "De lijn staat dicht — berichten komen pas binnen als je op ophalen drukt"}
              </span>
            </div>

            {webhook.wachtrij > 0 && (
              <p className="mt-1 text-xs text-warn">
                {webhook.wachtrij} bericht(en) blijven hangen bij Telegram.
              </p>
            )}
            {webhook.laatsteFout && (
              <p className="mt-1 text-xs text-danger">Laatste fout: {webhook.laatsteFout}</p>
            )}

            <button
              type="button"
              className={`btn mt-3 ${webhook.aan ? "btn-ghost" : "btn-primary"}`}
              disabled={busy}
              onClick={() =>
                doe(async () =>
                  setFeedback(webhook.aan ? await zetInkomendeLijnUit() : await zetInkomendeLijnAan()),
                )
              }
            >
              {busy ? "Bezig…" : webhook.aan ? "Lijn sluiten" : "Lijn openzetten"}
            </button>
          </div>

          <p className="text-xs text-text-muted">
            Staat de lijn open, dan leest de Head elk bericht meteen, denkt na en antwoordt in
            Telegram. Ophalen hoeft dan niet meer — die knop blijft staan voor als je wilt
            controleren of er iets is blijven liggen. Lokaal werkt de lijn niet: Telegram kan je
            eigen Mac niet bereiken.
          </p>
        </div>
      )}

      <ActieFout fout={fout} />

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p className="text-sm text-ok">{state.ok}</p>}
      {feedback && (
        <p className={`text-sm ${feedback.ok ? "text-ok" : "text-warn"}`}>{feedback.message}</p>
      )}
    </div>
  );
}
