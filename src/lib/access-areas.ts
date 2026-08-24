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
  /// Waar dit scherm bij hoort in het menu. Eenentwintig losse items zijn op
  /// een telefoon onvindbaar; gegroepeerd zijn het er zes.
  groep?: Groep;
  /// Onder de secties in plaats van erboven. Voor je inbox: daar ga je
  /// dagelijks heen, en de badge moet zichtbaar zijn zonder een sectie open
  /// te klappen.
  onderaan?: boolean;
};

export type Groep = "werk" | "klanten" | "team" | "archief" | "systeem";

/// De secties in de zijbalk. "systeem" staat hier bewust niet tussen: dat is
/// beheer, geen werk, en zit achter het tandwiel onderin. Het stond tussen de
/// schermen waar je dagelijks heen gaat en maakte die lijst een derde langer,
/// terwijl je er hooguit een paar keer per maand komt.
export const GROEPEN: { key: Groep; label: string; icon: string }[] = [
  { key: "werk", label: "Werk", icon: "☑" },
  { key: "klanten", label: "Klanten", icon: "◈" },
  { key: "team", label: "Team", icon: "🤖" },
  { key: "archief", label: "Archief", icon: "📚" },
];

/// Hoort dit scherm achter het tandwiel in plaats van in het menu?
export function isBeheer(groep?: Groep): boolean {
  return groep === "systeem";
}

export const AREAS: Area[] = [
  { path: "/hq", label: "HQ", icon: "◆" },
  // Het brein op volledig scherm. Staat niet in het menu: je komt er vanaf HQ,
  // en het is geen werkscherm maar een blik op wat er draait.
  { path: "/brein", label: "Brein", icon: "◉", buitenMenu: true },
  { path: "/overleg", label: "Overleg", icon: "☀", groep: "werk" },
  { path: "/agenda", label: "Agenda", icon: "▦", groep: "werk" },
  { path: "/taken", label: "Taken", icon: "☑", groep: "werk" },
  { path: "/projecten", label: "Campagnes", icon: "▣", groep: "klanten" },
  { path: "/campagnes", label: "Advertenties", icon: "◈", groep: "klanten" },
  { path: "/rapportages", label: "Rapportages", icon: "▤", groep: "archief" },
  { path: "/team", label: "Teamchat", icon: "💬", groep: "team" },
  { path: "/agents", label: "Agents", icon: "◉", groep: "team" },
  { path: "/creators", label: "Creators", icon: "◐", groep: "klanten" },
  { path: "/werkwijze", label: "Werkwijze", icon: "⇄", groep: "team" },

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
  { path: "/kennis", label: "Kennis", icon: "◇", groep: "archief" },
  { path: "/activiteit", label: "Activiteit", icon: "≡", groep: "archief" },
  { path: "/meldingen", label: "Meldingen", icon: "!", onderaan: true },

  // Klanten staat bewust open voor het team: wie klantcommunicatie doet, moet
  // bij de klantgegevens kunnen. Wat er niet in zit is geld — facturen en
  // financiën blijven hieronder bij de eigenaar. Een link intrekken ook.
  { path: "/klanten", label: "Klanten", icon: "◈", groep: "klanten" },

  {
    path: "/goedkeuringen",
    label: "Goedkeuringen",
    icon: "✓",
    roles: ["owner"],
    reason: "Alleen de eigenaar beslist over externe acties en uitgaven.",
    groep: "werk",
  },
  {
    path: "/opbouw",
    label: "Opbouw",
    icon: "◱",
    roles: ["owner"],
    reason: "Hier wordt bepaald wat een agent mag; dat is aan de eigenaar.",
    groep: "systeem",
  },
  {
    path: "/facturen",
    label: "Facturen",
    icon: "€",
    roles: ["owner"],
    reason: "Financiele administratie is alleen voor de eigenaar.",
    groep: "klanten",
  },
  {
    // Het dossier van één klant. Valt onder /klanten en erft dus dezelfde
    // toegang; staat hier alleen omdat de bewakingstest elke pagina wil zien.
    path: "/klanten/[id]",
    label: "Klantdossier",
    icon: "◈",
    buitenMenu: true,
    groep: "klanten",
  },
  {
    // Verslagen van klantgesprekken. Het team moet erbij kunnen: zonder te weten
    // wat er is afgesproken kunnen ze er niet mee verder, en dat is precies
    // waarvoor ze bestaan. Er staan budgetten in, maar dat is campagne-informatie
    // en geen financiële administratie.
    path: "/gesprekken",
    label: "Gesprekken",
    icon: "❝",
    groep: "klanten",
  },
  {
    // Hier staat de naam van het bureau onder een document dat naar een klant
    // gaat. Dat is niets voor een teamlid om goed te keuren.
    path: "/samenwerkingen",
    label: "Samenwerkingen",
    icon: "✎",
    roles: ["owner"],
    reason: "Overeenkomsten worden namens de eigenaar getekend.",
    groep: "klanten",
  },
  {
    path: "/tools",
    label: "Tools",
    icon: "⚒",
    roles: ["owner"],
    reason: "Koppelingen en rechten bepalen waar agents bij kunnen.",
    groep: "systeem",
  },
  {
    path: "/monitoring",
    label: "Monitoring",
    icon: "◎",
    roles: ["owner"],
    reason: "Hier worden agents geactiveerd en dat kost geld.",
    groep: "systeem",
  },
  {
    path: "/financien",
    label: "AI Finance",
    icon: "€",
    roles: ["owner"],
    reason: "Kosten en budget zijn voor de eigenaar.",
    groep: "systeem",
  },
  {
    path: "/proefdraaien",
    label: "Proefdraaien",
    icon: "▷",
    roles: ["owner"],
    reason: "Proefopdrachten kosten geld.",
    groep: "systeem",
  },
  {
    path: "/scenarios",
    label: "Testscenario's",
    icon: "🧪",
    roles: ["owner"],
    reason: "Een scenario laat meerdere agents denken en dat kost geld.",
    groep: "systeem",
  },
  {
    path: "/instellingen",
    label: "Instellingen",
    icon: "⚙",
    roles: ["owner"],
    reason: "Hier staan de sleutels en koppelingen.",
    groep: "systeem",
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
