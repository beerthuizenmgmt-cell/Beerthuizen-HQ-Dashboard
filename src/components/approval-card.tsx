"use client";

import { useState, useTransition } from "react";
import { approveRequest, rejectRequest } from "@/lib/actions/approvals";
import { AgentAvatar } from "./agent-avatar";

export type ApprovalItem = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  payload: unknown;
  createdAt: Date;
  agent: { name: string; emoji: string | null; color: string | null; avatarUrl: string | null };
};

const KIND_LABELS: Record<string, string> = {
  email_send: "E-mail versturen",
  external_message: "Bericht naar buiten",
  budget: "Geld uitgeven",
  publish: "Publiceren",
  system_change: "Systeem wijzigen",
  other: "Overig",
};

export function ApprovalCard({ approval }: { approval: ApprovalItem }) {
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (result?.ok) {
    return (
      <div className="card border-ok/30 p-4">
        <p className="text-sm text-ok">{result.message}</p>
      </div>
    );
  }

  return (
    <article className="card p-5">
      <div className="flex flex-wrap items-start gap-3">
        <AgentAvatar agent={approval.agent} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-text-faint">
            {approval.agent.name} vraagt akkoord ·{" "}
            <span className="chip px-1.5 py-0 text-[10px]">
              {KIND_LABELS[approval.kind] ?? approval.kind}
            </span>
          </p>
          <h3 className="mt-1 text-lg leading-snug">{approval.title}</h3>
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{approval.summary}</p>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-text-muted hover:text-text">
          Wat er precies klaarstaat
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-bg p-3 font-mono text-[11px] leading-relaxed text-text-muted">
          {JSON.stringify(approval.payload, null, 2)}
        </pre>
      </details>

      <div className="mt-4 space-y-2 border-t border-border pt-4">
        <input
          className="input"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Opmerking erbij (optioneel) — bij afwijzen: waarom niet"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setResult(await approveRequest(approval.id, note));
              })
            }
          >
            {pending ? "Bezig…" : "Akkoord"}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setResult(await rejectRequest(approval.id, note));
              })
            }
          >
            Niet doen
          </button>
        </div>

        {result && !result.ok && <p className="text-sm text-danger">{result.message}</p>}
      </div>
    </article>
  );
}
