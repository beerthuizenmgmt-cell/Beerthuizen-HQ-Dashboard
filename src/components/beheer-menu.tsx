"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { NavLink } from "./mobiele-nav";

// Beheer zit achter het tandwiel, niet in het menu.
//
// Opbouw, Tools, Monitoring, AI Finance, Proefdraaien, Testscenario's en
// Instellingen zijn geen werk. Ze stonden tussen de schermen waar je dagelijks
// heen gaat en maakten die lijst een derde langer, terwijl je er hooguit een
// paar keer per maand komt.

export function BeheerMenu({ links }: { links: NavLink[] }) {
  const pad = usePathname();
  const [open, setOpen] = useState(false);
  const doos = useRef<HTMLDivElement>(null);

  const actief = (doel: string) => pad === doel || pad.startsWith(`${doel}/`);
  const ergensActief = links.some((l) => actief(l.path));

  // Klikken buiten het menu sluit het, en Escape ook. Zonder dit blijft het
  // openstaan zodra je iets anders aanklikt en dekt het de pagina af.
  useEffect(() => {
    if (!open) return;

    const buiten = (event: MouseEvent) => {
      if (doos.current && !doos.current.contains(event.target as Node)) setOpen(false);
    };
    const toets = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", buiten);
    document.addEventListener("keydown", toets);
    return () => {
      document.removeEventListener("mousedown", buiten);
      document.removeEventListener("keydown", toets);
    };
  }, [open]);

  if (links.length === 0) return null;

  return (
    <div ref={doos} className="relative">
      <button
        type="button"
        onClick={() => setOpen((aan) => !aan)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
          ergensActief || open ? "bg-surface-hover text-text" : "text-text-muted hover:bg-surface-hover"
        }`}
      >
        <span className={`w-4 shrink-0 text-center ${open ? "rotate-90 transition-transform" : "transition-transform"}`}>
          ⚙
        </span>
        <span className="min-w-0 flex-1 text-left">Beheer</span>
        <span className="text-xs text-text-faint">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        // Omhoog uitklappen: het tandwiel staat onderin de balk, dus naar
        // beneden zou het buiten beeld vallen.
        <div
          role="menu"
          // Een uitklapmenu zweeft boven de pagina, dus het heeft een eigen
          // rand nodig om zich van de inhoud eronder los te maken. Wel de
          // kaartvorm, met een zwaardere schaduw omdat hij verder van het vlak
          // af staat dan een gewone kaart.
          className="card absolute bottom-full left-0 z-50 mb-1 w-56 overflow-hidden py-1 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.85)]"
        >
          {links.map((link) => (
            <Link
              key={link.path}
              href={link.path}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                actief(link.path) ? "bg-accent-soft text-accent" : "text-text-muted hover:bg-surface-hover"
              }`}
            >
              <span className="w-4 shrink-0 text-center text-text-faint">{link.icon}</span>
              <span className="min-w-0 flex-1 truncate">{link.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
