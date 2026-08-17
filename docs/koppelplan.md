# Koppelplan

De agents zijn ingericht, de workflows werken, en van de 41 toegewezen tools
werkt er precies één. Dat is het verschil tussen een dashboard en een team dat
daadwerkelijk iets doet.

Dit is de volgorde waarin de handen worden aangesloten. Vastgelegd zodat er
morgen niet opnieuw hoeft te worden bedacht welke API aan de beurt is.

**De regel: één koppeling tegelijk, en pas door als hij met een echte test
werkt.** Veertig koppelingen die half staan is erger dan vier die het doen.

---

## Volgorde

| # | Systeem | Agents | Waarom nu | Nodig |
|---|---|---|---|---|
| 🔴 1 | **Meta + Instagram** | Mila, Fleur, Noor | Advertentie- en socialdata. Raakt drie agents tegelijk en maakt ze in één klap bruikbaar. | Access token + ad-account-ID (`act_…`) |
| 🔴 2 | **Boekhouding / facturatie** | Maud | Maud is compleet maar heeft nul facturen gezien. Zonder data is ze een goed ontworpen leegte. | API-sleutel |
| 🔴 3 | **Brand24** | Stefano, Mila, Noor, Fleur | Monitoring: weten wat er over merken en klanten gezegd wordt. | API-sleutel |
| 🔴 4 | **Browse AI** | Stefano, Lars, Mila | Concurrenten en marktbewegingen volgen zonder handwerk. | API-sleutel |
| 🟠 5 | **Canva** | Jesse, Noor, Fleur | Van concept naar zichtbaar ontwerp. | Canva Connect-app met OAuth |
| 🟠 6 | **Ahrefs / Semrush** | Stefano, Mila, Lars | Markt- en concurrentiecijfers onder het onderzoek. | API-sleutel |
| 🟠 7 | **E-mail** | Lars, Daan | Salescommunicatie. Let op de drie fasen in Lars' playbook: pas zelfstandig mailen na een week én na expliciete goedkeuring. | Mailbox met app-wachtwoord |
| 🟠 8 | **Creator- en influencerdata** | Fleur | Creatorselectie op cijfers in plaats van op gevoel. | API-sleutel (Influencity) |
| 🟠 9 | **AI-beeld en -video** | Jesse | Productie van concepten. | API-sleutel per aanbieder |
| 🟡 10 | **Automations** | Daan | Workflowautomatisering. Pas zinvol als er iets te automatiseren valt. | API-sleutel |

---

## Per koppeling dezelfde vier stappen

1. **Sleutel invoeren** bij Tools → de koppeling → configuratie. Enriqueo doet
   dit zelf; sleutels gaan versleuteld de database in en komen nooit in de
   browser.
2. **Verbinding testen** met de knop ernaast. Rood met een leesbare reden, of
   groen. Geen half-groene kaartjes.
3. **Rechten zetten** per agent: lezen, voorstellen of schrijven. Begin met
   lezen. Extern verkeer blijft hoe dan ook via goedkeuring lopen.
4. **Echte opdracht geven** aan de agent die hem heeft. Niet "de test slaagde"
   maar "Mila heeft de cijfers van vorige week opgehaald en er iets zinnigs
   over gezegd". Pas dan staat de koppeling.

---

## Wat er onder zit

De catalogus staat in [`src/lib/ai/toolkit.ts`](../src/lib/ai/toolkit.ts).
Een koppeling is pas echt als hij `implemented: true` heeft met een `run` en een
`definition` — de rest staat vastgelegd maar is nog een lege huls.

Wat er nu daadwerkelijk werkt, zie je met:

```bash
DOTENV_CONFIG_PATH=.env.production npx tsx scripts/audit-koppelingen.mts
```

Dat toont per tool wie hem heeft, of hij werkt, en wat er nog voor nodig is.
