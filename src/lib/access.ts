import "server-only";

import { redirect } from "next/navigation";
import { db } from "./db";
import { requireUser, type SessionUser } from "./auth";
import type { UserRole } from "@/generated/prisma/enums";

// Wie mag waar komen.
//
// Twee rollen, bewust simpel gehouden: de eigenaar beslist over geld, sleutels
// en alles wat naar buiten gaat; een teamlid werkt in de dagelijkse
// kantooromgeving. Eén lijst, zodat navigatie en toegangscontrole nooit uit
// elkaar kunnen lopen.

export type Area = {
  path: string;
  label: string;
  icon: string;
  /// Wie het mag zien. Leeg betekent: iedereen die is ingelogd.
  roles?: UserRole[];
  /// Waarom het beperkt is — komt in de melding als iemand er toch komt.
  reason?: string;
};

export const AREAS: Area[] = [
  { path: "/hq", label: "HQ", icon: "◆" },
  { path: "/overleg", label: "Overleg", icon: "☀" },
  { path: "/agenda", label: "Agenda", icon: "▦" },
  { path: "/taken", label: "Taken", icon: "☑" },
  { path: "/campagnes", label: "Campagnes", icon: "◈" },
  { path: "/rapportages", label: "Rapportages", icon: "▤" },
  { path: "/team", label: "Team", icon: "💬" },
  { path: "/agents", label: "Agents", icon: "◉" },
  { path: "/activiteit", label: "Activiteit", icon: "≡" },
  { path: "/meldingen", label: "Meldingen", icon: "!" },
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

/// Voor pagina's die alleen de eigenaar mag zien. Stuurt een teamlid netjes
/// terug naar HQ in plaats van een kale foutmelding te tonen.
export async function requireOwner(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "owner") redirect("/hq?geenToegang=1");
  return user;
}

// ============================================================
// Wie deed wat
// ============================================================

export async function audit(
  user: { id: string; name: string; role: UserRole },
  action: string,
  detail?: string,
  target?: { type: string; id: string },
): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action,
      detail: detail ?? null,
      targetType: target?.type ?? null,
      targetId: target?.id ?? null,
    },
  });
}
