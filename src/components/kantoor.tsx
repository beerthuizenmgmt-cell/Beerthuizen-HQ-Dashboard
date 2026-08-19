import type { TeamRegel } from "@/lib/cockpit";

// Je team, aan het werk.
//
// Bovenaan HQ stonden cijfers en tekst. Dit is negen collega's aan hun bureau in
// één kamer: je ziet in één blik wie er zit, wie er nu echt aan het werk is en
// bij wie er iets misgaat — voordat je één cijfer gelezen hebt.
//
// Getekend in gewone SVG. Geen plaatjes om te laden, schaalt van een telefoon
// tot een groot scherm zonder onscherp te worden, en elke agent krijgt zijn
// eigen kleur uit de database in plaats van een kleurtje dat wij verzinnen.

type Indeling = {
  rijen: number[];
  /// De breedte van de tekening zelf. Bepalend voor hoe groot alles uitvalt: op
  /// een telefoon van 340 pixels krimpt een tekening van 1000 breed met factor
  /// drie, en dan zijn de namen vier pixels hoog. Daar is de kamer dus ook in de
  /// tekening smaller.
  breedte: number;
  hoogte: number;
  eersteRij: number;
  rijafstand: number;
};

/// Op een breed scherm twee rijen van vijf en vier: de achterste hoger en
/// kleiner, zodat het een ruimte wordt in plaats van een rij poppetjes.
const BREED: Indeling = { rijen: [5, 4], breedte: 1000, hoogte: 340, eersteRij: 108, rijafstand: 118 };

/// Op een telefoon zou datzelfde neerkomen op negen figuren over driehonderd
/// pixels — namen van vier pixels hoog, dus onleesbaar. Daar drie rijen van
/// drie, in een kamer die hoger is dan breed.
const SMAL: Indeling = { rijen: [3, 3, 3], breedte: 400, hoogte: 470, eersteRij: 92, rijafstand: 138 };

/// De regels op een laptopscherm. Vaste waarden en geen toeval: negen
/// werkplekken die elke seconde iets anders tonen is onrustig, en bij elke
/// herlading een andere indeling maakt de kamer een flikkerend ding.
const REGELS = [
  { inspring: 0, lengte: 0.62 },
  { inspring: 2.4, lengte: 0.8 },
  { inspring: 2.4, lengte: 0.55 },
  { inspring: 4.8, lengte: 0.68 },
  { inspring: 2.4, lengte: 0.42 },
  { inspring: 0, lengte: 0.5 },
];

function Werkplek({
  lid,
  x,
  y,
  schaal,
  merk,
}: {
  lid: TeamRegel;
  x: number;
  y: number;
  schaal: number;
  /// De twee kamers staan allebei in de pagina — de ene verborgen. Zonder een
  /// eigen achtervoegsel delen ze hun verloop-namen, en dan verwijst de
  /// zichtbare kamer naar verlopen in de verborgene. Die schilderen niet.
  merk: string;
}) {
  const kleur = lid.color ?? "var(--accent)";
  const slaapt = lid.stand === "op pauze";
  const misgaat = lid.niveau === "rood";

  // Wie op pauze staat is er wel, maar doet niets: die tekenen we vaag. Zo blijft
  // het team compleet in beeld — een lege plek zou lezen alsof hij weg is.
  return (
    <g transform={`translate(${x} ${y}) scale(${schaal})`} opacity={slaapt ? 0.28 : 1}>
      {/* Schaduw op de vloer, zodat ze niet zweven */}
      <ellipse cx="0" cy="52" rx="36" ry="6" fill="#000" opacity="0.35" />

      {/* Bureau */}
      <rect x="-38" y="34" width="76" height="7" rx="3.5" fill="var(--border)" />
      <rect x="-38" y="34" width="76" height="7" rx="3.5" fill={`url(#bureaublad-${merk})`} />
      <rect x="-31" y="41" width="4" height="12" rx="2" fill="var(--border)" opacity="0.7" />
      <rect x="27" y="41" width="4" height="12" rx="2" fill="var(--border)" opacity="0.7" />

      {/* Schouders. De laptop komt hier deels overheen te staan, zodat hij
          er echt achter zit in plaats van ernaast. */}
      <path d="M -20 34 Q -20 12 0 12 Q 20 12 20 34 Z" fill={kleur} opacity={lid.bezig ? 1 : 0.7} />
      <path d="M -20 34 Q -20 12 0 12 Q 20 12 20 34 Z" fill={`url(#torso-licht-${merk})`} />

      {/* Slagschaduw van de kin op de borst */}
      <ellipse cx="0" cy="14" rx="12" ry="4" fill="#000" opacity="0.22" />

      {/* Hoofd.

          Hetzelfde gezicht als in de lijst met je digitale medewerkers: eerst
          zijn portret, anders zijn emoji, anders zijn initialen. Een eigen
          getekend koppie zou een tweede, ander gezicht opleveren voor dezelfde
          collega — dan herken je hem in de kamer niet terug uit de lijst.

          Ruim boven de laptop, want daar gaat het om: je wilt zien wie er zit. */}
      <clipPath id={`hoofd-${merk}-${lid.id}`}>
        <circle cx="0" cy="-4" r="13" />
      </clipPath>

      <circle cx="0" cy="-4" r="13" fill={kleur} opacity={lid.bezig ? 1 : 0.8} />

      {lid.avatarUrl ? (
        <image
          href={lid.avatarUrl}
          x="-13"
          y="-17"
          width="26"
          height="26"
          clipPath={`url(#hoofd-${merk}-${lid.id})`}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : lid.emoji ? (
        <text x="0" y="-4" textAnchor="middle" dominantBaseline="central" fontSize="14">
          {lid.emoji}
        </text>
      ) : (
        <text
          x="0"
          y="-4"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="11"
          fontWeight="600"
          fill="#fff"
          opacity="0.9"
        >
          {lid.naam.slice(0, 2).toUpperCase()}
        </text>
      )}

      {/* Licht en schaduw eroverheen. Zachter als er een portret onder zit —
          anders was je zijn gezicht weg met je eigen belichting. */}
      <circle
        cx="0"
        cy="-4"
        r="13"
        fill={`url(#hoofd-schaduw-${merk})`}
        opacity={lid.avatarUrl ? 0.5 : 1}
      />
      <circle
        cx="0"
        cy="-4"
        r="13"
        fill={`url(#hoofd-licht-${merk})`}
        opacity={lid.avatarUrl ? 0.4 : 1}
      />
      {/* Randlicht langs de bovenkant, dat maakt de bol rond */}
      <path
        d="M -11.5 -10 A 13 13 0 0 1 11.5 -10"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.45"
        strokeWidth="1.3"
        strokeLinecap="round"
      />

      {/* De laptop.

          Een scherm dat iets naar achteren helt en een toetsenbord dat naar je
          toe wijst — daarom lopen de zijkanten schuin. Een rechthoekig blok zou
          er als een monitor uitzien, en achter een monitor zit je niet te typen. */}
      <path
        d="M -15 34 L -18 18 L 18 18 L 15 34 Z"
        fill="var(--bg)"
        stroke="var(--border)"
        strokeWidth="1.4"
      />
      <path
        d="M -13.6 32.6 L -16.3 19.4 L 16.3 19.4 L 13.6 32.6 Z"
        fill={lid.bezig ? kleur : "var(--bg-elevated)"}
      >
        {lid.bezig && (
          <animate attributeName="opacity" values="0.5;0.95;0.5" dur="2.4s" repeatCount="indefinite" />
        )}
      </path>

      {/* Regels op het scherm.

          Het scherm was een egaal vlak — dat leest als een uit monitor, niet als
          iemand die zit te werken. Nu staan er regels op, ingesprongen en van
          verschillende lengte zoals tekst dat is. Ze lopen mee met de helling
          van het scherm, anders zweven ze ervoor.

          Werkt hij, dan lichten ze op tegen de kleur van het scherm. Werkt hij
          niet, dan blijven ze vaag zichtbaar: het scherm staat aan, er gebeurt
          alleen niets. */}
      <g clipPath={`url(#scherm-${merk}-${lid.id})`}>
        {REGELS.map((regel, i) => {
          const y = 21.4 + i * 2.15;
          // Het scherm loopt taps toe naar beneden; de regels moeten dat volgen.
          const halveBreedte = 16.3 - (y - 19.4) * 0.205;
          const start = -halveBreedte + 1.6 + regel.inspring;
          return (
            <rect
              key={i}
              x={start}
              y={y}
              width={(halveBreedte * 2 - 3.2 - regel.inspring) * regel.lengte}
              height="1.15"
              rx="0.5"
              fill="#fff"
              opacity={lid.bezig ? 0.72 : 0.16}
            />
          );
        })}
      </g>
      <clipPath id={`scherm-${merk}-${lid.id}`}>
        <path d="M -13.6 32.6 L -16.3 19.4 L 16.3 19.4 L 13.6 32.6 Z" />
      </clipPath>

      {/* Toetsenbord: het deel dat plat op het bureau ligt */}
      <path d="M -21 34 L 21 34 L 24 39 L -24 39 Z" fill="var(--border)" />
      <path d="M -21 34 L 21 34 L 24 39 L -24 39 Z" fill={`url(#bureaublad-${merk})`} />

      {/* Handen op het toetsenbord. Twee vlekjes in zijn eigen kleur, net licht
          genoeg om te lezen als handen en niet als vlekken. */}
      <ellipse cx="-9" cy="35.5" rx="4.2" ry="2.6" fill={kleur} opacity="0.85" />
      <ellipse cx="9" cy="35.5" rx="4.2" ry="2.6" fill={kleur} opacity="0.85" />

      {/* Het licht van het scherm op zijn gezicht en handen, als hij werkt */}
      {lid.bezig && (
        <ellipse cx="0" cy="24" rx="26" ry="16" fill={kleur} opacity="0.14">
          <animate attributeName="opacity" values="0.07;0.18;0.07" dur="2.4s" repeatCount="indefinite" />
        </ellipse>
      )}

      {/* Gaat er iets mis, dan een stipje boven zijn hoofd. Rood valt op tussen
          negen gekleurde figuren; een rode figuur zou juist verdwijnen. */}
      {misgaat && (
        <circle cx="18" cy="-15" r="5" fill="var(--danger)">
          <animate attributeName="r" values="4.5;6;4.5" dur="1.6s" repeatCount="indefinite" />
        </circle>
      )}

      {/* De naam schaalt niet mee met het figuur. Deed hij dat wel, dan werd hij
          op een telefoon en in de achterste rij onleesbaar klein — juist daar
          heb je hem nodig om te weten wie wie is. */}
      <text
        x="0"
        y={64 / schaal}
        textAnchor="middle"
        fontSize={13 / schaal}
        fill="var(--text-muted)"
        fontWeight="500"
      >
        {lid.naam}
      </text>
    </g>
  );
}

function Kamer({
  team,
  indeling,
  className,
}: {
  team: TeamRegel[];
  indeling: Indeling;
  className: string;
}) {
  const rijen: TeamRegel[][] = [];
  let rest = [...team];
  for (const aantal of indeling.rijen) {
    rijen.push(rest.slice(0, aantal));
    rest = rest.slice(aantal);
  }
  if (rest.length > 0) rijen[rijen.length - 1].push(...rest);

  const vloer = indeling.hoogte - 42;
  const merk = `k${indeling.breedte}`;
  const laatsteRij = Math.max(1, indeling.rijen.length - 1);

  // Verdeeld over de breedte, zodat elke rij de kamer vult.
  const plek = (i: number, aantal: number) => ((i + 0.5) / aantal) * indeling.breedte;

  return (
    <svg
      viewBox={`0 0 ${indeling.breedte} ${indeling.hoogte}`}
      className={`block w-full ${className}`}
      role="img"
      aria-label="Je team aan het werk"
    >
      <defs>
        <linearGradient id={`muur-${merk}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--bg-elevated)" />
          <stop offset="100%" stopColor="var(--bg)" />
        </linearGradient>
        <radialGradient id={`lamp-${merk}`} cx="50%" cy="0%" r="70%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.13" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>

        {/* Licht en schaduw als losse laagjes bovenop de kleur van de agent.
            Eén keer gedefinieerd, door alle negen figuren gebruikt. */}
        <radialGradient id={`hoofd-licht-${merk}`} cx="34%" cy="26%" r="62%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`hoofd-schaduw-${merk}`} cx="72%" cy="80%" r="70%">
          <stop offset="0%" stopColor="#000" stopOpacity="0.45" />
          <stop offset="60%" stopColor="#000" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`torso-licht-${merk}`} x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="45%" stopColor="#fff" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id={`bureaublad-${merk}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.25" />
        </linearGradient>
      </defs>

      {/* De kamer: muur, licht van boven, en een vloer die iets donkerder is */}
      <rect width={indeling.breedte} height={indeling.hoogte} fill={`url(#muur-${merk})`} />
      <rect width={indeling.breedte} height={indeling.hoogte} fill={`url(#lamp-${merk})`} />
      <rect y={vloer} width={indeling.breedte} height="55" fill="#000" opacity="0.22" />
      <line x1="0" y1={vloer} x2={indeling.breedte} y2={vloer} stroke="var(--border)" strokeWidth="1" opacity="0.5" />

      {rijen.map((rij, r) =>
        rij.map((lid, i) => (
          <Werkplek
            key={lid.id}
            lid={lid}
            x={plek(i, rij.length)}
            y={indeling.eersteRij + r * indeling.rijafstand}
            // Verder naar achteren is kleiner: dat maakt de diepte.
            // Groot genoeg om een portret te herkennen. Er past meer dan er
            // eerst stond: een bureau is 72 eenheden breed en er is ruim honderd
            // per plek beschikbaar.
            schaal={(indeling.breedte < 600 ? 0.85 : 0.95) + (r / laatsteRij) * 0.25}
            merk={merk}
          />
        )),
      )}
    </svg>
  );
}

export function Kantoor({ team }: { team: TeamRegel[] }) {
  if (team.length === 0) return null;

  const aanHetWerk = team.filter((l) => l.bezig).length;

  return (
    <section className="card relative overflow-hidden p-0">
      <Kamer team={team} indeling={BREED} className="hidden sm:block" />
      <Kamer team={team} indeling={SMAL} className="sm:hidden" />

      <div className="absolute top-4 left-5">
        <p className="text-sm font-semibold">Je team</p>
        <p className="text-xs text-text-muted">
          {aanHetWerk > 0
            ? `${aanHetWerk} van de ${team.length} ${aanHetWerk === 1 ? "is" : "zijn"} nu aan het werk`
            : `${team.length} collega's, op dit moment rustig`}
        </p>
      </div>
    </section>
  );
}
