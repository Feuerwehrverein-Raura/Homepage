# Mitglieder-App als Desktop-Programm

Stand 14.10.2026. Dieselbe Flutter-App (`flutter/mitglieder`) läuft als
Programm auf **Linux** (Pflicht, zuerst), **Windows** und **macOS**. Sie
ersetzt `vorstand-desktop` (Tauri), siehe `docs/flutter-entscheidung.md`
(Änderung 14.10.2026).

## Was anders ist als auf dem Handy

| Thema | Handy | Desktop |
|---|---|---|
| Anmeldung | flutter_appauth, `com.fwv.members:/oauth2redirect` | eigener Loopback-Login (unten) |
| Token-Speicher | Schlüsselbund / Keystore | flutter_secure_storage: Linux libsecret, Windows Anmeldeinformationen, macOS Schlüsselbund (alter Datei-Schlüsselbund) |
| Dateien (PDF, .ics) | Teilen-Menü | unter «Downloads» speichern und mit dem System-Programm öffnen |
| Update | Play / GitHub-APK | Hinweis «Neue Version verfügbar» aus `members-latest.json`, Knopf führt zur Release-Seite |
| Push | Firebase | keiner (Firebase gibt es für Linux/Windows nicht) |
| Adressbuch | Android: Abgleich | CardDAV (wie iOS) |

Code: `lib/desktop/desktop.dart`, `lib/anmeldung/loopback_anmeldung.dart`,
Weiche in `Dienste.echt()` (`lib/dienste.dart`).

Fenster: Titel «FWV Raura», 1280×800, mindestens 900×600 (darunter wird
die breite Ansicht mit Seitenleiste ab 840 dp unbrauchbar).

## Anmeldung (Loopback, RFC 8252)

1. Die App öffnet einen Empfänger auf `127.0.0.1` mit einem freien Port.
2. Sie öffnet den System-Browser mit der Anmeldeseite von Authentik
   (Authorization Code, PKCE S256, `state`, `nonce`), Rückleitung auf
   `http://127.0.0.1:<port>/callback`.
3. Der Browser kommt zurück, die App prüft `state`, tauscht den Code beim
   Token-Endpunkt (`https://auth.fwv-raura.ch/application/o/token/`, ohne
   Client-Secret) und prüft die `nonce` im ID-Token.

Erneuert wird wie auf dem Handy mit dem Refresh-Token am selben Endpunkt.
Wer den Browser-Tab schliesst, bricht im Login-Screen mit «Abbrechen» ab
(sonst nach 10 Minuten von selbst).

### In Authentik (eingerichtet am 15.10.2026)

Provider **fwv-members-app** → *Redirect URIs/Origins* → zusätzlich zum
bestehenden `com.fwv.members:/oauth2redirect` (strict) einen Eintrag:

| Matching mode | URL |
|---|---|
| Regex | `^http://127\.0\.0\.1:\d+/callback$` |

Der Port wechselt bei jeder Anmeldung, darum Regex (Matching mode pro
Eintrag gibt es seit Authentik 2024.8.5/2024.10.3; Punkte escapen, siehe
CVE-2024-52289). Nur `127.0.0.1`, nicht
`localhost` (RFC 8252, 8.3). Ohne diesen Eintrag zeigt Authentik
«Redirect URI Error» und die Anmeldung auf dem Desktop scheitert.

## Linux

Gebaut auf `ubuntu-latest` (24.04, glibc 2.39). Das Programm läuft auf
Ubuntu 24.04+, Debian 13 und ähnlich neuen Systemen.

- **Laufzeit:** `libgtk-3-0` (24.04: `libgtk-3-0t64`), `libsecret-1-0`, ein
  Secret-Service-Schlüsselbund (GNOME-Schlüsselbund oder KWallet). Ohne
  Schlüsselbund kann die App die Anmeldung nicht speichern.
- **Bauen:** `clang cmake ninja-build pkg-config libgtk-3-dev liblzma-dev
  libstdc++-12-dev libsecret-1-dev`. `libjsoncpp-dev` braucht
  flutter_secure_storage_linux 3.x nicht mehr.
- **Pakete:** `.deb` (`linux/packaging/deb-bauen.sh`: `/opt/fwv-raura`,
  Befehl `fwv-raura`, Startmenü-Eintrag) und `.tar.gz`.

## Windows

`.zip` mit `fwv_mitglieder.exe`, inkl. Visual-C++-Laufzeit. Nicht signiert:
SmartScreen warnt beim ersten Start («Weitere Informationen» → «Trotzdem
ausführen»).

## macOS

`.dmg` und `.zip`, ab macOS 12. **Nicht signiert/notarisiert** (kein
Developer-ID-Zertifikat): beim ersten Start Rechtsklick → «Öffnen». Der
Schlüsselbund läuft ohne «Keychain Sharing» (`usesDataProtectionKeychain:
false` in `fwv_core`), damit das Programm ohne Provisioning-Profil auf
jedem Mac startet.

## Release

Tag `members-v*` (wie Android): `build-android-members.yml` baut zusätzlich
die Jobs *Desktop Linux/Windows/macOS* und hängt die Dateien danach ans
Release (`desktop-release`), feste Namen auch unter `members-latest`
(`members-latest-linux-amd64.deb`, `…-linux-x64.tar.gz`,
`…-windows-x64.zip`, `…-macos.dmg`). Auf main/PR prüft `flutter-apps.yml`
mit `flutter build linux --debug`, dass Linux baut.

## Offen

- Musik (just_audio) gibt es auf Linux/Windows nicht (kein Plugin), der
  Musik-Bereich zeigt dort nichts Abspielbares.
- QR-Code-/Barcode-Scan (mobile_scanner) hat nur auf macOS ein Plugin; auf
  Linux/Windows funktioniert der Scan nicht (Login per QR-Code, Lager).
  Ungetestet, wie sich der Scanner dort meldet.
- Kein automatisches Update wie bei Tauri (nur Hinweis + Download).
- Signieren für Windows (Authenticode) und macOS (Developer ID,
  Notarisierung).
