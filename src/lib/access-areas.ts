// Wie mag waar komen.
//
// Staat los van access.ts omdat dat bestand `server-only` is en redirect uit
// next/navigation gebruikt — niet te lezen vanuit een onderhoudsscript. Hier
// staat alleen de kale afspraak, geen code die iets uitvoert, zodat de app en
// de tests uit dezelfde bron putten.
//
// Twee rollen, bewust simpel gehouden: de eigenaar beslist over geld, sleutels
// en alles wat naar buiten gaat; een teamlid werkt in de dagelijkse
// kantooromgeving. Eén lijst, zodat navigatie en toegangscontrole nooit uit
// elkaar kunnen lopen.

import type { UserRole } from "@/generated/prisma/enums";

export type Area = {
  path: string;
  label: string;
  icon: string;
  /// Wie het mag zien. Leeg betekent: iedereen die is ingelogd.
  roles?: UserRole[];
  /// Waarom het beperkt is — komt in de melding als iemand er toch komt.
  reason?: string;
  /// Onderdeel van een groter scherm, geen eigen menu-item. Wel nodig in deze
  /// lijst omdat de toegangsregel afwijkt van het scherm waar het onder valt.
  buitenMenu?: boolean;
};

export const AREAS: Area[] = [
  { path: "/hq", label: "HQ", icon: "◆" },
  { path: "/overleg", label: "Overleg", icon: "☀" },
  { path: "/agenda", label: "Agenda", icon: "▦" },
  { path: "/taken", label: "Taken", icon: "☑" },
  { path: "/projecten", label: "Projecten", icon: "▣" },
  { path: "/campagnes", label: "Campagnes", icon: "◈" },
  { path: "/rapportages", label: "Rapportages", icon: "▤" },
  { path: "/team", label: "Team", icon: "💬" },
  { path: "/agents", label: "Agents", icon: "◉" },
  { path: "/werkwijze", label: "Werkwijze", icon: "⇄" },

  // Het team bekijken mag iedereen. Bepalen wie er in het team zit en waar een
  // agent bij mag, is iets anders: daar zitten koppelingen en tokens achter.
  // Deze twee staan vóór /agents in de langste-match-volgorde en winnen dus.
  {
    path: "/agents/nieuw",
    label: "Nieuwe agent",
    icon: "+",
    roles: ["owner"],
    buitenMenu: true,
    reason: "Wie er in het team zit, bepaalt de eigenaar.",
  },
  { path: "/kennis", label: "Kennis", icon: "◇" },
  { path: "/activiteit", label: "Activiteit", icon: "≡" },
  { path: "/meldingen", label: "Meldingen", icon: "!" },

  // Klanten staat bewust open voor het team: wie klantcommunicatie doet, moet
  // bij de klantgegevens kunnen. Wat er niet in zit is geld — facturen en
  // financiën blijven hieronder bij de eigenaar. Een link intrekken ook.
  { path: "/klanten", label: "Klanten", icon: "◈" },

  {
    path: "/goedkeuringen",
    label: "Goedkeuringen",
    icon: "✓",
    roles: ["owner"],
    reason: "Alleen de eigenaar beslist over externe acties en uitgaven.",
  },
  {
    path: "/opbouw",
    label: "Opbouw",
    icon: "◱",
    roles: ["owner"],
    reason: "Hier wordt bepaald wat een agent mag; dat is aan de eigenaar.",
  },
  {
    path: "/facturen",
    label: "Facturen",
    icon: "€",
    roles: ["owner"],
    reason: "Financiele administratie is alleen voor de eigenaar.",
  },
  {
    path: "/tools",
    label: "Tools",
    icon: "⚒",
    roles: ["owner"],
    reason: "Koppelingen en rechten bepalen waar agents bij kunnen.",
  },
  {
    path: "/monitoring",
    label: "Monitoring",
    icon: "◎",
    roles: ["owner"],
    reason: "Hier worden agents geactiveerd en dat kost geld.",
  },
  {
    path: "/financien",
    label: "AI Finance",
    icon: "€",
    roles: ["owner"],
    reason: "Kosten en budget zijn voor de eigenaar.",
  },
  {
    path: "/proefdraaien",
    label: "Proefdraaien",
    icon: "▷",
    roles: ["owner"],
    reason: "Proefopdrachten kosten geld.",
  },
  {
    path: "/instellingen",
    label: "Instellingen",
    icon: "⚙",
    roles: ["owner"],
    reason: "Hier staan de sleutels en koppelingen.",
  },
];

export function areasFor(role: UserRole): Area[] {
  return AREAS.filter((area) => !area.roles || area.roles.includes(role));
}

export function findArea(path: string): Area | undefined {
  // Langste match wint, zodat /agents/123 bij /agents hoort.
  return [...AREAS]
    .sort((a, b) => b.path.length - a.path.length)
    .find((area) => path === area.path || path.startsWith(`${area.path}/`));
}

export function mayAccess(role: UserRole, path: string): boolean {
  const area = findArea(path);
  if (!area) return true;
  return !area.roles || area.roles.includes(role);
}
