// Het denkwerk, in beeld.
//
// Een hoofd waar de hersenen bovenuit komen en code uit opstijgt. Puur
// decoratief: het staat naast je begroeting en zegt in één beeld waar dit
// dashboard over gaat. Daarom staat er ook `aria-hidden` op — een schermlezer
// heeft niets aan "hoofd met hersenen", die leest gewoon de begroeting.
//
// De kleuren van de coderegels zijn dezelfde als die van je agents. Zo hoort het
// beeld bij de kamer eronder in plaats van dat het een willekeurig plaatje is.

/// Vaste kleuren en tijden. Willekeur zou bij elke herlading iets anders geven,
/// en dat maakt een pagina waar je dagelijks komt onrustig.
const CODE = [
  { x: 148, y: 44, breedte: 30, kleur: "var(--accent)", vertraging: "0s" },
  { x: 156, y: 32, breedte: 18, kleur: "var(--info)", vertraging: "0.35s" },
  { x: 136, y: 22, breedte: 26, kleur: "var(--ok)", vertraging: "0.7s" },
  { x: 112, y: 14, breedte: 16, kleur: "var(--warn)", vertraging: "1.05s" },
  { x: 168, y: 60, breedte: 22, kleur: "#a78bfa", vertraging: "1.4s" },
  { x: 90, y: 24, breedte: 20, kleur: "#f472b6", vertraging: "1.75s" },
  { x: 176, y: 78, breedte: 14, kleur: "#2dd4bf", vertraging: "2.1s" },
];

/// De kronkels van de hersenen. Met de hand uitgezet, want willekeurige bochten
/// zien er niet als hersenen uit maar als een kluwen.
const KRONKELS = [
  "M 62 74 q 10 -12 22 -6 q 10 5 18 -3",
  "M 58 86 q 12 -8 24 -2 q 12 6 22 -4",
  "M 64 62 q 8 -10 20 -8 q 12 2 16 6",
  "M 74 96 q 10 -6 20 -2 q 10 4 18 -2",
];

export function Brein({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden focusable="false">
      <defs>
        <radialGradient id="brein-gloed" cx="45%" cy="38%" r="55%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="brein-vorm" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      {/* Licht rondom de hersenen, dat maakt dat ze oplichten in plaats van
          alleen liggen */}
      <circle cx="88" cy="76" r="62" fill="url(#brein-gloed)" />

      {/* Schouders en hals */}
      <path d="M 44 200 q 0 -44 44 -50 q 44 6 44 50 Z" fill="var(--border)" />
      <path d="M 76 152 h 24 v 12 q -12 8 -24 0 Z" fill="var(--text-faint)" opacity="0.4" />

      {/* Het hoofd. De bovenkant is open: daar komen de hersenen uit. */}
      <path
        d="M 54 96 q 0 -8 2 -14 q 14 10 32 10 q 20 0 34 -12 q 4 8 4 16
           q 0 34 -36 44 q -36 -10 -36 -44 Z"
        fill="var(--text-faint)"
        opacity="0.5"
      />

      {/* De hersenen zelf, die bovenuit komen */}
      <path
        d="M 52 84 q -10 -26 12 -40 q 10 -18 30 -14 q 22 -6 32 14 q 22 12 12 40
           q -22 12 -43 12 q -21 0 -43 -12 Z"
        fill="url(#brein-vorm)"
      />
      {KRONKELS.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="#000"
          strokeOpacity="0.25"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      ))}
      {/* De groef in het midden, die maakt er twee helften van */}
      <path
        d="M 88 34 q 4 24 0 50"
        fill="none"
        stroke="#000"
        strokeOpacity="0.3"
        strokeWidth="2.4"
        strokeLinecap="round"
      />

      {/* De code die eruit opstijgt. Elke regel licht om de beurt op, zodat het
          beweegt zonder te knipperen. */}
      {CODE.map((regel, i) => (
        <rect
          key={i}
          x={regel.x}
          y={regel.y}
          width={regel.breedte}
          height="6"
          rx="3"
          fill={regel.kleur}
        >
          <animate
            attributeName="opacity"
            values="0.2;1;0.2"
            dur="3.2s"
            begin={regel.vertraging}
            repeatCount="indefinite"
          />
        </rect>
      ))}
    </svg>
  );
}
