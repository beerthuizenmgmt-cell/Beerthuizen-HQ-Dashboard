"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// De zijbalk, uitklapbaar per onderwerp.
//
// Eenentwintig items onder elkaar is een lijst waarin je zoekt in plaats van
// kiest. Gegroepeerd zijn het vijf secties plus HQ, en zie je in één oogopslag
// waar iets hoort te staan.
//
// Twee dingen die het bruikbaar houden:
//
//   - De sectie waar je nu in zit staat altijd open. Je verliest je plek niet
//     door te navigeren.
//   - Meldingen staat los onder de secties. Het is je inbox: daar ga je
//     dagelijks heen, en de badge moet zichtbaar zijn zonder dat je eerst
//     een sectie moet openklappen.
//
// Welke secties open staan wordt onthouden, zodat de balk er na een reload
// uitziet zoals je hem achterliet.

export type NavLink = { path: string; label: string; icon: string; groep?: string; onderaan?: boolean };

export type NavGroep = { key: string; label: string; icon: string };

const BADGE_PATH = "/meldingen";
const OPSLAG = "hq-open-secties";

export function SidebarNav({
  links,
  groepen,
  unread,
}: {
  links: NavLink[];
  groepen: NavGroep[];
  unread: number;
}) {
  const pathname = usePathname();
  const isActief = (pad: string) => pathname === pad || pathname.startsWith(`${pad}/`);

  const bovenaan = links.filter((l) => !l.groep && !l.onderaan);
  const onderaan = links.filter((l) => l.onderaan);
  const inGroep = (key: string) => links.filter((l) => l.groep === key);

  /// De sectie waar je nu in zit. Die staat altijd open, ongeacht wat er is
  /// opgeslagen — anders klap je hem dicht en ben je jezelf kwijt.
  const actieveGroep = links.find((l) => l.groep && isActief(l.path))?.groep;

  const [open, setOpen] = useState<string[]>([]);
  const [geladen, setGeladen] = useState(false);

  useEffect(() => {
    try {
      const bewaard = localStorage.getItem(OPSLAG);
      setOpen(bewaard ? (JSON.parse(bewaard) as string[]) : ["werk"]);
    } catch {
      setOpen(["werk"]);
    }
    setGeladen(true);
  }, []);

  function wissel(key: string) {
    const nieuw = open.includes(key) ? open.filter((k) => k !== key) : [...open, key];
    setOpen(nieuw);
    try {
      localStorage.setItem(OPSLAG, JSON.stringify(nieuw));
    } catch {
      // Werkt de opslag niet, dan werkt de balk gewoon zonder geheugen.
    }
  }

  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {/* HQ hoort in geen enkele sectie: het is de plek waar alles samenkomt. */}
      {bovenaan.map((link) => (
        <Link
          key={link.path}
          href={link.path}
          className={`flex items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors ${
            isActief(link.path)
              ? "bg-surface font-semibold text-text"
              : "text-text-muted hover:bg-surface-hover hover:text-text"
          }`}
        >
          <span className="w-4 text-center text-xs text-text-faint">{link.icon}</span>
          <span className="flex-1">{link.label}</span>
        </Link>
      ))}

      {groepen.map((groep) => {
        const items = inGroep(groep.key);
        if (items.length === 0) return null;

        // Vóór het laden uit localStorage alleen de actieve sectie open: dat
        // voorkomt dat de balk zichtbaar openklapt zodra de pagina hydrateert.
        const isOpen = geladen ? open.includes(groep.key) || actieveGroep === groep.key : actieveGroep === groep.key;

        return (
          <div key={groep.key} className="mt-1">
            <button
              type="button"
              onClick={() => wissel(groep.key)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-2.5 rounded px-3 py-1.5 text-left text-xs font-semibold tracking-wide text-text-faint uppercase transition-colors hover:text-text-muted"
            >
              <span className="w-4 text-center">{groep.icon}</span>
              <span className="flex-1">{groep.label}</span>
              <span className="text-[10px] text-text-faint">{isOpen ? "−" : "+"}</span>
            </button>

            {isOpen && (
              <div className="mt-0.5 flex flex-col gap-0.5">
                {items.map((link) => (
                  <Link
                    key={link.path}
                    href={link.path}
                    className={`flex items-center gap-2.5 rounded py-1.5 pr-3 pl-6 text-sm transition-colors ${
                      isActief(link.path)
                        ? "bg-surface font-semibold text-text"
                        : "text-text-muted hover:bg-surface-hover hover:text-text"
                    }`}
                  >
                    <span className="w-4 text-center text-xs text-text-faint">{link.icon}</span>
                    <span className="flex-1">{link.label}</span>
                    {link.path === BADGE_PATH && unread > 0 && (
                      <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Je inbox staat onder de secties, niet erin: je gaat er dagelijks
          heen en de badge moet zichtbaar zijn zonder iets open te klappen. */}
      {onderaan.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          {onderaan.map((link) => (
            <Link
              key={link.path}
              href={link.path}
              className={`flex items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors ${
                isActief(link.path)
                  ? "bg-surface font-semibold text-text"
                  : "text-text-muted hover:bg-surface-hover hover:text-text"
              }`}
            >
              <span className="w-4 text-center text-xs text-text-faint">{link.icon}</span>
              <span className="flex-1">{link.label}</span>
              {link.path === BADGE_PATH && unread > 0 && (
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
