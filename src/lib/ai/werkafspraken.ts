// Wie is waar eigenaar van, en welke route loopt een opdracht.
//
// Het functieprofiel (charters.ts) zegt wat een agent kán. Dit bestand zegt
// waar hij *van is* en hoe het werk door de organisatie loopt. Zonder deze laag
// zijn negen agents negen chatvensters: iedereen kan alles een beetje, niemand
// is ergens verantwoordelijk voor, en twee agents doen hetzelfde werk zonder
// het van elkaar te weten.
//
// De regel die alles stuurt:
//
//   Iedere opdracht heeft één eigenaar, eventueel ondersteunende agents,
//   één duidelijke overdracht naar de volgende stap, en één duidelijk moment
//   waarop Enriqueo nodig is.
//
// Net als de functieprofielen staat dit in code en niet in de database: het is
// beleid. Het hoort vast te liggen, controleerbaar, met een geschiedenis.
//
// Collega's worden aangeduid met hun sleutel en niet met hun naam — namen zijn
// aanpasbaar in het dashboard en zouden hier meteen verouderen.

export type AgentKey =
  | "chief"
  | "influencer"
  | "research"
  | "analytics"
  | "creative"
  | "social"
  | "bizdev"
  | "operations"
  | "finance";

/// Waar een agent van is, en wat hij met wie uitwisselt.
export type Eigendom = {
  agentKey: AgentKey;
  /// Eén regel: waar deze agent eigenaar van is. Niet "helpt bij", maar "is van".
  eigenaarVan: string;
  /// Wat hij van collega's nodig heeft om zijn werk te kunnen doen.
  krijgtVan: { agentKey: AgentKey; wat: string }[];
  /// Wat hij aan collega's oplevert.
  levertAan: { agentKey: AgentKey | "enriqueo"; wat: string }[];
  /// Waar hij ondersteunt zonder eigenaar te zijn. Belangrijk: hij vult aan,
  /// hij neemt niet over.
  ondersteuntBij: { agentKey: AgentKey; waarmee: string }[];
};

export const EIGENDOM: Eigendom[] = [
  {
    agentKey: "chief",
    eigenaarVan: "Coördinatie, planning, kwaliteitscontrole en de lijn met Enriqueo",
    krijgtVan: [
      { agentKey: "influencer", wat: "creatorselectie, campagneopzet, resultaten" },
      { agentKey: "research", wat: "markt- en concurrentiebeeld" },
      { agentKey: "analytics", wat: "advertentieprestaties en advies" },
      { agentKey: "creative", wat: "concepten en creatieve richting" },
      { agentKey: "social", wat: "contentstrategie en planning" },
      { agentKey: "bizdev", wat: "prospects en voorbereide voorstellen" },
      { agentKey: "operations", wat: "blokkades, ontbrekende informatie, doorlooptijd" },
      { agentKey: "finance", wat: "afwijkingen, betalingsproblemen, financiële risico's" },
    ],
    levertAan: [{ agentKey: "enriqueo", wat: "het ochtendrapport, beslismomenten en waarschuwingen" }],
    ondersteuntBij: [],
  },
  {
    agentKey: "influencer",
    eigenaarVan: "Influencercampagnes van begin tot eind, en de creatorselectie",
    krijgtVan: [
      { agentKey: "chief", wat: "klantbriefing, budget, deadline, doelstelling" },
      { agentKey: "research", wat: "creator research, benchmarks, concurrentiecampagnes" },
      { agentKey: "creative", wat: "creatieve richting" },
      { agentKey: "social", wat: "contentstrategie" },
      { agentKey: "analytics", wat: "hoe eerdere creators presteerden" },
    ],
    levertAan: [
      { agentKey: "chief", wat: "shortlist met motivatie, campagneopzet, deliverables, resultaten" },
    ],
    ondersteuntBij: [
      { agentKey: "bizdev", waarmee: "de influencerpropositie in een voorstel" },
      { agentKey: "social", waarmee: "creatorcontent voor de eigen kanalen" },
    ],
  },
  {
    agentKey: "research",
    eigenaarVan: "Research en intelligence: markt, merken, creators, concurrenten, trends",
    krijgtVan: [{ agentKey: "chief", wat: "de onderzoeksvraag en waarvoor het dient" }],
    levertAan: [
      { agentKey: "influencer", wat: "creator research en benchmarks" },
      { agentKey: "analytics", wat: "advertising benchmarks en concurrentiecampagnes" },
      { agentKey: "bizdev", wat: "prospect research" },
      { agentKey: "creative", wat: "creatieve trends" },
      { agentKey: "social", wat: "wat concurrenten op social doen" },
      { agentKey: "chief", wat: "strategische informatie" },
    ],
    ondersteuntBij: [
      { agentKey: "influencer", waarmee: "creators zoeken en vergelijken" },
      { agentKey: "bizdev", waarmee: "bedrijven en aanleidingen onderzoeken" },
    ],
  },
  {
    agentKey: "analytics",
    eigenaarVan: "Advertising en analytics — en daarmee het geld dat aan advertenties opgaat",
    krijgtVan: [
      { agentKey: "chief", wat: "welke campagne en welk doel" },
      { agentKey: "research", wat: "benchmarks en wat concurrenten doen" },
      { agentKey: "influencer", wat: "welke creator bij welke advertentie hoort" },
    ],
    levertAan: [
      { agentKey: "chief", wat: "advies met een besluit erin: stoppen, opschalen, testen" },
      { agentKey: "creative", wat: "welke creatives beter en slechter werken" },
      { agentKey: "social", wat: "welke content zich leent voor advertenties" },
    ],
    ondersteuntBij: [
      { agentKey: "influencer", waarmee: "campagneresultaten doorrekenen" },
      { agentKey: "social", waarmee: "contentprestaties duiden" },
    ],
  },
  {
    agentKey: "creative",
    eigenaarVan: "Creatieve concepten: campagnes, content, hooks, scripts, formats",
    krijgtVan: [
      { agentKey: "chief", wat: "de briefing en de kaders" },
      { agentKey: "influencer", wat: "de influencercontext" },
      { agentKey: "analytics", wat: "wat presteert en wat niet" },
      { agentKey: "social", wat: "de contentstrategie" },
    ],
    levertAan: [{ agentKey: "chief", wat: "concept, creatieve richting, formats, scripts" }],
    ondersteuntBij: [
      { agentKey: "social", waarmee: "contentideeën voor de eigen kanalen" },
      { agentKey: "bizdev", waarmee: "de creatieve propositie in een voorstel" },
    ],
  },
  {
    agentKey: "social",
    eigenaarVan: "Social- en contentstrategie van Beerthuizen en van de projecten",
    krijgtVan: [
      { agentKey: "chief", wat: "planning en prioriteit" },
      { agentKey: "creative", wat: "creatieve concepten" },
      { agentKey: "analytics", wat: "contentprestaties" },
      { agentKey: "research", wat: "wat concurrenten doen" },
      { agentKey: "influencer", wat: "creatorcontent" },
    ],
    levertAan: [{ agentKey: "chief", wat: "contentstrategie, planning, contentprestaties" }],
    ondersteuntBij: [
      { agentKey: "influencer", waarmee: "contentformats binnen een campagne" },
      { agentKey: "bizdev", waarmee: "de content- en socialpropositie in een voorstel" },
    ],
  },
  {
    agentKey: "bizdev",
    eigenaarVan: "Nieuwe zakelijke kansen en de commerciële pipeline",
    krijgtVan: [
      { agentKey: "research", wat: "onderzoek naar bedrijven en aanleidingen" },
      { agentKey: "chief", wat: "prioriteiten" },
      { agentKey: "creative", wat: "de creatieve propositie" },
      { agentKey: "influencer", wat: "de influencerpropositie" },
      { agentKey: "social", wat: "de content- en socialpropositie" },
      { agentKey: "finance", wat: "financiële informatie waar dat relevant is" },
    ],
    levertAan: [{ agentKey: "chief", wat: "gekwalificeerde prospects en voorbereide voorstellen" }],
    ondersteuntBij: [],
  },
  {
    agentKey: "operations",
    eigenaarVan: "Operations en workflow: dat niemand onnodig op iemand wacht",
    krijgtVan: [{ agentKey: "chief", wat: "wat er loopt en wanneer het klaar moet zijn" }],
    levertAan: [
      { agentKey: "chief", wat: "blokkades, ontbrekende informatie, gevaar voor de doorlooptijd" },
    ],
    // Jolanda's rol is bewust ondersteunend bij iedereen: zij signaleert, zij
    // neemt niet over. Zonder die grens wordt zij een tweede coördinator naast
    // Daan en weet niemand meer wie er stuurt.
    ondersteuntBij: [
      { agentKey: "influencer", waarmee: "campagneplanning en overdrachten" },
      { agentKey: "creative", waarmee: "productieplanning" },
      { agentKey: "social", waarmee: "contentplanning" },
      { agentKey: "bizdev", waarmee: "opvolging die blijft liggen" },
    ],
  },
  {
    agentKey: "finance",
    eigenaarVan: "Financiële administratie, facturen en debiteuren",
    krijgtVan: [{ agentKey: "chief", wat: "welk project af is en gefactureerd kan worden" }],
    levertAan: [
      { agentKey: "chief", wat: "alleen afwijkingen: betalingsproblemen, risico's, beslismomenten" },
      { agentKey: "bizdev", wat: "financiële informatie waar dat voor een voorstel nodig is" },
    ],
    ondersteuntBij: [],
  },
];

// ============================================================
// De routes
// ============================================================

export type StapRol = "eigenaar" | "ondersteunt" | "controleert" | "beslist";

export type Stap = {
  wie: AgentKey | "enriqueo";
  rol: StapRol;
  wat: string;
  /// Waar de coördinator per opdracht bepaalt of deze stap nodig is. Niet elke
  /// campagne heeft advertenties, niet elk event heeft een leverancier.
  optioneel?: boolean;
};

export type Route = {
  key: string;
  naam: string;
  /// Waaraan je herkent dat déze route geldt.
  wanneer: string;
  eigenaar: AgentKey;
  stappen: Stap[];
  /// Het ene moment waarop Enriqueo nodig is. Precies één.
  enriqueoMoment: string;
  /// Wat er aan het eind ligt.
  levert: string;
};

export const ROUTES: Route[] = [
  {
    key: "campagne",
    naam: "Nieuwe influencercampagne",
    wanneer: "Een klant wil een campagne, of Enriqueo geeft een campagneopdracht",
    eigenaar: "influencer",
    stappen: [
      { wie: "chief", rol: "controleert", wat: "vertaalt de opdracht, bepaalt wie nodig is, zet taken uit" },
      { wie: "influencer", rol: "eigenaar", wat: "campagnestrategie, creatorselectie, opzet en deliverables" },
      { wie: "research", rol: "ondersteunt", wat: "creator research, benchmarks, concurrentiecampagnes" },
      { wie: "creative", rol: "ondersteunt", wat: "creatief concept binnen de briefing" },
      { wie: "social", rol: "ondersteunt", wat: "contentstrategie en formats", optioneel: true },
      { wie: "analytics", rol: "ondersteunt", wat: "advertentieplan en meetplan", optioneel: true },
      { wie: "influencer", rol: "eigenaar", wat: "verzamelt alles tot één campagnevoorstel" },
      { wie: "chief", rol: "controleert", wat: "controleert volledigheid, logica, spelling en cijfers" },
      { wie: "enriqueo", rol: "beslist", wat: "akkoord op het voorstel" },
    ],
    enriqueoMoment: "Akkoord op het definitieve campagnevoorstel, en op het budget als dat nog niet vaststaat",
    levert: "Eén campagnevoorstel: strategie, creators met motivatie, concept, deliverables, planning en begroting",
  },
  {
    key: "creatorselectie",
    naam: "Creatorselectie",
    wanneer: "Er moeten creators gekozen worden voor een campagne",
    eigenaar: "influencer",
    stappen: [
      { wie: "research", rol: "ondersteunt", wat: "levert research: bereik, publiek, eerdere samenwerkingen" },
      { wie: "influencer", rol: "eigenaar", wat: "beoordeelt merkfit, niche, doelgroepfit, contentfit en maakt de shortlist" },
      { wie: "chief", rol: "controleert", wat: "controleert of de motivatie navolgbaar is" },
      { wie: "enriqueo", rol: "beslist", wat: "akkoord voor er contact met creators wordt gelegd" },
    ],
    enriqueoMoment: "Akkoord op de shortlist, vóór enig contact met een creator",
    levert: "Shortlist met per creator een onderbouwing en een verwachte bijdrage",
  },
  {
    key: "campagneresultaten",
    naam: "Campagneresultaten verwerken",
    wanneer: "Een campagne is gelopen en creators leveren hun resultaten aan",
    eigenaar: "influencer",
    stappen: [
      { wie: "influencer", rol: "eigenaar", wat: "controleert of alles binnen is en signaleert wat ontbreekt" },
      { wie: "analytics", rol: "ondersteunt", wat: "rekent de cijfers door: bereik, engagement, CPM, CPE" },
      { wie: "social", rol: "ondersteunt", wat: "beoordeelt de content zelf" },
      { wie: "research", rol: "ondersteunt", wat: "zet het naast de benchmarks" },
      { wie: "influencer", rol: "eigenaar", wat: "stelt het campagnerapport samen" },
      { wie: "chief", rol: "controleert", wat: "controleert cijfers, conclusies en toon" },
      { wie: "enriqueo", rol: "beslist", wat: "akkoord voor het rapport naar de klant gaat" },
    ],
    enriqueoMoment: "Akkoord op het rapport, vóór het in de klantportal verschijnt",
    levert: "Campagnerapport met resultaten per creator, per contentstuk, en wat er de volgende keer anders moet",
  },
  {
    key: "advertising",
    naam: "Advertenties bijsturen",
    wanneer: "Er lopen advertenties en er is nieuwe data",
    eigenaar: "analytics",
    stappen: [
      { wie: "analytics", rol: "eigenaar", wat: "analyseert en komt met een besluit: stoppen, opschalen of testen" },
      { wie: "research", rol: "ondersteunt", wat: "levert de benchmark om tegen af te zetten", optioneel: true },
      { wie: "creative", rol: "ondersteunt", wat: "maakt de betere creative", optioneel: true },
      { wie: "social", rol: "ondersteunt", wat: "past de content aan", optioneel: true },
      { wie: "chief", rol: "controleert", wat: "bewaakt dat het advies ook wordt uitgevoerd" },
      { wie: "enriqueo", rol: "beslist", wat: "akkoord bij een budgetwijziging" },
    ],
    enriqueoMoment: "Akkoord op elke wijziging van het advertentiebudget",
    levert: "Concreet advies met een bedrag en een reden, klaar om uit te voeren",
  },
  {
    key: "sales",
    naam: "Nieuwe prospect",
    wanneer: "Er dient zich een commerciële kans aan, of er wordt actief gezocht",
    eigenaar: "bizdev",
    stappen: [
      { wie: "research", rol: "ondersteunt", wat: "onderzoekt het bedrijf en de aanleiding" },
      { wie: "bizdev", rol: "eigenaar", wat: "kwalificeert, bepaalt de propositie en bereidt het voorstel voor" },
      { wie: "creative", rol: "ondersteunt", wat: "creatieve propositie", optioneel: true },
      { wie: "influencer", rol: "ondersteunt", wat: "influencerpropositie", optioneel: true },
      { wie: "social", rol: "ondersteunt", wat: "content- en socialpropositie", optioneel: true },
      { wie: "chief", rol: "controleert", wat: "controleert het voorstel en de mail" },
      { wie: "enriqueo", rol: "beslist", wat: "akkoord op voorstel én op verzending" },
    ],
    enriqueoMoment: "Akkoord vóór er iets naar buiten gaat — een mail, een voorstel, een toezegging",
    levert: "Gekwalificeerde prospect met aanleiding, propositie, voorstel en een concept-mail",
  },
  {
    key: "content",
    naam: "Content voor Beerthuizen zelf",
    wanneer: "De eigen kanalen: Instagram, de studio's, het productiehuis",
    eigenaar: "social",
    stappen: [
      { wie: "social", rol: "eigenaar", wat: "strategie, pillars, planning" },
      { wie: "creative", rol: "ondersteunt", wat: "concepten en formats" },
      { wie: "analytics", rol: "ondersteunt", wat: "wat werkte en wat niet" },
      { wie: "research", rol: "ondersteunt", wat: "wat concurrenten doen", optioneel: true },
      { wie: "chief", rol: "controleert", wat: "bewaakt de planning" },
      { wie: "enriqueo", rol: "beslist", wat: "akkoord vóór publicatie" },
    ],
    enriqueoMoment: "Akkoord vóór er iets gepubliceerd wordt",
    levert: "Contentplanning met per stuk het format, het kanaal en het doel",
  },
  {
    key: "event",
    naam: "Event",
    wanneer: "Er wordt een event georganiseerd",
    eigenaar: "chief",
    stappen: [
      { wie: "chief", rol: "eigenaar", wat: "coördineert het geheel" },
      { wie: "creative", rol: "ondersteunt", wat: "eventconcept" },
      { wie: "influencer", rol: "ondersteunt", wat: "creators en gasten" },
      { wie: "social", rol: "ondersteunt", wat: "contentstrategie rond het event" },
      { wie: "research", rol: "ondersteunt", wat: "research", optioneel: true },
      { wie: "bizdev", rol: "ondersteunt", wat: "partners, leveranciers, commerciële kansen", optioneel: true },
      { wie: "operations", rol: "ondersteunt", wat: "planning en productie" },
      { wie: "finance", rol: "ondersteunt", wat: "facturatie achteraf" },
      { wie: "enriqueo", rol: "beslist", wat: "akkoord op concept en begroting" },
    ],
    enriqueoMoment: "Akkoord op het eventconcept en de begroting",
    levert: "Eventplan met concept, gasten, planning, productie en begroting",
  },
  {
    key: "studio",
    naam: "Studio-aanvraag",
    wanneer: "Iemand wil de fotostudio of de podcaststudio gebruiken",
    eigenaar: "operations",
    stappen: [
      { wie: "chief", rol: "controleert", wat: "neemt de aanvraag aan en bepaalt wat er nodig is" },
      { wie: "operations", rol: "eigenaar", wat: "planning en beschikbaarheid" },
      { wie: "bizdev", rol: "ondersteunt", wat: "commerciële opvolging bij een nieuwe klant", optioneel: true },
      { wie: "creative", rol: "ondersteunt", wat: "creatieve productie", optioneel: true },
      { wie: "finance", rol: "ondersteunt", wat: "facturatie" },
      { wie: "enriqueo", rol: "beslist", wat: "akkoord op het tarief bij een nieuwe klant" },
    ],
    enriqueoMoment: "Akkoord op het tarief wanneer het een nieuwe klant of een afwijkende prijs betreft",
    levert: "Ingeplande studiodag met de afspraken en de facturatie klaargezet",
  },
  {
    key: "facturatie",
    naam: "Factureren",
    wanneer: "Een project of opdracht is afgerond",
    eigenaar: "finance",
    stappen: [
      { wie: "chief", rol: "controleert", wat: "meldt dat het werk af is en wat er geleverd is" },
      { wie: "finance", rol: "eigenaar", wat: "maakt het factuurconcept op basis van het klantdossier" },
      { wie: "enriqueo", rol: "beslist", wat: "akkoord op de factuur" },
      { wie: "finance", rol: "eigenaar", wat: "verstuurt, bewaakt de termijn, bereidt herinneringen voor" },
      { wie: "chief", rol: "controleert", wat: "krijgt alleen bericht bij een afwijking of een risico" },
    ],
    enriqueoMoment: "Akkoord op elke factuur vóór verzending, en op elke herinnering",
    levert: "Verzonden factuur met bewaakte betaaltermijn en voorbereide opvolging",
  },
  {
    key: "klant",
    naam: "Nieuwe klant aanmaken",
    wanneer: "Er komt een nieuwe klant bij",
    eigenaar: "chief",
    stappen: [
      { wie: "chief", rol: "eigenaar", wat: "zet een beveiligde klantlink klaar" },
      { wie: "enriqueo", rol: "beslist", wat: "stuurt de link naar de klant" },
      { wie: "finance", rol: "ondersteunt", wat: "controleert de facturatiegegevens zodra ze binnen zijn" },
      { wie: "chief", rol: "controleert", wat: "koppelt het dossier aan het project" },
    ],
    enriqueoMoment: "Alleen het versturen van de link — de klant vult zelf in, jij typt niets over",
    levert: "Volledig klantdossier dat meteen bruikbaar is voor facturatie en projecten",
  },
];

// ============================================================
// Prioriteiten en vaste regels
// ============================================================

export const PRIORITEITEN = [
  { code: "P1", kleur: "🔴", wat: "Klantprobleem, deadline vandaag, financieel risico, externe verplichting" },
  { code: "P2", kleur: "🟠", wat: "Een collega wordt geblokkeerd, of een klant wacht" },
  { code: "P3", kleur: "🟡", wat: "Naderende deadline, gewoon werk" },
  { code: "P4", kleur: "🟢", wat: "Optimalisatie, research, verbetering" },
] as const;

export const SAMENWERKINGSREGELS = [
  "Verzin nooit gegevens. Weet je iets niet, dan zeg je dat je het niet weet.",
  "Doe geen aannames alsof het feiten zijn. Wat je afleidt, benoem je als afleiding.",
  "Noteer waar informatie vandaan komt.",
  "Maak onderscheid tussen wat bekend is en wat ontbreekt.",
  "Voer geen externe actie uit waarvoor toestemming nodig is.",
  "Leg je werk vast waar het thuishoort, niet alleen in je antwoord.",
  "Geef werk door aan de eigenaar van de volgende stap, niet aan wie toevallig beschikbaar is.",
  "Doe geen werk dat een collega al doet. Kijk eerst of het er al ligt.",
] as const;

// ============================================================
// Naar het systeemprompt
// ============================================================

export function eigendomVoor(agentKey: string): Eigendom | undefined {
  return EIGENDOM.find((e) => e.agentKey === agentKey);
}

export function routesVoor(agentKey: string): Route[] {
  return ROUTES.filter((route) => route.stappen.some((stap) => stap.wie === agentKey));
}

/// De werkafspraken zoals de agent ze meekrijgt bij elke denkbeurt.
///
/// Bewust compact: dit komt bovenop zijn functieprofiel en zijn werkinstructies,
/// en die zijn al lang. Wat hier staat is precies wat hij nodig heeft om te
/// weten waar hij van is, wat hij van wie krijgt, en waar hij zijn werk laat.
export function werkafsprakenAlsPrompt(
  agentKey: string,
  namen: Record<string, string>,
): string {
  const eigendom = eigendomVoor(agentKey);
  if (!eigendom) return "";

  const naam = (key: string) => (key === "enriqueo" ? "Enriqueo" : (namen[key] ?? key));

  const regels: string[] = [`# Je plaats in het team`, ``, `**Jij bent eigenaar van:** ${eigendom.eigenaarVan}.`];

  if (eigendom.krijgtVan.length) {
    regels.push(``, `Wat je van collega's krijgt:`);
    for (const bron of eigendom.krijgtVan) {
      regels.push(`- ${naam(bron.agentKey)} — ${bron.wat}`);
    }
    regels.push(
      ``,
      `Ontbreekt daarvan iets, dan vraag je het aan die collega of je meldt het bij ${naam("chief")}.`,
      `Je vult het niet zelf in en je gaat er niet omheen werken.`,
    );
  }

  if (eigendom.levertAan.length) {
    regels.push(``, `Wat jij oplevert, en aan wie:`);
    for (const doel of eigendom.levertAan) {
      regels.push(`- ${naam(doel.agentKey)} — ${doel.wat}`);
    }
  }

  if (eigendom.ondersteuntBij.length) {
    regels.push(
      ``,
      `Waar je ondersteunt zonder eigenaar te zijn — je vult aan, je neemt niet over:`,
    );
    for (const hulp of eigendom.ondersteuntBij) {
      regels.push(`- ${naam(hulp.agentKey)} — ${hulp.waarmee}`);
    }
  }

  const routes = routesVoor(agentKey);
  if (routes.length) {
    regels.push(``, `## De routes waar jij in zit`);
    for (const route of routes) {
      const mijn = route.stappen.filter((s) => s.wie === agentKey);
      const benIkEigenaar = route.eigenaar === agentKey;

      regels.push(
        ``,
        `**${route.naam}** — ${benIkEigenaar ? "jij bent eigenaar" : `eigenaar is ${naam(route.eigenaar)}`}`,
        `Wanneer: ${route.wanneer}.`,
        `Jouw deel: ${mijn.map((s) => s.wat).join("; ")}.`,
      );

      if (benIkEigenaar) {
        const volgorde = route.stappen
          .map((s) => `${naam(s.wie)}${s.optioneel ? " (alleen als het nodig is)" : ""}`)
          .join(" → ");
        regels.push(`Volgorde: ${volgorde}.`, `Enriqueo is nodig bij: ${route.enriqueoMoment}.`, `Levert op: ${route.levert}.`);
      }
    }
  }

  regels.push(
    ``,
    `## Prioriteiten`,
    ...PRIORITEITEN.map((p) => `${p.kleur} **${p.code}** — ${p.wat}`),
    ``,
    `## Hoe we hier met elkaar werken`,
    ...SAMENWERKINGSREGELS.map((regel) => `- ${regel}`),
    ``,
    `Elke opdracht heeft één eigenaar, eventueel ondersteunende collega's, één`,
    `overdracht naar de volgende stap, en één moment waarop Enriqueo nodig is.`,
    `Weet je niet wie de eigenaar is, dan vraag je het aan ${naam("chief")} —`,
    `je begint niet aan werk waarvan onduidelijk is van wie het is.`,
  );

  return regels.join("\n");
}
