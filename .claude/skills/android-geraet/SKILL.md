---
name: android-geraet
description: Android-Handy per USB (adb) untersuchen und bedienen - Bildschirm ansehen, Texte lesen, tippen, Chrome fernsteuern, App/APK installieren und Versionen/Signaturen pruefen, Logs lesen. Verwenden, wenn der Nutzer sein Smartphone (z.B. Samsung A37) an den Mac haengt, etwas auf dem Handy nicht klappt (Download, Installation, Mitteilung, Player) oder ein Ablauf auf einem echten Geraet nachvollzogen werden soll.
---

# Android-Geraet per USB

adb liegt unter `~/Library/Android/sdk/platform-tools/adb` (nicht im PATH).
Hilfsskripte in diesem Ordner (`.claude/skills/android-geraet/`).
Es ist das Handy des Nutzers: nur tun, was der Ablauf braucht, keine
Einstellungen nebenbei aendern, keine Logins eintippen (das macht er).

## Verbinden und wach halten

```sh
ADB=~/Library/Android/sdk/platform-tools/adb
$ADB devices -l                       # "device" = bereit, "unauthorized" = am Handy erlauben
$ADB shell svc power stayon usb       # bleibt an, solange das Kabel steckt (Nutzer-Wunsch)
$ADB shell input keyevent KEYCODE_WAKEUP
```
Zurueck auf normal: `$ADB shell svc power stayon false`.

**Kabellos (Wireless Debugging, `ip:port` vom Nutzer):** `stayon usb` wirkt
ohne Kabel nicht - der Bildschirm geht aus, die Verbindung bricht ab und
der Port wechselt. Darum gleich nach dem Verbinden:

```sh
$ADB connect <ip:port>
$ADB -s <ip:port> shell svc power stayon true    # an, auch ohne Kabel
$ADB -s <ip:port> shell input keyevent KEYCODE_WAKEUP
```
Am Ende der Sitzung unbedingt `stayon false`, sonst leert sich der Akku.
Neue Adresse nach Abbruch: `$ADB mdns services` zeigt `_adb-tls-connect`.

## Sehen, was das Handy zeigt

```sh
$ADB exec-out screencap -p > $SCRATCH/h.png && sips -Z 900 $SCRATCH/h.png --out $SCRATCH/hk.png
```
Dann `hk.png` mit dem Read-Tool ansehen (verkleinert, sonst zu gross).
Texte statt Bild: `texte.sh` (uiautomator). Oberste Activity:
`$ADB shell dumpsys activity activities | grep topResumedActivity`.

## Tippen

- Auf einen sichtbaren Text: `tippe.sh "Trotzdem herunterladen"`.
- Wischen: `$ADB shell input swipe 540 1700 540 900 300`.
- Bildschirm 1080x2340 (A37); Koordinaten aus uiautomator sind echte Pixel.

## Chrome fernsteuern (Webseiten)

```sh
$ADB forward tcp:9444 localabstract:chrome_devtools_remote
curl -s http://127.0.0.1:9444/json        # offene Tabs
node --experimental-websocket chrome-tipp.mjs fwv-raura.ch/apps.html 'a[href*="members-latest.apk"]'
```
`chrome-tipp.mjs` scrollt das Element in die Mitte (ohne Animation, die
Website scrollt sonst sanft und misst falsch) und loest einen echten
Touch aus - wie ein Finger, also mit "Benutzergeste" (Downloads usw.).

## Apps und APKs

```sh
$ADB shell dumpsys package com.fwv.members | grep -E "versionName|versionCode|lastUpdateTime|installerPackageName"
$ADB install -r datei.apk                  # Update ueber bestehende App (gleiche Signatur noetig)
python3 -I apk-signatur.py datei.apk      # Signatur ohne Java
```
installerPackageName `com.android.vending` = aus Play, `null` = APK/adb.
Mitglieder-App: Play signiert mit `EF:99:A7:…`, die APK auf der Website
ist seit 15.10.2026 dieselbe (von Play geholt, `.github/scripts/play-apk.py`).

## Logs

```sh
$ADB logcat -d -t 500 | grep -iE "SchopfPlayer|flutter|PackageInstaller|FirebaseMessaging"
```
Schopf-Player meldet zusaetzlich an den Server (`SCHOPF-DIAGNOSE` im Log
von fwv-api-members), aber nur mit Freigabe aus einer Schicht.

## Bekannte Stolpersteine (am A37 gesehen)

- **APK-Download "haengt bei 100 %":** Chrome wartet auf «Die Datei könnte
  schädlich sein → Trotzdem herunterladen». In einem eingebetteten Fenster
  (CustomTabActivity, z.B. Link aus WhatsApp oder Home-Bildschirm-Web-App)
  erscheint die Frage oft nicht; dort kommt nach dem Laden auch kein
  «Öffnen» - die Datei liegt dann in den Mitteilungen.
- Danach: Auswahl «Öffnen mit» (wegen weiterer Installer-Apps) →
  **Paketinstallation**, dann «Diese App aktualisieren?», dann **Google
  Play Protect «App-Scan empfohlen» → App scannen → Installieren**
  (App ist nur im geschlossenen Test, Play Protect kennt sie nicht).
- Der Schopf-Player erscheint nur mit bestaetigter Schicht (1 h vor bis
  1 h nach); ohne Schicht auch keine Diagnose-Meldungen.
- Downloads liegen unter `/sdcard/Download/` (`.pending-…` = noch nicht bestaetigt).
