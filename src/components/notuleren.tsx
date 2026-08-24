"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { bewaarGesprek } from "@/lib/actions/gesprek";

// Notuleren tijdens een fysiek gesprek.
//
// Je drukt op start en er verandert verder niets: je blijft gewoon in HQ werken.
// Alleen linksonder staat een stipje dat het loopt. Pas als je stopt wordt er
// iets vastgelegd.
//
// Waarom dit in de buitenste schil hangt en niet op een pagina: navigeer je van
// HQ naar Taken, dan wordt die pagina opgeruimd en de opname met hem mee. Hier
// overleeft hij het klikken door het dashboard. Wat hij níét overleeft is het
// sluiten van het tabblad — de opname draait in je browser, niet op de server.
//
// De opname gaat in stukken van twee minuten naar de server. Dat moet, want
// Vercel accepteert 4,5 MB per verzoek en een uur audio is dertig tot zestig.
// Het levert ook iets op: klapt er iets halverwege, dan is alleen het laatste
// stuk weg in plaats van het hele gesprek.

const STUK_MS = 120_000;

export function Notuleren() {
  const [loopt, setLoopt] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [stukken, setStukken] = useState(0);
  const [sinds, setSinds] = useState<number | null>(null);
  const [bezigMetOpslaan, setBezigMetOpslaan] = useState(false);

  const recorder = useRef<MediaRecorder | null>(null);
  const stroom = useRef<MediaStream | null>(null);
  const tekst = useRef<string[]>([]);
  const router = useRouter();

  // Waarschuwen bij het sluiten van het tabblad. De opname leeft hier, dus
  // wegklikken betekent kwijt — dat mag je niet per ongeluk doen.
  useEffect(() => {
    if (!loopt) return;
    const waarschuw = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", waarschuw);
    return () => window.removeEventListener("beforeunload", waarschuw);
  }, [loopt]);

  async function stuurStuk(blob: Blob) {
    if (blob.size < 4_000) return;
    const formulier = new FormData();
    formulier.append("audio", blob, "stuk.webm");

    try {
      const antwoord = await fetch("/api/opname", { method: "POST", body: formulier });
      const uit = (await antwoord.json()) as { ok: boolean; tekst?: string; error?: string };
      if (!uit.ok) {
        setFout(uit.error ?? "Uitschrijven mislukte.");
        return;
      }
      if (uit.tekst) {
        tekst.current.push(uit.tekst);
        setStukken((n) => n + 1);
      }
    } catch {
      // Een stuk dat niet aankomt mag de opname niet stoppen. De rest loopt
      // door; dit stuk mist straks in het verslag en dat is beter dan alles.
      setFout("Een stuk kon niet worden uitgeschreven. De opname loopt door.");
    }
  }

  async function start() {
    setFout(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      stroom.current = s;
      tekst.current = [];
      setStukken(0);

      const r = new MediaRecorder(s, { mimeType: "audio/webm" });
      r.ondataavailable = (e) => {
        if (e.data.size > 0) void stuurStuk(e.data);
      };
      r.start(STUK_MS);
      recorder.current = r;
      setSinds(Date.now());
      setLoopt(true);
    } catch {
      setFout("Ik kan de microfoon niet gebruiken. Geef je browser toestemming en probeer opnieuw.");
    }
  }

  async function stop() {
    const r = recorder.current;
    if (!r) return;

    setBezigMetOpslaan(true);

    // Het laatste stuk moet nog binnenkomen voordat we opslaan, anders mist het
    // eind van het gesprek — en dat is meestal net het deel met de afspraken.
    await new Promise<void>((klaar) => {
      r.onstop = async () => {
        await new Promise((r2) => setTimeout(r2, 800));
        klaar();
      };
      r.stop();
    });

    stroom.current?.getTracks().forEach((t) => t.stop());
    recorder.current = null;
    stroom.current = null;
    setLoopt(false);

    const volledig = tekst.current.join(" ").trim();
    if (!volledig) {
      setFout("Er is niets uitgeschreven. Stond de microfoon aan en is de sleutel ingesteld?");
      setBezigMetOpslaan(false);
      setSinds(null);
      return;
    }

    try {
      await bewaarGesprek(volledig, sinds ? Math.round((Date.now() - sinds) / 60_000) : null);
      router.push("/gesprekken");
      router.refresh();
    } catch (error) {
      setFout(error instanceof Error ? error.message : "Opslaan mislukt.");
    } finally {
      setBezigMetOpslaan(false);
      setSinds(null);
    }
  }

  if (!loopt) {
    return (
      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={start}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
        >
          <span className="w-4 shrink-0 text-center">●</span>
          <span className="flex-1 text-left">Notuleren starten</span>
        </button>
        {fout && <p className="mt-1 px-3 text-[11px] text-danger">{fout}</p>}
      </div>
    );
  }

  return (
    <div className="px-3 pb-2">
      <button
        type="button"
        onClick={stop}
        disabled={bezigMetOpslaan}
        className="flex w-full items-center gap-2.5 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger transition-colors hover:bg-danger/20"
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
        </span>
        <span className="flex-1 text-left">
          {bezigMetOpslaan ? "Verslag maken…" : "Notuleren stoppen"}
        </span>
      </button>

      <p className="mt-1 px-3 text-[11px] text-text-faint">
        {stukken === 0
          ? "opname loopt · eerste stuk komt na twee minuten"
          : `opname loopt · ${stukken} stuk${stukken === 1 ? "" : "ken"} uitgeschreven`}
      </p>
      {fout && <p className="mt-1 px-3 text-[11px] text-warn">{fout}</p>}
    </div>
  );
}
