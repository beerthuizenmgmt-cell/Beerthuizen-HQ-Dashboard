import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { bouwCockpit } from "@/lib/cockpit";
import { BreinCanvas } from "@/components/brein-canvas";
import { BreinCodestroom } from "@/components/brein-codestroom";
import { Logo } from "@/components/logo";

// Het brein op volledig scherm.
//
// Verder niets: geen menu, geen cijfers, geen kaarten. Alleen het merk
// linksboven — en dat is tegelijk de weg terug — en rechts wie er in het brein
// zit. Dit is het scherm dat je op een tweede monitor laat staan: je ziet in
// één blik wie er vuurt zonder ergens doorheen te hoeven kijken.
//
// Bewust buiten de app-schil en niet als vlak eroverheen. Legde je het over de
// zijbalk heen, dan staat die er nog steeds: onzichtbaar, maar wel bereikbaar
// met de tabtoets. Dan spring je vanaf een leeg scherm ineens in een menu dat je
// niet ziet.

export const dynamic = "force-dynamic";

export default async function BreinPage() {
  await requireUser();
  const { team } = await bouwCockpit();

  const actief = team.filter((l) => l.bezig).length;

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-[#05060a]">
      {/* Het brein vult de volle breedte en de lijst ligt eroverheen.

          Stond de lijst als eigen kolom ernaast, dan is het brein wel netjes
          gecentreerd in de ruimte die overblijft — maar die ruimte is smaller
          dan het scherm, dus zat het honderdachtentwintig pixels links van het
          midden. En dat is wat je ziet. */}
      <div className="relative min-h-0 flex-1">
        {/* 0,60 en niet hoger: nagerekend loopt de massa bij 0,62 met de
            ademhaling erbij twee pixels buiten de onderkant, en dan knip je de
            onderste zwerm af. */}
        <BreinCanvas team={team} schaalFactor={0.6} />

        {/* Wie er in het brein zit. Een naam die over een zwerm heen ligt lees
            je in één oogopslag niet terug; deze lijst is de leesbare versie van
            hetzelfde beeld. */}
        <aside className="absolute top-1/2 right-0 hidden w-56 -translate-y-1/2 p-6 lg:block xl:w-64">
          <p className="mb-4 font-mono text-[10px] tracking-[0.22em] text-white/35 uppercase">
            Agents
          </p>

          <ul className="space-y-2">
            {team.map((lid) => {
              const kleur = lid.color ?? "#6366f1";
              const slaapt = lid.stand === "op pauze";
              return (
                <li key={lid.id}>
                  <Link
                    href={`/team/dm-${lid.sleutel}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/5"
                    style={{ opacity: slaapt ? 0.4 : 1 }}
                  >
                    {/* Het bolletje is de kleur van zijn zwerm; zo koppel je de
                        lijst aan het beeld ernaast. Wie vuurt, gloeit. */}
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        background: kleur,
                        boxShadow: lid.bezig ? `0 0 10px 1px ${kleur}` : "none",
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-sm text-white/90">
                        {lid.naam}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-white/35">
                        {lid.rol}
                      </span>
                    </span>
                    {lid.bezig && (
                      <span
                        className="shrink-0 font-mono text-[10px] tracking-wider uppercase"
                        style={{ color: kleur }}
                      >
                        actief
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      <BreinCodestroom team={team} groot />

      {/* Linksboven het merk, en dat is de deur terug. */}
      <Link
        href="/hq"
        className="absolute top-6 left-8 z-10 flex flex-col gap-1.5 transition-opacity hover:opacity-70"
        title="Terug naar het dashboard"
      >
        <Logo />
        <span className="font-mono text-[10px] tracking-[0.2em] text-white/35 uppercase">
          {actief > 0
            ? `${actief} van de ${team.length} ${actief === 1 ? "vuurt" : "vuren"}`
            : `${team.length} agents · in rust`}
        </span>
      </Link>
    </div>
  );
}
