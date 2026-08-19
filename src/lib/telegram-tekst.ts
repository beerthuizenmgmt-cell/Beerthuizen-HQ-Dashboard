// Wat er met de tékst van een Telegram-bericht moet gebeuren voordat hij weg kan.
//
// Bewust los van telegram.ts: die module is server-only en leest de versleutelde
// bot-sleutel, dus hij is niet te testen zonder database en secrets. Dit zijn
// pure functies over tekst, zodat de auditset ze wél kan natrekken.

/// Telegram weigert alles boven deze lengte; we houden wat marge.
export const TELEGRAM_MAX = 3900;

/// Herkent de klacht van de Markdown-lezer van Telegram.
///
/// De tekst komt van een agent en gaat over echte klanten, dus er zit van alles
/// in: een sterretje, een liggend streepje in een bestandsnaam, een blokhaak om
/// een verwijzing. Struikelt de lezer daarover, dan weigert Telegram het hele
/// bericht — niet een stukje ervan, alles. Dat was de oorzaak van berichten die
/// "soms niet binnenkwamen".
export function isOpmaakfout(error: unknown): boolean {
  const tekst = error instanceof Error ? error.message : String(error);
  return /can't parse entities|can't find end|unsupported start tag|reserved and must be escaped/i.test(tekst);
}

/// Haalt de opmaaktekens weg die Telegram als opmaak leest. Liever een melding
/// zonder vetgedrukte kop dan geen melding.
export function zonderOpmaak(tekst: string): string {
  return tekst.replace(/[*_`]/g, "");
}

/// Knipt op lege regels waar het kan, en anders hard. Zo blijft een lang bericht
/// leesbaar in plaats van middenin een zin af te breken.
export function knipOp(tekst: string, max: number = TELEGRAM_MAX): string[] {
  if (tekst.length <= max) return [tekst];

  const stukken: string[] = [];
  let rest = tekst;

  while (rest.length > max) {
    const venster = rest.slice(0, max);
    const knip = Math.max(venster.lastIndexOf("\n\n"), venster.lastIndexOf("\n"));
    const tot = knip > max * 0.5 ? knip : max;
    stukken.push(rest.slice(0, tot).trimEnd());
    rest = rest.slice(tot).trimStart();
  }

  if (rest) stukken.push(rest);
  return stukken;
}
