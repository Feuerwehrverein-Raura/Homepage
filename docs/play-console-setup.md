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
- **Organisator-Modus**: Anmeldungen zu Events die der eingeloggte User
  als Organisator hinterlegt ist (E-Mail-Match)
- **Geräte-Token (FCM, Phase 2)**: anonym, für Push-Benachrichtigungen

Keine Drittanbieter-Tracking, keine Werbung, keine Analytics-Frameworks.
Daten bleiben auf eigenen Servern (`api.fwv-raura.ch`, `auth.fwv-raura.ch`).

## 8. Google-Play-Compliance-Checkliste

### 8.1 Pflicht-Punkte (sonst Reject im Review)

| Anforderung | Status | Wo erledigt |
|-------------|--------|-------------|
| Privacy Policy | ✅ | <https://www.fwv-raura.ch/datenschutz-app.html> |
| Account-Lösch-Möglichkeit (in-App + Web) | ✅ | App: Profil → "Aus dem Verein austreten"<br>Web: <https://www.fwv-raura.ch/account-loeschen.html> |
| Data Safety Form ausgefüllt | ⏳ | Du in Play Console (siehe 8.2) |
| Content Rating (IARC) | ⏳ | Du in Play Console |
| targetSdk ≥ 35 | ✅ | `members-android/app/build.gradle.kts` |
| Berechtigungen sparsam | ✅ | nur INTERNET + CAMERA |
| Keine Werbung / Tracking | ✅ | – |
| App-Icon 512×512 | ⏳ | siehe 8.3 |
| Mind. 2 Screenshots | ⏳ | siehe 8.3 |

### 8.2 Data Safety Form — die richtigen Antworten

**Sammelt die App Nutzerdaten?** Ja

**Wird gesammelt:**

| Datentyp | Optional? | Geteilt? | Verwendet für | Verschlüsselt? | Löschbar? |
|----------|-----------|----------|---------------|----------------|-----------|
| Name | Nein | Nein | App-Funktionalität, Account-Verwaltung | Ja (TLS) | Ja |
| E-Mail-Adresse | Nein | Nein | Account-Verwaltung, Kommunikation | Ja (TLS) | Ja |
| Telefonnummer | Ja | Nein | App-Funktionalität (Kontakt bei Anmeldung) | Ja (TLS) | Ja |
| Adresse | Ja | Nein | Mitglieder-Verzeichnis | Ja (TLS) | Ja |
| Geburtstag | Ja | Nein | Mitglieder-Verzeichnis | Ja (TLS) | Ja |
| Foto (Profil) | Ja | Nein | Mitglieder-Verzeichnis | Ja (TLS) | Ja |
| App-Aktivität (Anmeldungen) | Nein | Nein | App-Funktionalität | Ja (TLS) | Ja |

**Werden Daten an Dritte weitergegeben?** Nein.
**Werden Daten verschlüsselt übertragen?** Ja (TLS 1.2+).
**Können Nutzer eine Datenlöschung anfordern?** Ja, in-App (Profil → Austritt) oder Web (`account-loeschen.html`).

### 8.3 Listing-Assets (Pflicht)

Was du in die Play Console hochlädst:

| Asset | Format | Wo |
|-------|--------|-----|
| App-Icon | 512×512 PNG | Play Console → Listing |
| Feature-Graphic | 1024×500 PNG | Play Console → Listing |
| Screenshots Smartphone | mind. 2, 16:9 oder 9:16 | Play Console → Listing |
| Beschreibung (kurz) | max. 80 Zeichen | aus `play/listings/de-CH/short-description.txt` |
| Beschreibung (lang) | max. 4000 Zeichen | aus `play/listings/de-CH/full-description.txt` |
| App-Titel | max. 30 Zeichen | aus `play/listings/de-CH/title.txt` |

Die `play/listings/de-CH/*` Dateien werden nach dem ersten manuellen
Hochladen automatisch über das Gradle Play Publisher Plugin synchronisiert
(siehe `members-android/app/build.gradle.kts`).

### 8.4 Closed Testing — neue Developer-Account-Regel

Seit November 2023 verlangt Google für **neu erstellte Developer-Accounts**:

> Vor der ersten Production-Veröffentlichung müssen mindestens
> **12 Tester** über **mindestens 14 Tage** im Closed-Testing-Track aktiv
> sein.

Pragmatisch für den FWV:

1. **Sofort starten:** Internal Testing (max. 100 Tester, kein Review,
   sofort verfügbar). Hier können wir 1–2 Wochen mit dem Vorstand testen.
2. **Promotion zu Closed Testing:** mit den ersten ~12 Mitgliedern als
   offiziellen Testern, 14 Tage laufen lassen.
3. **Erst danach:** Promotion zu Production / Open Testing möglich.

Solange wir nur im **Closed Testing** bleiben (bis 100 Tester gratis),
brauchen wir die 14-Tage-Regel **nicht** zu erfüllen — sie greift erst
bei Promotion zu Production.

### 8.5 Was du selbst tun musst

| Schritt | Wann |
|---------|------|
| In Play Console "App erstellen" | jetzt (du hast Account) |
| Google Cloud → Service Account "fwv-play-publisher" anlegen | jetzt |
| Service-Account-JSON herunterladen | jetzt |
| GitHub Secret `PLAY_SERVICE_ACCOUNT_JSON` hinterlegen | jetzt |
| Play Console → API access → Service Account verlinken + Berechtigung "Releases → Manage testing track releases" | jetzt |
| Listing in Play Console: Privacy Policy + Account-Lösch-URL eintragen | nach erstem Upload |
| Data Safety Form ausfüllen (Tabelle 8.2) | nach erstem Upload |
| Content Rating Form ausfüllen | nach erstem Upload |
| Tester-E-Mails sammeln und in Play Console eintragen | parallel |

Sobald `PLAY_SERVICE_ACCOUNT_JSON` als Secret gesetzt ist, lädt der
nächste `members-v*` Tag die App automatisch ins Internal Testing Track.
