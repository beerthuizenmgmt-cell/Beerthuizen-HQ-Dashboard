"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { TeamRegel } from "@/lib/cockpit";

// Het brein van het bureau.
//
// Negen wolken van deeltjes, één per agent, elk in zijn eigen kleur. Samen
// vormen ze één massa; los van elkaar zie je wie waar zit. Werkt een agent
// echt — een denkbeurt in de laatste tien minuten — dan licht zijn wolk op en
// schieten er vonken uit.
//
// Op een canvas en niet in SVG: het gaat om een paar duizend deeltjes die dertig
// keer per seconde bewegen. Evenveel SVG-elementen zou de browser laten kruipen,
// want die moet er dan ook nog een DOM-boom van bijhouden.
//
// De labels staan er wél als gewone HTML overheen. Tekst op een canvas wordt
// wazig op een scherm met hoge resolutie, en zo kun je erop klikken: elk label
// is een deur naar het gesprek met die agent.

/// Waar de wolken staan, in een vlak van 0 tot 1. Met de hand uitgezet in de
/// vorm van een brein — breder dan hoog, iets voller aan de bovenkant. Een
/// cirkel van negen punten op gelijke afstand ziet eruit als een bloem.
const PLEKKEN = [
  { x: 0.5, y: 0.47, r: 0.3 },
  { x: 0.67, y: 0.33, r: 0.25 },
  { x: 0.33, y: 0.34, r: 0.25 },
  { x: 0.76, y: 0.53, r: 0.24 },
  { x: 0.24, y: 0.54, r: 0.24 },
  { x: 0.62, y: 0.69, r: 0.24 },
  { x: 0.38, y: 0.7, r: 0.24 },
  { x: 0.5, y: 0.24, r: 0.21 },
  { x: 0.5, y: 0.79, r: 0.21 },
];

type Deeltje = {
  wolk: number;
  /// Positie binnen de wolk, in poolcoördinaten zodat draaien goedkoop is.
  hoek: number;
  afstand: number;
  snelheid: number;
  grootte: number;
  helderheid: number;
  /// Eigen ritme, zodat niet alle deeltjes tegelijk pulseren.
  fase: number;
};

function hexNaarRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const vol = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(vol, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function BreinCanvas({ team }: { team: TeamRegel[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const teamRef = useRef(team);
  teamRef.current = team;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const stil = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let breedte = 0;
    let hoogte = 0;
    let deeltjes: Deeltje[] = [];

    // Eén keer een zacht lichtpuntje tekenen en dat daarna duizenden keren
    // stempelen. Een cirkel per deeltje berekenen kost per beeld het veelvoud;
    // een vierkantje is goedkoop maar ziet er als een blokje uit, en dat is
    // precies wat je in een deeltjeswolk niet wilt.
    const stippen = new Map<string, HTMLCanvasElement>();

    function stip(kleur: string): HTMLCanvasElement {
      const bestaand = stippen.get(kleur);
      if (bestaand) return bestaand;

      const maat = 16;
      const doek = document.createElement("canvas");
      doek.width = maat;
      doek.height = maat;
      const dctx = doek.getContext("2d")!;
      const verloop = dctx.createRadialGradient(maat / 2, maat / 2, 0, maat / 2, maat / 2, maat / 2);
      verloop.addColorStop(0, kleur);
      verloop.addColorStop(0.4, kleur.replace(/[\d.]+\)$/, "0.55)"));
      verloop.addColorStop(1, kleur.replace(/[\d.]+\)$/, "0)"));
      dctx.fillStyle = verloop;
      dctx.fillRect(0, 0, maat, maat);

      stippen.set(kleur, doek);
      return doek;
    }

    /// Hoeveel deeltjes passen hier? Meeschalen met het oppervlak: op een
    /// telefoon is een paar duizend deeltjes zonde van de accu, en je ziet ze
    /// toch niet.
    function bouwDeeltjes() {
      const oppervlak = breedte * hoogte;
      const perWolk = Math.round(Math.min(520, Math.max(140, oppervlak / 900)));
      const nieuw: Deeltje[] = [];

      for (let w = 0; w < PLEKKEN.length; w += 1) {
        for (let i = 0; i < perWolk; i += 1) {
          // Wortel van een toevalsgetal: zo liggen de deeltjes gelijkmatig over
          // het vlak in plaats van opgehoopt in het midden. Daarna nog een keer
          // machtsverheffen om de kern juist wél voller te maken, zoals in een
          // echte wolk.
          const afstand = Math.pow(Math.random(), 0.65);
          nieuw.push({
            wolk: w,
            hoek: Math.random() * Math.PI * 2,
            afstand,
            // Verder naar buiten draait langzamer; dat geeft de wolk diepte.
            snelheid: (0.00022 + Math.random() * 0.0004) * (1 - afstand * 0.55),
            grootte: 1 + Math.random() * 1.8,
            helderheid: 0.4 + Math.random() * 0.6,
            fase: Math.random() * Math.PI * 2,
          });
        }
      }
      deeltjes = nieuw;
    }

    function meten() {
      const rect = canvas!.getBoundingClientRect();
      // Boven de twee zie je geen verschil meer, en het kost wel vier keer zoveel
      // pixels om te tekenen.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      breedte = rect.width;
      hoogte = rect.height;
      canvas!.width = Math.round(breedte * dpr);
      canvas!.height = Math.round(hoogte * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      bouwDeeltjes();
    }

    let tijd = 0;
    let bezigId = 0;
    let draait = true;

    function teken(verstreken: number) {
      const leden = teamRef.current;
      ctx!.clearRect(0, 0, breedte, hoogte);

      // De kortste kant bepaalt de schaal, zodat het brein niet uitrekt op een
      // breed scherm.
      const schaal = Math.min(breedte, hoogte);

      // De kern. In het midden lopen alle wolken in elkaar over en dat wordt
      // wit — zoals licht dat van alle kanten samenkomt. Zonder deze laag blijft
      // het midden even donker als de rand en valt het brein uit elkaar in negen
      // losse zwermen.
      const hoeveelWerkt = leden.filter((l) => l.bezig).length;
      const kernKracht = 0.1 + Math.min(hoeveelWerkt, 4) * 0.05 + Math.sin(tijd * 1.1) * 0.02;
      ctx!.globalCompositeOperation = "lighter";
      const kern = ctx!.createRadialGradient(
        breedte / 2,
        hoogte * 0.5,
        0,
        breedte / 2,
        hoogte * 0.5,
        schaal * 0.34,
      );
      kern.addColorStop(0, `rgba(220,235,255,${kernKracht})`);
      kern.addColorStop(0.5, `rgba(180,205,255,${kernKracht * 0.35})`);
      kern.addColorStop(1, "rgba(160,190,255,0)");
      ctx!.fillStyle = kern;
      ctx!.fillRect(0, 0, breedte, hoogte);
      ctx!.globalCompositeOperation = "source-over";

      for (let w = 0; w < PLEKKEN.length; w += 1) {
        const lid = leden[w];
        if (!lid) continue;

        const plek = PLEKKEN[w];
        const [r, g, b] = hexNaarRgb(lid.color ?? "#6366f1");
        const middenX = plek.x * breedte;
        const middenY = plek.y * hoogte;
        const straal = plek.r * schaal;

        const slaapt = lid.stand === "op pauze";
        const werkt = lid.bezig;

        // Wie werkt gloeit op en pulseert; wie op pauze staat is er nog wel,
        // maar gedempt. Een wolk die helemaal verdwijnt leest als "weg".
        const puls = werkt ? 0.75 + Math.sin(tijd * 2.2) * 0.25 : 1;
        const kracht = (slaapt ? 0.25 : werkt ? 1 : 0.78) * puls;

        ctx!.globalCompositeOperation = "lighter";

        // Een zachte gloed onder de deeltjes. Zonder dit is het een zwerm
        // losse stipjes; hiermee wordt het een massa waar licht uit komt.
        const gloed = ctx!.createRadialGradient(middenX, middenY, 0, middenX, middenY, straal);
        gloed.addColorStop(0, `rgba(${r},${g},${b},${0.16 * kracht})`);
        gloed.addColorStop(0.55, `rgba(${r},${g},${b},${0.05 * kracht})`);
        gloed.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx!.fillStyle = gloed;
        ctx!.fillRect(middenX - straal, middenY - straal, straal * 2, straal * 2);

        for (const d of deeltjes) {
          if (d.wolk !== w) continue;
          d.hoek += d.snelheid * verstreken;

          // Zachte ademhaling: de wolk zet uit en krimpt weer.
          const adem = 1 + Math.sin(tijd * 0.6 + d.fase) * 0.035;
          const x = middenX + Math.cos(d.hoek) * d.afstand * straal * adem;
          const y = middenY + Math.sin(d.hoek) * d.afstand * straal * adem * 0.92;

          // Naar de rand toe doven ze uit, anders krijgt de wolk een harde rand.
          const rand = 1 - d.afstand * 0.5;
          const alfa = Math.min(1, d.helderheid * rand * kracht);

          // Dicht bij het hart van de wolk verzadigt het licht naar wit. Dat is
          // wat je in de video ziet: gekleurd aan de rand, gloeiend in de kern.
          const heet = Math.max(0, 1 - d.afstand * 2.6);
          const mr = Math.round(r + (255 - r) * heet * 0.7);
          const mg = Math.round(g + (255 - g) * heet * 0.7);
          const mb = Math.round(b + (255 - b) * heet * 0.7);

          // Op kleur afronden zodat er een handvol stempels ontstaat in plaats
          // van een nieuwe voor elk deeltje.
          const sleutel = `rgba(${mr & ~7},${mg & ~7},${mb & ~7},1)`;
          const maat = d.grootte * 3.2;
          ctx!.globalAlpha = alfa;
          ctx!.drawImage(stip(sleutel), x - maat / 2, y - maat / 2, maat, maat);
        }

        // Vonken: alleen bij wie echt aan het werk is. Ze schieten vanuit de
        // kern naar buiten en doven onderweg uit.
        if (werkt && !stil) {
          for (let i = 0; i < 5; i += 1) {
            const hoek = tijd * 0.7 + (i / 5) * Math.PI * 2 + w;
            const lengte = straal * (1.15 + Math.sin(tijd * 1.6 + i) * 0.45);
            const eindX = middenX + Math.cos(hoek) * lengte;
            const eindY = middenY + Math.sin(hoek) * lengte;

            const verloop = ctx!.createLinearGradient(middenX, middenY, eindX, eindY);
            verloop.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
            verloop.addColorStop(1, `rgba(${r},${g},${b},0)`);
            ctx!.strokeStyle = verloop;
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            ctx!.moveTo(middenX, middenY);
            ctx!.lineTo(eindX, eindY);
            ctx!.stroke();
          }
        }

        ctx!.globalAlpha = 1;
        ctx!.globalCompositeOperation = "source-over";
      }
    }

    let vorige = performance.now();

    function lus(nu: number) {
      if (!draait) return;
      const verstreken = Math.min(nu - vorige, 50);
      vorige = nu;
      tijd += verstreken / 1000;
      teken(verstreken);
      bezigId = requestAnimationFrame(lus);
    }

    meten();

    // Altijd meteen één beeld tekenen, ook als de lus daarna gaat draaien.
    // requestAnimationFrame vuurt niet in een tabblad op de achtergrond, dus
    // zonder dit laadt HQ daar als een leeg zwart vlak en zie je bij terugkomst
    // pas iets. En wie beweging heeft uitgezet krijgt hiermee het stilstaande
    // brein: het hoort er te staan, het hoeft alleen niet te bewegen.
    teken(0);

    if (!stil) bezigId = requestAnimationFrame(lus);

    // Niet doortekenen als er niemand kijkt. Een dashboard staat de hele dag
    // open; zonder dit draait de ventilator terwijl je in een ander tabblad zit.
    function bijZichtbaarheid() {
      if (stil) return;
      if (document.visibilityState === "visible") {
        if (!draait) {
          draait = true;
          vorige = performance.now();
          bezigId = requestAnimationFrame(lus);
        }
      } else {
        draait = false;
        cancelAnimationFrame(bezigId);
      }
    }

    const waarnemer = new ResizeObserver(() => {
      meten();
      if (stil) teken(0);
    });
    waarnemer.observe(canvas);
    document.addEventListener("visibilitychange", bijZichtbaarheid);

    return () => {
      draait = false;
      cancelAnimationFrame(bezigId);
      waarnemer.disconnect();
      document.removeEventListener("visibilitychange", bijZichtbaarheid);
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      {/* De labels. Als HTML en niet op het canvas: scherper op een goed scherm,
          en zo kun je doorklikken naar het gesprek met die agent. */}
      {team.slice(0, PLEKKEN.length).map((lid, i) => {
        const plek = PLEKKEN[i];
        const kleur = lid.color ?? "#6366f1";
        return (
          <Link
            key={lid.id}
            href={`/team/dm-${lid.sleutel}`}
            // Op een telefoon weg. Negen kaders met twee regels tekst passen niet
            // in een vlak van driehonderd bij driehonderd: ze schuiven over
            // elkaar heen en dan lees je geen enkele naam meer. Daar is het brein
            // het beeld en de lijst eronder de leesbare versie.
            className="absolute hidden -translate-x-1/2 -translate-y-1/2 rounded border px-1.5 py-0.5 font-mono text-[9px] leading-tight tracking-wider whitespace-nowrap uppercase backdrop-blur-[2px] transition-transform hover:scale-110 sm:block sm:text-[10px]"
            style={{
              left: `${plek.x * 100}%`,
              top: `${plek.y * 100}%`,
              borderColor: `${kleur}88`,
              background: "rgba(0,0,0,0.55)",
              color: kleur,
              opacity: lid.stand === "op pauze" ? 0.45 : 1,
            }}
          >
            <span className="block font-semibold">{lid.naam}</span>
            <span className="block text-[8px] opacity-70 sm:text-[9px]">
              {lid.bezig ? "actief" : "rust"} · {lid.stand}
            </span>
          </Link>
        );
      })}
    </>
  );
}
