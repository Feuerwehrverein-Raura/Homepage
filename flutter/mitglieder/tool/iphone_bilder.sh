#!/bin/bash
# iPhone-Bilder fuer die Anleitungen aus dem iOS-Simulator (Device Hub).
# Siehe integration_test/iphone_bilder_test.dart.
#
#   tool/iphone_bilder.sh                         alle Bilder (01-29)
#   tool/iphone_bilder.sh 05-profil,21-austritt   nur diese
#
# Schreibt docker/frontend-website/images/anleitung/ios/NN-*.jpg (540 px
# breit). Nur erfundene Daten (Erika Muster), keine Verbindung zum Server.
set -euo pipefail

cd "$(dirname "$0")/.."
WURZEL=$(cd ../.. && pwd)
ZIEL="$WURZEL/docker/frontend-website/images/anleitung/ios"
ORDNER="$PWD/build/iphone_bilder"
NAME="FWV Tour iPhone 17"
TYP="com.apple.CoreSimulator.SimDeviceType.iPhone-17"
BREITE=540

UDID=$(xcrun simctl list devices available -j | python3 -I -c '
import json, sys
for ds in json.load(sys.stdin)["devices"].values():
    for d in ds:
        if d["name"] == sys.argv[1]:
            print(d["udid"]); sys.exit()
' "$NAME")
if [ -z "$UDID" ]; then
  # Neuester iOS-Simulator.
  UDID=$(xcrun simctl create "$NAME" "$TYP")
fi
# Jeder Lauf startet sauber (Werkszustand), dann Sprache und Region wie im
# Verein - erase setzt auch die Sprache zurueck.
xcrun simctl shutdown "$UDID" 2>/dev/null || true
xcrun simctl erase "$UDID"
xcrun simctl boot "$UDID"
xcrun simctl bootstatus "$UDID" >/dev/null
xcrun simctl spawn "$UDID" defaults write -g AppleLanguages -array de-CH
xcrun simctl spawn "$UDID" defaults write -g AppleLocale -string de_CH
xcrun simctl shutdown "$UDID"
xcrun simctl bootstatus "$UDID" -b >/dev/null
# Das Simulator-Fenster heisst "Device Hub" (nur zum Zuschauen).
HUB="$(xcode-select -p)/../Applications/DeviceHub.app"
[ -d "$HUB" ] && open -g "$HUB" || true
xcrun simctl ui "$UDID" appearance light
# Uhrzeit wie das "jetzt" der Tour (So 11.10.2026, 10:00 in der Zeitzone
# des Macs, die der Simulator uebernimmt). Nur volles ISO mit Millisekunden
# geht zuverlaessig - "10:00" allein lehnt simctl ab ("non-ISO").
OFF=$(date +%z)
JETZT="2026-10-11T10:00:00.000${OFF:0:3}:${OFF:3:2}"
xcrun simctl status_bar "$UDID" override --time "$JETZT" --dataNetwork wifi \
  --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4 \
  --operatorName '' --batteryState discharging --batteryLevel 100

rm -rf "$ORDNER" && mkdir -p "$ORDNER" "$ZIEL"

# Antwortet auf die Anfragen des Tests mit einem Bildschirmfoto.
(
  while true; do
    for a in "$ORDNER"/*.anfrage; do
      [ -e "$a" ] || continue
      n=$(basename "$a" .anfrage)
      xcrun simctl io "$UDID" screenshot --type=png "$ORDNER/$n.png" >/dev/null 2>&1
      sips --resampleWidth "$BREITE" -s format jpeg -s formatOptions 85 \
        "$ORDNER/$n.png" --out "$ZIEL/$n.jpg" >/dev/null
      rm "$a"
      touch "$ORDNER/$n.fertig"
      echo "Foto: ios/$n.jpg"
    done
    sleep 0.2
  done
) &
FOTOGRAF=$!
trap 'kill $FOTOGRAF 2>/dev/null || true' EXIT

flutter test integration_test/iphone_bilder_test.dart -d "$UDID" \
  --dart-define=FOTO_ORDNER="$ORDNER" \
  --dart-define=REPO_WURZEL="$WURZEL" \
  --dart-define=NUR="${1:-}"
