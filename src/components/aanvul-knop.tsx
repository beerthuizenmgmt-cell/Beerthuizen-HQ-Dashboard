"use client";

import { useState, useTransition } from "react";
import { maakAanvullink } from "@/lib/actions/portaal";

// Een tweede link voor wat er nog ontbreekt.
//
// De klant krijgt alleen de openstaande vragen te zien, en zijn antwoorden
// worden samengevoegd met wat er al ligt. Geen nieuw project, geen formulier
// dat hij helemaal opnieuw moet doorlopen.

export function AanvulKnop({ projectId }: { projectId: string }) {
  const [bezig, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [gekopieerd, setGekopieerd] = useState(false);

  if (link) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-bg px-2 py-1 text-xs">{link}</code>
        <button
          type="button"
          className="btn btn-ghost text-xs"
          onClick={() => {
            void navigator.clipboard.writeText(link);
            setGekopieerd(true);
          }}
        >
          {gekopieerd ? "gekopieerd" : "kopieer"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        className="btn btn-ghost text-xs"
        disabled={bezig}
        onClick={() =>
          start(async () => {
            const uitkomst = await maakAanvullink(projectId);
            if (uitkomst.link) setLink(uitkomst.link);
            else setFout(uitkomst.error ?? "Aanmaken mislukt.");
          })
        }
      >
        {bezig ? "Bezig…" : "Vraag dit op bij de klant"}
      </button>
      {fout && <p className="mt-2 text-xs text-danger">{fout}</p>}
    </div>
  );
}
