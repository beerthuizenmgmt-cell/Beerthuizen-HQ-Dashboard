import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { bouwCockpit, type Niveau } from "@/lib/cockpit";
import { AgentAvatar } from "@/components/agent-avatar";
import { Staafjes, PerDag, Ring, NogNietGekoppeld } from "@/components/grafiek";
import { BreinHQ } from "@/components/brein-hq";
import { haalOverzicht } from "@/lib/overzicht";
import { ActivityList } from "@/components/activity-list";
import { formatDayLong, hourInTimezone, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

// HQ — de cockpit.
//
// Openen, binnen tien seconden weten hoe Beerthuizen ervoor staat, binnen
// dertig seconden weten wat je moet doen, en vanaf daar met één klik de details
// in. Alles wat dat niet dient staat op een ander scherm.
//
// Dus: geen negen grote agentkaarten meer, geen lijst met alles wat er ooit
// gebeurd is. Wel bovenaan wat vandaag jouw beslissing nodig heeft, want dat is
// het enige werk dat niemand anders kan doen.

function groet(): string {
  const uur = hourInTimezone();
  if (uur < 6) return "Goedenacht";
  if (uur < 12) return "Goedemorgen";
  if (uur < 18) return "Goedemiddag";
  return "Goedenavond";
}

const STIP: Record<Niveau, string> = {
  rood: "bg-danger",
  oranje: "bg-warn",
  groen: "bg-success",
};

const RAND: Record<Niveau, string> = {
  rood: "border-danger/40 bg-danger/5",
  oranje: "border-warn/40 bg-warn/5",
  groen: "border-border",
};

const CIJFER: Record<Niveau, string> = {
  rood: "text-danger",
  oranje: "text-warn",
  groen: "text-text",
};

export default async function HQPage() {
  const user = await requireUser();

  const [cockpit, activiteit, overzicht] = await Promise.all([
    bouwCockpit(),
    db.activityEvent.findMany({
      orderBy: { occurredAt: "desc" },
      take: 6,
      include: { agent: { select: { name: true, emoji: true, color: true, avatarUrl: true } } },
    }),
    haalOverzicht(),
  ]);

  const { vandaag, blokken, prioriteiten, team, briefing } = cockpit;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* ── Wie je bent en welke dag het is ───────────────────────────── */}
      <header className="komt-op">
        <h1 className="text-3xl">
          {groet()}, <span className="accent-serif">{user.name}</span>
        </h1>
        <p className="mt-1 text-sm text-text-muted">{formatDayLong(new Date())}</p>
      </header>

      {/* ── Je team, aan het werk ──────────────────────────────────────── */}
      {/* Bovenaan, vóór de cijfers: je ziet in één blik wie er zit en wie er nu
          echt aan het werk is voordat je iets gelezen hebt. */}
      <div className="komt-op" style={{ animationDelay: "80ms" }}>
        <BreinHQ team={team} />
      </div>

      {/* ── Vandaag ────────────────────────────────────────────────────── */}
      <section className="komt-op grid grid-cols-2 gap-3 sm:grid-cols-4" style={{ animationDelay: "160ms" }}>
        {[
          {
            label: vandaag.aandacht === 1 ? "vraagt jouw aandacht" : "vragen jouw aandacht",
            waarde: vandaag.aandacht,
            toon: vandaag.aandacht > 0 ? "rood" : "groen",
            link: "#prioriteiten",
          },
          {
            label: vandaag.deadlinesDezeWeek === 1 ? "deadline deze week" : "deadlines deze week",
            waarde: vandaag.deadlinesDezeWeek,
            toon: vandaag.deadlinesDezeWeek > 0 ? "oranje" : "groen",
            link: "/agenda",
          },
          {
            label: vandaag.lopendeTaken === 1 ? "taak loopt" : "taken lopen",
            waarde: vandaag.lopendeTaken,
            toon: "groen",
            link: "/taken",
          },
          {
            label: vandaag.vragen === 1 ? "vraag van een agent" : "vragen van agents",
            waarde: vandaag.vragen,
            toon: vandaag.vragen > 0 ? "oranje" : "groen",
            link: "/overleg",
          },
        ].map((tegel) => (
          <Link key={tegel.label} href={tegel.link} className="card p-4 transition hover:border-accent/40">
            <p className={`text-3xl font-semibold ${CIJFER[tegel.toon as Niveau]}`}>{tegel.waarde}</p>
            <p className="mt-0.5 text-xs text-text-muted">{tegel.label}</p>
          </Link>
        ))}
      </section>

      {/* ── Wat Daan ervan vindt ───────────────────────────────────────── */}
      {briefing && (
        <section className="komt-op card-cream p-5" style={{ animationDelay: "240ms" }}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="eyebrow-rule start">Daan, vanochtend</p>
            <span className="text-xs text-text-faint">{timeAgo(briefing.wanneer)}</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed">{briefing.tekst}</p>
          <Link href={briefing.link} className="mt-3 inline-block text-xs underline hover:text-text">
            Het hele overleg — {briefing.gerapporteerd} van {briefing.gerapporteerd} gerapporteerd →
          </Link>
        </section>
      )}

      {/* ── Prioriteiten ───────────────────────────────────────────────── */}
      <section id="prioriteiten" className="komt-op" style={{ animationDelay: "320ms" }}>
        <h2 className="eyebrow-rule start mb-3">Dit heeft jou nodig</h2>

        {prioriteiten.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-text-muted">
              Niets wacht op jou. Geen openstaande goedkeuringen, geen vragen, geen deadline in gevaar.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {prioriteiten.map((punt, index) => (
              <li key={index} className={`card border p-4 ${RAND[punt.niveau]}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${STIP[punt.niveau]}`} />
                      <p className="font-medium">{punt.titel}</p>
                    </div>
                    <p className="mt-1 pl-4 text-sm text-text-muted">{punt.uitleg}</p>
                  </div>
                  <Link href={punt.link} className="btn btn-ghost shrink-0 text-xs">
                    {punt.linkLabel}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Bedrijf in één oogopslag ───────────────────────────────────── */}
      <section>
        <h2 className="eyebrow-rule start mb-3">Bedrijf in één oogopslag</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {blokken.map((blok) => (
            <div key={blok.titel} className="card p-4">
              <div className="flex items-baseline justify-between">
                <p className="eyebrow">{blok.titel}</p>
                <Link href={blok.link} className="text-xs text-text-faint hover:text-text">
                  →
                </Link>
              </div>

              {blok.cijfers.length > 0 ? (
                <dl className="mt-3 space-y-1.5">
                  {blok.cijfers.map((cijfer) => (
                    <div key={cijfer.label} className="flex items-baseline justify-between gap-3">
                      <dt className="text-xs text-text-muted">{cijfer.label}</dt>
                      <dd className={`text-sm font-medium ${CIJFER[cijfer.toon ?? "groen"]}`}>
                        {cijfer.waarde}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                // Bewust geen nullen: een meter die niets meet hoort te zeggen
                // dat hij niets meet, en waar je hem aansluit.
                blok.ontbreekt && (
                  <div className="mt-3">
                    <p className="text-sm text-text-muted">{blok.ontbreekt.wat}</p>
                    <Link
                      href={blok.ontbreekt.link}
                      className="mt-1 inline-block text-xs text-accent underline"
                    >
                      {blok.ontbreekt.actie} →
                    </Link>
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Het team ───────────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow-rule start">Je digitale medewerkers</h2>
          <Link href="/agents" className="text-xs text-text-muted hover:text-text">
            Alles beheren →
          </Link>
        </div>
        <div className="card divide-y divide-border">
          {team.map((lid) => (
            <Link
              key={lid.id}
              href={`/agents/${lid.id}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${STIP[lid.niveau]}`} />
              <AgentAvatar
                agent={{ name: lid.naam, emoji: lid.emoji, color: lid.color, avatarUrl: lid.avatarUrl }}
                size="xs"
              />
              {/* Naam en functie onder elkaar: negen namen zonder functie zeggen
                  je niets als je niet uit je hoofd weet wie waarover gaat. */}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{lid.naam}</span>
                <span className="block truncate text-xs text-text-muted">{lid.rol}</span>
              </span>
              <span className="shrink-0 text-xs text-text-faint">{lid.stand}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Hoe het loopt ──────────────────────────────────────────────── */}
      {/* Twee groepen van drie in plaats van zes gelijke kaarten op een rij.
          Zes kaarten met dezelfde oranje staafjes lezen als één blok: je ziet
          wel dat er iets staat, maar niet wat. Elke grafiek heeft nu een eigen
          kleur met betekenis — groen voor wat af is, rood voor wat vastloopt,
          blauw voor je agents. */}
      <section className="komt-op space-y-5" style={{ animationDelay: "400ms" }}>
        <h2 className="eyebrow-rule start">Hoe het loopt</h2>

        <div>
          <p className="mb-2 text-xs tracking-wide text-text-faint uppercase">Het werk</p>
          <div className="grid gap-4 md:grid-cols-3">
          <div className="card p-5">
            <p className="text-sm font-semibold">Taken per kolom</p>
            <p className="mb-3 text-xs text-text-faint">waar het werk nu staat</p>
            {/* Een ring in plaats van staafjes: bij een verdeling wil je zowel
                de verhouding als het totaal zien, en dat staat hier allebei. */}
            <Ring
              data={overzicht.taken.perStatus}
              onderschrift="taken"
              leeg="Nog geen taken."
            />
          </div>

          <div className="card p-5">
            <p className="text-sm font-semibold">Afgerond, per dag</p>
            <p className="mb-3 text-xs text-text-faint">de afgelopen week</p>
            <PerDag
              data={overzicht.taken.afgerondPerDag}
              kleur="var(--ok)"
              leeg="Deze week nog niets afgerond."
            />
          </div>

          <div className="card p-5">
            <p className="text-sm font-semibold">Openstaand werk per agent</p>
            <p className="mb-3 text-xs text-text-faint">wat er nog op iemands bord ligt</p>
            <Staafjes
              data={overzicht.taken.perAgent}
              kleur="var(--warn)"
              leeg="Niemand heeft openstaand werk."
            />
          </div>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs tracking-wide text-text-faint uppercase">Je agents</p>
          <div className="grid gap-4 md:grid-cols-3">

          <div className="card p-5">
            <p className="text-sm font-semibold">Hoe druk je agents het hadden</p>
            <p className="mb-3 text-xs text-text-faint">denkbeurten deze week</p>
            <Staafjes
              data={overzicht.agents.runsPerAgent}
              kleur="var(--info)"
              leeg="Deze week nog niet aan het werk geweest."
            />
          </div>

          <div className="card p-5">
            <p className="text-sm font-semibold">Wat ze kostten</p>
            <p className="mb-3 text-xs text-text-faint">deze week, in euro</p>
            <Ring
              data={overzicht.agents.kostenPerAgent}
              midden={`€${overzicht.agents.kostenPerAgent.reduce((n, r) => n + r.waarde, 0).toFixed(2)}`}
              onderschrift="deze week"
              leeg="Nog niets uitgegeven."
            />
          </div>

          <div className="card p-5">
            <p className="text-sm font-semibold">Hoe lang ze erover doen</p>
            <p className="mb-3 text-xs text-text-faint">gemiddeld per denkbeurt</p>
            <Staafjes
              data={overzicht.agents.tijdPerAgent}
              eenheid=" s"
              kleur="var(--text-faint)"
              leeg="Nog niets gemeten."
            />
          </div>
          </div>
        </div>

          {/* Advertenties en campagnes hebben nog geen enkele rij in de database.
              Een grafiek daarvan zou een verloop tonen dat niet bestaat, dus
              zeggen we wat er ontbreekt en wat eraan te doen is. */}
        <div className="grid gap-4 md:grid-cols-2">
          {!overzicht.advertenties.gekoppeld && (
            <div className="card p-5">
              <p className="text-sm font-semibold">Advertenties</p>
              <p className="mb-3 text-xs text-text-faint">bereik, besteding, resultaat</p>
              <NogNietGekoppeld
                wat="advertentiecijfers"
                watErMoet="Meta is nog niet gekoppeld. Zolang dat niet staat komen er geen cijfers binnen en valt er niets te tonen."
              />
            </div>
          )}

          {overzicht.campagnes.aantal === 0 && (
            <div className="card p-5">
              <p className="text-sm font-semibold">Campagnes</p>
              <p className="mb-3 text-xs text-text-faint">wat er loopt</p>
              <NogNietGekoppeld
                wat="campagnes"
                watErMoet="Er staat nog geen enkele campagne geregistreerd. Vanuit een klantaanvraag wordt er hier vanzelf een."
              />
            </div>
          )}
        </div>
      </section>

      {/* ── Laatste activiteit ─────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow-rule start">Laatste activiteit</h2>
          <Link href="/activiteit" className="text-xs text-text-muted hover:text-text">
            Alles bekijken →
          </Link>
        </div>
        <div className="card divide-y divide-border">
          <ActivityList events={activiteit} emptyMessage="Nog niets gebeurd vandaag." />
        </div>
      </section>
    </div>
  );
}
