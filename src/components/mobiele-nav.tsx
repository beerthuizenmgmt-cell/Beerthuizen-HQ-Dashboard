"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// Navigatie op een telefoon.
//
// De zijbalk telt eenentwintig items. Op een laptop is dat een lijst, op een
// telefoon is het een zoektocht. Hier staan vier vaste tabs onderaan waar je
// duim bij kan, plus "Meer" met alles gegroepeerd.
//
// De schermen zijn niet weggehaald, alleen geordend: wat je dagelijks nodig
// hebt staat onder je duim, de rest is één tik verder.

export type NavLink = { path: string; label: string; icon: string; groep?: string };

const VAST = [
  { path: "/hq", label: "HQ", icon: "◆" },
  { path: "/taken", label: "Werk", icon: "☑" },
  { path: "/projecten", label: "Campagnes", icon: "▣" },
];

const GROEPLABELS: Record<string, string> = {
  werk: "Werk",
  klanten: "Klanten en campagnes",
  geld: "Geld",
  team: "Team",
  systeem: "Systeem",
};

export function MobieleNav({ links, unread }: { links: NavLink[]; unread: number }) {
  const pad = usePathname();
  const [open, setOpen] = useState(false);

  const actief = (doel: string) => pad === doel || pad.startsWith(`${doel}/`);
  const beschikbaar = (doel: string) => links.some((l) => l.path === doel);

  const gegroepeerd = Object.entries(
    links.reduce<Record<string, NavLink[]>>((acc, link) => {
      const groep = link.groep ?? "systeem";
      (acc[groep] ??= []).push(link);
      return acc;
    }, {}),
  );

  return (
    <>
      {/* Alles, gegroepeerd. Schuift van onder in beeld zodat het bij je duim
          begint in plaats van bovenaan het scherm. */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-label="Alle schermen">
          <button
            type="button"
            aria-label="Sluiten"
            className="absolute inset-0 bg-bg/80"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-border bg-bg-elevated p-5 pb-24">
            {gegroepeerd.map(([groep, items]) => (
              <section key={groep} className="mb-5">
                <p className="eyebrow mb-2">{GROEPLABELS[groep] ?? groep}</p>
                <div className="grid grid-cols-2 gap-2">
                  {items.map((link) => (
                    <Link
                      key={link.path}
                      href={link.path}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-2.5 rounded-lg border px-3 py-3 text-sm ${
                        actief(link.path)
                          ? "border-accent/50 bg-accent-soft text-accent"
                          : "border-border hover:bg-surface-hover"
                      }`}
                    >
                      <span className="w-4 shrink-0 text-center text-text-faint">{link.icon}</span>
                      <span className="min-w-0 flex-1 truncate">{link.label}</span>
                      {link.path === "/meldingen" && unread > 0 && (
                        <span className="chip shrink-0 border-accent/50 text-xs text-accent">{unread}</span>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {/* De balk zelf. Vast onderaan, want daar is je duim. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-bg-elevated md:hidden">
        {VAST.filter((tab) => beschikbaar(tab.path)).map((tab) => (
          <Link
            key={tab.path}
            href={tab.path}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
              actief(tab.path) ? "text-accent" : "text-text-muted"
            }`}
          >
            <span className="text-base leading-none">{tab.icon}</span>
            {tab.label}
          </Link>
        ))}

        <Link
          href="/meldingen"
          className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
            actief("/meldingen") ? "text-accent" : "text-text-muted"
          }`}
        >
          <span className="text-base leading-none">!</span>
          Meldingen
          {unread > 0 && (
            <span className="absolute right-1/2 top-1.5 translate-x-4 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
            open ? "text-accent" : "text-text-muted"
          }`}
        >
          <span className="text-base leading-none">{open ? "×" : "☰"}</span>
          Meer
        </button>
      </nav>
    </>
  );
}
