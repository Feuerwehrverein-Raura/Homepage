#!/usr/bin/env bash
# Signiert ein macOS-Programm (.app) mit dem festen Zertifikat des Vereins
# ("FWV Raura Code Signing", selbst ausgestellt, gueltig bis 2046) - fuer
# die Mitglieder-App und FWV Musik, aufgerufen aus den Release-Workflows.
#
# Warum: Die Apps speichern die Anmeldung im Schluesselbund. macOS gibt den
# Eintrag nur dem Programm, das ihn angelegt hat, erkannt an der Signatur.
# Ad-hoc signiert hat jeder Build eine andere - nach jedem Update fragte
# macOS nach dem Passwort. Mit festem Zertifikat bleibt die Signatur gleich,
# "Immer erlauben" gilt dann auch fuer spaetere Versionen. Die Gatekeeper-
# Warnung beim ersten Start bleibt (dafuer braucht es eine Apple Developer ID).
#
# Aufruf: signieren-macos.sh <App.app> <entitlements.plist>
# Umgebung: MACOS_SIGNATUR_P12 (base64), MACOS_SIGNATUR_PASSWORT
# Laeuft nur auf dem Runner: legt einen eigenen Schluesselbund an und
# loescht ihn am Ende wieder.
set -euo pipefail

APP="$1"
ENT="$2"
: "${MACOS_SIGNATUR_P12:?Secret MACOS_SIGNATUR_P12 fehlt}"
: "${MACOS_SIGNATUR_PASSWORT:?Secret MACOS_SIGNATUR_PASSWORT fehlt}"

ARBEIT="$(mktemp -d)"
KC="$ARBEIT/signieren.keychain-db"
KCPW="$(openssl rand -hex 16)"
trap 'security delete-keychain "$KC" 2>/dev/null || true; rm -rf "$ARBEIT"' EXIT

echo "$MACOS_SIGNATUR_P12" | base64 --decode > "$ARBEIT/zert.p12"
security create-keychain -p "$KCPW" "$KC"
security set-keychain-settings -lut 3600 "$KC"
security unlock-keychain -p "$KCPW" "$KC"
security import "$ARBEIT/zert.p12" -k "$KC" -P "$MACOS_SIGNATUR_PASSWORT" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple: -s -k "$KCPW" "$KC" >/dev/null
# Selbst ausgestellt = nicht vertrauenswuerdig, darum ohne -v suchen;
# codesign signiert trotzdem.
ID="$(security find-identity -p codesigning "$KC" | awk '/FWV Raura Code Signing/{print $2; exit}')"
[ -n "$ID" ] || { echo "Zertifikat nicht im Schluesselbund" >&2; exit 1; }

# Erst eingebettete Frameworks und Bibliotheken (innen nach aussen), dann
# die App selbst mit ihren Berechtigungen (Sandbox, Netz).
find "$APP/Contents/Frameworks" -depth \( -name '*.framework' -o -name '*.dylib' \) 2>/dev/null |
  while read -r teil; do
    codesign --force --timestamp=none --keychain "$KC" --sign "$ID" "$teil"
  done
codesign --force --timestamp=none --keychain "$KC" --sign "$ID" --entitlements "$ENT" "$APP"

codesign --verify --deep --strict --verbose=2 "$APP"
codesign -dv "$APP" 2>&1 | grep -E '^(Authority|Identifier|TeamIdentifier)='
echo "Designated Requirement:"
codesign -dr - "$APP" 2>&1 | tail -1
