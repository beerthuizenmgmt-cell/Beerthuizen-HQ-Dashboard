import { db } from "@/lib/db";

/// Een goedgekeurde actie is pas gedaan als de taak die eruit voortkwam klaar is.
///
/// Akkoord geven maakt een taak voor de agent; de mail gaat niet vanzelf de deur
/// uit. Zonder deze stap bleef `executedAt` altijd leeg en was op de
/// goedkeuringenpagina niet te zien of een akkoord ook echt is uitgevoerd —
/// "goedgekeurd" en "verstuurd" zagen er precies hetzelfde uit. Juist daar wil
/// je dat verschil kunnen zien.
export async function markeerGoedkeuringUitgevoerd(taskId: string): Promise<void> {
  await db.approval.updateMany({
    where: { linkedTaskId: taskId, status: "approved", executedAt: null },
    data: { executedAt: new Date() },
  });
}
