import { z } from "zod";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/agents";
import { notify } from "@/lib/notifications";
import type { TaskStatus } from "@/generated/prisma/enums";

// Hiermee praat een agent terug. Auth is één token per agent, dat hij meekrijgt
// in de opdracht die het dashboard hem stuurt.
//
//   POST /api/agents/<id>/reply
//   Authorization: Bearer at_xxx
//   { "taskId": "...", "status": "done", "message": "wat ik gedaan heb" }
//
// Zonder taskId belandt het bericht in het DM-kanaal van de agent, zodat je het
// alsnog ziet.

const ReplySchema = z.object({
  taskId: z.string().optional(),
  status: z.string().optional(),
  message: z.string().min(1, "message mag niet leeg zijn"),
});

const ALLOWED_STATUSES: TaskStatus[] = ["in_progress", "blocked", "review", "done"];

export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/reply">) {
  const { id } = await params;

  const header = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(header.trim())?.[1];
  if (!token) {
    return Response.json({ error: "missing_auth", message: "Verwacht: Authorization: Bearer <token>" }, { status: 401 });
  }

  const agent = await db.agent.findUnique({ where: { id } });
  // Vergelijken op zowel ID als token: een geldig token van agent A mag niet
  // namens agent B praten.
  if (!agent || !agent.inboundToken || agent.inboundToken !== token) {
    return Response.json({ error: "bad_token", message: "Onbekende agent of ongeldig token" }, { status: 401 });
  }

  const parsed = ReplySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 422 });
  }
  const { taskId, status, message } = parsed.data;

  if (taskId) {
    const task = await db.task.findUnique({ where: { id: taskId } });
    if (!task) return Response.json({ error: "unknown_task" }, { status: 404 });
    if (task.agentId !== agent.id) {
      return Response.json({ error: "not_your_task", message: "Deze taak staat op naam van iemand anders" }, { status: 403 });
    }

    const nextStatus =
      status && (ALLOWED_STATUSES as string[]).includes(status) ? (status as TaskStatus) : null;

    await db.taskUpdate.create({
      data: {
        taskId: task.id,
        authorType: "agent",
        authorAgentId: agent.id,
        kind: nextStatus === "done" ? "result" : "comment",
        body: message,
      },
    });

    if (nextStatus) {
      await db.task.update({
        where: { id: task.id },
        data: {
          status: nextStatus,
          result: nextStatus === "done" ? message : task.result,
          completedAt: nextStatus === "done" ? new Date() : null,
        },
      });
    }

    await logActivity({
      agentId: agent.id,
      kind: "taak_update",
      level: nextStatus === "blocked" ? "warn" : nextStatus === "done" ? "success" : "info",
      message: `${agent.name}: ${nextStatus === "done" ? "taak afgerond" : nextStatus === "blocked" ? "loopt vast" : "update"} — ${task.title}`,
    });

    await notify({
      level: nextStatus === "blocked" ? "warn" : nextStatus === "done" ? "success" : "info",
      title:
        nextStatus === "done"
          ? `${agent.name} is klaar met "${task.title}"`
          : nextStatus === "blocked"
            ? `${agent.name} loopt vast op "${task.title}"`
            : `${agent.name} gaf een update`,
      body: message.slice(0, 200),
      link: `/taken/${task.id}`,
      agentId: agent.id,
      // Vastlopen en afronden wil je weten zonder het dashboard open te hebben.
      push: nextStatus === "blocked" || nextStatus === "done",
    });

    return Response.json({ ok: true, task: { id: task.id, status: nextStatus ?? task.status } });
  }

  // Geen taak erbij: als los bericht in het DM-kanaal van deze agent.
  const channel = await db.channel.findUnique({ where: { agentId: agent.id } });
  if (!channel) {
    return Response.json({ error: "no_channel", message: "Deze agent heeft geen gesprekskanaal" }, { status: 404 });
  }

  await db.message.create({
    data: {
      channelId: channel.id,
      fromType: "agent",
      fromAgentId: agent.id,
      body: message,
      delivery: "delivered",
    },
  });

  await db.agent.update({ where: { id: agent.id }, data: { lastActiveAt: new Date() } });

  await notify({
    title: `${agent.name} heeft iets gestuurd`,
    body: message.slice(0, 200),
    link: `/team/${channel.key}`,
    agentId: agent.id,
  });

  return Response.json({ ok: true, channel: channel.key });
}
