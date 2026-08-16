# Opbouw van het AI-team — stand van 16 augustus 2026

Eén agent tegelijk, volledig af voordat de volgende begint. Dit document is de
papieren versie van het scherm **Opbouw** in het dashboard; daar staan dezelfde
gegevens, maar dan met de actuele cijfers erbij.

## Overzicht

| Agent | Configuratie | Tools | Permissies | Tests | Status |
|---|---|---|---|---|---|
| **Daan** — Head of Operations | 7 verantwoordelijkheden · 6 KPI's · 3 signalen | 7 ingebouwd + web_fetch | Niveau 3 — coördineren · 4 acties met akkoord | Proefopdracht geslaagd | 🟢 ingericht |
| **Fleur** — Influencer Campaign Manager | 6 verantwoordelijkheden · 3 KPI's · 2 signalen | Instagram, Meta Ads, Sheets (0/3) | Niveau 2 · 3 acties met akkoord | na akkoord | 🟡 voorstel klaar |
| **Mila** — Analytics Manager | 5 verantwoordelijkheden · 3 KPI's · 2 signalen | Analytics, Meta Ads, Sheets (0/3) | Niveau 2 · 2 acties met akkoord | na akkoord | 🟡 voorstel klaar |
| **Sanne** — Research Manager | 5 verantwoordelijkheden · 3 KPI's · 1 signaal | Web search, web_fetch, concurrentiemonitor (0/3) | Niveau 2 · 1 actie met akkoord | na akkoord | 🟡 voorstel klaar |
| **Jesse** — Creative Director | 5 verantwoordelijkheden · 2 KPI's · 1 signaal | Canva, beeld-AI, video-AI (0/3) | Niveau 2 · 2 acties met akkoord | na akkoord | 🟡 voorstel klaar |
| **Noor** — Social Media Manager | 5 verantwoordelijkheden · 2 KPI's · 1 signaal | Instagram, Canva, Sheets (0/3) | Niveau 2 · 2 acties met akkoord | na akkoord | 🟡 voorstel klaar |
| **Bram** — Operations Manager | 5 verantwoordelijkheden · 2 KPI's · 1 signaal | Sheets (0/1) | Niveau 2 · 2 acties met akkoord | na akkoord | 🟡 voorstel klaar |
| **Lars** — Business Development | 5 verantwoordelijkheden · 2 KPI's · 1 signaal | E-mail, web search, Sheets (0/3) | Niveau 2 · 3 acties met akkoord | na akkoord | 🟡 voorstel klaar |
| **Main** — OpenClaw workspace | koppeling, geen medewerker | — | — | — | n.v.t. |

## Autonomieniveaus

Er zijn drie niveaus. Een vierde — zelfstandig naar buiten handelen — bestaat
bewust niet.

1. **Meedenken** — analyseert en adviseert, doet zelf niets in het systeem.
2. **Zelfstandig binnen het dashboard** — maakt taken, legt vast, rapporteert,
   bevraagt collega's. Alles wat naar buiten gaat of geld raakt gaat eerst
   langs jou.
3. **Coördineren** — alles van niveau 2, plus andere agents aansturen en
   prioriteiten stellen. Nog steeds geen externe, commerciële of financiële
   acties zonder akkoord.

Alleen Daan staat op niveau 3. De rest staat voorgesteld op niveau 2.

## Wat "voorstel" betekent

Een voorstel is volledig uitgewerkt maar **niet van kracht**. Het staat in het
dossier van de agent, maar gaat niet mee in zijn denkwerk; hij gedraagt zich
precies zoals hij zich gisteren gedroeg. Pas als jij akkoord geeft, zet ik het
profiel op actief.

Zo kun je per agent lezen wat hij zou gaan doen, voordat hij het doet.

## De keten die we uiteindelijk willen

```
Head → Research → Analytics → Campaign → Creative → Social → Head → Enriqueo
```

Technisch kan dit al: Daan heeft het gereedschap `vraag_agent`, waarmee hij een
collega een vraag stelt die meteen antwoordt. De diepte is op één niveau
begrensd, zodat een keten niet ongemerkt uitwaaiert.

Wat er nog moet gebeuren voordat dit betekenisvol is: de collega's moeten een
actief profiel hebben. Een agent zonder functieomschrijving antwoordt wel, maar
weet niet waar hij over gaat.

## Per agent — wat er nog moet gebeuren

### Fleur — Influencer Campaign Manager
- Profiel goedkeuren of aanpassen.
- Instagram- en Meta-koppeling: beide nog te bouwen.
- Test: een campagnebriefing beoordelen en een creatorvoorstel onderbouwen.

### Mila — Analytics Manager
- Profiel goedkeuren of aanpassen.
- Google Analytics en Meta Ads: beide nog te bouwen. Zonder deze twee kan zij
  alleen werken met wat er in het dashboard staat.
- Test: een week aan campagnecijfers duiden en één aanbeveling doen.

### Sanne — Research Manager
- Profiel goedkeuren of aanpassen.
- Web search en concurrentiemonitor: nog te bouwen. `web_fetch` werkt al.
- Test: een merk doorlichten met bronvermelding.

### Jesse — Creative Director
- Profiel goedkeuren of aanpassen.
- Canva, beeld-AI en video-AI: nog te bouwen.
- Test: een campagneconcept uitwerken vanuit een doelstelling.

### Noor — Social Media Manager
- Profiel goedkeuren of aanpassen.
- Instagram en Canva: nog te bouwen.
- Test: een weekplanning maken en één post volledig voorbereiden.

### Bram — Operations Manager
- Profiel goedkeuren of aanpassen.
- Sheets: nog te bouwen.
- Test: knelpunten in het huidige takenbord benoemen.

### Lars — Business Development
- Profiel goedkeuren of aanpassen.
- E-mail en web search: nog te bouwen. **Let op:** de e-mailkoppeling verstuurt
  nooit zelf; hij bereidt voor en jij drukt op verzenden.
- Test: een prospect onderbouwen en een introductiemail opstellen.

## Wat er in de catalogus nog niet gebouwd is

Tien koppelingen staan in de catalogus als *gepland*: Canva, beeld-AI, video-AI,
Meta Ads, Google Analytics, Sheets, web search, concurrentiemonitor, Instagram en
e-mail. Ze zijn zichtbaar zodat je ziet wat een functie nodig heeft, maar ze doen
nog niets. Dat staat er in het dashboard ook zo bij — een koppeling die "aan"
lijkt te staan maar niets doet, is erger dan geen koppeling.

Twee werken wel: **web_fetch** (een pagina lezen, met een blokkade op interne
adressen) en **custom_webhook**.
