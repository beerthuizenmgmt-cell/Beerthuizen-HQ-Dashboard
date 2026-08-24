// Hoe je een creator beoordeelt.
//
// Dit is de werkwijze van het vak, niet iets wat wij bedacht hebben. De cijfers
// en signalen hieronder komen uit hoe bureaus creators toetsen: engagement,
// echtheid van het publiek, en de patronen die verraden dat bereik gekocht is.
//
// Waarom dit in code staat en niet in een prompt: het is een norm waar het
// bureau zich aan houdt en waarop een selectie te controleren valt. Een agent
// die zegt "deze past goed" moet dat langs deze lat kunnen leggen, en jij moet
// kunnen nakijken welke lat dat was.
//
// Let op: dit zijn richtlijnen, geen wetten. Een creator die op één punt afwijkt
// kan alsnog de juiste zijn — maar dan hoort er een reden bij.

export type Signaal = {
  wat: string;
  betekenis: string;
};

/// Wat een gezond profiel eruit laat zien.
export const MAATSTAVEN = [
  {
    kop: "Engagement",
    norm: "Tussen de 3 en 8 procent is gezond voor een kleinere creator.",
    uitleg:
      "Onder de 1 procent duidt op gekochte volgers. Boven de 15 procent duidt meestal op een engagementgroep waarin mensen elkaars berichten opkloppen — dat is even onbetrouwbaar als te weinig.",
  },
  {
    kop: "Verhouding reacties en likes",
    norm: "Er horen echte reacties onder te staan, niet alleen duimpjes.",
    uitleg:
      "Nul reacties bij duizenden likes is een alarmsignaal. Kijk ook waaróver ze gaan: echte reacties zijn specifiek en gaan over de post, niet 'nice!' of emoji van steeds dezelfde accounts.",
  },
  {
    kop: "Waar het publiek zit",
    norm: "Het publiek moet overlappen met de doelgroep van de klant.",
    uitleg:
      "Een maker met bereik in het buitenland is waardeloos voor een restaurant in Utrecht. Dit is de duurste fout die je kunt maken, want hij valt pas op als de campagne al loopt.",
  },
  {
    kop: "Hoe de groei liep",
    norm: "Geleidelijk gegroeid, zonder sprongen.",
    uitleg:
      "Duizenden volgers erbij op één dag betekent gekocht of een uitschieter die niets zegt over de rest. Vraag om het mediakit als je het niet zelf kunt zien.",
  },
  {
    kop: "Wat hij eerder deed",
    norm: "Eerdere samenwerkingen die passen, en hoe zijn publiek daarop reageerde.",
    uitleg:
      "Een maker die alles aanprijst wat langskomt heeft geen geloofwaardigheid meer. Kijk of het publiek bij betaalde posts net zo reageert als bij gewone.",
  },
];

/// Wat je laat afvallen. Bewust apart van de maatstaven: dit zijn geen punten
/// waarop je afweegt maar redenen om iemand niet voor te stellen.
export const ALARMSIGNALEN: Signaal[] = [
  {
    wat: "Volgers die in korte tijd hard oplopen zonder aanleiding",
    betekenis: "Gekocht bereik. Het publiek bestaat niet en klikt dus ook nergens op.",
  },
  {
    wat: "Veel volgers, bijna geen reacties",
    betekenis: "Hetzelfde: bereik op papier dat in het echt niets doet.",
  },
  {
    wat: "Dezelfde accounts reageren onder elke post, binnen een paar minuten",
    betekenis: "Een engagementgroep. De cijfers kloppen, het publiek niet.",
  },
  {
    wat: "Publiek uit landen of in talen die niets met de klant te maken hebben",
    betekenis: "Het bereik gaat langs de doelgroep heen, hoe groot het ook is.",
  },
  {
    wat: "Reacties die nergens over gaan of overduidelijk spam zijn",
    betekenis: "Het publiek is er wel, maar leest niet mee.",
  },
];

/// Wat er in een onderbouwing hoort te staan. Zonder dit is een selectie een
/// lijstje namen, en daar kan Enriqueo bij een klant niets mee.
export const ONDERBOUWING = [
  "Waarom dit bij déze klant past — niet in het algemeen, maar bij dit product en deze doelgroep",
  "Wat het publiek van deze maker gemeen heeft met de klanten die de klant zoekt",
  "Het bereik en de engagement, met bron en meetdatum",
  "Wat hij eerder deed dat hierop lijkt, en hoe dat liep",
  "Wat het ongeveer gaat kosten",
  "Waar je twijfelt — want een selectie zonder één kanttekening is niet nagekeken",
];

/// De hele werkwijze als tekst voor in de prompt.
export function selectieAlsPrompt(): string {
  return [
    "Waar je op let:",
    ...MAATSTAVEN.map((m) => `- ${m.kop}: ${m.norm} ${m.uitleg}`),
    "",
    "Redenen om iemand niet voor te stellen:",
    ...ALARMSIGNALEN.map((s) => `- ${s.wat} — ${s.betekenis}`),
    "",
    "Wat er per creator in je onderbouwing staat:",
    ...ONDERBOUWING.map((o) => `- ${o}`),
  ].join("\n");
}
