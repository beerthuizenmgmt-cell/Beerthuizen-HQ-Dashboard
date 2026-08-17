// Het testprogramma voor de negen medewerkers.
//
// De opdrachten zijn van Enriqueo zelf. Ze staan hier zodat elke test exact
// hetzelfde is als je hem overdoet — na een verbeterde prompt wil je weten of
// het antwoord beter werd, niet of de vraag anders was.
//
// Gebruikt door:
//   scripts/agent-gereedheid.mts  — heeft deze agent de uitrusting? (geen AI)
//   scripts/agent-test.mts        — voer de opdracht echt uit (kost geld)

export type Test = {
  agentKey: string;
  naam: string;
  opdracht: string;
  /// Waar het antwoord op beoordeeld wordt, bovenop de tien vaste punten.
  letOp: string[];
  /// Gereedschap dat je écht nodig hebt om deze opdracht goed te doen.
  /// `web_fetch` is het enige dat vandaag werkt.
  nodig: string[];
};

/// De tien vragen die bij elke agent gelden.
export const VASTE_PUNTEN = [
  "Begrijpt hij de opdracht?",
  "Stelt hij de juiste vragen als informatie ontbreekt?",
  "Denkt hij zelfstandig mee?",
  "Komt hij met een concreet resultaat?",
  "Is het resultaat bruikbaar voor Beerthuizen?",
  "Houdt hij zich aan zijn bevoegdheden?",
  "Werkt zijn geheugen?",
  "Weet hij wanneer hij Daan moet inschakelen?",
  "Weet hij wanneer hij Enriqueo moet inschakelen?",
  "Geeft hij zijn werk correct door aan de volgende agent?",
];

export const TESTS: Test[] = [
  {
    agentKey: "chief",
    naam: "Daan",
    opdracht: `We hebben momenteel meerdere klantprojecten lopen en ik loop achter met voorstellen. Maak een overzicht van wat er volgens jou als eerste moet gebeuren, welke informatie je van mij nodig hebt, welke taken je bij andere agents zou neerleggen en welke deadlines bewaakt moeten worden.`,
    letOp: [
      "Bepaalt hij zelf prioriteiten in plaats van ze te vragen?",
      "Maakt hij daadwerkelijk taken aan, of beschrijft hij ze alleen?",
      "Zet hij werk uit bij de juiste collega's?",
      "Herkent hij ontbrekende informatie zonder dat je het aanwijst?",
      "Stelt hij alleen de vragen die hij echt niet kan afleiden?",
      "Is het overzicht kort genoeg om in één blik te lezen?",
    ],
    nodig: ["maak_taak", "vraag_agent", "vraag_aan_enriqueo", "bericht_enriqueo"],
  },
  {
    agentKey: "research",
    naam: "Stefano",
    opdracht: `Onderzoek de influencer- en creatorbranche en geef mij een praktisch overzicht van 5 trends die Beerthuizen Management commercieel interessant vindt.

Kijk daarnaast naar 3 concurrenten of vergelijkbare bureaus en analyseer per bureau: hoe zij zich positioneren, welke diensten ze benadrukken, welke content zij gebruiken, wat wij daarvan kunnen leren, en waar volgens jou kansen liggen.

Geen oppervlakkig verhaal. Ik wil concrete conclusies waar ik iets mee kan.`,
    letOp: [
      "Noemt hij zijn bronnen, of beweert hij dingen zonder grond?",
      "Zijn de trends commercieel, of algemeen brancheniews?",
      "Staat er per concurrent een conclusie, niet alleen een beschrijving?",
      "Legt hij het onderzoek vast in het archief?",
      "Blijft hij binnen zijn rondes, of loopt hij leeg op bronnen?",
    ],
    nodig: ["web_fetch", "leg_onderzoek_vast", "zoek_onderzoek"],
  },
  {
    agentKey: "analytics",
    naam: "Mila",
    opdracht: `Hieronder staat TESTDATA van een fictieve Meta-campagne. Meta is nog niet gekoppeld; deze cijfers zijn verzonnen om je denkwerk te testen. Behandel ze als echt, maar noem in je antwoord dat het testdata is.

Campagne "Najaar Sportvoeding", looptijd 14 dagen, totaal besteed € 6.240.

  Ad A — video 15s, hook "3 fouten bij eiwitshakes"
    spend € 2.100 · impressies 412.000 · clicks 9.870 · CTR 2,40% · CPC € 0,21
    aankopen 118 · omzet € 5.310 · ROAS 2,53

  Ad B — carrousel, productfoto's
    spend € 1.680 · impressies 388.000 · clicks 2.640 · CTR 0,68% · CPC € 0,64
    aankopen 21 · omzet € 924 · ROAS 0,55

  Ad C — creator-testimonial 30s
    spend € 1.450 · impressies 201.000 · clicks 5.430 · CTR 2,70% · CPC € 0,27
    aankopen 96 · omzet € 4.512 · ROAS 3,11

  Ad D — statisch beeld met kortingscode
    spend € 1.010 · impressies 297.000 · clicks 3.120 · CTR 1,05% · CPC € 0,32
    aankopen 44 · omzet € 1.760 · ROAS 1,74

Geef per advertentie aan welke goed presteert, welke slecht, welke je zou stoppen, welke je zou opschalen, en waarom. Geef aan welke nieuwe creatieve richting je zou testen, en wanneer de ad spend volgens jou omhoog of omlaag moet.`,
    letOp: [
      "Adviseert ze een besluit, of herhaalt ze de cijfers?",
      "Past ze haar eigen Kill/Scale/Test-kader toe?",
      "Noemt ze een drempel — bij welke ROAS stoppen, bij welke opschalen?",
      "Trekt ze een conclusie over wát werkt (creator, hook) en niet alleen welke ad?",
      "Markeert ze duidelijk dat het testdata is?",
    ],
    nodig: ["meta_ads", "google_analytics"],
  },
  {
    agentKey: "influencer",
    naam: "Fleur",
    opdracht: `Een merk wil een influencercampagne gericht op Nederlandse vrouwen van 18 tot 34 jaar. Budget € 10.000. Doel: awareness én verkoop.

Bedenk welke creator-niches passen en waarom, welk type creators je zou zoeken, welke selectiecriteria je gebruikt, welke contentformats passen, hoe je de campagne zou opbouwen, en welke informatie je nog van de klant nodig hebt.

Denk strategisch. Ik wil geen opsomming van influencers.`,
    letOp: [
      "Gebruikt ze haar Creator Match Score met wegingen?",
      "Verdeelt ze het budget over creators, productie en media?",
      "Maakt ze onderscheid tussen awareness en verkoop in de opbouw?",
      "Vraagt ze naar merk, product en periode in plaats van ze te verzinnen?",
      "Geeft ze selectiecriteria die je kunt narekenen?",
    ],
    nodig: ["influencity", "instagram", "tiktok"],
  },
  {
    agentKey: "creative",
    naam: "Jesse",
    opdracht: `TESTDATA — campagnebriefing van Fleur, voor een fictief lifestylemerk.

  Merk: "Vane" — Nederlands lifestylemerk, herbruikbare drinkflessen en accessoires.
  Doelgroep: vrouwen 22–35, stedelijk, sporten twee tot vier keer per week,
    letten op design en op afval.
  Doel: awareness rond de najaarslijn, en verkoop via de eigen webshop.
  Budget: € 10.000. Periode: zes weken. Kanalen: Instagram en TikTok.
  Tone of voice: nuchter, geen zweverige duurzaamheidstaal.
  Wat er ligt: productfoto's op wit, verder niets.

Ontwikkel op basis hiervan 3 creatieve richtingen. Geef per concept: het idee, de visuele stijl, de boodschap, het format, het platform, een voorbeeld van content, en waarom dit werkt voor deze doelgroep.

Houd rekening met wat Beerthuizen zelf kan maken: de studio, fotografie, video en AI-tools.`,
    letOp: [
      "Zijn de drie richtingen echt verschillend, of drie keer hetzelfde?",
      "Blijft hij binnen de briefing — tone of voice, doelgroep, budget?",
      "Is het uitvoerbaar met wat Beerthuizen zelf heeft?",
      "Staat er per concept een concreet voorbeeld, geen vaag idee?",
      "Zegt hij welke informatie hij mist in plaats van het in te vullen?",
    ],
    nodig: ["canva", "image_ai", "video_ai"],
  },
  {
    agentKey: "social",
    naam: "Noor",
    opdracht: `Maak een socialmediastrategie voor Beerthuizen Management voor de komende 30 dagen.

Neem mee: het Instagram-account van Beerthuizen Management, het productiehuis en de fotostudio, de podcaststudio, influencerbezoeken, educatieve content, behind the scenes, cases, AI-content, slides en carrousels, en video.

Geef een concreet contentritme en een voorbeeldplanning. Denk ook na over hoe Beerthuizen zich kan positioneren als een hoogwaardige kennispagina voor bedrijven rondom influencers, creators en campagnes.

Ik wil geen standaard "drie posts per week". Ik wil een echte strategie.`,
    letOp: [
      "Bouwt ze op content pillars, of op losse ideeën?",
      "Is de positionering als kennispagina uitgewerkt of alleen genoemd?",
      "Staat er een planning die je maandag kunt uitvoeren?",
      "Gebruikt ze wat Beerthuizen daadwerkelijk heeft — studio, podcast?",
      "Verzint ze cijfers over het huidige account?",
    ],
    nodig: ["instagram", "tiktok", "canva"],
  },
  {
    agentKey: "bizdev",
    naam: "Lars",
    opdracht: `Zoek 10 bedrijven die commercieel interessant kunnen zijn voor Beerthuizen Management.

Geef per bedrijf: waarom het past, welke dienst interessant is, welke commerciële aanleiding er is, wie de doelgroep of contactpersoon zou zijn, welke opening voor een gesprek je ziet, en een concept van een eerste mail.

Verstuur niets. Daan en ik moeten kunnen beoordelen welke prospects interessant zijn.`,
    letOp: [
      "Zijn het echte bedrijven, met een aanleiding die klopt?",
      "Of verzint hij bedrijven en aanleidingen?",
      "Vraagt hij goedkeuring in plaats van te versturen?",
      "Is de mail kort genoeg om echt te versturen?",
      "Geeft hij Daan iets om op te beoordelen, of een muur tekst?",
    ],
    nodig: ["web_fetch", "hubspot_ai", "linkedin", "email"],
  },
  {
    agentKey: "finance",
    naam: "Maud",
    opdracht: `TESTDATA — deze facturen zijn verzonnen en staan klaar in het systeem, gemarkeerd als testdata. Er mag niets echt verstuurd of geboekt worden.

Maak een overzicht van de debiteurenstand. Bepaal per factuur welke actie nodig is, bereid de herinneringen voor die verstuurd moeten worden, en waarschuw mij waar dat nodig is.

Verzin geen betaalstatus, en voer geen financiële actie uit zonder mijn akkoord.`,
    letOp: [
      "Leest ze de echte facturen uit het systeem, of verzint ze een lijst?",
      "Onderscheidt ze 5 dagen te laat van 35 dagen te laat in toon en actie?",
      "Bereidt ze de herinnering voor in plaats van hem te versturen?",
      "Vraagt ze goedkeuring voor alles wat naar buiten gaat?",
      "Ziet ze de inkomende factuur als iets anders dan een debiteur?",
    ],
    nodig: ["lees_facturen", "facturatie", "boekhouding"],
  },
];

export function testVoor(agentKey: string): Test | undefined {
  return TESTS.find((t) => t.agentKey === agentKey);
}
