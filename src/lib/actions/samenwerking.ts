"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/access";

// Een overeenkomst goedkeuren of als verstuurd markeren.
//
// Alleen de eigenaar: hier staat zijn naam onder, en of iets naar een klant gaat
// is geen beslissing voor een teamlid.
//
// Versturen doen we niet automatisch. De knop legt alleen vast dát jij hem hebt
// verstuurd, zodat je later kunt terugzien wat er wanneer de deur uit ging.

export async function keurSamenwerkingGoed(id: string) {
  await requireOwner();
  await db.samenwerking.updateMany({
    where: { id, status: "concept" },
    data: { status: "goedgekeurd", goedgekeurdOp: new Date() },
  });
  revalidatePath(`/samenwerkingen/${id}`);
  revalidatePath("/samenwerkingen");
}

export async function markeerSamenwerkingVerstuurd(id: string) {
  await requireOwner();
  await db.samenwerking.updateMany({
    where: { id, status: "goedgekeurd" },
    data: { status: "verstuurd", verstuurdOp: new Date() },
  });
  revalidatePath(`/samenwerkingen/${id}`);
  revalidatePath("/samenwerkingen");
}
