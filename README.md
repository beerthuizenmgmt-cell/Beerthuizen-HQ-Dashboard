# BHMGMT HQ

Het digitale kantoor van Beerthuizen Management: één plek waar het AI-team van acht agents
zichtbaar is, aangestuurd wordt en verantwoording aflegt.

## Wat er nu werkt

**Fase 1 — fundament en teamoverzicht**

- **Inloggen** met e-mail en wachtwoord; sessie in een httpOnly-cookie.
- **HQ-overzicht** met het hele team, live status, en wat er aandacht nodig heeft.
- **Agents toevoegen en beheren** met een keuze uit vier koppeltypes en een
  **verbindingstest** die in gewone taal zegt wat er mis is.
- **Reader-koppelingen**: het ingest-contract is identiek aan dat van de bestaande
  `elara-reader`, dus die draait er zonder aanpassing op.
- **Activiteitenfeed** van alles wat de agents doen.

**Fase 2 — taken en teamcommunicatie**

- **Takenbord** van inbox tot klaar; taak aanmaken, toewijzen en uitbesteden.
- **Dispatch via de adapter** van de agent, met de opdracht én het token om terug te melden.
- **Terugpraten**: agents melden voortgang, blokkades en resultaat op `/api/agents/[id]/reply`,
  of via de Telegram-webhook.
- **Teamkanalen en DM's** met @mentions; agent-naar-agent verkeer loopt via de orchestrator en
  blijft daardoor meeleesbaar.
- **Meldingen** in het dashboard, met een Telegram-push bij vastlopers en afrondingen.

Fase 3 (ochtendoverleg) en 4 (Meta ads-manager) staan in het plan.

Overal geldt: als iets niet bezorgd kan worden, zegt de app **waarom**, in plaats van stilletjes
te falen. Een taak toewijzen aan een niet-gekoppelde agent blokkeert de verzendknop met uitleg.

## Aan de praat krijgen

```bash
npm install
```

Start de lokale database. Dit draait een echte Postgres en drukt een connectiestring af —
zet die in `.env` als `DATABASE_URL` en `SHADOW_DATABASE_URL`:

```bash
npm run db:dev
```

Vul verder `APP_SECRET` in `.env` (genereer met `openssl rand -base64 32`), en dan:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

De seed maakt het eigenaarsaccount aan. Er staat bewust geen standaardwachtwoord in de code,
dus geef er zelf een mee:

```bash
SEED_PASSWORD='...' npm run db:seed
```

## Koppeltypes

| Type | Wanneer | Taken versturen |
|---|---|---|
| **Telegram-bot** | De agent heeft een eigen bot. Snelst werkend. | ja |
| **OpenClaw gateway** | Directe WebSocket naar de agent. Rijkst. | ja, mits het token `operator.write` heeft |
| **Reader (push)** | Agent is niet van buitenaf bereikbaar. | nee |
| **Nog niet koppelen** | Je regelt de koppeling later. | nee |

De gateway-adapter onderhandelt protocol 3–4, doorloopt de connect-challenge en **leest de
verzendmethode uit `features.methods`** in plaats van hem te gokken — gateway-builds verschillen
daarin.

## Reader aansluiten

Maak bij **Instellingen → Reader-koppelingen** een koppeling aan. Je krijgt eenmalig een
API-sleutel plus het startcommando. De reader praat alleen uitgaand, dus er hoeft geen poort open.

Endpoints (auth: `Authorization: Bearer <instance_id>:<api_key>`):

```
POST /api/ingest/snapshot    agents, modellen en skills
POST /api/ingest/activity    losse gebeurtenissen
POST /api/ingest/heartbeat   levensteken
```

## Naar Vercel

1. Repo naar GitHub pushen en in Vercel importeren.
2. **Storage → Create Database → Postgres** aanmaken; `DATABASE_URL` wordt automatisch gekoppeld.
3. Environment variables zetten: `APP_SECRET`, `APP_URL`, `CRON_SECRET`.
4. Deployen. `postinstall` draait `prisma generate`; migraties draai je met `npm run db:deploy`.

## Beveiliging

- Agent-tokens staan versleuteld (AES-256-GCM) in de database en gaan nooit naar de browser —
  in de UI zie je alleen een gemaskeerde weergave.
- API-sleutels van readers worden gehasht opgeslagen en zijn na aanmaken niet meer op te vragen.
- `APP_SECRET` is de sleutel onder beide. Wijzig je hem, dan zijn bestaande agent-tokens niet
  meer te ontsleutelen en moet je ze opnieuw invoeren.

## Ochtendoverleg en ochtendcall

Twee momenten per werkdag, allebei in Europe/Amsterdam:

| Tijd | Wat er gebeurt |
|---|---|
| **08:00** | Het team wordt uitgevraagd: gisteren, vandaag, blokkades, en vragen voor jou. Je kunt de briefing lezen zodra je wakker bent. |
| **09:45** | Wie nog niet reageerde krijgt een herinnering, zodat om tien uur alles er ligt. |
| **10:00** | Jij opent de call op `/overleg/call` en loopt de vragen één voor één af. |

In de call spreek je je antwoord in — de browser zet het om naar tekst, jij kunt het nog bijschaven
en het gaat daarna rechtstreeks naar de agent die de vraag stelde. Werkt in Chrome, Edge en Safari;
in Firefox valt de microfoonknop weg en typ je gewoon. Er gaat geen audio naar een externe dienst.

Naast de vragen staat de planning van de dag, en met één knop leg je een afspraak vast als taak.

Vercel draait crons in UTC, wat twee keer per jaar een uur zou verschuiven. Daarom vuurt de cron op
meerdere momenten en controleert `/api/cron/standup` zelf of het hier écht tijd is.

## Bij het ontwikkelen

Na `prisma migrate` of `prisma generate` **moet de dev-server opnieuw op**. Next houdt de oude
gegenereerde client vast en je krijgt anders `Unknown argument`-fouten op velden die wel degelijk
bestaan.

## Agenda

`/agenda` toont de week als planbord. Per dag zie je:

- **wat de agents die ochtend zeiden op te pakken** — rechtstreeks uit hun standup, met blokkades
  eronder in oranje;
- **taken met een deadline op die dag**, gekleurd naar prioriteit en met de agent erbij;
- **of er een overleg was** en of de call is afgerond;
- afgeronde taken doorgestreept, zodat je ziet wat er die dag klaarkwam.

Taken versleep je naar een andere dag, of naar de strook **Nog geen dag** om ze los te maken van de
planning. Met **+ inplannen** zet je direct iets op een dag zonder het takenformulier te openen.

Het scherm ververst zichzelf elke minuut, maar alleen als het tabblad zichtbaar is — bedoeld om de
hele dag open te staan.
