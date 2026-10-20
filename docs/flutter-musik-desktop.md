# FWV Musik – Desktop-Programm

Stand 20.10.2026. Der Musik-Bereich der Mitglieder-App (Playlist-Editor,
Radiosender, Player, «Im Schopf») als **eigenes Programm** für macOS, Linux
und Windows: `flutter/musik`, Paket `fwv_musik`.

## Was drin ist

- **Playlists** ansehen, anlegen, bearbeiten (Titelsuche, Liste abgleichen),
  löschen.
- **Radiosender** anlegen und löschen.
- **Hören am Computer:** ganze Playlists, einzelne Titel, Radio (gestreamt
  über die Hör-Freigabe von api-members, wie auf dem Handy).
- **Im Schopf:** den Laptop im Lokal fernbedienen – nur Gruppe Roter
  Schopf, Vorstand, admin (dieselbe Regel prüft api-members).

Die Bildschirme kommen unverändert aus `flutter/fwv_roterschopf`
(`MusikScreen`). Was dort geändert wird, landet in beiden Apps. Die App
selbst hat nur Anmeldung und Start (`lib/main.dart`, `lib/anmeldung.dart`,
`lib/dienste.dart`).

## Anmeldung

Nur Vereinskonto (Authentik), über Loopback im System-Browser – dieselbe
`LoopbackAnmeldung` wie die Mitglieder-App auf dem Desktop
(`package:fwv_core/desktop.dart`, Ablauf in `docs/flutter-desktop.md`).
Gleicher Authentik-Provider **fwv-members-app**, darum ist in Authentik
nichts einzutragen. Kein QR-Code, kein Organisator-Zugang.

Die Sitzung liegt im Schlüsselbund des Systems (`SichererSpeicher`).

## Ton je System

| System | Wiedergabe | Zusatz |
|---|---|---|
| macOS | just_audio (AVPlayer) | just_audio_background: Medientasten, «Jetzt läuft» |
| Linux | just_audio_media_kit → libmpv | `libmpv2` auf dem System (das .deb zieht es mit) |
| Windows | just_audio_media_kit → libmpv | `libmpv-2.dll` liegt im Programmordner |

Bauen auf Linux braucht zusätzlich `libmpv-dev`.

## Release

Tag `musik-vX.Y.Z` → `.github/workflows/build-desktop-musik.yml`:
Analyse und Tests (`fwv_core`, `fwv_roterschopf`, `musik`), dann

- Linux: `fwv-musik_X.Y.Z_amd64.deb` und `fwv-musik-X.Y.Z-linux-x64.tar.gz`
- Windows: `fwv-musik-X.Y.Z-windows-x64-setup.exe` (Inno Setup,
  `flutter/packaging/windows-setup.iss`, ohne Administratorrechte)
- macOS: `fwv-musik-X.Y.Z-macos.dmg` und `.zip` (unsigniert)

und ein GitHub-Release `musik-vX.Y.Z`, **nie** «Latest» (das gehört dem
Updater von vorstand-desktop). Auf main/PR prüft `flutter-apps.yml` Analyse,
Tests und dass Linux baut.

Lokal:

    cd flutter/musik
    flutter test
    flutter run -d macos

## Offen

- Kein Update-Hinweis in der App (Download von der Release-Seite).
- Unsigniert auf Windows und macOS.
- Kein Eintrag auf www.fwv-raura.ch/download/.
- Eigenes Symbol (heute das Mitglieder-Logo).
