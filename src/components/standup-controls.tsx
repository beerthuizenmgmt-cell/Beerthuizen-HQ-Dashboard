"use client";

import { useState, useTransition } from "react";
import { startStandupNow } from "@/lib/actions/standup";

export function StandupControls({ hasMeeting, reachable }: { hasMeeting: boolean; reachable: number }) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending || reachable === 0}
        title={reachable === 0 ? "Geen enkele agent kan berichten ontvangen" : undefined}
        onClick={() =>
          startTransition(async () => {
            setFeedback(await startStandupNow());
          })
        }
      >
        {pending ? "Bezig…" : hasMeeting ? "Opnieuw uitvragen" : "Start overleg nu"}
      </button>

      {feedback && (
        <p
          className={`max-w-xs rounded-lg border px-3 py-2 text-xs ${
            feedback.ok ? "border-ok/40 bg-ok/10 text-ok" : "border-warn/40 bg-warn/10 text-warn"
          }`}
        >
          {feedback.message}
        </p>
      )}
    </div>
  );
}
