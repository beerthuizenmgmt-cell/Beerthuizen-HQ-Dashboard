// Welk gereedschap echt gebouwd is.
//
// Staat los van toolkit.ts omdat dat bestand `server-only` is en dus niet
// vanuit een onderhoudsscript te lezen valt. Hier staat alleen de kale
// waarheid — geen code die iets uitvoert — zodat zowel de app als de scripts
// uit dezelfde bron putten.
//
// Zet je een koppeling af in toolkit.ts, dan hoort hij ook hier weg. De test
// in toolkit.ts bewaakt dat ze gelijk blijven.

export const GEBOUWD_GEREEDSCHAP = ["web_fetch", "custom_webhook"] as const;

export function isGebouwd(toolKey: string): boolean {
  return (GEBOUWD_GEREEDSCHAP as readonly string[]).includes(toolKey);
}
