"use client";

import { useEffect, useRef } from "react";

// De denkwolk boven HQ.
//
// Negen clusters van deeltjes, één per agent, in zijn eigen kleur en met zijn
// naam erbij. Ze zweven om hun eigen middelpunt, de hele wolk draait langzaam,
// en binnen een cluster lopen lijntjes tussen deeltjes die dicht bij elkaar
// komen — dat maakt er een netwerk van in plaats van een hoop stippen.
//
// Wie op dit moment werkt heeft een drukkere, fellere wolk. Zo is het beeld niet
// alleen mooi maar zegt het ook iets: je ziet aan de wolk waar het werk zit.
//
// Op canvas en niet in SVG. Zeshonderd deeltjes als losse SVG-elementen is
// zeshonderd knopen die de browser elke beeldopbouw moet bijhouden; op canvas is
// het één element en tekenen we zelf.

export type WolkAgent = { naam: string; kleur: string; bezig: boolean };

type Deeltje = {
  cluster: number;
  hoek: number;
  straal: number;
  snelheid: number;
  /// Eigen op-en-neer, zodat een cluster ademt in plaats van als schijf te draaien.
  wiebel: number;
  wiebelSnelheid: number;
  grootte: number;
};

const PER_CLUSTER = 46;

/// Hoeveel deeltjes er binnen één cluster met elkaar verbonden mogen worden.
/// Alle paren van alle clusters is werk voor niets: lijnen tussen twee clusters
/// zie je toch niet als samenhang, en ze maken het beeld modderig.
const LIJN_AFSTAND = 26;

export function BreinWolk({ agents }: { agents: WolkAgent[] }) {
  const doek = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = doek.current;
    if (!canvas || agents.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const stilstaan = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Canvas kent geen CSS-variabelen: fillStyle = "var(--accent)" wordt stil
    // genegeerd en je tekent dan in zwart. Eén keer opzoeken wat ze werkelijk
    // zijn, en dan met echte kleuren werken.
    const stijl = getComputedStyle(document.documentElement);
    const echteKleur = (kleur: string) => {
      const naam = kleur.match(/^var\((--[\w-]+)\)$/)?.[1];
      return naam ? stijl.getPropertyValue(naam).trim() || "#ff4500" : kleur;
    };
    const kleuren = agents.map((a) => echteKleur(a.kleur));

    // ── De deeltjes ──────────────────────────────────────────────────────
    const deeltjes: Deeltje[] = [];
    for (let c = 0; c < agents.length; c += 1) {
      const druk = agents[c].bezig;
      for (let i = 0; i < PER_CLUSTER; i += 1) {
        deeltjes.push({
          cluster: c,
          hoek: Math.random() * Math.PI * 2,
          // Wortel, anders klonteren ze in het midden: bij een gelijkmatige
          // trekking zit de helft binnen de halve straal.
          straal: Math.sqrt(Math.random()) * (druk ? 34 : 27),
          snelheid: (0.12 + Math.random() * 0.25) * (druk ? 1.6 : 1) * (Math.random() < 0.5 ? -1 : 1),
          wiebel: Math.random() * Math.PI * 2,
          wiebelSnelheid: 0.4 + Math.random() * 0.8,
          grootte: 0.7 + Math.random() * 1.5,
        });
      }
    }

    let breedte = 0;
    let hoogte = 0;
    let middelpunten: { x: number; y: number }[] = [];

    function meet() {
      const r = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      breedte = r.width;
      hoogte = r.height;
      canvas!.width = Math.round(breedte * dpr);
      canvas!.height = Math.round(hoogte * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      // De clusters in een ring, iets platter dan rond zodat de wolk de brede
      // band vult in plaats van er een bal in te zijn.
      const straalX = Math.min(breedte * 0.34, 300);
      const straalY = Math.min(hoogte * 0.3, 86);
      middelpunten = agents.map((_, i) => {
        const hoek = (i / agents.length) * Math.PI * 2 - Math.PI / 2;
        return {
          x: breedte / 2 + Math.cos(hoek) * straalX,
          y: hoogte / 2 + Math.sin(hoek) * straalY,
        };
      });
    }

    meet();
    const meter = new ResizeObserver(() => {
      meet();
      // Een canvas leegt zichzelf zodra je zijn afmeting zet; zonder dit blijft
      // hij leeg tot de volgende stap, en bij stilstaan zelfs voorgoed.
      teken();
    });
    meter.observe(canvas);

    // ── Tekenen ──────────────────────────────────────────────────────────
    let t = 0;
    let bezigMetTekenen = 0;

    function teken() {
      ctx!.clearRect(0, 0, breedte, hoogte);

      // Per cluster, zodat we de kleur één keer zetten en de lijnen alleen
      // binnen het cluster hoeven te zoeken.
      for (let c = 0; c < agents.length; c += 1) {
        const agent = agents[c];
        const mid = middelpunten[c];
        if (!mid) continue;

        const eigen = deeltjes.filter((d) => d.cluster === c);
        const punten = eigen.map((d) => {
          const hoek = d.hoek + t * d.snelheid;
          const adem = 1 + Math.sin(t * d.wiebelSnelheid + d.wiebel) * 0.16;
          return {
            x: mid.x + Math.cos(hoek) * d.straal * adem,
            y: mid.y + Math.sin(hoek) * d.straal * adem * 0.8,
            g: d.grootte,
          };
        });

        // Lijnen eerst, zodat de stippen erbovenop liggen.
        ctx!.strokeStyle = kleuren[c];
        ctx!.lineWidth = 0.5;
        for (let i = 0; i < punten.length; i += 1) {
          for (let j = i + 1; j < punten.length; j += 1) {
            const dx = punten[i].x - punten[j].x;
            const dy = punten[i].y - punten[j].y;
            const afstand = Math.hypot(dx, dy);
            if (afstand > LIJN_AFSTAND) continue;
            ctx!.globalAlpha = (1 - afstand / LIJN_AFSTAND) * (agent.bezig ? 0.3 : 0.14);
            ctx!.beginPath();
            ctx!.moveTo(punten[i].x, punten[i].y);
            ctx!.lineTo(punten[j].x, punten[j].y);
            ctx!.stroke();
          }
        }

        ctx!.fillStyle = kleuren[c];
        ctx!.globalAlpha = agent.bezig ? 0.95 : 0.5;
        for (const p of punten) {
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, p.g, 0, Math.PI * 2);
          ctx!.fill();
        }

        // De naam, in de kleur van het cluster.
        ctx!.globalAlpha = agent.bezig ? 0.95 : 0.45;
        ctx!.font = "600 11px ui-sans-serif, system-ui, sans-serif";
        ctx!.textAlign = "center";
        ctx!.fillText(agent.naam.toUpperCase(), mid.x, mid.y - 42);
      }

      ctx!.globalAlpha = 1;
    }

    function stap() {
      // Vaste stap in plaats van de echte tijd: op een traag toestel wordt de
      // beweging dan langzamer in plaats van schokkerig.
      t += 0.016;
      teken();
      bezigMetTekenen = requestAnimationFrame(stap);
    }

    // Meteen één beeld, vóór het eerste animatieframe. Anders staat er een leeg
    // vlak tot de browser toekomt aan tekenen — op een traag toestel merkbaar,
    // en op een tabblad dat op de achtergrond geopend wordt blijft het leeg tot
    // je ernaartoe gaat.
    t = 1.4;
    teken();

    if (!stilstaan) {
      // Wie beweging heeft uitgezet houdt het bij dat ene beeld. Niet niets: de
      // wolk hoort erbij, alleen zonder dat hij beweegt.
      bezigMetTekenen = requestAnimationFrame(stap);
    }

    // Niet doortekenen op een tabblad waar niemand naar kijkt; dat kost alleen
    // maar accu.
    function bijZichtbaarheid() {
      if (stilstaan) return;
      cancelAnimationFrame(bezigMetTekenen);
      if (document.visibilityState === "visible") bezigMetTekenen = requestAnimationFrame(stap);
    }
    document.addEventListener("visibilitychange", bijZichtbaarheid);

    return () => {
      cancelAnimationFrame(bezigMetTekenen);
      meter.disconnect();
      document.removeEventListener("visibilitychange", bijZichtbaarheid);
    };
  }, [agents]);

  return <canvas ref={doek} className="block h-full w-full" aria-hidden />;
}
