#!/usr/bin/env bash
# Zet een back-up terug. Overschrijft de huidige database.
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a

: "${DATABASE_URL:?DATABASE_URL ontbreekt}"
FILE="${1:-}"
[ -z "$FILE" ] && { echo "Gebruik: npm run restore <bestand.sql.gz>" >&2; exit 1; }
[ -f "$FILE" ] || { echo "Bestand niet gevonden: $FILE" >&2; exit 1; }

echo "Dit OVERSCHRIJFT de database achter DATABASE_URL met ${FILE}."
echo "Maak eerst een verse back-up als je dat nog niet deed."
read -r -p "Doorgaan? typ JA: " ok
[ "$ok" = "JA" ] || { echo "Afgebroken."; exit 1; }

gunzip -c "$FILE" | psql "$DATABASE_URL"
echo "Teruggezet uit ${FILE}."
