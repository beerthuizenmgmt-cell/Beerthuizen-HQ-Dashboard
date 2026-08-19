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
const BREED: Indeling = { rijen: [5, 4], breedte: 1000, hoogte: 260, eersteRij: 92, rijafstand: 86 };

/// Op een telefoon zou datzelfde neerkomen op negen figuren over driehonderd
/// pixels — namen van vier pixels hoog, dus onleesbaar. Daar drie rijen van
/// drie, in een kamer die hoger is dan breed.
const SMAL: Indeling = { rijen: [3, 3, 3], breedte: 400, hoogte: 330, eersteRij: 66, rijafstand: 96 };

function Werkplek({ lid, x, y, schaal }: { lid: TeamRegel; x: number; y: number; schaal: number }) {
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
      <rect x="-30" y="33" width="4" height="13" rx="2" fill="var(--border)" opacity="0.7" />
      <rect x="26" y="33" width="4" height="13" rx="2" fill="var(--border)" opacity="0.7" />

      {/* De collega zelf: hoofd en schouders, achter zijn bureau */}
      <path d="M -17 26 Q -17 8 0 8 Q 17 8 17 26 Z" fill={kleur} opacity={lid.bezig ? 1 : 0.7} />
      <circle cx="0" cy="0" r="9.5" fill={kleur} opacity={lid.bezig ? 1 : 0.8} />

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
        <linearGradient id={`muur-${indeling.hoogte}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--bg-elevated)" />
          <stop offset="100%" stopColor="var(--bg)" />
        </linearGradient>
        <radialGradient id={`lamp-${indeling.hoogte}`} cx="50%" cy="0%" r="70%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.13" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* De kamer: muur, licht van boven, en een vloer die iets donkerder is */}
      <rect width={indeling.breedte} height={indeling.hoogte} fill={`url(#muur-${indeling.hoogte})`} />
      <rect width={indeling.breedte} height={indeling.hoogte} fill={`url(#lamp-${indeling.hoogte})`} />
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
            schaal={(indeling.breedte < 600 ? 0.5 : 0.78) + (r / laatsteRij) * 0.22}
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
