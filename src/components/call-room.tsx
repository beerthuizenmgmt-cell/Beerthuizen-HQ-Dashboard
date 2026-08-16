"use client";

import { useMemo, useState, useTransition } from "react";
import { answerQuestion, endCall, skipQuestion, taskFromCall } from "@/lib/actions/call";
import { useSpeech } from "./use-speech";

export type CallQuestion = {
  id: string;
  body: string;
  answer: string | null;
  answered: boolean;
  skipped: boolean;
  deliveryError: string | null;
  agent: { id: string; name: string; emoji: string | null; color: string | null };
};

export function CallRoom({ questions }: { questions: CallQuestion[] }) {
  const open = useMemo(() => questions.filter((q) => !q.answered && !q.skipped), [questions]);
  const done = questions.length - open.length;

  const [index, setIndex] = useState(0);

  const current = open[index] ?? open[0] ?? null;

  if (questions.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-text-muted">
          Het team heeft vandaag geen vragen gesteld. Je kunt de planning hiernaast doorlopen en de
          call afronden.
        </p>
        <EndCallButton />
      </div>
    );
  }

  if (!current) {
    return (
      <div className="card p-8 text-center">
        <p className="text-lg font-semibold">Alle vragen zijn langsgekomen</p>
        <p className="mt-1 text-sm text-text-muted">
          {done} van {questions.length} afgehandeld.
        </p>
        <EndCallButton />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-elevated">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${(done / questions.length) * 100}%` }}
          />
        </div>
        <span className="text-xs text-text-faint">
          {done}/{questions.length}
        </span>
      </div>

      {/* De key zorgt dat het antwoordveld en de microfoon vanzelf resetten
          zodra je bij een volgende vraag bent. */}
      <AnswerPanel
        key={current.id}
        question={current}
        onAnswered={() => setIndex((i) => Math.min(i, Math.max(open.length - 2, 0)))}
      />

      {open.length > 1 && (
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>Nog {open.length - 1} vraag/vragen na deze</span>
          <button
            type="button"
            className="hover:text-text"
            onClick={() => setIndex((i) => (i + 1) % open.length)}
          >
            Andere vraag eerst →
          </button>
        </div>
      )}

      <QuickTask agents={questions.map((q) => q.agent)} />
    </div>
  );
}

/// Eén vraag met het antwoordveld eronder. Staat los, zodat een nieuwe vraag
/// een nieuwe component is en alle invoer vanzelf schoon begint.
function AnswerPanel({ question, onAnswered }: { question: CallQuestion; onAnswered: () => void }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const speech = useSpeech((text) => {
    // Ingesproken tekst komt in stukjes binnen; netjes achter elkaar plakken.
    setDraft((previous) => (previous ? `${previous.trimEnd()} ${text.trim()}` : text.trim()));
  });

  const accent = question.agent.color ?? "#6366f1";

  return (
    <article className="card p-5">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg text-lg"
          style={{ background: `color-mix(in srgb, ${accent} 18%, transparent)` }}
        >
          {question.agent.emoji ?? "◉"}
        </span>
        <div>
          <p className="text-sm font-semibold">{question.agent.name}</p>
          <p className="text-[11px] text-text-faint">vraagt</p>
        </div>
      </div>

      <p className="mt-4 text-lg leading-snug">{question.body}</p>

      <div className="mt-5 space-y-3">
        <textarea
          value={draft + (speech.interim ? ` ${speech.interim}` : "")}
          onChange={(event) => setDraft(event.target.value)}
          className="input min-h-28 resize-y"
          placeholder="Spreek je antwoord in of typ het hier…"
        />

        <div className="flex flex-wrap items-center gap-2">
          {speech.supported ? (
            <button
              type="button"
              onClick={speech.toggle}
              className={`btn ${speech.listening ? "btn-danger" : "btn-ghost"}`}
              disabled={pending}
            >
              {speech.listening ? "⏹ Stop met opnemen" : "🎙 Antwoord inspreken"}
            </button>
          ) : (
            <span className="text-xs text-text-faint">
              Deze browser kan geen spraak omzetten — typ je antwoord. In Chrome werkt het wel.
            </span>
          )}

          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !draft.trim()}
            onClick={() =>
              startTransition(async () => {
                if (speech.listening) speech.stop();
                const result = await answerQuestion(question.id, draft);
                if (result.ok) onAnswered();
                else setError(result.error ?? "Versturen mislukt.");
              })
            }
          >
            {pending ? "Bezig…" : "Versturen en volgende"}
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending}
            onClick={() => startTransition(() => skipQuestion(question.id))}
          >
            Sla over
          </button>
        </div>

        {speech.listening && (
          <p className="text-xs text-ok">
            Ik luister mee — praat gerust door, je kunt het daarna nog aanpassen.
          </p>
        )}
        {speech.error && <p className="text-xs text-warn">{speech.error}</p>}
        {error && (
          <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">{error}</p>
        )}
      </div>
    </article>
  );
}

function EndCallButton() {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={() => startTransition(() => endCall())}
      className="mt-5"
    >
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Bezig…" : "Call afronden"}
      </button>
    </form>
  );
}

/// Tijdens het praten komen er afspraken uit. Die wil je meteen vastleggen,
/// niet onthouden tot na de call.
function QuickTask({ agents }: { agents: CallQuestion["agent"][] }) {
  const unique = useMemo(() => {
    const seen = new Map<string, CallQuestion["agent"]>();
    for (const agent of agents) seen.set(agent.id, agent);
    return [...seen.values()];
  }, [agents]);

  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState(unique[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost text-xs">
        + Afspraak vastleggen als taak
      </button>
    );
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Afspraak vastleggen</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-text-muted">
          Sluiten
        </button>
      </div>

      <input
        className="input"
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          setSaved(false);
        }}
        placeholder="Wat is er afgesproken?"
      />

      <div className="flex flex-wrap gap-2">
        <select className="input w-auto" value={agentId} onChange={(event) => setAgentId(event.target.value)}>
          {unique.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.emoji ? `${agent.emoji} ` : ""}
              {agent.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !title.trim() || !agentId}
          onClick={() =>
            startTransition(async () => {
              const result = await taskFromCall(agentId, title);
              if (result.ok) {
                setTitle("");
                setSaved(true);
              }
            })
          }
        >
          {pending ? "Bezig…" : "Taak aanmaken"}
        </button>
      </div>

      {saved && <p className="text-xs text-ok">Staat op het takenbord.</p>}
    </div>
  );
}
