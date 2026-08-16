#!/usr/bin/env bash
# Volledige back-up van de database naar backups/.
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a

: "${DATABASE_URL:?DATABASE_URL ontbreekt}"

mkdir -p backups
STAMP=$(date +%Y-%m-%d-%H%M)
OUT="backups/bhmgmt-${STAMP}.sql.gz"

echo "Back-up maken naar ${OUT}…"
pg_dump "$DATABASE_URL" --clean --if-exists --no-owner --no-privileges | gzip > "$OUT"

SIZE=$(wc -c < "$OUT" | tr -d ' ')
if [ "$SIZE" -lt 1000 ]; then
  echo "FOUT: de back-up is maar ${SIZE} bytes. Dat klopt niet — controleer DATABASE_URL." >&2
  exit 1
fi

echo "Klaar: ${OUT} ($(( SIZE / 1024 )) kB)"
echo "Bewaar hier minstens één kopie van buiten deze Mac."
