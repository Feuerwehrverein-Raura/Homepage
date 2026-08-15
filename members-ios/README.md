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
  im Keychain
- **Events:** Liste und Detailansicht mit Datum, Ort, Kosten,
  Organisator, Beschreibung und Schichten — nur lesend
- **Profil:** Stammdaten, Kontakt, Adresse — nur lesend
- **Einstellungen:** Abmelden
- **CI:** Simulator-Build als Compile-Check bei jedem Push und PR

### Bekannte Lücken

Nach Dringlichkeit, nicht nach Aufwand:

1. **Der Refresh-Token wird nie eingelöst.** `AuthManager` legt ihn im
   Keychain ab, aber `OIDCClient` hat keine Refresh-Methode und
   `APIClient` behandelt kein 401. Läuft der Access-Token ab, bleibt
   `isLoggedIn` auf `true`: die App wirkt angemeldet und zeigt nur noch
   Ladefehler. Vorbild ist `AuthInterceptor` der Android-App — bei
   401/403 den `refresh_token`-Grant fahren und den Request einmal
   wiederholen.
2. **Anmelden zu Anlässen fehlt ganz.** Dafür nötig: `POST` im
   `APIClient` (kann bisher nur `GET`), der Aufruf
   `POST registrations/public` mit `{type: "shift"|"participant",
   eventId, eventTitle, organizerEmail, name, email, phone, notes,
   shiftIds}`, das Feld `organizerEmail` im `Event`-Modell, und eine
   Ansicht für `GET registrations/mine` — das Modell `MyRegistration`
   existiert bereits ungenutzt.
3. **Kein Push.** Braucht einen APNs-Key und damit das Apple Developer
   Program.
4. **Adressbuch-Import** ist in `SettingsView` ein Button ohne
   Funktion.

### Phasen

- [x] **Phase 1 — Fundament:** App-Gerüst, Config, Keychain,
      API-Client, OIDC-Login, Tab-Shell, CI
- [x] **Phase 2 — Lesen:** Events-Liste, Event-Detail mit Schichten,
      Profil
- [ ] **Phase 3 — Sitzung tragfähig machen:** Token-Refresh und
      401-Wiederholung. Wenig Code, aber alles Weitere baut darauf auf
- [ ] **Phase 4 — Anmeldung:** Schicht- und Teilnehmer-Anmeldung,
      „Meine Anmeldungen" im Profil
- [ ] **Phase 5 — Push:** braucht Apple-Konto
- [ ] **Phase 6 — Organisator:** Notizen, Rezepte, Material — der
      grosse Block, den Android schon hat
- [ ] **Phase 7 — Adressbuch-Import (CNContacts), App-Store-Listing**

## Voraussetzungen für TestFlight/Release (offen, Apple-Konto nötig)

- Apple Developer Program (Organisation FWV Raura) abgeschlossen
- APNs-Key in Firebase + iOS-App in Firebase registriert (Push)
- Code-Signing/Provisioning in der Release-CI

Derselbe fehlende Account blockiert auch die Signierung der
macOS-Desktop-App (siehe `vorstand-desktop/README.md`).
