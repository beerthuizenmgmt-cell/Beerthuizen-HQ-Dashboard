# Back-up, herstel en terugrollen

Wat te doen als er iets misgaat. Kort gehouden zodat je het onder druk nog kunt lezen.

## Wat er te verliezen valt

| Waar | Wat | Te herstellen? |
|---|---|---|
| Database | agents, taken, overleggen, kosten, goedkeuringen, gesprekken, portretten | alleen uit een back-up |
| Git | alle code | ja, altijd |
| `.env` | `APP_SECRET`, `DATABASE_URL`, `CRON_SECRET` | **nee, niet in git** — bewaar apart |
| Instellingen in de database | API-sleutel, Telegram-token, bedrijfscontext | uit een back-up, versleuteld met `APP_SECRET` |

**Het gevaarlijkste punt:** `APP_SECRET` staat niet in git en niet in de back-up van de code. Raak je
hem kwijt, dan zijn de opgeslagen sleutels niet meer te ontcijferen — de data blijft heel, maar je
moet de API-sleutel en het bot-token opnieuw invoeren. Zet hem in je wachtwoordmanager, nu.

## Back-up maken

```bash
npm run backup
```

Schrijft `backups/bhmgmt-JJJJ-MM-DD-HHMM.sql.gz` met de volledige database. Bewaar er minstens één
buiten je Mac.

Handmatig kan ook:

```bash
pg_dump "$DATABASE_URL" --clean --if-exists | gzip > backup.sql.gz
```

## Terugzetten

```bash
npm run restore backups/bhmgmt-2026-08-16-1200.sql.gz
```

Dit **overschrijft** de huidige database. Maak eerst een verse back-up van wat er nu staat, ook als
je denkt dat die waardeloos is — je weet pas achteraf wat je nodig had.

## Terugrollen na een mislukte deploy

Drie niveaus, van licht naar zwaar:

**1. Alleen de code deugt niet, de database is ongemoeid.**
In Vercel: Deployments → de vorige → *Promote to Production*. Klaar in een minuut, data blijft staan.

**2. Een migratie heeft de database gewijzigd en het gaat mis.**
Zet eerst de code terug (stap 1). Zet daarna de database terug uit de back-up die je vóór de deploy
maakte. Zonder die back-up is een migratie niet terug te draaien — Prisma kent geen `down`.

**3. Alles opnieuw opbouwen.**
```bash
git clone <repo> && cd bhmgmt-hq && npm install
cp <bewaarde .env> .env
npm run db:deploy      # zet het schema neer
npm run restore <back-up>   # zet de data terug
```

## Vaste volgorde rond een deploy

1. Back-up maken en controleren dat het bestand groter is dan nul bytes.
2. `npm run build` lokaal — een build die hier faalt, faalt daar ook.
3. Deployen.
4. Smoke test langs de negen punten uit het draaiboek.
5. Gaat het mis: stap 1 of 2 van het terugrollen.

## Wat er automatisch gebeurt

Vercel Postgres maakt zelf point-in-time back-ups; hoe ver terug hangt af van je plan. Vertrouw daar
niet blind op: die back-up zit bij dezelfde partij als je database. Eén eigen kopie buiten Vercel is
het verschil tussen een vervelende ochtend en een verloren maand.
