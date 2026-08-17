# Toolmatrix

Welke koppeling heeft welke agent nodig, en waarom. Niet twintig tegelijk
prioriteren: een agent die één werkende tool heeft is meer waard dan negen
agents die er allemaal drie half hebben.

De vraag per regel is steeds dezelfde: **kan deze agent zonder deze koppeling
zijn kernfunctie uitvoeren?** Zo niet, dan is het rood.

---

## 🔴 Nu koppelen — zonder dit werkt de kernfunctie niet

| Agent | Tool | Waarom | Wat jij aanlevert |
|---|---|---|---|
| **Mila** | Meta Ads | Zij bewaakt het geld dat aan advertenties opgaat. Zonder spend, CPM en ROAS kan ze niets bewaken. | Access token + ad-account-ID (`act_…`) |
| **Maud** | Facturatie | Zij is eigenaar van de administratie maar heeft geen factuur gezien. | API-sleutel van je facturatiesysteem |
| **Fleur** | Creator-database | Zij moet creators vinden en vergelijken. Nu kan ze alleen beoordelen wat jij aandraagt. | API-sleutel Influencity |
| **Noor** | Instagram | Zij is eigenaar van de contentstrategie maar ziet geen enkel resultaat van wat er staat. | Access token |
| **Stefano** | Web research | 🟢 **Werkt al** — `web_fetch`. Hij is de enige agent die vandaag echt iets kan opzoeken. | — |
| **Lars** | Web research | 🟢 **Werkt al** — sinds vannacht ook bij hem. | — |
| **Daan** | Telegram | 🟢 **Werkt al** — de lijn met jou staat. | — |

**Waarom deze vier eerst:** Meta raakt drie agents tegelijk (Mila, Fleur, Noor),
facturatie maakt Maud in één klap bruikbaar, en de creator-database is het
verschil tussen Fleur die adviseert en Fleur die zoekt.

---

## 🟠 Daarna — maakt bestaand werk merkbaar beter

| Agent | Tool | Waarom |
|---|---|---|
| **Mila** | Google Analytics | Websitegedrag naast advertentiecijfers; anders meet ze alleen de klik. |
| **Stefano** | Brand24 | Weten wat er over merken en klanten gezegd wordt, zonder handmatig zoeken. |
| **Stefano** | Browse AI | Concurrenten en tarieven volgen zonder dat iemand pagina's afgaat. |
| **Jesse** | Canva | Van concept naar iets wat je kunt laten zien. |
| **Lars** | E-mail | Salescommunicatie. Let op de drie fasen in zijn playbook: pas zelfstandig versturen na een week én na jouw expliciete vrijgave. |
| **Fleur** | TikTok | Nu alleen Instagram; de helft van de creators zit daar niet. |
| **Noor** | TikTok | Idem, voor contentprestaties. |

---

## 🟢 Later — nuttig, niet nodig

| Agent | Tool | Waarom het kan wachten |
|---|---|---|
| Stefano | Ahrefs / Semrush | SEO-diepte is waardevol, maar niet waar jouw omzet vandaan komt. |
| Jesse | Beeld- en video-AI | Productie kan ook zonder; het concept is het schaarse goed. |
| Lars | HubSpot / LinkedIn | Zinvol zodra de pipeline groeit; bij een handvol prospects is het overhead. |
| Daan | Automations | Pas nuttig als er iets te automatiseren valt. |
| Mila | Campaign Intelligence | Bovenop Meta, niet ervoor. |
| Maud | Boekhouding | Na facturatie: eerst factureren, dan boeken. |

---

## Hoe je een koppeling aanzet

1. **Sleutel invoeren** bij Tools → de koppeling → configuratie. Jij doet dit
   zelf; sleutels gaan versleuteld de database in en komen nooit in de browser.
2. **Verbinding testen** met de knop ernaast. Rood met een leesbare reden, of
   groen.
3. **Rechten zetten** per agent: lezen, voorstellen of schrijven. Begin met
   lezen. Extern verkeer blijft hoe dan ook via goedkeuring lopen.
4. **Een echte opdracht geven** aan de agent die hem heeft. Niet "de test
   slaagde", maar "Mila heeft de cijfers van vorige week opgehaald en er iets
   zinnigs over gezegd".

Wat er vandaag werkelijk werkt, zie je met:

```bash
DOTENV_CONFIG_PATH=.env.production npx tsx scripts/audit-koppelingen.mts
```

---

## De stand van vandaag

Van de 42 toegewezen koppelingen werkt er **één**: webpagina's lezen, bij Daan,
Stefano en Lars. Alle andere staan vastgelegd met de juiste velden en rechten,
maar wachten op een sleutel.

Dat betekent dat de agents vandaag kunnen denken, adviseren, taken maken en
elkaar inschakelen — maar niets kunnen aanraken. De vier rode regels hierboven
zijn wat dat verandert.
