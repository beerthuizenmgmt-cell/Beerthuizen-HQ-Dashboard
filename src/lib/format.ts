/// Relatieve tijd in het Nederlands — "3 min geleden" leest sneller dan een
/// tijdstempel wanneer je een overzicht scant.
export function timeAgo(date: Date | null | undefined): string {
  if (!date) return "nooit";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);

  if (seconds < 0) return "zojuist";
  if (seconds < 45) return "zojuist";
  if (seconds < 90) return "1 min geleden";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min geleden`;
  if (seconds < 7200) return "1 uur geleden";
  if (seconds < 86400) return `${Math.round(seconds / 3600)} uur geleden`;
  if (seconds < 172800) return "gisteren";
  if (seconds < 2592000) return `${Math.round(seconds / 86400)} dagen geleden`;
  return date.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

/// Is dit tijdstip recenter dan `withinMs`? Staat bewust buiten de componenten,
/// zodat de klok niet tijdens het renderen wordt gelezen.
export function isRecent(date: Date | null | undefined, withinMs: number): boolean {
  return date ? Date.now() - date.getTime() < withinMs : false;
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
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
  other: "Overig",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}
