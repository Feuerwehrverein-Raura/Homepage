# Google Play Console Setup für FWV-Mitglieder-App

Dieses Dokument führt durch die einmaligen Schritte, um die FWV-Mitglieder-App
über den Google Play Store an Vereinsmitglieder zu verteilen (Closed Testing,
bis 100 Tester gratis ohne Public-Review).

## 1. Google Play Console Account anlegen

**Was du brauchst:**

- Google-Account (idealerweise ein Verein-Account, nicht persönlich, z.B.
  `praesident@fwv-raura.ch` oder `vorstand@fwv-raura.ch`)
- Kreditkarte für die einmalige Registrierungsgebühr von **USD 25**
- Wahl des Account-Typs: **Organization** (nicht Personal)
  - Begründung: bei einem Verein gehört der Account dem Verein, nicht einer
    Privatperson — wichtig falls Vorstandswechsel später ansteht

**Schritte:**

1. Öffnen: <https://play.google.com/console/signup>
2. Mit dem Verein-Google-Account einloggen
3. Bei "Welcher Account-Typ?" → **Organization** wählen
4. Geforderte Angaben:
   - Organisationsname: `Feuerwehrverein Raura`
   - Webseite: `https://www.fwv-raura.ch`
   - Telefon: `+41 61 813 03 16` (oder andere Vorstand-Nummer)
   - Adresse: Kaiseraugst-Vereinsadresse
5. Identitätsverifizierung (Personalausweis/ID-Karte des verantwortlichen
   Vorstandsmitglieds) — wird von Google geprüft, kann 1–2 Tage dauern
6. USD 25 zahlen
7. Entwickler-Vertrag akzeptieren

## 2. Service-Account für CI erstellen

Damit das CI automatisch neue App-Versionen ins Play-Store-Closed-Testing
hochladen kann, brauchen wir einen Service-Account mit API-Zugriff.

1. **Google Cloud Console öffnen**: <https://console.cloud.google.com>
2. Neues Projekt anlegen: `fwv-raura-play` (falls nicht schon vorhanden)
3. Im Projekt → **IAM & Admin** → **Service Accounts** → **Create Service Account**
   - Name: `fwv-play-publisher`
   - Beschreibung: `Publishes new versions of FWV apps to Play Store`
4. Service-Account erstellen, dann unter **Keys** → **Add Key** → **JSON**
   - JSON-Datei wird heruntergeladen — gut aufheben, kann nicht erneut
     heruntergeladen werden
5. **Play Console öffnen** → **Settings** → **API access**
6. Service-Account verlinken (E-Mail-Adresse aus der JSON: `xxx@fwv-raura-play.iam.gserviceaccount.com`)
7. Berechtigungen: **Releases → Manage testing track releases**
8. Unter **Account details → User accounts and rights** dem Service-Account
   Zugriff zur App geben (App entsteht nach erstem manuellem Upload)

## 3. App in Play Console anlegen

Erst nach erfolgreicher Identitätsverifizierung:

1. Play Console → **Create app**
2. App-Details:
   - Name: `FWV Raura`
   - Standardsprache: `Deutsch (Schweiz) – de-CH`
   - App oder Spiel: **App**
   - Kostenlos oder kostenpflichtig: **Kostenlos**
   - Erklärungen:
     - ☑ App-Richtlinien
     - ☑ US-Exportgesetze
3. Unter **Setup** → **App content**:
   - Privacy Policy URL: `https://www.fwv-raura.ch/datenschutz-app.html`
     (wird von uns gehostet)
   - Ad-frei
   - Keine In-App-Käufe
   - Zielgruppe: **Erwachsene** (18+)
   - Data Safety Form ausfüllen (Vorlage liefern wir mit)
4. Unter **Closed testing** → **Create new track** → Track-Name `Mitglieder`
   - Country availability: nur Schweiz (Mitglieder sind hauptsächlich CH)
   - Tester verwalten: Liste mit E-Mail-Adressen aller Vereinsmitglieder
     (oder Google-Group anlegen wie `mitglieder@fwv-raura.ch`)

## 4. Was ich (Claude) vorbereite und du dann nur noch hochlädst

- ✅ App-Code (Phase 1: Login, Events, Anmeldung, Profil, Organisator-Modus)
- ✅ App-Icon (512×512), nutzt das bestehende FWV-Logo
- ✅ Mind. 2 Screenshots in mehreren Auflösungen
- ✅ Privacy Policy als HTML-Seite auf fwv-raura.ch
- ✅ Data Safety Form mit den richtigen Antworten (Daten die wir sammeln)
- ✅ App-Beschreibung für den Play Store (kurz + lang)
- ✅ Build-Pipeline: `bundleRelease` (.aab statt .apk) und Auto-Upload via
  CI über Gradle Play Publisher

## 5. Was du tun musst (in dieser Reihenfolge)

| Schritt | Aufgabe | Wann |
|---------|---------|------|
| 1 | Google-Account auf Vereins-E-Mail anlegen (falls noch nicht) | jetzt |
| 2 | Play Console Account anlegen, USD 25 zahlen | jetzt |
| 3 | Identitätsverifizierung abwarten | 1–2 Tage |
| 4 | Service-Account erstellen, JSON sicher aufbewahren | nach Schritt 3 |
| 5 | Service-Account-JSON als GitHub-Secret hinterlegen<br>(`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`) | nach Schritt 4 |
| 6 | Tester-Liste sammeln (E-Mails der Mitglieder) | parallel |
| 7 | Erste manuelle App-Erstellung in Play Console nach Anleitung | wenn Schritt 3 durch |

## 6. Kosten im Überblick

- USD 25 einmalig (Google Play Developer Account)
- 0 CHF für Closed Testing bis 100 Tester
- 0 CHF Hosting (GitHub bleibt für Code, fwv-raura.ch hostet Privacy Policy)
- Bei späterem Wachstum > 100 Tester: Open Testing oder Production —
  weiterhin gratis, aber mit Review (1–2 Wochen Wartezeit pro Update)

## 7. Datenschutz-Compliance

Die App wird folgende Daten verarbeiten:

- **Mitglied-Login** (Authentik OIDC): E-Mail, Name, Funktion
- **Veranstaltungs-Anmeldungen**: Name, E-Mail, Telefon, Allergien (optional)
- **Organisator-Login**: Event-spezifische E-Mail/Passwort
- **Geräte-Token (FCM, Phase 2)**: anonym, für Push-Benachrichtigungen

Keine Drittanbieter-Tracking, keine Werbung, keine Analytics-Frameworks.
Daten bleiben auf eigenen Servern (`api.fwv-raura.ch`, `auth.fwv-raura.ch`).
