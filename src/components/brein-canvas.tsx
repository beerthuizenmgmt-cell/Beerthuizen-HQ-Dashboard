"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { TeamRegel } from "@/lib/cockpit";

// Het brein van het bureau.
//
// Negen zwermen in een ruimte, één per agent, elk in zijn eigen kleur. De hele
// massa tuimelt langzaam om zijn as, en dát is wat het diep maakt: deeltjes
// vooraan zijn groter en feller, deeltjes achteraan kleiner en doffer. Draait
// er niets, dan is het een platte sticker.
//
// Vuurt een agent — een denkbeurt in de laatste tien minuten — dan licht zijn
// zwerm op en schieten er vonken uit.
//
// Op een canvas en niet in SVG: het gaat om duizenden deeltjes die dertig keer
// per seconde bewegen. Evenveel SVG-elementen zou de browser laten kruipen,
// want die moet er dan ook nog een DOM-boom van bijhouden.
//
// De labels staan er wél als gewone HTML overheen. Tekst op een canvas wordt
// wazig op een scherm met hoge resolutie, en zo kun je erop klikken: elk label
// is een deur naar het gesprek met die agent.

/// Waar de zwermen zweven, in een kubus van -1 tot 1. Met de hand uitgezet in de
/// vorm van een brein: breder dan hoog, voller aan de bovenkant. Negen punten op
/// gelijke afstand van elkaar ziet eruit als een bloem, niet als hersenen.
const PLEKKEN = [
  { x: 0.0, y: -0.05, z: 0.0, r: 0.62 },
  { x: 0.52, y: -0.42, z: 0.18, r: 0.5 },
  { x: -0.52, y: -0.4, z: -0.16, r: 0.5 },
  { x: 0.74, y: 0.12, z: -0.24, r: 0.46 },
  { x: -0.74, y: 0.14, z: 0.22, r: 0.46 },
  { x: 0.44, y: 0.56, z: 0.26, r: 0.46 },
  { x: -0.46, y: 0.55, z: -0.2, r: 0.46 },
  { x: 0.04, y: -0.7, z: -0.3, r: 0.4 },
  { x: -0.02, y: 0.74, z: 0.28, r: 0.4 },
];

/// Waar de tentakels vandaan komen en heen kronkelen.
///
/// Vast uitgezet en niet toevallig: een tentakel die bij elke ronde ergens
/// anders vandaan groeit hoort niet bij een zwerm meer. Elk getal is een hoek in
/// radialen, een lengte en een tempo.
const TENTAKELS = [
  { hoek: -0.4, lengte: 1.5, bocht: 0.55, tempo: 0.55 },
  { hoek: 1.9, lengte: 1.25, bocht: -0.7, tempo: 0.42 },
  { hoek: 3.7, lengte: 1.6, bocht: 0.4, tempo: 0.68 },
];

type Deeltje = {
  zwerm: number;
  /// Plek binnen de zwerm, in de kubus. Vast; de hele wolk draait, niet het
  /// deeltje in zichzelf.
  x: number;
  y: number;
  z: number;
  grootte: number;
  helderheid: number;
  /// Eigen ritme, zodat niet alles tegelijk ademt.
  fase: number;
};

function hexNaarRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const vol = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(vol, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function BreinCanvas({
  team,
  schaalFactor = 0.56,
}: {
  team: TeamRegel[];
  /// Hoe groot de massa is ten opzichte van de kortste kant van het vlak.
  ///
  /// Op HQ 0,56: daar deelt het brein de ruimte met de rest van de pagina en is
  /// er marge nodig voor het uitzetten van de ademhaling. Op het volledige
  /// scherm mag hij groter, want daar is niets anders.
  schaalFactor?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const teamRef = useRef(team);
  teamRef.current = team;
  const schaalFactorRef = useRef(schaalFactor);
  schaalFactorRef.current = schaalFactor;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const stil = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let breedte = 0;
    let hoogte = 0;
    let deeltjes: Deeltje[] = [];

    // Eén keer een lichtpuntje tekenen en dat daarna duizenden keren stempelen.
    // Een cirkel per deeltje berekenen kost per beeld het veelvoud; een
    // vierkantje is goedkoop maar ziet eruit als een blokje. Het verloop is kort
    // gehouden: in de video zijn het scherpe puntjes met een klein halootje, geen
    // wattenbolletjes.
    const stippen = new Map<string, HTMLCanvasElement>();

    function stip(r: number, g: number, b: number): HTMLCanvasElement {
      const sleutel = `${r},${g},${b}`;
      const bestaand = stippen.get(sleutel);
      if (bestaand) return bestaand;

      const maat = 12;
      const doek = document.createElement("canvas");
      doek.width = maat;
      doek.height = maat;
      const dctx = doek.getContext("2d")!;
      const verloop = dctx.createRadialGradient(maat / 2, maat / 2, 0, maat / 2, maat / 2, maat / 2);
      // Bijna de hele stip is vol; alleen de buitenste rand dooft uit. Met een
      // lange uitloop bestaat een klein stipje vooral uit halo en blijft er van
      // het licht zelf niets over — dan oogt de hele zwerm dof.
      verloop.addColorStop(0, `rgba(${r},${g},${b},1)`);
      verloop.addColorStop(0.55, `rgba(${r},${g},${b},1)`);
      verloop.addColorStop(0.78, `rgba(${r},${g},${b},0.45)`);
      verloop.addColorStop(1, `rgba(${r},${g},${b},0)`);
      dctx.fillStyle = verloop;
      dctx.fillRect(0, 0, maat, maat);

      stippen.set(sleutel, doek);
      return doek;
    }

    /// Hoeveel deeltjes passen hier? Meeschalen met het oppervlak: op een
    /// telefoon is een paar duizend deeltjes zonde van de accu, en je ziet ze
    /// toch niet.
    function bouwDeeltjes() {
      const oppervlak = breedte * hoogte;
      const perZwerm = Math.round(Math.min(1100, Math.max(220, oppervlak / 380)));
      const nieuw: Deeltje[] = [];

      for (let w = 0; w < PLEKKEN.length; w += 1) {
        for (let i = 0; i < perZwerm; i += 1) {
          // Gelijkmatig over een bol, en daarna naar de kern getrokken zodat het
          // midden voller is dan de rand — zoals in een echte zwerm.
          const u = Math.random() * 2 - 1;
          const hoek = Math.random() * Math.PI * 2;
          const straal = Math.pow(Math.random(), 0.55);
          const vlak = Math.sqrt(1 - u * u);

          nieuw.push({
            zwerm: w,
            x: Math.cos(hoek) * vlak * straal,
            y: u * straal,
            z: Math.sin(hoek) * vlak * straal,
            grootte: 0.7 + Math.random() * 1.1,
            helderheid: 0.55 + Math.random() * 0.45,
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

    function teken() {
      const leden = teamRef.current;
      ctx!.clearRect(0, 0, breedte, hoogte);

      const midX = breedte / 2;
      const midY = hoogte / 2;
      // De kortste kant bepaalt de schaal, zodat het brein niet uitrekt op een
      // breed scherm.
      //
      // De uiterste zwerm ligt op 0,74 van het midden en is zelf 0,46 breed, dus
      // de massa reikt tot ongeveer 1,2. Met het perspectief erbij komt dat op
      // 0,39 van de kortste kant — een bol die ruim binnen het paneel past in
      // plaats van er aan alle kanten uit te lopen.
      // De ademhaling laat de massa tot elf procent uitzetten; die marge zit in
      // de factor verwerkt.
      const schaal = Math.min(breedte, hoogte) * schaalFactorRef.current;

      // De hele massa draait om zijn as, met een lichte knik zodat je er van
      // opzij op kijkt in plaats van er recht tegenaan.
      const draaiing = tijd * 0.16;
      const cosD = Math.cos(draaiing);
      const sinD = Math.sin(draaiing);
      const kanteling = Math.sin(tijd * 0.11) * 0.16;

      // De hele massa ademt: zet uit en krimpt weer. Twee ritmes over elkaar,
      // want één zuivere sinus voelt als een machine die pompt. Zo lijkt het
      // eerder op iets wat leeft.
      const adem =
        1 + Math.sin(tijd * 0.42) * 0.07 + Math.sin(tijd * 0.27 + 1.3) * 0.045;
      const cosK = Math.cos(kanteling);
      const sinK = Math.sin(kanteling);

      ctx!.globalCompositeOperation = "lighter";

      for (let w = 0; w < PLEKKEN.length; w += 1) {
        const lid = leden[w];
        if (!lid) continue;

        const plek = PLEKKEN[w];
        const [r, g, b] = hexNaarRgb(lid.color ?? "#6366f1");
        const slaapt = lid.stand === "op pauze";
        const werkt = lid.bezig;

        // Wie werkt gloeit op en pulseert; wie op pauze staat is er nog wel,
        // maar gedempt. Een zwerm die helemaal verdwijnt leest als "weg".
        const puls = werkt ? 0.8 + Math.sin(tijd * 2.4) * 0.2 : 1;
        const kracht = (slaapt ? 0.35 : werkt ? 1.6 : 1.15) * puls;

        const gewoon = stip(r, g, b);
        // De kern verzadigt naar wit, zoals licht dat van alle kanten samenkomt.
        const heet = stip(
          Math.round(r + (255 - r) * 0.75),
          Math.round(g + (255 - g) * 0.75),
          Math.round(b + (255 - b) * 0.75),
        );

        for (const d of deeltjes) {
          if (d.zwerm !== w) continue;

          // Elk deeltje wiegt nog een beetje in zichzelf, boven op de ademhaling
          // van de hele massa. Zonder dit is het een star rooster dat draait.
          const wieg = 1 + Math.sin(tijd * 0.7 + d.fase) * 0.04;

          let px = plek.x + d.x * plek.r * wieg;
          let py = plek.y + d.y * plek.r * wieg;
          let pz = plek.z + d.z * plek.r * wieg;

          // Draaien om de verticale as, dan kantelen om de horizontale.
          const rx = px * cosD - pz * sinD;
          const rz = px * sinD + pz * cosD;
          const ry = py * cosK - rz * sinK;
          const dz = py * sinK + rz * cosK;

          px = rx;
          py = ry;
          pz = dz;

          // Perspectief: wat verder weg ligt, wordt kleiner en doffer. Dit is
          // wat de zwerm ruimtelijk maakt in plaats van een platte sticker.
          const diepte = 1 / (1.9 + pz);
          const x = midX + px * schaal * adem * diepte;
          const y = midY + py * schaal * adem * diepte;

          const maat = d.grootte * diepte * 4.6;
          if (maat < 0.25) continue;

          const alfa = Math.min(1, d.helderheid * kracht * (0.45 + diepte * 1.3));
          if (alfa < 0.02) continue;

          // Dicht bij het hart van de zwerm gloeit het wit uit.
          const kernNabij = Math.abs(d.x) + Math.abs(d.y) + Math.abs(d.z) < 0.55;

          ctx!.globalAlpha = alfa;
          ctx!.drawImage(kernNabij ? heet : gewoon, x - maat / 2, y - maat / 2, maat, maat);
        }

        // Tentakels.
        //
        // Slierten die uit de zwerm groeien met een lichtpuls die eroverheen
        // loopt — een signaal dat wegloopt van waar het vandaan komt, in de
        // kleur van die agent. Ze kronkelen doordat het controlepunt van de
        // bocht meebeweegt op zijn eigen ritme.
        //
        // Bij wie werkt lopen er drie pulsen tegelijk en zijn ze fel; bij wie
        // rust ééntje en gedempt. Helemaal weglaten zou de zwerm losknippen van
        // de rest.
        if (!stil || werkt) {
          const kx = midX + (plek.x * cosD - plek.z * sinD) * schaal * adem * 0.53;
          const ky = midY + plek.y * schaal * adem * 0.53;

          for (const t of TENTAKELS) {
            const zwaai = Math.sin(tijd * t.tempo + w) * t.bocht;
            const hoek = t.hoek + w * 0.7 + zwaai * 0.35;
            const lang = schaal * 0.42 * t.lengte * adem;

            const eindX = kx + Math.cos(hoek) * lang;
            const eindY = ky + Math.sin(hoek) * lang;
            // Het controlepunt staat opzij van de lijn; hoe verder opzij, hoe
            // sterker de kronkel.
            const stuurX = kx + Math.cos(hoek + zwaai) * lang * 0.6;
            const stuurY = ky + Math.sin(hoek + zwaai) * lang * 0.6;

            // De sliert zelf, vaag.
            ctx!.strokeStyle = `rgba(${r},${g},${b},${werkt ? 0.3 : 0.14})`;
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            ctx!.moveTo(kx, ky);
            ctx!.quadraticCurveTo(stuurX, stuurY, eindX, eindY);
            ctx!.stroke();

            // De pulsen die eroverheen lopen. Een punt op een kwadratische bocht
            // op tijd u, met een staartje erachteraan.
            const pulsen = werkt ? 3 : 1;
            for (let i = 0; i < pulsen; i += 1) {
              const u = ((tijd * (werkt ? 0.55 : 0.28) + i / pulsen + w * 0.13) % 1);
              const punt = (v: number, a: number, c: number, e: number) =>
                (1 - v) * (1 - v) * a + 2 * (1 - v) * v * c + v * v * e;

              const px2 = punt(u, kx, stuurX, eindX);
              const py2 = punt(u, ky, stuurY, eindY);
              const staartU = Math.max(0, u - 0.12);
              const sx = punt(staartU, kx, stuurX, eindX);
              const sy = punt(staartU, ky, stuurY, eindY);

              // Dooft uit naar het uiteinde: het signaal raakt op onderweg.
              const kracht2 = (1 - u) * (werkt ? 1 : 0.45);

              const streep = ctx!.createLinearGradient(sx, sy, px2, py2);
              streep.addColorStop(0, `rgba(${r},${g},${b},0)`);
              streep.addColorStop(1, `rgba(${r},${g},${b},${0.85 * kracht2})`);
              ctx!.strokeStyle = streep;
              ctx!.lineWidth = 1.8;
              ctx!.beginPath();
              ctx!.moveTo(sx, sy);
              ctx!.lineTo(px2, py2);
              ctx!.stroke();

              // Het kopje van de puls, wit uitgegloeid.
              ctx!.globalAlpha = 0.9 * kracht2;
              const kop = 5;
              ctx!.drawImage(heet, px2 - kop / 2, py2 - kop / 2, kop, kop);
              ctx!.globalAlpha = 1;
            }
          }
        }

        // Vonken: alleen bij wie echt aan het werk is. Ze schieten vanuit de kern
        // naar buiten en doven onderweg uit.
        if (werkt && !stil) {
          const kx = midX + (plek.x * cosD - plek.z * sinD) * schaal * adem * 0.53;
          const ky = midY + plek.y * schaal * adem * 0.53;

          ctx!.globalAlpha = 1;
          for (let i = 0; i < 6; i += 1) {
            const hoek = tijd * 0.9 + (i / 6) * Math.PI * 2 + w;
            const lengte = schaal * (0.22 + Math.sin(tijd * 1.9 + i) * 0.12);
            const eindX = kx + Math.cos(hoek) * lengte;
            const eindY = ky + Math.sin(hoek) * lengte;

            const verloop = ctx!.createLinearGradient(kx, ky, eindX, eindY);
            verloop.addColorStop(0, `rgba(${r},${g},${b},0.7)`);
            verloop.addColorStop(1, `rgba(${r},${g},${b},0)`);
            ctx!.strokeStyle = verloop;
            ctx!.lineWidth = 1.2;
            ctx!.beginPath();
            ctx!.moveTo(kx, ky);
            ctx!.lineTo(eindX, eindY);
            ctx!.stroke();
          }
        }
      }

      ctx!.globalAlpha = 1;
      ctx!.globalCompositeOperation = "source-over";
    }

    let vorige = performance.now();

    function lus(nu: number) {
      if (!draait) return;
      tijd += Math.min(nu - vorige, 50) / 1000;
      vorige = nu;
      teken();
      bezigId = requestAnimationFrame(lus);
    }

    meten();

    // Altijd meteen één beeld tekenen, ook als de lus daarna gaat draaien.
    // requestAnimationFrame vuurt niet in een tabblad op de achtergrond, dus
    // zonder dit laadt HQ daar als een leeg zwart vlak en zie je bij terugkomst
    // pas iets. En wie beweging heeft uitgezet krijgt hiermee het stilstaande
    // brein: het hoort er te staan, het hoeft alleen niet te bewegen.
    teken();

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
      teken();
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
          en zo kun je doorklikken naar het gesprek met die agent.

          Op een telefoon weg. Negen kaders met twee regels tekst passen niet in
          een vlak van driehonderd bij driehonderd: ze schuiven over elkaar heen
          en dan lees je geen enkele naam meer. Daar is het brein het beeld en de
          lijst eronder de leesbare versie. */}
      {team.slice(0, PLEKKEN.length).map((lid, i) => {
        const plek = PLEKKEN[i];
        const kleur = lid.color ?? "#6366f1";
        return (
          <Link
            key={lid.id}
            href={`/team/dm-${lid.sleutel}`}
            className="absolute hidden -translate-x-1/2 -translate-y-1/2 rounded border px-1.5 py-0.5 font-mono text-[9px] leading-tight tracking-wider whitespace-nowrap uppercase backdrop-blur-[2px] transition-transform hover:scale-110 sm:block sm:text-[10px]"
            style={{
              // Vaste plek, afgeleid van waar de zwerm hoort te zweven. De
              // zwerm zelf draait; het label niet, want een naam die met de
              // massa meedraait is niet te lezen en niet aan te klikken.
              left: `${50 + plek.x * 34 * (schaalFactor / 0.56)}%`,
              top: `${50 + plek.y * 34 * (schaalFactor / 0.56)}%`,
              borderColor: `${kleur}88`,
              background: "rgba(0,0,0,0.6)",
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
