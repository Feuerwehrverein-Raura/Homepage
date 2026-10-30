---
name: fwv-desktop-apps
description: Desktop-Programme des Vereins (Flutter fuer macOS, Windows, Linux - Mitglieder-App, FWV Musik, kuenftige) releasen, neu anlegen und auf www.fwv-raura.ch/apps.html einbinden - Windows-Installer (.exe), macOS-Signatur, Linux-.deb, Logo im Vereinsstil. Verwenden bei "Desktop-App", "Programm fuer den Computer", "neue Version" einer Desktop-App, "exe", "dmg", "Logo fuer die App", "Schluesselbund fragt nach Passwort", "auf der Apps-Seite" - und IMMER, wenn eine neue App entsteht oder eine bestehende neue Dateien bekommt.
---

# Desktop-Programme (Flutter)

**Eine App ist erst fertig, wenn sie auf `apps.html` steht** und der
Download dort live funktioniert. Das wurde bei FWV Musik zuerst vergessen.

| App | Projekt | Tag | Workflow | Karte auf apps.html |
|---|---|---|---|---|
| Mitglieder | `flutter/mitglieder` | `members-v*` | `build-android-members.yml` (Jobs desktop-*) | «Mitglieder» → «Programm für den Computer» (feste Links `members-latest-…`) |
| FWV Musik | `flutter/musik` | `musik-v*` | `build-desktop-musik.yml` | «Musik» (`loadMusikDesktop()`, liest neuestes Release) |
| Vorstand Desktop (Tauri, alt) | `vorstand-desktop` | `vorstand-desktop-v*` | `build-desktop-vorstand.yml` | «Vorstand Desktop» |

Doku: `docs/flutter-desktop.md`, `docs/flutter-musik-desktop.md`.

## Neue Version

1. Tag auf einen Commit **ohne** `[skip ci]` setzen (sonst laeuft nichts):
   ```sh
   git fetch -q origin
   C=$(git log -1 --format=%H origin/main --grep "skip ci" --invert-grep)
   git tag musik-vX.Y.Z $C && git push origin musik-vX.Y.Z
   ```
   Mitglieder-App: Skill `fwv-members-release` (dort laeuft auch Play).
2. Lauf bis zum Ende beobachten (`gh run watch … --exit-status`), Fehler
   auswerten und beheben.
3. Dateien pruefen: `gh release view <tag> --json assets -q '.assets[].name'`
   Erwartet: `…-windows-x64-setup.exe`, `…-macos.dmg`, `…-macos.zip`,
   `…_amd64.deb`, `…-linux-x64.tar.gz`.
4. **apps.html pruefen** (Abschnitt unten) - zeigt die Karte die neue
   Version und fuehren die Links auf die neuen Dateien?

Desktop-Releases werden **nie** «Latest» (`--latest=false`):
`releases/latest` gehoert dem Updater von vorstand-desktop.

## Was jede Desktop-App hat

- **Anmeldung:** `LoopbackAnmeldung` aus `package:fwv_core/desktop.dart`
  (Authentik-Provider fwv-members-app, Rueckleitung `127.0.0.1` per Regex -
  in Authentik nichts einzutragen).
- **Schluesselbund (macOS):** jede App ihr eigener Bereich -
  `SichererSpeicher(null, 'ch.fwvraura.<name>')`. Mit dem gemeinsamen
  Standardnamen liest eine App die Eintraege einer anderen, und macOS fragt
  fuer jeden der ~7 Eintraege einzeln nach dem Passwort (FWV Musik 1.0.2).
- **Test-Builds getrennt (macOS):** `AppInfo.xcconfig` gibt Debug eigenen
  Namen und Kennung (`PRODUCT_NAME[config=Debug] = FWV Musik Test`,
  `…musik.test`), `dienste.dart` im Debug einen eigenen
  Schluesselbund-Bereich. Sonst zeigt macOS zwei Apps, startet den ad-hoc
  signierten Test-Build und fragt nach dem Passwort (30.10.2026: mein
  `flutter build macos --debug` lag im Repo, Stefan startete ihn statt
  1.2.1). Nach jedem lokalen macOS-Build aufraeumen:
  `lsregister -u "<…>.app" && rm -rf build/macos`, pruefen mit
  `lsregister -dump | grep -i "path:.*<Name>.*\.app"`.
- **macOS-Kategorie:** `LSApplicationCategoryType` in
  `macos/Runner/Info.plist` setzen (Musik: `public.app-category.music`),
  sonst fehlt die App in der Programm-Uebersicht von macOS 26.
- **Windows:** Installer mit Inno Setup, ein Skript fuer alle:
  `flutter/packaging/windows-setup.iss`, aufgerufen per `pwsh` (Git-Bash
  verbiegt `/D…`). Jede App hat eine **eigene, nie geaenderte AppId**
  (neue GUID: `python3 -c "import uuid;print(uuid.uuid4())"`), sonst gilt
  ein Update als zweites Programm. VC++-Laufzeit-DLLs vorher ins
  Release-Verzeichnis kopieren. Installiert ohne Adminrechte.
- **macOS:** `flutter/packaging/signieren-macos.sh` nach `flutter build
  macos`, vor Zip/DMG. Festes Zertifikat «FWV Raura Code Signing» (Secrets
  `MACOS_SIGNATUR_P12`, `MACOS_SIGNATUR_PASSWORT`; Sicherung in Vaultwarden).
  Ohne feste Signatur fragt macOS nach jedem Update nach dem
  Schluesselbund-Passwort. Erwartet im Log: `satisfies its Designated
  Requirement` und `certificate root = H"3d21942b…"`. Entitlements:
  `network.client` + `network.server` (Loopback-Anmeldung).
- **Linux:** `linux/packaging/deb-bauen.sh` + `.desktop`-Datei, gebaut auf
  ubuntu-latest. Braucht die App libmpv (Musik): `libmpv-dev` beim Bauen,
  `libmpv2` in `Depends`.
- **CI bei jedem Push:** Paket in die Test-Matrix von `flutter-apps.yml`
  und ein Linux-Debug-Build dort.

## Neue Desktop-App anlegen (Checkliste)

1. `flutter create --platforms=macos,linux,windows --org ch.fwvraura …`;
   Titel, Fenstergroesse, Bundle-Id (`ch.fwvraura.<name>`), Entitlements
   wie in `flutter/musik` (Diff gegen `flutter/mitglieder` hilft).
2. Workflow nach Vorlage `build-desktop-musik.yml` (eigenes Tag-Praefix,
   neue AppId, Signieren-Schritt, Release ohne Latest).
3. `flutter-apps.yml`: Matrix + Linux-Build.
4. Logo (unten).
5. **Karte auf `docker/frontend-website/apps.html`** (Vorlage: Karte
   «Musik»): Bild `images/apps/<name>.png`, Version-Span, Knopf fuer das
   eigene System, Zeile «Andere Systeme», JS-Funktion nach Vorlage
   `loadMusikDesktop()`. Endungen `-windows-x64-setup.exe`, `-macos.dmg`,
   `_amd64.deb`, `-linux-x64.tar.gz`.
6. Doku `docs/flutter-<name>-desktop.md`, Tabelle oben in diesem Skill
   ergaenzen.
7. Website ausliefern (Skill `fwv-website-deploy`) und live pruefen (unten).

## Logo im Vereinsstil

Alle Logos (`docker/frontend-website/images/apps/`) sind Aufkleber-
Illustrationen: Comic-Feuerwehrmann (roter Helm, blaue Sonnenbrille,
schwarze Uniform mit gelben Streifen), Gegenstaende zum Thema, dicker
weisser Rand, goldenes Banner mit dem Namen in Grossbuchstaben. **Nicht
selbst als SVG zeichnen** - der Nutzer erzeugt das Bild mit einem
Bildgenerator. Prompt-Vorlage (Thema austauschen):

    Sticker-style cartoon logo, same style as a series of app icons for a
    Swiss volunteer fire brigade club. A cheerful cartoon firefighter mascot
    with a big red classic fire helmet, blue mirrored sunglasses and black
    uniform with yellow reflective stripes, <THEMA>. Thick white sticker
    outline, bold saturated colors, golden ribbon banner at the bottom with
    the word "<NAME>" in bold white capital letters with dark outline.
    Transparent background, square 1024x1024, centered.

Einbauen (Vorlage `flutter/musik/branding/`): Original nach
`branding/logo-original.png`; kleine Groessen (16-48 px) = ganzes Logo
auf dunkelrotem Kreis `#7f1d1d` (Chrome headless rendern, Logo 880 px in
1000-px-Kreis) → `branding/logo-klein.png`. Gross (ab 64 px), Anmeldung,
Linux-Symbol und Website: volles Logo. Groessen mit `sips -z`, `.ico` aus
PNG-Eintraegen per Python (`struct`, Groessen 16,24,32,48 klein; 64,128,256
voll).

## Live pruefen

```sh
curl -s https://www.fwv-raura.ch/apps.html | grep -c '<name>-download'
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://www.fwv-raura.ch/images/apps/<name>.png
```
Dann die Seite im Browser (oder headless Chrome) ansehen: Version
sichtbar, Knopf «Für <System> herunterladen».

Mitglieder-Karte: feste Links auf `members-latest-…`. Wechselt ein
Dateiname (z.B. `.zip` → `-setup.exe`), die Links **erst nach** dem
Release umstellen, das die neue Datei erzeugt - sonst 404.
