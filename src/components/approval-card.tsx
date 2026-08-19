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

// Wat je gezien moet hebben vóór je "akkoord" klikt. De ontvanger staat
// bovenaan: dát is het onomkeerbare deel. Eerder zat hij onderin een
// dichtgeklapt blok JSON, achter de tekst van de mail, dus je kon akkoord geven
// op een bericht naar een echt bedrijf zonder ooit gezien te hebben naar wie.
const KERNPUNTEN: { sleutel: string; label: string; nadruk?: boolean }[] = [
  { sleutel: "ontvanger", label: "Naar", nadruk: true },
  { sleutel: "onderwerp", label: "Onderwerp" },
  { sleutel: "bedrag", label: "Bedrag", nadruk: true },
  { sleutel: "bijlage", label: "Bijlage" },
  { sleutel: "termijn", label: "Termijn" },
];

function kernpunten(payload: unknown): { label: string; waarde: string; nadruk: boolean }[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const velden = payload as Record<string, unknown>;
  return KERNPUNTEN.flatMap(({ sleutel, label, nadruk }) => {
    const waarde = velden[sleutel];
    if (waarde === undefined || waarde === null || waarde === "") return [];
    return [{ label, waarde: String(waarde), nadruk: nadruk ?? false }];
  });
}

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
  const kern = kernpunten(approval.payload);

  // Klapt de beslissing ergens onderweg, dan mag je daar nooit over in het
  // ongewisse blijven: op deze pagina is "ik weet niet of mijn akkoord is
  // aangekomen" het slechtste dat er kan gebeuren.
  function beslis(actie: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      try {
        setResult(await actie());
      } catch (error) {
        setResult({
          ok: false,
          message: `Je beslissing is niet vastgelegd: ${
            error instanceof Error ? error.message : "onbekende fout"
          }. Ververs de pagina en kijk of het verzoek er nog staat.`,
        });
      }
    });
  }

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

      {kern.length > 0 && (
        <dl className="mt-3 space-y-1 rounded-lg border border-border bg-bg px-3 py-2.5 text-sm">
          {kern.map(({ label, waarde, nadruk }) => (
            <div key={label} className="flex gap-2">
              <dt className="w-20 shrink-0 text-xs text-text-faint">{label}</dt>
              <dd className={`min-w-0 break-words ${nadruk ? "font-medium text-warn" : "text-text"}`}>
                {waarde}
              </dd>
            </div>
          ))}
        </dl>
      )}

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
            onClick={() => beslis(() => approveRequest(approval.id, note))}
          >
            {pending ? "Bezig…" : "Akkoord"}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={pending}
            onClick={() => beslis(() => rejectRequest(approval.id, note))}
          >
            Niet doen
          </button>
        </div>

        {result && !result.ok && <p className="text-sm text-danger">{result.message}</p>}
      </div>
    </article>
  );
}
