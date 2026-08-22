import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { bouwCockpit } from "@/lib/cockpit";
import { BreinCanvas } from "@/components/brein-canvas";
import { BreinCodestroom } from "@/components/brein-codestroom";
import { LogoMark } from "@/components/logo";

// Het brein op volledig scherm.
//
// Verder niets: geen menu, geen cijfers, geen kaarten. Alleen het merk
// linksboven, en dat is tegelijk de weg terug. Dit is het scherm dat je op een
// tweede monitor laat staan — je ziet in één blik wie er vuurt zonder ergens
// doorheen te hoeven kijken.
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
      {/* Het brein krijgt alle ruimte die overblijft; de strook eronder pakt
          alleen wat hij nodig heeft. */}
      <div className="relative min-h-0 flex-1">
        <BreinCanvas team={team} />
      </div>

      <BreinCodestroom team={team} />

      {/* Linksboven het merk, en dat is de deur terug. */}
      <Link
        href="/hq"
        className="absolute top-5 left-5 z-10 flex items-center gap-3 transition-opacity hover:opacity-70"
        title="Terug naar het dashboard"
      >
        <LogoMark />
        <span className="hidden font-mono text-[10px] tracking-[0.2em] text-white/40 uppercase sm:block">
          {actief > 0
            ? `${actief} van de ${team.length} ${actief === 1 ? "vuurt" : "vuren"}`
            : `${team.length} agents · in rust`}
        </span>
      </Link>
    </div>
  );
}
