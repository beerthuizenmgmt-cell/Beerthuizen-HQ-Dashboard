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

/// Is dit tijdstip recenter dan `withinMs`? Staat bewust buiten de componenten,
/// zodat de klok niet tijdens het renderen wordt gelezen.
export function isRecent(date: Date | null | undefined, withinMs: number): boolean {
  return date ? Date.now() - date.getTime() < withinMs : false;
}

const CATEGORY_LABELS: Record<string, string> = {
  content: "Content",
  marketing: "Marketing",
  ads: "Advertenties",
  analyse: "Analyse",
  ops: "Operations",
  research: "Research",
  bizdev: "Business development",
  other: "Overig",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}
