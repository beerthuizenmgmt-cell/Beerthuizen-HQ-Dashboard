"use client";

import { useState, useTransition } from "react";

// Een knop die niets doet.
//
// Overal in het dashboard stond `start(() => void deActie(id))`. Dat `void`
// gooit het antwoord weg — inclusief de fout. Mislukte de actie, dan gebeurde
// er zichtbaar níéts: geen melding, geen verandering, geen spoor. Je kunt dan
// niet testen of iets werkt, want "er gebeurt niets" ziet er hetzelfde uit als
// "het is gelukt maar je ziet het niet".
//
// Deze hook doet hetzelfde werk, maar houdt vast wat er misging zodat je het
// naast de knop kunt tonen.

/// Next gebruikt fouten om te navigeren. Die moeten dóór, anders werkt een
/// redirect of een 404 vanuit een serveractie niet meer.
function isNavigatie(error: unknown): boolean {
  const digest = (error as { digest?: unknown })?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND");
}

function leesbaar(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Er ging iets mis. Probeer het opnieuw, of kijk bij Activiteit wat er gebeurde.";
}

export function useActie() {
  const [bezig, start] = useTransition();
  const [fout, setFout] = useState<string | null>(null);

  /// Voer een serveractie uit. Gaat het mis, dan komt de reden in `fout`.
  function doe(actie: () => Promise<unknown>): void {
    setFout(null);
    start(async () => {
      try {
        await actie();
      } catch (error) {
        if (isNavigatie(error)) throw error;
        setFout(leesbaar(error));
      }
    });
  }

  return { bezig, fout, doe, wisFout: () => setFout(null) };
}
