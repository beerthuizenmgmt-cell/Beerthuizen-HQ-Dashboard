/// Alles wat een tijd of datum toont gaat hier langs. Vercel draait op UTC, dus
/// zonder expliciete tijdzone staan berichten er een uur naast en klopt de
/// datum rond middernacht niet meer.
export const TIMEZONE = "Europe/Amsterdam";

/// Relatieve tijd in het Nederlands — "3 min geleden" leest sneller dan een
/// tijdstempel wanneer je een overzicht scant.
export function timeAgo(date: Date | null | undefined): string {
  if (!date) return "nooit";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);

  if (seconds < 45) return "zojuist";
  if (seconds < 90) return "1 min geleden";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min geleden`;
  if (seconds < 7200) return "1 uur geleden";
  if (seconds < 86400) return `${Math.round(seconds / 3600)} uur geleden`;
  if (seconds < 172800) return "gisteren";
  if (seconds < 2592000) return `${Math.round(seconds / 86400)} dagen geleden`;
  return formatDate(date);
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("nl-NL", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString("nl-NL", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDayLong(date: Date): string {
  return date.toLocaleDateString("nl-NL", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/// Uur van de dag in Amsterdam — voor de begroeting op HQ.
export function hourInTimezone(date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", hour12: false }).format(date),
  );
}

/// De kalenderdag waar een tijdstip in Amsterdam op valt, als "2026-08-16".
/// Alles wat per dag gegroepeerd wordt gaat hierlangs, anders vallen taken van
/// 's avonds laat op de verkeerde dag.
export function dayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/// Van een dagsleutel terug naar een Date op middernacht UTC — hetzelfde
/// ankerpunt dat Meeting.date gebruikt.
export function fromDayKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/// De maandag van de week waar deze dag in valt.
export function startOfWeek(key: string): string {
  const date = fromDayKey(key);
  // getUTCDay: 0 = zondag. Wij beginnen op maandag.
  const shift = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - shift);
  return date.toISOString().slice(0, 10);
}

export function addDays(key: string, days: number): string {
  const date = fromDayKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatWeekday(key: string): { short: string; day: string; month: string } {
  const date = fromDayKey(key);
  return {
    short: date.toLocaleDateString("nl-NL", { timeZone: "UTC", weekday: "short" }),
    day: date.toLocaleDateString("nl-NL", { timeZone: "UTC", day: "numeric" }),
    month: date.toLocaleDateString("nl-NL", { timeZone: "UTC", month: "short" }),
  };
}

/// Is dit tijdstip recenter dan `withinMs`? Staat bewust buiten de componenten,
/// zodat de klok niet tijdens het renderen wordt gelezen.
export function isRecent(date: Date | null | undefined, withinMs: number): boolean {
  return date ? Date.now() - date.getTime() < withinMs : false;
}

/// Is deze houdbaarheidsdatum verstreken? Staat hier om dezelfde reden buiten
/// de componenten: de klok lezen tijdens het renderen mag niet.
export function isVerlopen(date: Date | null | undefined): boolean {
  return date ? date.getTime() < Date.now() : false;
}

/// Bedragen onder een cent zijn hier normaal — één agentaanroep kost al snel
/// €0,0005. Afronden op twee decimalen zou overal €0,00 tonen en de indruk
/// wekken dat er niets geregistreerd is.
export function formatEuro(value: number): string {
  const decimals = value > 0 && value < 0.01 ? 4 : 2;
  return value.toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const CATEGORY_LABELS: Record<string, string> = {
  content: "Content",
  marketing: "Marketing",
  ads: "Advertenties",
  analyse: "Analyse",
  ops: "Operations",
  research: "Research",
  bizdev: "Business development",
  finance: "Financieel",
  other: "Overig",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}
