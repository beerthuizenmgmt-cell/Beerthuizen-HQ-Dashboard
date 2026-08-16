import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export default async function TeamIndexPage() {
  await requireUser();

  const first = await db.channel.findFirst({
    where: { kind: "team" },
    orderBy: { sortOrder: "asc" },
    select: { key: true },
  });

  redirect(first ? `/team/${first.key}` : "/hq");
}
