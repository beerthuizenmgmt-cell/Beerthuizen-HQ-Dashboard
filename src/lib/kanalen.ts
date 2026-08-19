// Waar hoort wat.
//
// De drie teamkanalen bestonden wel, maar nergens stond wanneer je welk kanaal
// kiest. Het gereedschap noemde alleen de namen, dus koos een agent maar wat:
// hetzelfde Nike-testplan belandde zowel in #campagnes als in #resultaten, en
// een gesprek over een campagnehook stond in #algemeen. Dan zijn het geen drie
// kanalen maar één lange lijst in drie stukken.
//
// Deze omschrijvingen staan in code en niet in de database, net als de
// functieprofielen en de werkafspraken: het is een afspraak over hoe er
// gewerkt wordt, en die hoort vast te liggen. Het gereedschap, de prompt en het
// scherm putten er alle drie uit, zodat ze niet uit elkaar kunnen lopen.

export type KanaalSleutel = "algemeen" | "campagnes" | "resultaten";

export type Kanaal = {
  key: KanaalSleutel;
  naam: string;
  /// Eén regel onder de kop in het scherm.
  omschrijving: string;
  /// Wanneer een agent hier hoort te posten.
  wanneer: string;
  /// Wat er juist níét hoort, zodat de grens scherp is.
  nietHier: string;
};

export const KANALEN: Kanaal[] = [
  {
    key: "algemeen",
    naam: "Algemeen",
    omschrijving: "Overleg, vragen en alles wat nog geen eigen plek heeft",
    wanneer:
      "Voor overleg, vragen aan elkaar, knelpunten die niemand nog opgepakt heeft, en dingen die over het bureau zelf gaan in plaats van over één campagne.",
    nietHier: "Geen campagnestatus en geen cijfers — daar zijn eigen kanalen voor.",
  },
  {
    key: "campagnes",
    naam: "Campagnes",
    omschrijving: "Wat er speelt per lopende campagne: stand, planning, knelpunten",
    wanneer:
      "Voor de stand van een lopende campagne: wat af is, wat er nog moet, waar het vastloopt en welke beslissing er nodig is. Noem altijd om welke klant of campagne het gaat.",
    nietHier:
      "Geen losse cijfers of rapportages; die horen in resultaten. Wel de betekenis ervan voor deze campagne.",
  },
  {
    key: "resultaten",
    naam: "Resultaten",
    omschrijving: "Cijfers en wat ze betekenen: rapportages, KPI's, budget, debiteuren",
    wanneer:
      "Voor cijfers die af zijn: campagneresultaten, KPI's, bestedingen, debiteurenstand. Altijd met de periode erbij en wat het betekent — een getal zonder duiding zegt niets.",
    nietHier:
      "Geen plannen of voornemens. Een testplan dat nog moet draaien hoort in campagnes; de uitkomst ervan hier.",
  },
];

const PER_SLEUTEL = new Map(KANALEN.map((k) => [k.key, k]));

export function kanaal(key: string): Kanaal | undefined {
  return PER_SLEUTEL.get(key as KanaalSleutel);
}

/// Voor de omschrijving van het gereedschap: wanneer kies je welk kanaal.
export function kanaalkeuzeAlsPrompt(): string {
  return KANALEN.map((k) => `- ${k.key}: ${k.wanneer} ${k.nietHier}`).join("\n");
}
