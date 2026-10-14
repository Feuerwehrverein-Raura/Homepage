#!/usr/bin/env bash
# Baut aus dem Linux-Bundle (flutter build linux --release) ein .deb-Paket.
# Aufruf aus flutter/mitglieder:
#   linux/packaging/deb-bauen.sh <version> <ziel.deb>
#
# Aufbau wie frueher vorstand-desktop (Tauri-.deb):
#   /opt/fwv-raura/                      das Bundle (Programm, lib/, data/)
#   /usr/bin/fwv-raura                   Verweis auf das Programm
#   /usr/share/applications/…desktop     Eintrag im Startmenue
#   /usr/share/icons/hicolor/256x256/…   Symbol
# Abhaengigkeiten: GTK 3 (Fenster) und libsecret (Schluesselbund fuer die
# Anmeldung, flutter_secure_storage). Auf Ubuntu 24.04 heisst GTK
# libgtk-3-0t64, darum die Alternative.
set -euo pipefail

VERSION="$1"
ZIEL="$2"
BUNDLE="build/linux/x64/release/bundle"
HIER="$(cd "$(dirname "$0")" && pwd)"

[ -x "$BUNDLE/fwv_mitglieder" ] || { echo "Bundle fehlt: $BUNDLE" >&2; exit 1; }

ARBEIT="$(mktemp -d)"
trap 'rm -rf "$ARBEIT"' EXIT
PAKET="$ARBEIT/fwv-raura"

mkdir -p "$PAKET/DEBIAN" "$PAKET/opt/fwv-raura" "$PAKET/usr/bin" \
  "$PAKET/usr/share/applications" "$PAKET/usr/share/icons/hicolor/256x256/apps"
cp -a "$BUNDLE/." "$PAKET/opt/fwv-raura/"
ln -s /opt/fwv-raura/fwv_mitglieder "$PAKET/usr/bin/fwv-raura"
install -m 644 "$HIER/ch.fwvraura.members.desktop" "$PAKET/usr/share/applications/"
install -m 644 "$BUNDLE/data/app_icon.png" \
  "$PAKET/usr/share/icons/hicolor/256x256/apps/ch.fwvraura.members.png"

GROESSE="$(du -sk "$PAKET" | cut -f1)"
cat > "$PAKET/DEBIAN/control" <<EOF
Package: fwv-raura
Version: ${VERSION}
Section: misc
Priority: optional
Architecture: amd64
Installed-Size: ${GROESSE}
Depends: libgtk-3-0t64 | libgtk-3-0, libsecret-1-0
Recommends: gnome-keyring | kwalletmanager
Maintainer: Feuerwehrverein Raura <vorstand@fwv-raura.ch>
Homepage: https://www.fwv-raura.ch
Description: FWV Raura - App für Mitglieder, Organisatoren und Vorstand
 Desktop-Fassung der Mitglieder-App des Feuerwehrvereins Raura
 (Flutter). Ersetzt das bisherige Vorstand-Desktop-Programm.
EOF

dpkg-deb --build --root-owner-group "$PAKET" "$ZIEL"
echo "Gebaut: $ZIEL"
