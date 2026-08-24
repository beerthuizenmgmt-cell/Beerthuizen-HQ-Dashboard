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
  // Sterke bochten. Met een kleine bocht schieten ze recht naar buiten en wordt
  // het een sterexplosie in plaats van slierten die om de massa heen krullen.
  { hoek: -0.4, lengte: 0.55, bocht: 1.5, tempo: 0.55 },
  { hoek: 1.9, lengte: 0.4, bocht: -1.8, tempo: 0.42 },
  { hoek: 3.7, lengte: 0.62, bocht: 1.15, tempo: 0.68 },
];

/// Welke deeltjes met elkaar verbonden zijn.
///
/// Eén keer uitgerekend en daarna alleen nog getekend. Elk beeld opnieuw
/// nagaan welke deeltjes dicht bij elkaar liggen is achtduizend deeltjes tegen
/// achtduizend, en dat haalt geen enkele browser dertig keer per seconde.
type Verbinding = { van: number; naar: number };

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

/// Een hartslag, geen sinus.
///
/// Een hart doet twee slagen kort na elkaar en ligt daarna stil: lub-dub, rust.
/// Een zuivere sinus pompt gelijkmatig op en neer en dat voelt als een machine.
/// Twee smalle pieken met een lange stilte erna is wat je herkent als iets wat
/// leeft.
///
/// Geeft 0 in rust en 1 op het hoogtepunt van de eerste slag.
function hartslag(tijd: number): number {
  // Trager en breder dan een echte hartslag.
  //
  // Op veertig slagen per minuut met scherpe pieken schokte het beeld: je oog
  // wordt er elke seconde naartoe getrokken en dat is vermoeiend op een scherm
  // waar je de hele dag naar kijkt. Nu tweeëntwintig slagen per minuut met
  // zachte pieken — je ziet het kloppen, maar het trekt niet aan je.
  const CYCLUS = 2.7;
  const t = tijd % CYCLUS;
  const piek = (midden: number, breedte: number) =>
    Math.exp(-(((t - midden) / breedte) ** 2));
  // De tweede slag is zwakker dan de eerste, zoals het echt gaat.
  return Math.min(1, piek(0.22, 0.19) + piek(0.78, 0.24) * 0.55);
}

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
    let draden: Verbinding[] = [];
    /// Waar elk deeltje op het scherm belandde. Nodig om de draden te kunnen
    /// tekenen zonder het perspectief twee keer uit te rekenen.
    let opScherm: { x: number; y: number; diepte: number }[] = [];

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

      // Ruim genoeg om nooit opgeblazen te worden.
      //
      // Het sjabloon was twaalf pixels en deeltjes vooraan worden groter dan
      // dat. Een plaatje van twaalf pixels dat je naar vierentwintig uitrekt
      // wordt blokkerig, en dat is precies het pixeleffect dat je ziet. Vierenzestig
      // is groter dan het grootste deeltje ooit wordt.
      const maat = 64;
      const doek = document.createElement("canvas");
      doek.width = maat;
      doek.height = maat;
      const dctx = doek.getContext("2d")!;
      const verloop = dctx.createRadialGradient(maat / 2, maat / 2, 0, maat / 2, maat / 2, maat / 2);
      // Een volle kern die geleidelijk uitdooft, zonder knik.
      //
      // Eerder sprong het verloop van vol naar bijna niets in één stap. Dat
      // geeft elk stipje een harde rand, en duizenden harde randjes bij elkaar
      // lezen als korrel. Meer tussenstappen maakt er licht van.
      verloop.addColorStop(0, `rgba(${r},${g},${b},1)`);
      verloop.addColorStop(0.18, `rgba(${r},${g},${b},1)`);
      verloop.addColorStop(0.34, `rgba(${r},${g},${b},0.72)`);
      verloop.addColorStop(0.52, `rgba(${r},${g},${b},0.34)`);
      verloop.addColorStop(0.72, `rgba(${r},${g},${b},0.11)`);
      verloop.addColorStop(0.88, `rgba(${r},${g},${b},0.03)`);
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

      // De draden ertussen. Alleen tussen een handvol knooppunten per zwerm:
      // alles met alles verbinden geeft een wolk gaas waarin je niets meer ziet,
      // en het kost het veelvoud aan rekenwerk.
      const nieuweDraden: Verbinding[] = [];
      const perZwermGeteld = new Map<number, number[]>();

      nieuw.forEach((d, i) => {
        const lijst = perZwermGeteld.get(d.zwerm) ?? [];
        // Elke twaalfde is een knooppunt. Dat geeft genoeg draden om een netwerk
        // te zien zonder dat het dichtslibt.
        if (lijst.length < 26 && i % 12 === 0) lijst.push(i);
        perZwermGeteld.set(d.zwerm, lijst);
      });

      for (const knopen of perZwermGeteld.values()) {
        for (let a = 0; a < knopen.length; a += 1) {
          for (let b = a + 1; b < knopen.length; b += 1) {
            const p = nieuw[knopen[a]];
            const q = nieuw[knopen[b]];
            const afstand = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
            // Alleen wat dicht bij elkaar ligt. Draden dwars door de hele zwerm
            // zien eruit als een kooi, niet als een netwerk.
            if (afstand < 0.62) nieuweDraden.push({ van: knopen[a], naar: knopen[b] });
          }
        }
      }
      draden = nieuweDraden;
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
      // Zonder dit schaalt de browser de lichtpuntjes met harde randen in plaats
      // van vloeiend, en dat is te zien als korrel.
      ctx!.imageSmoothingEnabled = true;
      ctx!.imageSmoothingQuality = "high";
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

      // De hele massa ademt én klopt mee met de kern.
      //
      // De trage golven zijn de ademhaling; de hartslag zet er een korte stoot
      // bovenop. Zonder die stoot leeft de kern in zijn eentje en hangt de rest
      // er los omheen — mét klopt alles op hetzelfde ritme, en dát is wat het
      // één ding maakt in plaats van een bal met wolken eromheen.
      const adem =
        1 +
        Math.sin(tijd * 0.42) * 0.055 +
        Math.sin(tijd * 0.27 + 1.3) * 0.035 +
        hartslag(tijd) * 0.045;
      const cosK = Math.cos(kanteling);
      const sinK = Math.sin(kanteling);

      ctx!.globalCompositeOperation = "lighter";

      // ── De kern ────────────────────────────────────────────────────────
      //
      // Een opgesloten zon die eruit wil. Hij klopt als een hart: twee slagen
      // kort na elkaar en dan rust. Bij elke slag zwelt hij op, wordt het licht
      // feller, en breekt er licht door de kieren van de schil die eromheen zit.
      //
      // Dit is het punt waar alles vandaan komt. De zwermen eromheen halen hun
      // energie hier, en dat moet je kunnen zien.
      const slag = hartslag(tijd);

      // De gloed die om alles heen hangt. Zwelt mee, maar veel breder en zachter
      // dan de kern zelf — dat is wat de ruimte vult.
      const wijd = schaal * (0.62 + slag * 0.14);
      const halo = ctx!.createRadialGradient(midX, midY, 0, midX, midY, wijd);
      halo.addColorStop(0, `rgba(255,248,230,${0.1 + slag * 0.1})`);
      halo.addColorStop(0.28, `rgba(190,210,255,${0.045 + slag * 0.045})`);
      halo.addColorStop(1, "rgba(255,255,255,0)");
      ctx!.fillStyle = halo;
      ctx!.fillRect(midX - wijd, midY - wijd, wijd * 2, wijd * 2);

      // De zon zelf. Wit in het midden, naar goud en dan naar de kleur van de
      // ruimte eromheen.
      const kernStraal = schaal * (0.115 + slag * 0.038);
      const zon = ctx!.createRadialGradient(midX, midY, 0, midX, midY, kernStraal);
      zon.addColorStop(0, "rgba(255,255,255,1)");
      zon.addColorStop(0.3, `rgba(255,246,214,${0.92 + slag * 0.08})`);
      zon.addColorStop(0.6, `rgba(255,196,96,${0.5 + slag * 0.3})`);
      zon.addColorStop(0.85, `rgba(255,130,40,${0.16 + slag * 0.2})`);
      zon.addColorStop(1, "rgba(255,90,20,0)");
      ctx!.fillStyle = zon;
      ctx!.fillRect(midX - kernStraal, midY - kernStraal, kernStraal * 2, kernStraal * 2);

      // De schil eromheen, met kieren.
      //
      // Zes bogen met openingen ertussen, langzaam draaiend. Bij elke hartslag
      // wijken ze uit elkaar en breekt het licht erdoorheen — dat is het
      // "open en dicht" gaan. Ze zijn donker getekend, dus wat je ziet is niet
      // de schil maar het licht dat er tussenuit komt.
      // De schil is niet donker maar licht.
      //
      // Eerst tekende ik hem in bijna zwart, in de gedachte dat je dan het licht
      // ertussenuit ziet komen. Op een zwarte achtergrond leest dat als een gat:
      // je ziet een balk dwars over de zon. Wat je in het echt ziet bij iets wat
      // gloeit achter een tralie is niet de tralie maar de rand die oplicht.
      // Daarom bogen in warm licht, die opengaan bij elke slag.
      const schilStraal = kernStraal * (1.34 + slag * 0.3);
      const opening = 0.3 + slag * 0.42;
      ctx!.lineCap = "round";
      for (let i = 0; i < 6; i += 1) {
        const van = (i / 6) * Math.PI * 2 + tijd * 0.22;
        ctx!.strokeStyle = `rgba(255,214,150,${0.16 + slag * 0.3})`;
        ctx!.lineWidth = Math.max(1, kernStraal * 0.07);
        ctx!.beginPath();
        ctx!.arc(midX, midY, schilStraal, van + opening / 2, van + Math.PI / 3 - opening / 2);
        ctx!.stroke();
      }

      // De uitbarstingen door de kieren. Alleen op het hoogtepunt van een slag:
      // dat maakt het een uitbarsting in plaats van een lamp die aanstaat.
      if (slag > 0.18) {
        for (let i = 0; i < 6; i += 1) {
          const hoek = (i / 6) * Math.PI * 2 + tijd * 0.22 - opening / 2;
          const ver = kernStraal * (1.4 + slag * 2.6);
          const straal = ctx!.createLinearGradient(
            midX + Math.cos(hoek) * kernStraal,
            midY + Math.sin(hoek) * kernStraal,
            midX + Math.cos(hoek) * ver,
            midY + Math.sin(hoek) * ver,
          );
          straal.addColorStop(0, `rgba(255,236,180,${0.55 * slag})`);
          straal.addColorStop(1, "rgba(255,170,60,0)");
          ctx!.strokeStyle = straal;
          ctx!.lineWidth = Math.max(1.5, kernStraal * 0.14 * slag);
          ctx!.beginPath();
          ctx!.moveTo(midX + Math.cos(hoek) * kernStraal * 0.9, midY + Math.sin(hoek) * kernStraal * 0.9);
          ctx!.lineTo(midX + Math.cos(hoek) * ver, midY + Math.sin(hoek) * ver);
          ctx!.stroke();
        }
      }

      opScherm = [];

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

        for (let index = 0; index < deeltjes.length; index += 1) {
          const d = deeltjes[index];
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

          // Onder een hele pixel wordt een stipje een hard blokje in plaats van
          // een lichtpunt. Dan liever iets groter en zwakker.
          const maat = Math.max(1.4, d.grootte * diepte * 4.6);

          const alfa = Math.min(1, d.helderheid * kracht * (0.45 + diepte * 1.3));
          if (alfa < 0.02) continue;

          // Dicht bij het hart van de zwerm gloeit het wit uit.
          const kernNabij = Math.abs(d.x) + Math.abs(d.y) + Math.abs(d.z) < 0.55;

          // Waar dit deeltje belandde, zodat de draden er straks langs kunnen.
          opScherm[index] = { x, y, diepte };

          ctx!.globalAlpha = alfa;
          ctx!.drawImage(kernNabij ? heet : gewoon, x - maat / 2, y - maat / 2, maat, maat);
        }

        // Tentakels.
        //
        // Slierten die uit de zwerm groeien met stroom die eroverheen loopt — in
        // de kleur van de agent waar het vandaan komt.
        //
        // Ze zijn opgebouwd uit losse stukjes en niet als één vloeiende bocht.
        // Dat is wat het stroom laat lijken: elk knikpunt krijgt een kleine
        // uitwijking haaks op de lijn die met de tijd meebeweegt, sterker naar
        // het uiteinde toe zoals bij een zweep. Een gladde curve leest als een
        // touwtje, niet als een vonk.
        //
        // En in drie lagen over elkaar: een brede zachte gloed, een kern, en de
        // puls die eroverheen loopt. Eén lijn van één pixel is een streepje;
        // deze stapeling maakt er licht van.
        if (!stil || werkt) {
          // Waar de sliert vandaan komt: niet uit de zwerm zelf maar uit de
          // kern. De zwerm ligt er onderweg tussen, en dat is precies het
          // beeld — de energie komt uit de bron en gaat langs de agent naar
          // buiten.
          const kx = midX;
          const ky = midY;

          // De zwerm waar hij langs moet, zodat de sliert niet dwars door de
          // massa heen schiet maar via zijn eigen agent naar buiten loopt.
          const langsX = midX + (plek.x * cosD - plek.z * sinD) * schaal * adem * 0.53;
          const langsY = midY + plek.y * schaal * adem * 0.53;

          const STAPPEN = 18;

          for (const t of TENTAKELS) {
            const zwaai = Math.sin(tijd * t.tempo + w) * t.bocht;

            // De richting van kern naar zwerm, en dan dóór naar buiten.
            const richting = Math.atan2(langsY - ky, langsX - kx) + zwaai * 0.5;
            const naarZwerm = Math.hypot(langsX - kx, langsY - ky);
            const lang = naarZwerm + schaal * 0.22 * t.lengte * adem;

            const eindX = kx + Math.cos(richting) * lang;
            const eindY = ky + Math.sin(richting) * lang;
            // Het controlepunt ligt bij de zwerm, met een zwaai opzij: zo buigt
            // de sliert er langs in plaats van er dwars doorheen.
            // Ver opzij, zodat de sliert een boog maakt om de massa heen.
            const stuurX = langsX + Math.cos(richting + Math.PI / 2) * naarZwerm * zwaai * 1.15;
            const stuurY = langsY + Math.sin(richting + Math.PI / 2) * naarZwerm * zwaai * 1.15;

            // De hele sliert uitrekenen: punt voor punt over de bocht, met de
            // uitwijking erbovenop.
            const punten: { x: number; y: number }[] = [];
            for (let i = 0; i <= STAPPEN; i += 1) {
              const u = i / STAPPEN;
              const bx = (1 - u) * (1 - u) * kx + 2 * (1 - u) * u * stuurX + u * u * eindX;
              const by = (1 - u) * (1 - u) * ky + 2 * (1 - u) * u * stuurY + u * u * eindY;

              // Haaks op de richting van de sliert.
              const dx = eindX - kx;
              const dy = eindY - ky;
              const len = Math.hypot(dx, dy) || 1;
              const nx = -dy / len;
              const ny = dx / len;

              // Twee golven over elkaar, zodat het knettert in plaats van
              // netjes te slingeren. Aan de aanhechting nul, naar het uiteinde
              // toe steeds meer.
              const kracht3 = u * u * (werkt ? 1 : 0.5);
              const kronkel =
                (Math.sin(tijd * 5.5 + i * 0.9 + w) * 3.2 +
                  Math.sin(tijd * 9.1 + i * 2.1 + w * 2) * 1.6) *
                kracht3;

              punten.push({ x: bx + nx * kronkel, y: by + ny * kronkel });
            }

            const tekenPad = (van: number, tot: number) => {
              ctx!.beginPath();
              ctx!.moveTo(punten[van].x, punten[van].y);
              for (let i = van + 1; i <= tot; i += 1) ctx!.lineTo(punten[i].x, punten[i].y);
              ctx!.stroke();
            };

            ctx!.lineCap = "round";
            ctx!.lineJoin = "round";

            // Laag 1: de gloed eromheen.
            ctx!.strokeStyle = `rgba(${r},${g},${b},${werkt ? 0.16 : 0.07})`;
            ctx!.lineWidth = 6;
            tekenPad(0, STAPPEN);

            // Laag 2: de kern van de sliert.
            ctx!.strokeStyle = `rgba(${r},${g},${b},${werkt ? 0.5 : 0.22})`;
            ctx!.lineWidth = 2;
            tekenPad(0, STAPPEN);

            // Laag 3: de stroom die eroverheen loopt.
            // De pulsen vertrekken mee met de hartslag: elke slag stuurt de
            // kern een lading naar buiten. Daarom loopt hun positie op met de
            // tijd maar begint hij bij elke cyclus opnieuw.
            const pulsen = werkt ? 3 : 1;
            for (let i = 0; i < pulsen; i += 1) {
              const u = (tijd * (werkt ? 0.55 : 0.32) + i / pulsen + w * 0.13) % 1;
              const kop = Math.round(u * STAPPEN);
              const staart = Math.max(0, kop - 4);
              if (kop <= staart) continue;

              // Dooft uit naar het uiteinde: het signaal raakt onderweg op.
              const kracht2 = (1 - u) * (werkt ? 1 : 0.5);

              // De gloed van de puls, breed en zacht.
              ctx!.strokeStyle = `rgba(${r},${g},${b},${0.45 * kracht2})`;
              ctx!.lineWidth = 9;
              tekenPad(staart, kop);

              // De kern, wit uitgegloeid — daar zit de stroom zelf.
              ctx!.strokeStyle = `rgba(255,255,255,${0.75 * kracht2})`;
              ctx!.lineWidth = 2.4;
              tekenPad(staart, kop);

              // Het kopje.
              const punt = punten[kop];
              ctx!.globalAlpha = 0.95 * kracht2;
              const maatKop = 9;
              ctx!.drawImage(heet, punt.x - maatKop / 2, punt.y - maatKop / 2, maatKop, maatKop);
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

      // De draden tussen de knooppunten. Na de deeltjes, want ze horen erover
      // te liggen — eronder verdwijnen ze in de wolk.
      //
      // Ze doven uit met de afstand: een draad die het halve scherm oversteekt
      // is geen verbinding meer maar een streep. En met de diepte, zodat het
      // netwerk aan de achterkant terugvalt in plaats van door de massa heen te
      // snijden.
      ctx!.globalAlpha = 1;
      for (const draad of draden) {
        const a = opScherm[draad.van];
        const b = opScherm[draad.naar];
        if (!a || !b) continue;

        const lid = leden[deeltjes[draad.van].zwerm];
        if (!lid || lid.stand === "op pauze") continue;

        const lengte = Math.hypot(a.x - b.x, a.y - b.y);
        const grens = schaal * 0.5;
        if (lengte > grens) continue;

        const [r, g, b2] = hexNaarRgb(lid.color ?? "#6366f1");
        const nabij = 1 - lengte / grens;
        const diep = (a.diepte + b.diepte) / 2;
        const alfa = nabij * nabij * diep * (lid.bezig ? 0.42 : 0.2);
        if (alfa < 0.015) continue;

        ctx!.strokeStyle = `rgba(${r},${g},${b2},${alfa})`;
        ctx!.lineWidth = Math.max(0.4, diep * 0.9);
        ctx!.beginPath();
        ctx!.moveTo(a.x, a.y);
        ctx!.lineTo(b.x, b.y);
        ctx!.stroke();
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
            className="absolute hidden -translate-x-1/2 -translate-y-1/2 border px-1 py-px font-mono text-[9px] leading-[1.15] tracking-[0.08em] whitespace-nowrap uppercase transition-transform hover:scale-110 sm:block"
            style={{
              // Vaste plek, afgeleid van waar de zwerm hoort te zweven. De
              // zwerm zelf draait; het label niet, want een naam die met de
              // massa meedraait is niet te lezen en niet aan te klikken.
              //
              // Nooit op de kern. De Head of Operations zweeft in het midden,
              // en zijn label kwam daarmee precies op de zon te liggen — een
              // zwarte balk dwars door het felste punt van het beeld. Elk label
              // wordt daarom minstens een stuk naar buiten geduwd, in de
              // richting waarin zijn zwerm ligt.
              ...(() => {
                const factor = schaalFactor / 0.56;
                const afstand = Math.hypot(plek.x, plek.y);

                // Het label hoort óp zijn eigen wolk, niet ernaast. Duw je ze
                // naar buiten, dan zweven ze los in het zwart en valt het beeld
                // uit elkaar — dan zie je negen bordjes met een wolk ergens
                // daarachter in plaats van negen gekleurde zwermen die zichzelf
                // benoemen.
                //
                // Eén uitzondering: de zwerm die in het midden zweeft ligt op de
                // kern, en daar is het te fel om iets te kunnen lezen. Die krijgt
                // net genoeg ruimte om de zon vrij te laten.
                // 0,3 en niet lager: nagemeten stond het label bij 0,2 op
                // zevenenvijftig pixels van het midden terwijl de zon er
                // vierenvijftig is — dan valt het weg in de gloed.
                const kernVrij = 0.3;
                const richting =
                  afstand < 0.02
                    ? { x: 0, y: -1 }
                    : { x: plek.x / afstand, y: plek.y / afstand };
                const uit = Math.max(afstand, kernVrij);
                return {
                  left: `${50 + richting.x * uit * 34 * factor}%`,
                  top: `${50 + richting.y * uit * 34 * factor}%`,
                };
              })(),
              // Rand in zijn eigen kleur, met een gloed die hem aan de wolk
              // vastplakt. Zonder die gloed is het een bordje dat toevallig
              // boven de zwerm hangt; mét lijkt het licht van de wolk zelf.
              borderColor: lid.bezig ? kleur : `${kleur}99`,
              background: "rgba(2,3,7,0.78)",
              color: kleur,
              boxShadow: `0 0 10px -2px ${kleur}${lid.bezig ? "" : "66"}`,
              opacity: lid.stand === "op pauze" ? 0.4 : 1,
            }}
          >
            <span className="block font-semibold">{lid.naam}</span>
            {/* De tweede regel is de stand, gedempt. In de referentie staat daar
                het aantal neuronen en de vuursnelheid; hier staat wat hij
                werkelijk doet — dat is hetzelfde idee met echte inhoud. */}
            <span className="block text-[8px] tracking-normal opacity-60">
              {lid.bezig ? "actief" : "rust"} · {lid.stand}
            </span>
          </Link>
        );
      })}
    </>
  );
}
