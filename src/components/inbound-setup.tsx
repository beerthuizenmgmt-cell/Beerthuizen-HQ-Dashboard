"use client";

import { useState } from "react";
import { useActie } from "@/components/use-actie";
import { ActieFout } from "@/components/actie-fout";
import { rotateInboundToken } from "@/lib/actions/notifications";

/// Laat zien hoe een agent terugpraat. Het token staat standaard verborgen —
/// het is een sleutel, geen leesvoer.
export function InboundSetup({
  agentId,
  token,
  appUrl,
  isTelegram,
}: {
  agentId: string;
  token: string | null;
  appUrl: string;
  isTelegram: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const { doe, fout, bezig: pending } = useActie();

  const replyUrl = `${appUrl}/api/agents/${agentId}/reply`;
  const webhookUrl = `${appUrl}/api/webhooks/telegram/${agentId}`;
  const shown = visible && token ? token : "at_••••••••••••••••";

  return (
    <div className="space-y-3">
      <ActieFout fout={fout} />
      <p className="text-xs text-text-muted">
        Hiermee meldt de agent resultaten terug. Het token krijgt hij automatisch mee in elke opdracht
        die je hem stuurt — je hoeft het alleen zelf te gebruiken als je de koppeling handmatig instelt.
      </p>

      {!token ? (
        <button
          type="button"
          className="btn btn-ghost"
          disabled={pending}
          onClick={() => doe(() => rotateInboundToken(agentId))}
        >
          {pending ? "Bezig…" : "Token aanmaken"}
        </button>
      ) : (
        <>
          <pre className="overflow-x-auto rounded-lg border border-border bg-bg p-3 font-mono text-xs leading-relaxed text-text-muted">
{`POST ${replyUrl}
Authorization: Bearer ${shown}
{"taskId": "...", "status": "done", "message": "..."}`}
          </pre>

          {isTelegram && (
            <div>
              <p className="mb-1.5 text-xs text-text-muted">
                Wil je dat antwoorden uit Telegram hier binnenkomen? Registreer de webhook één keer:
              </p>
              <pre className="overflow-x-auto rounded-lg border border-border bg-bg p-3 font-mono text-xs leading-relaxed text-text-muted">
{`curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \\
  -d "url=${webhookUrl}" \\
  -d "secret_token=${shown}"`}
              </pre>
              {appUrl.includes("localhost") && (
                <p className="mt-1.5 text-xs text-warn">
                  Telegram kan localhost niet bereiken — dit werkt pas zodra het dashboard online staat.
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost text-xs" onClick={() => setVisible((v) => !v)}>
              {visible ? "Token verbergen" : "Token tonen"}
            </button>
            <button
              type="button"
              className="btn btn-ghost text-xs"
              disabled={pending}
              onClick={() => doe(() => rotateInboundToken(agentId))}
            >
              {pending ? "Bezig…" : "Nieuw token"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
