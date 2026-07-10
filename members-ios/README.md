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

## Status (Phasenplan)

- [x] **Phase 1 — Fundament:** App-Gerüst, Config, Keychain, API-Client,
      **OIDC-Login (ASWebAuthenticationSession + PKCE)**, Tab-Shell,
      Einstellungen mit Platzhalter „Kontakte importieren" + Abmelden,
      macOS-CI (Simulator-Build).
- [ ] Phase 2 — Events + Anmeldung, Profil, Push.
- [ ] Phase 3 — Organisator (Notizen, Rezepte & Material).
- [ ] Phase 4 — Adressbuch-Import (CNContacts), App-Store-Listing.

## Voraussetzungen für TestFlight/Release (offen, Apple-Konto nötig)

- Apple Developer Program (Organisation FWV Raura) abgeschlossen
- APNs-Key in Firebase + iOS-App in Firebase registriert (Push)
- Code-Signing/Provisioning in der Release-CI
