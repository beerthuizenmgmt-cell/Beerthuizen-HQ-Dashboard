// De samenwerkingsovereenkomst.
//
// De voorwaarden zijn altijd hetzelfde; alleen de afspraken verschillen per
// partij. Daarom staan de voorwaarden hier in code, als één bron, en levert
// Enriqueo alleen de bedrijfsnaam en wat er is afgesproken.
//
// Dat het in code staat en niet in de database is bewust. Dit is de tekst
// waarop het bureau zich vastlegt: die hoort met een geschiedenis vast te
// liggen, controleerbaar, en niet per ongeluk aanpasbaar vanuit een scherm.
//
// Let op: dit is een sjabloon dat het bureau zelf hanteert, geen juridisch
// advies. Wijzigt er iets aan de voorwaarden, dan hoort daar een jurist naar te
// kijken voordat het hier verandert.

export type Voorwaarde = {
  kop: string;
  tekst: string;
};

export const VOORWAARDEN: Voorwaarde[] = [
  {
    kop: "Wat wij doen",
    tekst:
      "Beerthuizen Management verzorgt de opzet, selectie, coördinatie en oplevering van de samenwerking zoals hieronder beschreven. Wij treden op als tussenpersoon tussen opdrachtgever en de betrokken creators, en zijn verantwoordelijk voor de aansturing en bewaking van de afgesproken werkzaamheden.",
  },
  {
    kop: "Wat wij van u nodig hebben",
    tekst:
      "Opdrachtgever levert tijdig aan wat nodig is om te kunnen starten: merkinformatie, richtlijnen, beeldmateriaal en de contactpersoon die beslissingen neemt. Vertraging in aanlevering verschuift de opleverdatum met dezelfde termijn.",
  },
  {
    kop: "Betaling",
    tekst:
      "Facturatie vindt plaats zoals bij de afspraken vermeld. Betaling geschiedt binnen veertien dagen na factuurdatum. Bij overschrijding is Beerthuizen Management gerechtigd de werkzaamheden op te schorten tot betaling is voldaan.",
  },
  {
    kop: "Gebruik van het materiaal",
    tekst:
      "Opdrachtgever verkrijgt het recht het opgeleverde materiaal te gebruiken op de kanalen en gedurende de termijn die bij de afspraken zijn vastgelegd. Gebruik daarbuiten — bijvoorbeeld in betaalde advertenties of na afloop van de termijn — vraagt om aanvullende toestemming en kan aanvullende kosten met zich meebrengen.",
  },
  {
    kop: "Wijzigingen",
    tekst:
      "Wijzigingen in de opdracht worden schriftelijk vastgelegd en kunnen gevolgen hebben voor prijs en planning. Wat niet schriftelijk is vastgelegd, maakt geen deel uit van deze overeenkomst.",
  },
  {
    kop: "Annulering",
    tekst:
      "Bij annulering door opdrachtgever worden de tot dat moment gemaakte kosten en reeds aangegane verplichtingen richting creators in rekening gebracht. Annulering binnen zeven dagen voor de afgesproken startdatum geeft recht op facturatie van vijftig procent van het overeengekomen bedrag.",
  },
  {
    kop: "Vertrouwelijkheid",
    tekst:
      "Beide partijen gaan vertrouwelijk om met informatie die zij van elkaar ontvangen en delen deze niet met derden, behalve voor zover nodig voor de uitvoering van deze samenwerking.",
  },
  {
    kop: "Aansprakelijkheid",
    tekst:
      "Beerthuizen Management spant zich in voor een zorgvuldige uitvoering, maar geeft geen garantie op specifieke resultaten zoals bereik, verkoop of volgersgroei. Aansprakelijkheid is beperkt tot het bedrag dat voor de betreffende opdracht is gefactureerd.",
  },
  {
    kop: "Toepasselijk recht",
    tekst:
      "Op deze overeenkomst is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter in het arrondissement waar Beerthuizen Management is gevestigd.",
  },
];

/// De vaste gegevens van het bureau. Staan hier zodat ze op elk document
/// hetzelfde zijn en niet per keer worden overgetypt.
export const BUREAU = {
  naam: "Beerthuizen Management",
  plaats: "Blaricum",
  ondertekenaar: "Enriqueo Beerthuizen",
  functie: "Founder",
};

/// De volledige overeenkomst als tekst.
///
/// Eén functie die alles samenstelt, zodat het document er altijd hetzelfde
/// uitziet — ongeacht of een agent het maakt of het scherm het toont.
export function stelOvereenkomstOp(input: {
  bedrijf: string;
  contactpersoon?: string | null;
  afspraken: string[];
  datum: Date;
}): string {
  const datum = input.datum.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return [
    `SAMENWERKINGSOVEREENKOMST`,
    ``,
    `tussen`,
    ``,
    `${BUREAU.naam}, gevestigd te ${BUREAU.plaats}, hierna: "wij"`,
    ``,
    `en`,
    ``,
    `${input.bedrijf}${input.contactpersoon ? `, vertegenwoordigd door ${input.contactpersoon}` : ""}, hierna: "opdrachtgever"`,
    ``,
    `Opgesteld te ${BUREAU.plaats}, ${datum}.`,
    ``,
    `## Wat wij hebben afgesproken`,
    ``,
    // De afspraken staan bovenaan en niet achteraan. Dit is het deel dat per
    // partij verschilt en waar het gesprek over ging; de voorwaarden eronder
    // zijn elke keer dezelfde en leest niemand opnieuw.
    ...input.afspraken.map((a, i) => `${i + 1}. ${a}`),
    ``,
    `## Voorwaarden`,
    ``,
    ...VOORWAARDEN.flatMap((v) => [`**${v.kop}**`, v.tekst, ``]),
    `## Ondertekening`,
    ``,
    `Namens ${BUREAU.naam}:`,
    ``,
    `${BUREAU.ondertekenaar}`,
    `${BUREAU.functie}`,
    ``,
    ``,
    `Namens ${input.bedrijf}:`,
    ``,
    `Naam:`,
    ``,
    `Datum:`,
    ``,
    `Handtekening:`,
  ].join("\n");
}
