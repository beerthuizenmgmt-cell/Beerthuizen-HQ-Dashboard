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

export DOTENV_CONFIG_PATH=.env.production
export NODE_OPTIONS=--conditions=react-server

echo "TYPECHECK EN BUILD"
npx tsc --noEmit || { echo "  🔴 typecheck mislukt"; exit 1; }
echo "  🟢 typecheck schoon"
npm run build 2>&1 | grep -qi "compiled successfully" && echo "  🟢 build schoon" || { echo "  🔴 build mislukt"; exit 1; }

echo ""
echo "TESTSETS"
GOED=0; FOUT=0; STUK=""
for s in audit-rechten audit-bewaking audit-standup audit-creators audit-klantportal \
         audit-rapportage audit-contract audit-voorstellen audit-studio audit-facturen \
         audit-gereedschap audit-randgevallen; do
  UIT=$(npx tsx "scripts/$s.mts" 2>&1 | tail -1)
  printf "  %-22s %s\n" "$s" "$UIT"
  G=$(echo "$UIT" | grep -oE '^[0-9]+' || echo 0)
  F=$(echo "$UIT" | grep -oE '[0-9]+ mislukt' | grep -oE '^[0-9]+' || echo 0)
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
