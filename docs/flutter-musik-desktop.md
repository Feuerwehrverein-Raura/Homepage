# FWV Musik – Desktop-Programm

Stand 30.10.2026. Der Musik-Bereich der Mitglieder-App (Playlist-Editor,
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
- **Interpreten:** die Sammlung nach Interpret, hören und ganz speichern.
- **Gespeichert (offline):** Playlists und Interpreten auf dem Computer
  ablegen; sie spielen auch ohne Netz.

## Offline speichern

`MusikAblage` (`fwv_roterschopf/lib/src/musik/ablage.dart`), Oberfläche in
`offline.dart`. Nur die Desktop-App gibt dem `MusikScreen` eine Ablage –
die Mitglieder-App zeigt davon nichts.

- Geladen wird über die Hör-Freigabe (`GET /kiosk/hoeren`), dieselbe wie
  beim Streamen; am Backend ist nichts dazugekommen.
- Ablage: `Application Support/Musik` (macOS im Container der App,
  Windows `%APPDATA%`, Linux `~/.local/share`), nicht im Cache-Ordner.
  `ablage.json` hält fest, welche Datei zu welchem Titel gehört und was
  gespeichert ist. Ein Titel in mehreren Sammlungen liegt nur einmal da.
- Beim Start und mit «Mit dem Server abgleichen»: neue Titel laden,
  entfernte löschen. Eine auf dem Server gelöschte Playlist bleibt, bis
  man sie selbst entfernt.
- **Alles speichern** (bei «Alle Titel» und im Reiter «Gespeichert»,
  mit Rückfrage): die ganze Sammlung. Sie wird zuletzt geladen, Playlists
  und Interpreten kommen zuerst.
- **Vor dem Speichern** fragt die App nach: Anzahl Titel, Platzbedarf
  (`POST /kiosk/hoeren/groesse`, zählt die Dateien auf dem Server) und
  freier Platz auf dem Computer (`df -Pk`, Windows PowerShell). Bleiben
  weniger als 2 GB frei, geht es nicht los. «Gespeichert» zeigt laufend
  Titel, MB des aktuellen Titels, wie viele noch fehlen und den freien
  Platz.
- Der Player spielt Gespeichertes von der Platte; ohne Netz nur das
  Gespeicherte.
- **Abmelden löscht alles Gespeicherte** (Musik nur für Mitglieder).
- Steht die Verbindung 30 s still (z.B. nach einem Netzwechsel), bricht
  die App den Titel ab und versucht ihn bis zu dreimal neu.
- Auf dem Mac liegt die Anmeldung in **einem** Schlüsselbund-Eintrag
  (`GebuendelterSpeicher`): Unser Zertifikat hat keine Team-ID, macOS
  bindet jeden Eintrag an genau eine Version und fragt nach einem Update
  je Eintrag – so nur einmal.

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

## Songs ergänzen (spotDL)

Reiter «Ergänzen» in FWV Musik, in der Mitglieder-App und auf mein.html –
nur Gruppe Roter Schopf, Vorstand, admin (api-members prüft dasselbe).

- Auf YouTube suchen (yt-dlp) oder einen Link einfügen: YouTube oder
  Spotify, Song, Album oder Playlist. «Offizielle Tonspur» = Kanal
  «… - Topic».
- Geladen wird auf dem Server im Container `fwv-musik-dl`
  (`docker/musik-dl`, spotDL 4.6.0, mp3, Bitrate wie die Quelle) und per
  WebDAV in den Nextcloud-Gruppenordner **9 «Musik»** gelegt (Konto
  `musik-bot`, darf nur dort schreiben). Was dort liegt, wird nicht
  überschrieben.
- Fertige Aufträge mit mehreren Songs: «Als Playlist anlegen».
- Der Laptop spiegelt den Ordner alle 5 Minuten nach `/Musik`
  (`kiosk-abgleich`), danach stehen die Songs überall zur Auswahl.

Aufrufe (api-members): `GET /kiosk/ergaenzen/suche?q=`,
`GET|POST /kiosk/ergaenzen`; für den Laptop `GET /kiosk/sammlung` und
`GET /kiosk/sammlung/datei?pfad=` (X-Kiosk-Key).

## Offen

- Kein Update-Hinweis in der App (Download von der Release-Seite).
- Unsigniert auf Windows und macOS.
- Kein Eintrag auf www.fwv-raura.ch/download/.
- Eigenes Symbol (heute das Mitglieder-Logo).
