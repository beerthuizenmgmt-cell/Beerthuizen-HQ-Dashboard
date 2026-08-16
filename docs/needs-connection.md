# Needs Connection — wat er per platform nodig is

Veertig platformen zijn toegewezen aan de negen agents, met rechten en al. Geen
ervan heeft een werkende verbinding. Dit document zegt per platform wat er moet
gebeuren en wie het moet doen — jij of ik.

Er zit geen nepkoppeling tussen. Een tool die "connected" zegt maar niets doet is
erger dan een tool die eerlijk zegt dat hij wacht.

## Hoe je dit leest

**Jij** = een account, abonnement, app-registratie of goedkeuring die alleen jij
kunt regelen. **Ik** = bouwwerk in het dashboard zodra jij de gegevens hebt.

Zet de sleutels altijd zelf in het dashboard onder *Tools → de betreffende tool*.
Stuur ze niet door de chat: dan moet je ze daarna toch weer vervangen.

---

## Prioriteit 1 — hier begint het echte werk

Deze vijf leveren direct waarde en zijn technisch het eenvoudigst.

### Brand24 — monitoring
**Voor:** Stefano, Mila, Daan, Fleur, Noor, Lars (6 agents — de meest gedeelde tool)
**Jij:** account met API-toegang (zit in het Premium-plan en hoger). Ga naar
Settings → API → genereer een token.
**Ik:** koppeling bouwen, projecten uitlezen, vermeldingen per merk en per
campagne binnenhalen.
**Kosten:** vanaf ongeveer €79 per maand. Vul je eigen bedrag in bij de tool.
**Test:** Stefano vraagt de vermeldingen van de afgelopen week op voor één merk
en vat op wat er speelt.

### Browse AI — pagina's volgen
**Voor:** Daan, Stefano, Mila, Jolanda, Fleur, Lars
**Jij:** account, dan Settings → API key. Robots aanmaken kan daarna vanuit het
dashboard of bij hen.
**Ik:** koppeling bouwen, robots aansturen, wijzigingen als signaal binnenhalen —
dit past precies op de event-driven opzet.
**Kosten:** gratis laag beschikbaar, betaald vanaf ongeveer $19 per maand.
**Test:** Stefano zet een concurrentpagina onder bewaking en meldt de eerste
wijziging.

### Meta — Facebook en Instagram
**Voor:** Mila, Fleur, Noor, Stefano
**Jij:** dit is de zwaarste van de vijf. Meta Business Suite → developers.facebook.com
→ app aanmaken (type Business) → systeemgebruiker met de rechten
`ads_read`, `instagram_basic`, `pages_read_engagement` → token genereren →
ad-account-ID opzoeken. Voor sommige rechten is App Review nodig; reken op één
tot twee weken.
**Ik:** koppeling bouwen zodra het token er is. Het runbook staat in
`docs/meta-setup.md`.
**Kosten:** geen, buiten je advertentiebudget.
**Test:** Mila haalt de cijfers van een lopende campagne op en duidt ze.

### Google Analytics
**Voor:** Mila
**Jij:** Google Cloud Console → project → Analytics Data API aanzetten →
serviceaccount aanmaken → JSON-sleutel downloaden → dat serviceaccount toevoegen
als lezer op je GA4-property. Property-ID erbij.
**Ik:** koppeling bouwen op de Data API.
**Kosten:** geen.
**Test:** Mila vergelijkt het verkeer van deze week met vorige week.

### Facturenadministratie — in het dashboard
**Voor:** Maud
**Jij:** niets. Dit bouw ik binnen het dashboard, zoals afgesproken.
**Ik:** facturenmodel met klant, factuurnummer, factuurdatum, vervaldatum,
bedrag, status, verzonddatum, betaaldatum, dagen openstaand, opvolgingsstatus,
eerste en tweede herinnering en interne notities. Plus het scherm om ze in te
voeren of te importeren.
**Kosten:** geen.
**Test:** Maud signaleert welke facturen over tijd zijn en bereidt de eerste
herinnering voor — versturen blijft jouw akkoord.

---

## Prioriteit 2 — zodra de eerste vijf lopen

### Ahrefs
**Voor:** Stefano, Mila · **Jij:** API-toegang zit alleen in Enterprise, of je
gebruikt losse API-credits. Controleer eerst wat je abonnement biedt.
**Kosten:** vanaf ongeveer €99 per maand, API vaak apart.

### Semrush
**Voor:** Stefano, Mila · **Jij:** API-eenheden aanschaffen bij je abonnement,
dan de API-sleutel uit je profiel halen.
**Kosten:** vanaf ongeveer €130 per maand, API-eenheden apart.

### Surfer SEO
**Voor:** Stefano · **Jij:** API is beschikbaar vanaf het Business-plan.
**Kosten:** vanaf ongeveer €89 per maand.

### Influencity
**Voor:** Fleur, Mila, Lars · **Jij:** vraag API-toegang aan bij je
accountmanager — dit staat niet standaard aan.
**Kosten:** op aanvraag.

### TikTok
**Voor:** Mila, Noor · **Jij:** developers.tiktok.com → app aanmaken →
Display API of Business API aanvragen. Review vereist.
**Kosten:** geen.

### YouTube
**Voor:** Mila, Noor · **Jij:** Google Cloud → YouTube Data API v3 aanzetten →
OAuth-client aanmaken. Voor eigen kanaalgegevens ook YouTube Analytics API.
**Kosten:** geen.

### Canva
**Voor:** Jesse, Noor, Fleur · **Jij:** canva.com/developers → Connect-app
aanmaken → OAuth instellen. Canva beoordeelt de app voordat hij live mag.
**Kosten:** Canva Pro, ongeveer €12 per maand.

---

## Prioriteit 3 — creatief en content

Deze hebben allemaal hetzelfde patroon: account, API-sleutel, koppeling bouwen.
Ze zijn los van elkaar te doen, dus we pakken ze in de volgorde die jou uitkomt.

| Tool | Voor | Wat jij nodig hebt | Ongeveer per maand |
|---|---|---|---|
| Photoroom | Jesse, Noor | API-sleutel via photoroom.com/api | vanaf $29 |
| Midjourney | Jesse, Noor | geen officiële API; loopt via Discord — mogelijk niet koppelbaar | vanaf $10 |
| Kling AI | Jesse, Noor | API-toegang via klingai.com, betaald per generatie | per gebruik |
| Higgsfield | Jesse, Noor | API-sleutel via je account | vanaf $9 |
| Lexica | Jesse | API-sleutel via lexica.art | vanaf $10 |
| v0 | Jesse, Jolanda | API-sleutel via v0.dev, Premium vereist | vanaf $20 |
| AI Arcade | Jesse | uitzoeken welke API zij bieden | onbekend |
| Brandwell | Jesse | API-sleutel via je account | vanaf $49 |
| Writer.com | Jesse, Lars | Enterprise-account met API | op aanvraag |
| Jasper | Jesse, Noor, Lars | API zit in Business-plan | vanaf $69 |
| Grammarly | Jesse, Noor, Lars | alleen Enterprise heeft API | op aanvraag |
| Copy.ai | Jesse, Noor, Lars | API-sleutel via workspace-instellingen | vanaf $49 |
| ContentShake | Jesse, Noor, Stefano | onderdeel van Semrush | via Semrush |

**Let op bij Midjourney:** er is geen officiële API. Koppelen kan alleen via een
omweg die tegen hun voorwaarden ingaat. Mijn advies: gebruik hiervoor Kling,
Lexica of Photoroom, en houd Midjourney handmatig.

---

## Prioriteit 4 — commercieel en financieel

### HubSpot
**Voor:** Lars, Daan · **Jij:** Private App aanmaken in je HubSpot-account met
de scopes voor contacten en deals.
**Kosten:** gratis laag beschikbaar.

### Reply.io
**Voor:** Lars · **Jij:** API-sleutel uit je accountinstellingen.
**Kosten:** vanaf $59 per gebruiker per maand.

### Albert.ai
**Voor:** Lars, Mila · **Jij:** contact met hun sales; dit is enterprise-software.
**Kosten:** op aanvraag.

### LinkedIn
**Voor:** Lars, Stefano · **Jij:** LinkedIn geeft geen API voor prospectonderzoek.
Alleen Sales Navigator, en dat is handwerk.
**Mijn advies:** schrap deze koppeling en laat Lars werken met openbare bronnen
via web_fetch.

### Userbot.ai
**Voor:** Lars, Daan · **Jij:** API-sleutel via je account.
**Kosten:** op aanvraag.

### Boekhoudpakket
**Voor:** Maud · **Jij:** eerst kiezen wélk pakket je gebruikt. Moneybird en
e-Boekhouden hebben een prettige API; Exact Online is zwaarder maar compleet.
**Ik:** koppeling bouwen zodra je gekozen hebt. De facturenadministratie die ik
nu maak is er alvast op voorbereid.

### CRM
**Voor:** Lars, Maud, Fleur · **Jij:** kiezen. Gebruik je HubSpot al, dan is dat
meteen je CRM en hoeft er niets extra's bij.

---

## Wat al werkt

| Tool | Voor | Stand |
|---|---|---|
| Webpagina lezen | Daan, Stefano | 🟢 werkt |
| Eigen webhook | iedereen die je hem geeft | 🟢 werkt |
| Telegram | Daan | 🟢 werkt |
| Taken, agenda, kanalen, goedkeuringen, geheugen | alle agents | 🟢 ingebouwd |

De eigen webhook is onderschat: daarmee koppel je vandaag al elk systeem dat
Make, Zapier of n8n kan bereiken — zonder dat ik er iets voor hoef te bouwen.
Voor Sheets, een simpele CRM-actie of een melding naar een ander systeem is dat
vaak genoeg.

---

## Mijn advies over de volgorde

1. **Brand24 en Browse AI** eerst. Ze raken zes van de negen agents, zijn snel
   geregeld en maken het team meteen merkbaar slimmer.
2. **Meta** daarna, want die duurt het langst door de review. Hoe eerder je hem
   aanvraagt, hoe eerder Mila en Fleur met echte cijfers werken.
3. **Facturenadministratie** parallel — die bouw ik zonder dat jij iets hoeft.
4. De rest op volgorde van wat je echt gebruikt. Van dertien creatieve tools
   heb je er waarschijnlijk drie nodig; koppel niet wat je toch niet opent.
