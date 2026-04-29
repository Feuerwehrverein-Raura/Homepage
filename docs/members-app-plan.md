# FWV Raura Mitglieder-App – Plan

## Ziel

Eine Android-App für Vereinsmitglieder und Veranstaltungs-Organisatoren des
Feuerwehrvereins Raura. Vertrieb über Google Play Store (Closed Testing,
bis 100 Tester gratis).

## Tech-Stack

Wie bei der Vorstand-App, damit Code & Wissen wiederverwendet werden kann:

- Kotlin 2.0
- Android Gradle Plugin 8.7+, Gradle 8.12
- Material 3 (`com.google.android.material`)
- ViewBinding
- Retrofit 2 + Gson + OkHttp 4
- Coil + Coil-SVG für Bilder
- ZXing (`com.journeyapps:zxing-android-embedded`) für QR-Login
  (16-KB-Page-Size-kompatibel — kein ML Kit)
- AppAuth-Android (`net.openid:appauth`) für OIDC-Login bei Authentik
- Firebase Cloud Messaging für Push-Benachrichtigungen (Phase 2)

## Repo-Struktur

```
members-android/
├── app/
│   ├── build.gradle.kts
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/ch/fwvraura/members/
│       │   ├── MainActivity.kt
│       │   ├── MembersApp.kt
│       │   ├── data/
│       │   │   ├── api/         # Retrofit-Interfaces
│       │   │   └── model/       # Data classes
│       │   └── ui/
│       │       ├── login/       # OIDC + Organizer-Login + QR
│       │       ├── events/      # Liste + Detail + Anmeldung
│       │       ├── profile/     # Eigenes Profil
│       │       ├── myregs/      # Eigene Anmeldungen
│       │       └── organizer/   # Organisator-Dashboard
│       └── res/                 # Layouts, Icons, Strings
├── build.gradle.kts
├── gradle/wrapper/
├── settings.gradle.kts
└── README.md
```

Eigenes Verzeichnis neben `vorstand-android/`. Application-ID
`ch.fwvraura.members` damit beide Apps parallel auf einem Gerät laufen können.

## Drei Login-Wege

### 1. Mitglied (OIDC via Authentik)

- AppAuth-Android startet Custom Tab → Login bei `auth.fwv-raura.ch`
- PKCE-Flow mit Client-ID `fwv-members` (existiert bereits)
- Redirect-URI: `ch.fwvraura.members:/oauth2redirect`
- Gibt JWT (RS256) zurück, wird als Bearer-Token für API-Calls genutzt
- Refresh-Token automatisch erneuert

### 2. Organisator (Event-spezifisch)

- E-Mail (`<event-slug>@fwv-raura.ch`) + Passwort gegen
  `POST /events/login`
- Endpoint existiert bereits, gibt JWT mit `type='organizer'` zurück
- App zeigt nur das eine Event und seine Anmeldungen

### 3. QR-Login (für beide Modi)

- Zusätzlicher persistenter Token wie bei der Vorstand-App
- Backend: bestehende Tabelle `vorstand_app_tokens` umbenennen oder
  neue Tabelle `app_tokens` mit Spalte `account_type`
- Im Vorstand-Web kann man QR für Mitglied **oder** Organisator generieren
- QR-Payload:
  `{"v":1,"type":"fwv-member-login","token":"fwv-member-..."}` oder
  `{"v":1,"type":"fwv-organizer-login","token":"fwv-org-..."}`

## Phase 1 – MVP

| # | Feature | Status |
|---|---------|--------|
| 1 | Login-Screen mit Modus-Wahl (Mitglied / Organisator) | offen |
| 2 | Mitglied-Login via OIDC (AppAuth) | offen |
| 3 | Organisator-Login via E-Mail/Passwort | offen |
| 4 | QR-Login als dritte Option | offen |
| 5 | Events-Liste (kommende Anlässe) | offen |
| 6 | Event-Detail mit Beschreibung, Datum, Ort | offen |
| 7 | Anmelde-Formular für Events (Name, Personenzahl, Allergien) | offen |
| 8 | Eigenes Profil ansehen + bearbeiten (Mitglied) | offen |
| 9 | Eigene Anmeldungen anzeigen | offen |
| 10 | Organisator-Dashboard: Anmeldungen für sein Event | offen |
| 11 | Anmeldungen genehmigen / ablehnen (Organisator) | offen |

## Phase 2 – später

- FCM Push-Benachrichtigungen für neue Anlässe
- Anmelde-Bestätigung als QR-Code (zum Vorzeigen am Eingang)
- Offline-Cache für bereits geladene Events
- Account-Löschung direkt in der App (Compliance-Anforderung)
- iCal-Export einer Anmeldung

## Backend-Anpassungen

| Endpoint | Status |
|----------|--------|
| `POST /events/login` (Organisator) | existiert |
| `GET /members/me` | existiert |
| `PUT /members/me` | existiert |
| `GET /events?upcoming=true` | existiert |
| `POST /registrations/public` | existiert |
| `POST /auth/member/qr-login` | **neu** |
| `POST /auth/organizer/qr-login` | **neu** |
| Tabelle `app_tokens` mit `account_type` | **Migration nötig** |

## Distribution

- Closed Testing in Google Play Console
- Bis 100 Tester gratis
- Kein Public Review nötig
- CI lädt automatisch neue Versionen ins Closed-Testing-Track via
  Gradle Play Publisher Plugin (`com.github.triplet.play`)
- Tag-Schema: `members-v1.0.0`, `members-v1.1.0`, ...

## Geschätzter Aufwand (Phase 1)

| Bereich | Aufwand |
|---------|---------|
| Repo-Skeleton + Gradle + CI-Workflow | 1–2 h |
| Login-Screen + 3 Auth-Modi | 4–6 h |
| Events-Liste + Detail + Anmeldung | 4–6 h |
| Profil + eigene Anmeldungen | 2–3 h |
| Organisator-Dashboard | 3–4 h |
| Erste Play-Store-Veröffentlichung | 1–2 h |
| **Total Phase 1** | **15–23 h** |

## Reihenfolge

1. ✅ `docs/play-console-setup.md` mit Anleitung für User
2. ✅ `docker/frontend-website/datenschutz-app.html` (Privacy Policy)
3. ✅ `docs/members-app-plan.md` (dieses Dokument)
4. **User**: Play Console Account erstellen, USD 25 zahlen, Identitätsverifizierung
5. **Claude**: App-Skeleton anlegen (`members-android/`)
6. **Claude**: Phase-1-Features implementieren
7. **Claude**: CI-Workflow für Play-Upload
8. **User**: Erste manuelle App-Erstellung in Play Console
9. **Claude**: Backend-Migration (`app_tokens` mit `account_type`)
10. **Beide**: Closed Testing mit ein paar Pilot-Mitgliedern
