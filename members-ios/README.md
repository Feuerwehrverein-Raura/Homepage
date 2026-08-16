# FWV Mitglieder — iOS (SwiftUI)

Native iOS-Version der Mitglieder-App, Pendant zu `members-android`.
Spricht dieselben Backends (`api.fwv-raura.ch`) und denselben
Authentik-Provider (`fwv-members-app`).

## Projekt öffnen / bauen

Das Xcode-Projekt wird **aus `project.yml` generiert** (XcodeGen), damit
kein `.xcodeproj` eingecheckt werden muss:

```bash
brew install xcodegen        # einmalig
cd members-ios
xcodegen generate            # erzeugt FWVMembers.xcodeproj
open FWVMembers.xcodeproj
```

Die CI (`.github/workflows/ios-members.yml`) baut bei jedem Push für den
iOS-Simulator (unsigniert, ohne Apple-Account) als Compile-Check.

## Lokal bauen

Mit installiertem Xcode reicht:

```bash
xcodegen generate
xcodebuild -project FWVMembers.xcodeproj -scheme FWVMembers \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

Ohne Xcodes Systemkomponenten (`sudo xcodebuild -runFirstLaunch`)
scheitert `xcodebuild` an einem fehlenden Simulator-Plugin — und zwar
bei jedem Ziel, auch beim Gerätebuild. Als schnelle Zwischenprüfung
genügt dann der Compiler allein:

```bash
xcrun --sdk iphoneos swiftc -typecheck -target arm64-apple-ios16.0 \
  $(find Sources -name "*.swift")
```

## Stand (August 2026)

Was in der App funktioniert:

- **Anmelden:** OIDC mit PKCE über `ASWebAuthenticationSession`, Tokens
  im Keychain, Token-Refresh mit 401-Wiederholung
- **Anlässe:** Liste und Detailansicht mit Datum, Ort, Kosten,
  Organisator, Beschreibung und Schichten
- **Anmelden zu Anlässen:** Schicht- und Teilnehmer-Anmeldung,
  vorbelegt aus dem eigenen Profil
- **Meine Anmeldungen:** Status, Datum, Ort, zugeteilte Schichten
- **Profil:** Stammdaten, Kontakt, Adresse — nur lesend
- **Adressbuch:** Anleitung und Konfigurationsprofil für das
  CardDAV-Adressbuch aus Nextcloud
- **CI:** Simulator-Build als Compile-Check bei jedem Push und PR

## Was gegenüber der Android-App fehlt

Die Android-App ist der grössere Bruder; hier steht, was auf iOS noch
aussteht. Nach Aufwand sortiert, das Blockierte zuletzt.

**Profil bearbeiten.** Auf iOS ist das Profil nur lesbar. Android kann
Änderungen speichern (`PUT members/me`), ein Profilfoto hochladen
(`POST members/me/photo`, die App muss vorher selbst verkleinern — das
Backend tut es nicht) und den Austritt beantragen
(`POST members/me/austritt`).

**Zugänge.** `GET members/me/accesses` liefert Web-Zugänge, Cloud-Ordner
und Funktions-E-Mails in einem Rutsch; Android zeigt sie als Karten und
lässt das Passwort einer Funktions-E-Mail ändern. Auf iOS fehlt der
Bildschirm ganz.

**Anlass vorschlagen.** `POST events/propose` legt keinen
veröffentlichten Anlass an, sondern einen Vorschlag zur Prüfung durch
den Vorstand. Der Vorschlagende wird serverseitig als Organisator
gesetzt.

**Kalender.** `GET calendar/items` liefert Anlässe, Beiträge und
Versände zusammengefasst.

**Organisator-Bereich.** Der grosse Block — auf Android ein eigener
Tab: Dashboard der eigenen Anlässe, Anmeldungen genehmigen und
ablehnen, Anmeldungen von Hand hinzufügen und bearbeiten (für
telefonisch gemeldete Gäste), Anlass und Schichten als Organisator
bearbeiten, alternative Schicht vorschlagen, Angemeldete benachrichtigen,
Notizen mit Anhängen, Rezepte und Material, PDF-Ausdrucke. Rund 25
Endpunkte, sinnvoll in Etappen zu bauen.

**Push und Benachrichtigungseinstellungen.** Blockiert: das Backend
nimmt unter `POST members/me/fcm-token` einen FCM-Token entgegen, iOS
bräuchte dafür Firebase Cloud Messaging und damit einen APNs-Key aus
dem Apple Developer Program. Android hat dazu vier Schalter für die
Arten von Benachrichtigungen.

**Auslieferung.** TestFlight und App Store — ebenfalls am Apple-Konto.

### Phasen

- [x] **Phase 1 — Fundament:** App-Gerüst, Config, Keychain,
      API-Client, OIDC-Login, Tab-Shell, CI
- [x] **Phase 2 — Lesen:** Anlass-Liste, Detail mit Schichten, Profil
- [x] **Phase 3 — Sitzung tragfähig machen:** Token-Refresh und
      401-Wiederholung
- [x] **Phase 4 — Anmeldung:** Schicht- und Teilnehmer-Anmeldung,
      „Meine Anmeldungen"
- [x] **Phase 5 — Adressbuch:** CardDAV statt Import (eine App kann
      unter iOS keine Kontakte bereitstellen)
- [ ] **Phase 6 — Eigene Daten:** Profil bearbeiten, Foto, Zugänge,
      Austritt
- [ ] **Phase 7 — Mitwirken:** Anlass vorschlagen, Kalender
- [ ] **Phase 8 — Organisator:** der grosse Block
- [ ] **Phase 9 — Push:** braucht Apple-Konto
- [ ] **Phase 10 — App-Store-Listing:** braucht Apple-Konto

## Voraussetzungen für TestFlight/Release (offen, Apple-Konto nötig)

- Apple Developer Program (Organisation FWV Raura) abgeschlossen
- APNs-Key in Firebase + iOS-App in Firebase registriert (Push)
- Code-Signing/Provisioning in der Release-CI

Derselbe fehlende Account blockiert auch die Signierung der
macOS-Desktop-App (siehe `vorstand-desktop/README.md`).
