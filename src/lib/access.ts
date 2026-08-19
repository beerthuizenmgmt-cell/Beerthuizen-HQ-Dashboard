import "server-only";

import { redirect } from "next/navigation";
import { db } from "./db";
import { requireUser, type SessionUser } from "./auth";
import type { UserRole } from "@/generated/prisma/enums";

// Wie mag waar komen.
//
// De lijst zelf staat in access-areas.ts, zonder server-only en zonder
// next/navigation, zodat scripts en tests hem kunnen lezen. Hier blijft alleen
// wat een server nodig heeft.

export { AREAS, GROEPEN, areasFor, findArea, isBeheer, mayAccess, type Area, type Groep } from "./access-areas";

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
