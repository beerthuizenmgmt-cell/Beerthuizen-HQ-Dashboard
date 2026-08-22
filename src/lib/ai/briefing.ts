// Wat een campagne nodig heeft voordat er iemand aan begint.
//
// Hiervoor bedacht elke agent zelf wat hij miste. Fleur vroeg om doelgroep en
// budget, Mila om KPI's en trackinginformatie, Jesse om merkrichtlijnen — elk
// via een eigen weg, op een eigen moment. Enriqueo kreeg dus losse vragen uit
// negen richtingen en niemand hield bij wat er al beantwoord was.
//
// Deze lijst is de enige bron. Daan loopt hem af, vraagt wat er ontbreekt, en
// zodra het compleet is kan het team aan de slag zonder nog iets te hoeven
// vragen.
//
// Net als de functieprofielen en de werkafspraken staat dit in code en niet in
// de database: het is beleid. Het hoort vast te liggen, controleerbaar, met een
// geschiedenis.

export type BriefingVeld = {
  sleutel: string;
  /// Hoe Daan het vraagt. In gewone taal, zoals je het aan een collega vraagt —
  /// niet als formulierlabel.
  vraag: string;
  /// Waarom het nodig is. Gaat mee in de vraag als Enriqueo doorvraagt, en
  /// dwingt ons eerlijk te zijn: kun je niet uitleggen waarom je het nodig hebt,
  /// dan hoef je het niet te vragen.
  waarom: string;
  /// Wie er niet verder kan zonder. Zo weet Daan wie hij kan vrijgeven zodra
  /// het antwoord er is.
  blokkeert: string[];
  /// Zonder dit kan er niets. De rest is wenselijk maar niet fataal — daarmee
  /// kan het team alvast beginnen terwijl de rest binnenkomt.
  hard: boolean;
};

export const BRIEFINGVELDEN: BriefingVeld[] = [
  {
    sleutel: "klant_en_branche",
    vraag:
      "Wie is de klant en wat doen ze precies? Branche, wat ze aanbieden, en waarin ze verschillen van de rest.",
    waarom:
      "Bepaalt welk soort creator past. Een restaurant met een open keuken vraagt om andere makers dan een bezorgketen.",
    blokkeert: ["influencer", "research", "creative"],
    hard: true,
  },
  {
    sleutel: "regio",
    vraag:
      "Waar zit de klant en hoe ver mag een creator vandaan komen? Alleen die stad, de provincie, of maakt het niet uit?",
    waarom:
      "Bij alles waar iemand fysiek langs moet — een zaak, een winkel, een locatie — valt of staat de selectie hierop. Een creator uit Groningen komt niet elke week naar Blaricum eten.",
    blokkeert: ["influencer", "research"],
    hard: true,
  },
  {
    sleutel: "doel",
    vraag:
      "Wat moet het opleveren? Meer reserveringen of verkoop, bekendheid bij een nieuwe groep, een opening onder de aandacht — en waaraan merkt de klant dat het gelukt is?",
    waarom:
      "Bepaalt of we gaan voor bereik of voor makers met een klein maar kopend publiek, en waar we achteraf op afrekenen.",
    blokkeert: ["analytics", "influencer", "creative"],
    hard: true,
  },
  {
    sleutel: "doelgroep",
    vraag:
      "Wie moet er binnenkomen? Leeftijd, waar ze wonen, en wat ze zoeken als ze bij zo'n klant terechtkomen.",
    waarom: "Het publiek van de creator moet hierop lijken, anders bereiken we de verkeerde mensen.",
    blokkeert: ["influencer", "creative", "social"],
    hard: true,
  },
  {
    sleutel: "budget",
    vraag:
      "Wat is het totaalbudget, en is dat inclusief de vergoeding voor de creators of komt dat er nog bij?",
    waarom:
      "Bepaalt hoeveel creators en van welk niveau. Het verschil tussen wel of niet inclusief is een factor twee in wat we kunnen voorstellen.",
    blokkeert: ["influencer", "finance", "analytics"],
    hard: true,
  },
  {
    sleutel: "vergoeding",
    vraag:
      "Wat krijgt een creator: betaald, alleen een tegenprestatie zoals een diner of product, of allebei?",
    waarom:
      "Bepaalt wie überhaupt ja zegt. Makers met bereik werken zelden voor alleen een maaltijd, kleinere makers vaak wél — dat is een heel andere lijst.",
    blokkeert: ["influencer", "finance"],
    hard: true,
  },
  {
    sleutel: "periode",
    vraag: "Wanneer moet het lopen? Een vaste datum, een seizoen, of zo snel mogelijk?",
    waarom:
      "Creators zijn weken vooruit geboekt. Een campagne die over tien dagen live moet is een andere lijst dan een die in het najaar loopt.",
    blokkeert: ["operations", "influencer", "social"],
    hard: true,
  },
  {
    sleutel: "kanalen_en_deliverables",
    vraag:
      "Welke kanalen, en wat moet er per creator opgeleverd worden? Bijvoorbeeld één reel plus drie stories op Instagram.",
    waarom: "Zonder aantallen valt er geen prijs per creator te maken en dus geen voorstel.",
    blokkeert: ["influencer", "social", "finance"],
    hard: true,
  },
  {
    sleutel: "sfeer",
    vraag:
      "Wat voor stijl past bij de klant — verzorgd en strak, of juist rauw en spontaan? En zijn er merken of makers die ze mooi vinden?",
    waarom:
      "Twee creators met hetzelfde bereik kunnen totaal verschillend werk maken. Een voorbeeld zegt hier meer dan een omschrijving.",
    blokkeert: ["creative", "influencer"],
    hard: false,
  },
  {
    sleutel: "eerder",
    vraag:
      "Heeft de klant dit eerder gedaan? Wat ging goed, wat niet, en werken ze al met bepaalde makers?",
    waarom:
      "Voorkomt dat we iemand voorstellen met wie het eerder misging, of iets herhalen wat niet werkte.",
    blokkeert: ["influencer", "research"],
    hard: false,
  },
  {
    sleutel: "verboden",
    vraag:
      "Is er iets wat juist niet mag? Concurrenten waar een creator niet mee mag werken, onderwerpen, of dingen die niet in beeld mogen.",
    waarom: "Dit komt anders pas naar boven als het werk al gemaakt is.",
    blokkeert: ["creative", "influencer", "social"],
    hard: false,
  },
  {
    sleutel: "meten",
    vraag:
      "Hoe gaan we meten of het werkt? Kunnen we een kortingscode of een trackinglink gebruiken, of kijken we naar bereik en reacties?",
    waarom:
      "Zonder meetpunt kunnen we achteraf niet zeggen of het gewerkt heeft, en dan valt er ook niets te herhalen.",
    blokkeert: ["analytics"],
    hard: false,
  },
];

const PER_SLEUTEL = new Map(BRIEFINGVELDEN.map((v) => [v.sleutel, v]));

export function briefingVeld(sleutel: string): BriefingVeld | undefined {
  return PER_SLEUTEL.get(sleutel);
}

/// De lijst zoals een agent hem in zijn prompt krijgt.
export function briefingAlsPrompt(): string {
  return BRIEFINGVELDEN.map(
    (v) => `- ${v.sleutel}${v.hard ? " (onmisbaar)" : ""}: ${v.vraag} — ${v.waarom}`,
  ).join("\n");
}
