---
name: fwv-app-downloads
description: Android-Apps des Vereins (Mitglieder, Kueche, Kasse) zum Download auf www.fwv-raura.ch/download/ bringen und auf der Apps-Seite zeigen - neue Version releasen (Tags kds-v*, kasse-v*, members-v*), Abholung pruefen, neue App aufnehmen. Verwenden bei "APK auf die Website", "App herunterladen", "neue Kassen-/Kuechen-App", "Download geht nicht", "auf der App-Seite einbauen".
---

# App-Downloads auf www.fwv-raura.ch

Die APKs liegen auf der **eigenen Website**, nicht mehr als GitHub-Link
(die Weiterleitung auf GitHubs Dateiserver blieb auf manchen Handys bei
100 % haengen; Android 7 kennt GitHubs neue Zertifikatskette nicht).

| App | Adresse | Quelle (GitHub-Release) | Projekt |
|---|---|---|---|
| Mitglieder | `/download/mitglieder.apk` | `members-latest` (Play-signiert) | `flutter/mitglieder` |
| Kueche | `/download/kueche.apk` | neuestes `kds-v*` (`*-release.apk`) | `simple-order-system/kitchen-display-android` |
| Kasse | `/download/kasse.apk` | neuestes `kasse-v*` (`*-release.apk`) | `flutter/kasse` |

`/download/versionen.json` nennt je App Version, SHA-256 und Stand -
`apps.html` liest daraus Link und Versionsnummer (GitHub nur als Fallback).

## So kommt eine Datei dorthin

Vereinsserver `docker.fwv-raura.ch`:
- `/opt/app-downloads/holen.sh` (Quelle im Repo: `docker/app-downloads/holen.sh`),
  systemd-Timer `app-downloads` alle 15 min. Laedt nur bei Aenderung
  (Asset-ID + Stand in `/opt/app-downloads/stand/`).
- Ablage `/opt/app-downloads/dateien`, im Container `fwv-frontend-website`
  schreibgeschuetzt als `/usr/share/nginx/html/download` eingehaengt
  (`docker-compose.prod.yml`, Server-Datei `/opt/docker/fwv-website/`).
- nginx (`docker/frontend-website/nginx.conf`, `location ^~ /download/`):
  Typ `application/vnd.android.package-archive` - ohne ihn erkennt Android
  die Datei nicht als App.

Sofort holen statt 15 min warten:
```sh
ssh stefan@docker.fwv-raura.ch 'sudo systemctl start app-downloads.service; jq -c . /opt/app-downloads/dateien/versionen.json'
```

## Neue Version einer App

- **Kueche:** `git tag kds-vX.Y && git push origin kds-vX.Y`
  (Workflow `build-android-kds.yml`, versionCode = X*1000+Y*100+Z).
- **Kasse:** `git tag kasse-vX.Y && git push origin kasse-vX.Y`
  (Workflow `build-android-kasse.yml`, gleiche Signatur wie die Kueche).
  Vorher und nachher Skill `fwv-kasse-testen` (Emulator, Website-APK starten).
  **Nie auf einen `[skip ci]`-Commit taggen**: dort laeuft der Build nicht.
- **Mitglieder:** Skill `fwv-members-release` (Tag `members-vX.Y.Z`; der
  Workflow verschiebt `members-latest`).

Danach: Build beobachten (`gh run watch`), dann Abholung starten (oben) und
pruefen:
```sh
curl -sI https://www.fwv-raura.ch/download/kasse.apk | grep -i content-type
```

## Kassen-App (native, Flutter)

`flutter/kasse`, Paket `ch.fwvraura.kasse`, Workflow `build-android-kasse.yml`
(Flutter 3.47.5, `flutter build apk`, danach mit apksigner und dem
Kuechen-Schluessel signiert: Secrets `KEYSTORE_BASE64`/`KEYSTORE_PASSWORD`,
Alias `kds`). versionCode = X*1000+Y*100+Z - die fruehere TWA-Huelle war
kasse-v1.0 (Code 1000), deshalb installiert sich 2.x direkt darueber.
Eine einzige App, laeuft im Single-App-Kiosk (Fully). Ab 2.3 aktualisiert
sie sich selbst: `lib/src/updater.dart` liest `/download/versionen.json`
(Version + SHA-256), `MainActivity.kt` laedt, prueft und oeffnet den
Installer (Banner, nur bei leerem Warenkorb). Die Datei
`order.fwv-raura.ch/.well-known/assetlinks.json` stammt noch von der
TWA-Huelle und schadet nicht.

## Neue App aufnehmen

Desktop-Programme (macOS, Windows, Linux) laufen anders - Skill
`fwv-desktop-apps`. Fuer jede neue App gilt: erst fertig, wenn sie auf
`apps.html` steht und der Download live geht.

1. Release-Workflow mit eigenem Tag-Praefix (`<app>-v*`), Asset `*-release.apk`,
   `make_latest: false` (sonst kapert es den Desktop-Updater).
2. In `docker/app-downloads/holen.sh` eine Zeile `hol <name> "$tag" ...`
   ergaenzen, auf den Server kopieren (`sudo install -m 755 ... /opt/app-downloads/holen.sh`).
3. Karte in `docker/frontend-website/apps.html` (Abschnitt Android Apps,
   Vorlage: Karte "Kasse"), Ids `<name>-download` / `<name>-version`, und in
   `eigeneDownloads()` `setzen('<name>', v.<name>)`.
4. Website ausliefern (Skill `fwv-website-deploy`) und Download pruefen.
