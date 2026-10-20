---
name: fwv-kasse-testen
description: Kassen-App (flutter/kasse) und Web-Kasse (order.fwv-raura.ch) im Android-Emulator gegen ein lokales Kassen-Backend durchspielen, ohne die echten Daten anzufassen - und eine neue Kassen-App releasen. Verwenden bei "im Emulator testen", "Kasse testen", "App laedt nicht", "neue Kassen-App", "Updater", vor jedem kasse-v*-Tag.
---

# Kasse im Emulator testen und releasen

Release-Builds koennen anders laufen als Tests und Debug-Builds. Die
Kassen-App 2.0/2.1 stuerzte beim Start ab, weil R8 Methoden von
shared_preferences entfernt hatte. Seither ist R8 aus
(`android/app/build.gradle.kts`). **Eine App-Aenderung ist erst fertig,
wenn das APK von der Website im Emulator startet.**

## 1. Lokales Testsystem (nie die echten Daten)

Postgres im Scratchpad (nur TCP, der Socketpfad waere zu lang):
```sh
P=/opt/homebrew/opt/postgresql@17/bin; S=<scratchpad>
$P/initdb -D $S/pg/data -U orderuser --auth=trust
$P/pg_ctl -D $S/pg/data -o "-p 55432 -k ''" -l $S/pg/log start
$P/createdb -h 127.0.0.1 -p 55432 -U orderuser orderdb
psql -h 127.0.0.1 -p 55432 -U orderuser orderdb -f simple-order-system/init-db.sql
```
Echte Artikelliste nur lesen und lokal einspielen: `settings.artikel_cache`
vom T400 holen (`psql -At -c "select value from settings where
key='artikel_cache'"`) und lokal als `artikel_cache` einfuegen.

Backend (`simple-order-system/backend`) mit einer env-Datei:
`DB_HOST=127.0.0.1 DB_PORT=55432 DB_NAME=orderdb DB_USER=orderuser
ORDER_API_KEY=test JWT_SECRET=<irgendwas> KASSE_VOR_ORT=true PORT=3999`
und **alle Fremd-URLs auf einen toten Port** (`CLOUD_ORDER_URL`,
`INVENTORY_API_URL`, `EVENTS_API_URL`, `MEMBERS_API_URL` =
`http://127.0.0.1:9`). Sonst schiebt das Testsystem Bestellungen in die
echte Cloud. Start: `npx tsx src/index.ts`.
- Web-Kasse mit Anmeldung testen: Token erzeugen mit
  `signMitgliedPosToken` aus `src/auth.ts` (gleiche env), Seite mit
  `?token=…` oeffnen.
- App mit Passwort testen: zusaetzlich `LOCAL_MODE=true ADMIN_PASSWORD=<test>`.
  Das ist ein erfundenes Test-Passwort und keine echte Anmeldung.

Ohne Drucker meldet die Kasse «Bon nicht gedruckt». Das ist hier richtig so.

## 2. Emulator sauber starten und verbinden

Jeder Test beginnt mit einem frisch zurueckgesetzten Emulator (keine alten
Apps, Logins oder Daten; haelt die AVD auch klein):
```sh
~/Library/Android/sdk/emulator/emulator -avd fwv-pixel -wipe-data -no-snapshot-save &
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = 1 ]; do sleep 2; done
```
Danach:
```sh
adb reverse tcp:3999 tcp:3999      # Backend
adb reverse tcp:4173 tcp:4173      # Web-Kasse (vite preview)
```
**Web-Kasse:** `VITE_API_URL=http://localhost:3999/api VITE_WS_URL=ws://localhost:3999/ws
npx vite build --outDir $S/pwa-dist` und dann `npx vite preview --outDir $S/pwa-dist --port 4173`.
In Chrome im Emulator oeffnen. Knoepfe ueber CDP antippen
(`adb forward tcp:9446 localabstract:chrome_devtools_remote`,
`Runtime.evaluate` mit `button.click()`). Zahlenfelder per
`adb shell input tap` und `input text`.

**App:** Release-Build mit umgebogenen Adressen:
```sh
cp android/app/src/main/AndroidManifest.xml $S/Manifest.orig   # IMMER frisch sichern
sed -i '' 's|<application|<application android:usesCleartextTraffic="true"|' android/app/src/main/AndroidManifest.xml
flutter build apk --release --dart-define=KASSE_CLOUD=http://localhost:3999 --dart-define=KASSE_LOKAL=http://localhost:1
cp $S/Manifest.orig android/app/src/main/AndroidManifest.xml   # zuruecksetzen, nie committen
```
**`KASSE_LOKAL` immer setzen.** Der Mac haengt per WireGuard im
Schopf-Netz, und ohne die Variable spricht die Test-App den **echten T400**
an (17.10.2026 passiert, der T400 lehnte das Test-Token ab).
Signaturkonflikt mit der installierten App: `adb uninstall ch.fwvraura.kasse`
(nur im Emulator).

## 3. Was durchspielen

- Bar: Artikel → Bar → Rueckgeld → abschliessen; in der DB `paid/cash`.
- Tisch: zwei Bestellungen an einen Tisch, die Kueche meldet nur einen Teil
  fertig (`PATCH /api/orders/:id/items/complete`). Unter Tische muss der
  **ganze gebuchte Betrag** offen stehen. Teilbetrag, dann «Alles bezahlen»;
  danach muss der Tisch weg sein, auch wenn Artikel noch nicht erledigt sind.
- Nach dem Senden fragt die Kasse «Später bezahlen / Karte / Bar / TWINT».
- `select * from kassen_geraete`: App (`app`) und Web-Kasse (`pwa`) melden sich.
- Updater: Build mit `--build-name=2.0.0` → blaues Banner «Neue Kassen-App …».
  Erlaubnis im Emulator mit
  `adb shell appops set ch.fwvraura.kasse REQUEST_INSTALL_PACKAGES allow`.
  Erwartet wird, dass sich der Android-Installer oeffnet. Das Update selbst
  scheitert hier an der Signatur (Debug- statt kds-Schluessel), das ist
  normal.

Aufraeumen: App deinstallieren, `pkill -f "tsx src/index.ts"`,
`pkill -f "vite preview"`, `pg_ctl … stop`, `adb reverse --remove-all`,
`adb emu kill` (der naechste Test setzt den Emulator ohnehin zurueck).

## 4. Release

1. Commit und Push, dann Tag `kasse-vX.Y[.Z]` **auf den eigenen Commit**,
   nie auf einen `chore(release) … [skip ci]`-Commit. Dort laufen auch
   Tag-Builds nicht (2.0 blieb so ungebaut).
2. Den Lauf `build-android-kasse.yml` beobachten, dann
   `sudo systemctl start app-downloads.service` auf `docker.fwv-raura.ch`
   (Skill `fwv-app-downloads`).
3. **Website-APK im Emulator starten:**
   `curl -o k.apk https://www.fwv-raura.ch/download/kasse.apk`, installieren,
   starten, `adb logcat -d | grep -c 'E flutter'` muss 0 sein,
   `dumpsys package ch.fwvraura.kasse | grep versionName`.
4. Die Geraete aktualisieren sich danach selbst (Banner, ab 2.3). Aeltere
   Versionen einmal von Hand ueber /download/kasse.apk installieren.

## Web-Kasse ausliefern

Die Web-Kasse ist der Container `order-frontend` (Skill `fwv-website-deploy`,
Watchtower `--run-once order-frontend`). Kiosk-Geraete holen neue
Fassungen alle 10 min selbst, aber nur bei leerem Warenkorb
(`frontend/src/main.tsx`). Geraete mit einer Fassung von vor dem
17.10.2026 muss man einmal von Hand neu laden.
