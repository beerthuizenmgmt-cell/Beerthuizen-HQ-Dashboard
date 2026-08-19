"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Het antwoord komt binnen terwijl je naar de pagina kijkt.
//
// Zonder dit moest je zelf verversen om te zien of er al iets terug was — en
// dan is het geen gesprek maar een postbus. Zolang er iemand nadenkt kijken we
// vaak; daarna rustiger, want dan is er niets te halen en hoeft de server niet
// elke paar seconden aangesproken te worden.
export function ChatVerversen({ wachtend }: { wachtend: boolean }) {
  const router = useRouter();

  useEffect(() => {
    const tempo = wachtend ? 2500 : 15_000;

    const tik = setInterval(() => {
      // Niet verversen als het tabblad op de achtergrond staat: dat kost werk
      // en niemand kijkt ernaar.
      if (document.visibilityState === "visible") router.refresh();
    }, tempo);

    // Kom je terug op het tabblad, dan wil je meteen zien wat je gemist hebt.
    const bijTerugkomst = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", bijTerugkomst);

    return () => {
      clearInterval(tik);
      document.removeEventListener("visibilitychange", bijTerugkomst);
    };
  }, [router, wachtend]);

  return null;
}

/// "Fleur is aan het typen…" — alleen zolang er echt iemand nadenkt.
export function DenktNa({ naam }: { naam: string }) {
  return (
    <div className="flex items-center gap-2 px-1 py-2 text-xs text-text-muted">
      <span className="flex gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-faint [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-faint [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-faint" />
      </span>
      {naam} denkt na…
    </div>
  );
}
