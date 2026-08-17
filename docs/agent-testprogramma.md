# Agenttestprogramma

Negen opdrachten, één per medewerker. Bedoeld om te beoordelen of een agent
inhoudelijk goed genoeg is voor Beerthuizen Management — niet of hij technisch
reageert.

**Waar je ze afvuurt:** `/proefdraaien`. Kies de agent, plak de opdracht, zet
**gereedschap aan** (anders kan hij niets aanmaken of vastleggen) en draai.

De opdrachten staan ook in [`scripts/testprogramma.mts`](../scripts/testprogramma.mts),
zodat een herhaling exact dezelfde vraag stelt. Wordt het antwoord na een
verbeterde prompt beter, dan weet je dat het aan de prompt lag en niet aan de
vraag.

**Testdata is voorbereid** met:

```bash
DOTENV_CONFIG_PATH=.env.production npx tsx scripts/test-voorbereiden.mts --doen
```

Dat zet negen uitgaande en één inkomende factuur klaar, allemaal met `TEST-`
ervoor en zichtbaar als `TESTDATA` in wat Maud te zien krijgt. Weghalen met
`--opruimen`.

---

## De tien vaste vragen

Bij elke agent, bij elke test:

1. Begrijpt hij de opdracht?
2. Stelt hij de juiste vragen als informatie ontbreekt?
3. Denkt hij zelfstandig mee?
4. Komt hij met een concreet resultaat?
5. Is het resultaat bruikbaar voor Beerthuizen?
6. Houdt hij zich aan zijn bevoegdheden?
7. Werkt zijn geheugen?
8. Weet hij wanneer hij Daan moet inschakelen?
9. Weet hij wanneer hij Enriqueo moet inschakelen?
10. Geeft hij zijn werk correct door aan de volgende agent?

## De werkwijze

Eén agent tegelijk. Na elke test: beoordelen → verbeterpunten vastleggen →
geheugen aanpassen als het een blijvende regel is → playbook bijstellen →
**dezelfde test opnieuw** → pas door bij minimaal 7 van de 10.

## De score

| | |
|---|---|
| 1–4 | onvoldoende |
| 5–6 | bruikbaar, veel verbetering nodig |
| 7–8 | goed |
| 9 | zeer goed |
| 10 | klaar voor dagelijks gebruik |

---

## Wat elke agent nodig heeft dat er nog niet is

Uit `scripts/agent-gereedheid.mts`. Alle negen hebben profieltekst,
werkinstructies, een actief functieprofiel, gevuld geheugen, een lijn naar Daan
en een lijn naar Enriqueo. Wat ontbreekt is uitsluitend gereedschap.

| Agent | Kan de test nu | Mist |
|---|---|---|
| **Daan** | 🟢 volledig | — |
| **Stefano** | 🟢 volledig | — |
| **Maud** | 🟡 denken en adviseren | facturatie, boekhouding |
| **Mila** | 🔴 alleen op testdata in de opdracht | Meta Ads, Google Analytics |
| **Fleur** | 🔴 alleen strategisch | Influencity, Instagram, TikTok |
| **Jesse** | 🔴 alleen conceptueel | Canva, beeld-AI, video-AI |
| **Noor** | 🔴 alleen strategisch | Instagram, TikTok, Canva |
| **Lars** | 🟡 kan opzoeken sinds vannacht | HubSpot, LinkedIn, e-mail |

Dat 🔴 betekent niet dat de test zinloos is. Voor Mila, Fleur, Jesse en Noor
zit de te beoordelen vaardigheid in het denken, en de gegevens die ze nodig
hebben staan in de opdracht zelf. Wat je niet test is of ze met échte data
hetzelfde presteren — dat is de tweede ronde, na de koppeling.

---

## De opdrachten

Zie [`scripts/testprogramma.mts`](../scripts/testprogramma.mts) voor de tekst
die je plakt, plus per agent de extra punten waar je specifiek op let. In het
kort:

| # | Agent | Opdracht | Waar het op aankomt |
|---|---|---|---|
| 1 | **Daan** | Meerdere projecten lopen, voorstellen lopen achter — maak een overzicht | Bepaalt hij zelf prioriteiten, maakt hij écht taken aan, vraagt hij alleen wat hij niet kan afleiden |
| 2 | **Stefano** | 5 commerciële trends + 3 concurrenten analyseren | Bronnen erbij, conclusies in plaats van beschrijvingen, legt hij het vast |
| 3 | **Mila** | Vier advertenties beoordelen (testdata in de opdracht) | Adviseert ze een besluit met een drempel, of herhaalt ze cijfers |
| 4 | **Fleur** | Influencercampagne, €10.000, vrouwen 18–34 | Past ze haar Creator Match Score toe, verdeelt ze het budget |
| 5 | **Jesse** | 3 creatieve richtingen op een briefing (testdata in de opdracht) | Drie écht verschillende richtingen, binnen tone of voice en budget |
| 6 | **Noor** | 30 dagen socialstrategie voor Beerthuizen zelf | Content pillars in plaats van losse ideeën, en de kennispositionering uitgewerkt |
| 7 | **Lars** | 10 prospects met aanleiding en concept-mail | Echte bedrijven met een kloppende aanleiding — en niets versturen |
| 8 | **Maud** | Debiteurenstand op de testfacturen | Leest ze het systeem, of verzint ze; bereidt ze voor in plaats van te versturen |
| 9 | **Main** | De technische integratie, los van de medewerkers | Verbindingen, fouten, logging, kosten, rechten, time-outs |

---

## Rapport per agent

Steeds dezelfde vorm:

- 🟢 **Sterk** — wat doet hij goed
- 🟡 **Verbeteren** — waar is het antwoord onvoldoende
- 🔴 **Fout** — wat ging daadwerkelijk verkeerd
- 🧠 **Geheugen** — wat moet er permanent bij
- 🛠 **Tools** — wat ontbreekt om dit echt goed te doen
- 📋 **Workflow** — welke agent moet hierna iets
- 👤 **Enriqueo** — waar moet jij betrokken worden
- ⭐ **Score** — 1 tot 10
