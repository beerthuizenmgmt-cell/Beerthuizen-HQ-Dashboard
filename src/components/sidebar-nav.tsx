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
          className="menu-item"
          data-actief={isActief(link.path) ? "ja" : "nee"}
        >
          <span className="w-4 text-center text-xs opacity-60">{link.icon}</span>
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
              className="flex w-full items-center gap-2.5 rounded px-3 py-1.5 text-left font-mono text-[10px] tracking-[0.18em] text-text-faint uppercase transition-colors hover:text-text-muted"
            >
              <span className="w-4 text-center">{groep.icon}</span>
              <span className="flex-1">{groep.label}</span>
              {/* Een driehoekje dat kantelt in plaats van een plus die in een min
                  verandert: je ziet de richting, en het springt niet van vorm. */}
              <span
                className="text-[8px] transition-transform duration-200"
                style={{ transform: isOpen ? "rotate(90deg)" : "none" }}
              >
                ▶
              </span>
            </button>

            {isOpen && (
              <div className="mt-0.5 flex flex-col gap-0.5">
                {items.map((link) => (
                  <Link
                    key={link.path}
                    href={link.path}
                    className="menu-item py-1.5 pr-3 pl-6"
                    data-actief={isActief(link.path) ? "ja" : "nee"}
                  >
                    <span className="w-4 text-center text-xs opacity-60">{link.icon}</span>
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
    </nav>
  );
}

/// Wat onderaan de balk hoort, vlak boven je account.
///
/// Bewust geen onderdeel van de nav hierboven: die groeit mee met het aantal
/// secties, en een blok dat daaraan vastzit belandt halverwege het scherm — of
/// duwt bij een korte vensterhoogte het accountblok eruit. De layout bepaalt
/// waar de onderkant is, niet de navigatie.
export function OnderaanNav({ links, unread }: { links: NavLink[]; unread: number }) {
  const pathname = usePathname();
  const items = links.filter((l) => l.onderaan);
  if (items.length === 0) return null;

  return (
    <div className="px-3 pb-2">
      {items.map((link) => {
        const actief = pathname === link.path || pathname.startsWith(`${link.path}/`);
        return (
          <Link
            key={link.path}
            href={link.path}
            className="menu-item"
            data-actief={actief ? "ja" : "nee"}
          >
            <span className="w-4 text-center text-xs opacity-60">{link.icon}</span>
            <span className="flex-1">{link.label}</span>
            {/* De badge gloeit, zoals alles wat aandacht vraagt in dit dashboard. */}
            {link.path === BADGE_PATH && unread > 0 && (
              <span
                className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white"
                style={{ boxShadow: "0 0 10px -1px var(--accent)" }}
              >
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
