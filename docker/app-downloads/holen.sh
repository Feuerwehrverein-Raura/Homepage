#!/bin/bash
# App-Downloads auf der eigenen Website (Oktober 2026)
#
# Vereinsserver: /opt/app-downloads/holen.sh, Timer app-downloads (15 min).
# Holt die neuesten App-Fassungen von den GitHub-Releases und legt sie unter
# /opt/app-downloads/dateien ab - eingehaengt in fwv-frontend-website als
# https://www.fwv-raura.ch/download/. Vorher gingen die Links direkt auf
# GitHub; die Weiterleitung auf GitHubs Dateiserver machte auf manchen Handys
# Probleme (Download blieb bei 100 % stehen, altes Kuechentablet).
#
#   mitglieder.apk  <- Release members-latest (Play-signiert, Universal-APK)
#   kueche.apk      <- neuestes Release kds-v*  (kitchen-display-*-release.apk)
#   kasse.apk       <- neuestes Release kasse-v* (kasse-*-release.apk)
#   versionen.json  <- Version, SHA-256 und Stand je App (auch fuer Apps selbst)
set -euo pipefail
ZIEL=/opt/app-downloads/dateien
STAND=/opt/app-downloads/stand
API=https://api.github.com/repos/Feuerwehrverein-Raura/Homepage
mkdir -p "$ZIEL" "$STAND"

releases=$(curl -fsS "$API/releases?per_page=60")

# Neuester Tag mit Praefix (nach Versionsnummer, nicht nach Datum)
neueste() {
  echo "$releases" | jq -r --arg p "$1" '
    [.[] | select(.draft | not) | select(.tag_name | startswith($p))]
    | sort_by(.tag_name | ltrimstr($p) | split(".") | map(tonumber? // 0))
    | last | .tag_name // empty'
}

# hol NAME TAG ASSET-MUSTER VERSION -> JSON-Eintrag; laedt nur bei Aenderung
hol() {
  local name=$1 tag=$2 muster=$3 version=$4 zeile id stand url
  zeile=$(curl -fsS "$API/releases/tags/$tag" | jq -r --arg m "$muster" \
    '[.assets[] | select(.name | test($m))][0] | select(. != null) | "\(.id) \(.updated_at) \(.browser_download_url)"')
  if [ -z "$zeile" ]; then echo "$name: kein APK in $tag" >&2; return 1; fi
  read -r id stand url <<<"$zeile"
  if [ "$(cat "$STAND/$name" 2>/dev/null)" != "$id $stand" ] || [ ! -s "$ZIEL/$name.apk" ]; then
    curl -fsSL -o "$ZIEL/.$name.neu" "$url"
    chmod 644 "$ZIEL/.$name.neu"
    mv "$ZIEL/.$name.neu" "$ZIEL/$name.apk"
    echo "$id $stand" > "$STAND/$name"
    logger -t heinzel "app-downloads: $name.apk $version neu abgelegt"
  fi
  printf '"%s":{"datei":"%s.apk","version":"%s","sha256":"%s","stand":"%s"}' \
    "$name" "$name" "$version" "$(sha256sum "$ZIEL/$name.apk" | cut -d' ' -f1)" "$stand"
}

m=$(neueste members-v)
k=$(neueste kds-v)
ka=$(neueste kasse-v)
eintraege=()
eintraege+=("$(hol mitglieder members-latest '^members-latest\.apk$' "${m#members-v}")") || true
eintraege+=("$(hol kueche "$k" '-release\.apk$' "${k#kds-v}")") || true
if [ -n "$ka" ]; then eintraege+=("$(hol kasse "$ka" '-release\.apk$' "${ka#kasse-v}")") || true; fi
json="{$(IFS=,; echo "${eintraege[*]}" | sed 's/^,//;s/,,*/,/g;s/,$//')}"
echo "$json" | jq . > "$ZIEL/.versionen.neu"   # jq prueft das JSON
chmod 644 "$ZIEL/.versionen.neu"
mv "$ZIEL/.versionen.neu" "$ZIEL/versionen.json"
