#!/usr/bin/env bash
# De volledige testset in één keer.
#
#   ./scripts/regressie.sh
#
# Draait alles wat er is en telt op. Bedoeld om na elke wijziging te draaien:
# een groene testset zegt niets als je hem alleen draait wanneer je verwacht
# dat hij groen is.
set -uo pipefail
cd "$(dirname "$0")/.."

# De auditsets maken testdata aan en gooien die daarna weer weg. Dat hoort niet
# in de echte database te gebeuren: klapt een set halverwege, dan blijft die
# rommel achter tussen je klanten, facturen en taken. Standaard draaien we dus
# lokaal. Wil je bewust tegen productie aan, dan zeg je dat er expliciet bij:
#
#   ./scripts/regressie.sh --productie
#
if [ "${1:-}" = "--productie" ]; then
  export DOTENV_CONFIG_PATH=.env.production
  echo "⚠️  Draait tegen de PRODUCTIEDATABASE. Testdata wordt daar aangemaakt en weer verwijderd."
  echo ""
else
  export DOTENV_CONFIG_PATH=.env
fi

# --import dotenv/config erbij: audit-standup importeert de standup-module
# rechtstreeks en die leest de database al bij het laden.
export NODE_OPTIONS="--conditions=react-server --import dotenv/config"

echo "TYPECHECK EN BUILD"
npx tsc --noEmit || { echo "  🔴 typecheck mislukt"; exit 1; }
echo "  🟢 typecheck schoon"
# Eerst opvangen, dan pas doorzoeken. `grep -q` sluit de pijp zodra hij iets
# vindt, npm krijgt SIGPIPE, en met pipefail leek een geslaagde build mislukt.
BUILD=$(npm run build 2>&1)
if echo "$BUILD" | grep -qi "compiled successfully"; then
  echo "  🟢 build schoon"
else
  echo "  🔴 build mislukt"
  echo "$BUILD" | tail -20
  exit 1
fi

echo ""
echo "TESTSETS"
GOED=0; FOUT=0; STUK=""
for s in audit-rechten audit-bewaking audit-standup audit-creators audit-klantportal \
         audit-rapportage audit-contract audit-voorstellen audit-studio audit-facturen \
         audit-gereedschap audit-randgevallen; do
  UIT=$(npx tsx "scripts/$s.mts" 2>&1 | tail -1)
  printf "  %-22s %s\n" "$s" "$UIT"
  # Een testset die crasht geeft geen telregel terug. Zonder deze controle
  # telde de runner die crash als nul fouten en bleef alles groen — precies
  # het soort stilte waar een testset waardeloos van wordt.
  if ! echo "$UIT" | grep -qE '^[0-9]+ geslaagd, [0-9]+ mislukt'; then
    echo "                         🔴 geen telling teruggekregen — deze set is gecrasht"
    FOUT=$((FOUT + 1)); STUK="$STUK $s(crash)"
    continue
  fi

  G=$(echo "$UIT" | grep -oE '^[0-9]+')
  F=$(echo "$UIT" | grep -oE '[0-9]+ mislukt' | grep -oE '^[0-9]+')
  GOED=$((GOED + G)); FOUT=$((FOUT + F))
  [ "$F" != "0" ] && STUK="$STUK $s"
done

echo ""
npx tsx scripts/audit.mts 2>&1 | tail -1

echo ""
echo "──────────────────────────────────────────────"
echo "  $GOED geslaagd · $FOUT mislukt"
[ -n "$STUK" ] && echo "  stuk:$STUK"
[ "$FOUT" != "0" ] && exit 1
exit 0
