"use client";

import { useState } from "react";
import { useActie } from "@/components/use-actie";
import { ActieFout } from "@/components/actie-fout";
import { dispatchTask, setTaskStatus, assignTask } from "@/lib/actions/tasks";

const STATUS_OPTIONS = [
  { value: "inbox", label: "Inbox" },
  { value: "assigned", label: "Toegewezen" },
  { value: "in_progress", label: "Bezig" },
  { value: "blocked", label: "Vastgelopen" },
  { value: "review", label: "Ter controle" },
  { value: "done", label: "Klaar" },
];

export function TaskActions({
  taskId,
  status,
  agentId,
  agents,
  canSend,
}: {
  taskId: string;
  status: string;
  agentId: string | null;
  agents: { id: string; name: string; emoji: string | null }[];
  canSend: boolean;
}) {
  const { doe, fout, bezig: pending } = useActie();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input w-auto"
          value={agentId ?? ""}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.value;
            if (!next) return;
            doe(() => assignTask(taskId, next));
          }}
        >
          <option value="">Niemand toegewezen</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.emoji ? `${agent.emoji} ` : ""}
              {agent.name}
            </option>
          ))}
        </select>

        <select
          className="input w-auto"
          value={status}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.value;
            doe(() => setTaskStatus(taskId, next));
          }}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !agentId || !canSend}
          title={
            !agentId
              ? "Wijs eerst een agent toe"
              : !canSend
                ? "Deze agent heeft geen koppeling die berichten ontvangt"
                : undefined
          }
          onClick={() => {
            doe(async () => {
              const result = await dispatchTask(taskId);
              setFeedback({
                ok: result.ok,
                text: result.ok ? "Opdracht verstuurd." : (result.error ?? "Versturen mislukt."),
              });
            });
          }}
        >
          {pending ? "Bezig…" : "Versturen naar agent"}
        </button>
      </div>

      {!canSend && agentId && (
        <p className="text-xs text-warn">
          Deze agent is nog niet gekoppeld aan een kanaal dat berichten ontvangt. Koppel hem via
          Telegram of de gateway om taken te kunnen uitbesteden.
        </p>
      )}

      <ActieFout fout={fout} />

      {feedback && (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            feedback.ok ? "border-ok/40 bg-ok/10 text-ok" : "border-danger/40 bg-danger/10 text-danger"
          }`}
        >
          {feedback.ok ? "✓ " : "✕ "}
          {feedback.text}
        </p>
      )}
    </div>
  );
}
