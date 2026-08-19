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
const BREED: Indeling = { rijen: [5, 4], breedte: 1000, hoogte: 300, eersteRij: 100, rijafstand: 104 };

/// Op een telefoon zou datzelfde neerkomen op negen figuren over driehonderd
/// pixels — namen van vier pixels hoog, dus onleesbaar. Daar drie rijen van
/// drie, in een kamer die hoger is dan breed.
const SMAL: Indeling = { rijen: [3, 3, 3], breedte: 400, hoogte: 400, eersteRij: 80, rijafstand: 118 };

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
      <ellipse cx="0" cy="46" rx="34" ry="6" fill="#000" opacity="0.35" />

      {/* Bureau */}
      <rect x="-36" y="26" width="72" height="7" rx="3.5" fill="var(--border)" />
      <rect x="-36" y="26" width="72" height="7" rx="3.5" fill={`url(#bureaublad-${merk})`} />
      <rect x="-30" y="33" width="4" height="13" rx="2" fill="var(--border)" opacity="0.7" />
      <rect x="26" y="33" width="4" height="13" rx="2" fill="var(--border)" opacity="0.7" />

      {/* De collega zelf.

          Het licht komt van linksboven, net als de lamp in de kamer. Daarom
          liggen de lichtvlekken linksboven en de schaduw rechtsonder — op het
          hoofd, op de schouders, en als slagschaduw van de kin op de borst.

          De hoogsels zijn wit en zwart met een lage dekking bovenop de kleur van
          de agent, niet lichtere en donkerder varianten van die kleur zelf. Zo
          werkt het voor elke kleur die iemand instelt, zonder dat wij per agent
          hoeven uit te rekenen wat zijn schaduw is. */}

      {/* Schouders */}
      <path d="M -17 26 Q -17 8 0 8 Q 17 8 17 26 Z" fill={kleur} opacity={lid.bezig ? 1 : 0.7} />
      <path d="M -17 26 Q -17 8 0 8 Q 17 8 17 26 Z" fill={`url(#torso-licht-${merk})`} />
      {/* Slagschaduw van het hoofd op de borst */}
      <ellipse cx="0" cy="11" rx="10" ry="4" fill="#000" opacity="0.22" />

      {/* Hoofd.

          Hetzelfde gezicht als in de lijst met je digitale medewerkers: eerst
          zijn portret, anders zijn emoji, anders zijn initialen. Twee getekende
          oogjes zouden een tweede, ander gezicht opleveren voor dezelfde
          collega — dan herken je hem in de kamer niet terug uit de lijst. */}
      <clipPath id={`hoofd-${merk}-${lid.id}`}>
        <circle cx="0" cy="0" r="9.5" />
      </clipPath>

      <circle cx="0" cy="0" r="9.5" fill={kleur} opacity={lid.bezig ? 1 : 0.8} />

      {lid.avatarUrl ? (
        <image
          href={lid.avatarUrl}
          x="-9.5"
          y="-9.5"
          width="19"
          height="19"
          clipPath={`url(#hoofd-${merk}-${lid.id})`}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : lid.emoji ? (
        <text x="0" y="0" textAnchor="middle" dominantBaseline="central" fontSize="10">
          {lid.emoji}
        </text>
      ) : (
        <text
          x="0"
          y="0"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="8"
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
        cy="0"
        r="9.5"
        fill={`url(#hoofd-schaduw-${merk})`}
        opacity={lid.avatarUrl ? 0.55 : 1}
      />
      <circle
        cx="0"
        cy="0"
        r="9.5"
        fill={`url(#hoofd-licht-${merk})`}
        opacity={lid.avatarUrl ? 0.45 : 1}
      />
      {/* Randlicht langs de bovenkant, dat maakt de bol rond */}
      <path
        d="M -8.4 -4.4 A 9.5 9.5 0 0 1 8.4 -4.4"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.45"
        strokeWidth="1.1"
        strokeLinecap="round"
      />

      {/* Beeldscherm ervoor. Brandt in zijn eigen kleur zodra hij echt aan het
          werk is; staat het uit, dan is het een donker vlak. */}
      <rect
        x="-19"
        y="6"
        width="38"
        height="22"
        rx="3"
        fill="var(--bg)"
        stroke="var(--border)"
        strokeWidth="1.5"
      />
      <rect
        x="-16.5"
        y="8.5"
        width="33"
        height="17"
        rx="2"
        fill={lid.bezig ? kleur : "var(--bg-elevated)"}
      >
        {lid.bezig && (
          <animate attributeName="opacity" values="0.5;0.95;0.5" dur="2.4s" repeatCount="indefinite" />
        )}
      </rect>

      {/* Gaat er iets mis, dan een stipje boven zijn hoofd. Rood valt op tussen
          negen gekleurde figuren; een rode figuur zou juist verdwijnen. */}
      {misgaat && (
        <circle cx="15" cy="-11" r="4.5" fill="var(--danger)">
          <animate attributeName="r" values="4;5.5;4" dur="1.6s" repeatCount="indefinite" />
        </circle>
      )}

      {/* De naam schaalt niet mee met het figuur. Deed hij dat wel, dan werd hij
          op een telefoon en in de achterste rij onleesbaar klein — juist daar
          heb je hem nodig om te weten wie wie is. */}
      <text
        x="0"
        y={58 / schaal}
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

  const vloer = indeling.hoogte - 36;
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
