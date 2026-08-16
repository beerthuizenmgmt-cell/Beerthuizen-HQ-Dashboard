import { meetingDate, runStandup } from "@/lib/standup";
import { db } from "@/lib/db";
import { hourInTimezone } from "@/lib/format";

// Vercel draait crons in UTC, dus een vaste UTC-tijd schuift twee keer per jaar
// een uur op. Daarom vuurt de cron op meerdere uren (zie vercel.json) en
// beslist deze handler of het in Amsterdam écht tijd is. Draaide het overleg
// vandaag al, dan doet een extra aanroep niets.
//
// Vercel roept dit aan met `Authorization: Bearer <CRON_SECRET>`. Handmatig
// starten kan met `?force=1` vanuit de app.

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // lokaal mag het zonder
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

async function handle(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }

  const setting = await db.setting.findUnique({ where: { key: "standup" } });
  const config = (setting?.value ?? {}) as { enabled?: boolean; time?: string };
  if (config.enabled === false) {
    return Response.json({ ok: true, skipped: "standup staat uit" });
  }

  const force = new URL(request.url).searchParams.get("force") === "1";

  if (!force) {
    const wanted = Number((config.time ?? "08:00").split(":")[0]);
    if (hourInTimezone() !== wanted) {
      return Response.json({ ok: true, skipped: "nog niet het ingestelde tijdstip" });
    }

    // Al gedraaid vandaag? Dan is dit een tweede cronvuur, niet een tweede overleg.
    const today = await db.meeting.findUnique({ where: { date: meetingDate() } });
    if (today && today.status !== "scheduled") {
      return Response.json({ ok: true, skipped: "overleg van vandaag loopt al" });
    }
  }

  const result = await runStandup();
  return Response.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
