#!/bin/bash
# DMG mit Hintergrund und Pfeil «in Programme ziehen» (dmg/einstellungen.py).
# dmgbuild schreibt das Fensterlayout selbst - kein Finder noetig, laeuft
# auch auf den GitHub-Runnern.
#
#   dmg-bauen.sh "<Pfad>/FWV Musik.app" "FWV Musik" <ziel.dmg>
set -euo pipefail
APP=$1 VOLUME=$2 ZIEL=$3
HIER="$(cd "$(dirname "$0")" && pwd)"
if ! python3 -c 'import dmgbuild' 2>/dev/null; then
  python3 -m pip install --quiet --user 'dmgbuild==1.6.7' 2>/dev/null ||
    python3 -m pip install --quiet --user --break-system-packages 'dmgbuild==1.6.7'
fi
python3 -m dmgbuild -s "$HIER/dmg/einstellungen.py" \
  -D app="$APP" -D einstellungen="$HIER/dmg/einstellungen.py" \
  "$VOLUME" "$ZIEL"
