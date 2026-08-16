import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateInstance, ingestError } from "@/lib/ingest";
import { tooManyRequests } from "@/lib/rate-limit";

const HeartbeatSchema = z.object({
  instance_id: z.string().optional(),
  timestamp: z.string().optional(),
  reader_version: z.string().optional(),
  uptime_seconds: z.number().int().nonnegative().optional(),
});

export async function POST(request: Request) {
  const auth = await authenticateInstance(request);
  if ("limited" in auth) return tooManyRequests(auth.limited);
  if ("error" in auth) return ingestError(auth.error);

  const parsed = HeartbeatSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 422 });
  }

  await db.instance.update({
    where: { id: auth.instance.id },
    data: {
      lastHeartbeatAt: new Date(),
      readerVersion: parsed.data.reader_version ?? auth.instance.readerVersion,
      uptimeSeconds: parsed.data.uptime_seconds ?? auth.instance.uptimeSeconds,
    },
  });

  return Response.json({ ok: true });
}
