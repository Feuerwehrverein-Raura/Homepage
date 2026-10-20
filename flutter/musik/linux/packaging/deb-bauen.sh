#!/usr/bin/env bash
# Baut aus dem Linux-Bundle (flutter build linux --release) ein .deb-Paket.
# Aufruf aus flutter/musik:
#   linux/packaging/deb-bauen.sh <version> <ziel.deb>
#
# Aufbau wie bei der Mitglieder-App (flutter/mitglieder/linux/packaging):
#   /opt/fwv-musik/                      das Bundle (Programm, lib/, data/)
#   /usr/bin/fwv-musik                   Verweis auf das Programm
#   /usr/share/applications/…desktop     Eintrag im Startmenue
#   /usr/share/icons/hicolor/256x256/…   Symbol
# Abhaengigkeiten: GTK 3 (Fenster), libsecret (Schluesselbund fuer die
# Anmeldung) und libmpv (spielt die Musik, ueber just_audio_media_kit).
# Auf Ubuntu 24.04 heisst GTK libgtk-3-0t64, darum die Alternative.
set -euo pipefail

VERSION="$1"
ZIEL="$2"
BUNDLE="build/linux/x64/release/bundle"
HIER="$(cd "$(dirname "$0")" && pwd)"

[ -x "$BUNDLE/fwv_musik" ] || { echo "Bundle fehlt: $BUNDLE" >&2; exit 1; }

ARBEIT="$(mktemp -d)"
trap 'rm -rf "$ARBEIT"' EXIT
PAKET="$ARBEIT/fwv-musik"

mkdir -p "$PAKET/DEBIAN" "$PAKET/opt/fwv-musik" "$PAKET/usr/bin" \
  "$PAKET/usr/share/applications" "$PAKET/usr/share/icons/hicolor/256x256/apps"
cp -a "$BUNDLE/." "$PAKET/opt/fwv-musik/"
ln -s /opt/fwv-musik/fwv_musik "$PAKET/usr/bin/fwv-musik"
install -m 644 "$HIER/ch.fwvraura.musik.desktop" "$PAKET/usr/share/applications/"
install -m 644 "$BUNDLE/data/app_icon.png" \
  "$PAKET/usr/share/icons/hicolor/256x256/apps/ch.fwvraura.musik.png"

GROESSE="$(du -sk "$PAKET" | cut -f1)"
cat > "$PAKET/DEBIAN/control" <<STEUER
Package: fwv-musik
Version: ${VERSION}
Section: sound
Priority: optional
Architecture: amd64
Installed-Size: ${GROESSE}
Depends: libgtk-3-0t64 | libgtk-3-0, libsecret-1-0, libmpv2
Recommends: gnome-keyring | kwalletmanager
Maintainer: Feuerwehrverein Raura <vorstand@fwv-raura.ch>
Homepage: https://www.fwv-raura.ch
Description: FWV Musik - Playlists und Radiosender des Roten Schopfs
 Der Musik-Bereich der Mitglieder-App des Feuerwehrvereins Raura als
 eigenes Programm: Playlists bearbeiten, Radiosender pflegen, am Computer
 hoeren und den Laptop im Vereinslokal fernbedienen.
STEUER

dpkg-deb --build --root-owner-group "$PAKET" "$ZIEL"
echo "Gebaut: $ZIEL"
