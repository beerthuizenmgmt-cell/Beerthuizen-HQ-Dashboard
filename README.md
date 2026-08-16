# BHMGMT HQ

Het digitale kantoor van Beerthuizen Management: één plek waar het AI-team van acht agents
zichtbaar is, aangestuurd wordt en verantwoording aflegt.

## Wat er nu werkt (fase 1)

- **Inloggen** met e-mail en wachtwoord; sessie in een httpOnly-cookie.
- **HQ-overzicht** met het hele team, live status, en wat er aandacht nodig heeft.
- **Agents toevoegen en beheren** met een keuze uit vier koppeltypes en een
  **verbindingstest** die in gewone taal zegt wat er mis is.
- **Reader-koppelingen**: het ingest-contract is identiek aan dat van de bestaande
  `elara-reader`, dus die draait er zonder aanpassing op.
- **Activiteitenfeed** van alles wat de agents doen.

Fase 2 (taken en teamcommunicatie), 3 (ochtendoverleg) en 4 (Meta ads-manager) staan in het plan.

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

Inloggen kan met het account uit de seed (`SEED_EMAIL` / `SEED_PASSWORD`, standaard
`jacey_music@live.nl` / `welkom123`). **Wijzig dat wachtwoord voordat de app online staat.**

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
