import { meetingDate, runStandup } from "@/lib/standup";
import { db } from "@/lib/db";
import { TIMEZONE } from "@/lib/format";

// Vercel draait crons in UTC, dus een vaste UTC-tijd schuift twee keer per jaar
// een uur op. Daarom vuurt de cron op meerdere momenten (zie vercel.json) en
// beslist deze handler of het in Amsterdam écht tijd is.
//
// Twee momenten per werkdag:
//   08:00  de briefing die je kunt lezen als je vroeg wakker bent
//   09:45  de uitvraag voor de ochtendcall van 10:00
//
// Beide keren draait dezelfde uitvraag. Wie 's ochtends al geantwoord heeft
// wordt niet nog een keer lastiggevallen; wie nog niet reageerde krijgt om
// kwart voor tien een herinnering. Dat is precies het gedrag dat je wilt.

const WINDOW_MINUTES = 15;

function minutesNow(): number {
  const [hours, minutes] = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date())
    .split(":")
    .map(Number);
  return hours * 60 + minutes;
}

function toMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // lokaal mag het zonder
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

async function handle(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }

  const setting = await db.setting.findUnique({ where: { key: "standup" } });
  const config = (setting?.value ?? {}) as {
    enabled?: boolean;
    time?: string;
    callPrepTime?: string;
  };

  if (config.enabled === false) {
    return Response.json({ ok: true, skipped: "overleg staat uit" });
  }

  const params = new URL(request.url).searchParams;
  const force = params.get("force") === "1";

  // Op het Hobby-plan mag er maar één cron per dag draaien, en die kan door de
  // zomertijd op een ander lokaal uur vallen dan ingesteld. In die stand kijken
  // we daarom niet naar de klok maar naar de vraag: is het overleg van vandaag
  // al begonnen? Zo niet, dan nu. Met Pro kan het weer op de minuut.
  if (params.get("daily") === "1" && !force) {
    const today = await db.meeting.findUnique({ where: { date: meetingDate() } });
    if (today && today.status !== "scheduled") {
      return Response.json({ ok: true, skipped: "overleg van vandaag liep al" });
    }
    const result = await runStandup();
    return Response.json({ ok: true, mode: "daily", ...result });
  }

  if (!force) {
    const now = minutesNow();
    const slots = [
      { name: "briefing", at: toMinutes(config.time ?? "08:00") },
      { name: "call-voorbereiding", at: toMinutes(config.callPrepTime ?? "09:45") },
    ].filter((slot): slot is { name: string; at: number } => slot.at !== null);

    // Binnen een kwartier ná een ingesteld tijdstip telt als "nu".
    const matched = slots.find((slot) => now >= slot.at && now < slot.at + WINDOW_MINUTES);
    if (!matched) {
      return Response.json({ ok: true, skipped: "buiten de ingestelde tijdstippen" });
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
