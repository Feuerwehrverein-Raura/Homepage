# Feuerwehrverein Raura Kaiseraugst - Homepage

> Vollständige Vereinsverwaltung mit Event-Management, Kassensystem, Inventarverwaltung, Buchhaltung und Android-Apps

[![Docker](https://img.shields.io/badge/Docker-Ready-blue)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)](https://www.postgresql.org/)
[![Android](https://img.shields.io/badge/Android-SDK%2026+-3DDC84)](https://developer.android.com/)

---

## Übersicht

Dieses Repository enthält das komplette IT-System des Feuerwehrvereins Raura Kaiseraugst:

| System | Beschreibung | URL |
|--------|--------------|-----|
| **Website** | Öffentliche Homepage und Mitgliederbereich | fwv-raura.ch |
| **Vorstand-Portal** | Verwaltungs-Dashboard für Vorstand | fwv-raura.ch/vorstand.html |
| **Kassensystem** | Bestellverwaltung bei Anlässen | order.fwv-raura.ch |
| **Kitchen Display** | Echtzeit-Anzeige für Küche/Bar | kitchen.fwv-raura.ch |
| **Inventar** | Lagerverwaltung mit Rezepten | inventar.fwv-raura.ch |
| **Buchhaltung** | Kontenplan, Rechnungen, Berichte | api.fwv-raura.ch/accounts |
| **PDF-Designer** | Visueller Editor für PDF-Vorlagen | pdf.fwv-raura.ch |
| **Wiki** | Benutzerdokumentation | wiki.fwv-raura.ch |
| **Android Apps** | Vorstand-App, Kitchen Display | GitHub Releases |

---

## System-Architektur

```
                                    ┌─────────────────┐
                                    │    Traefik      │
                                    │ (Reverse Proxy) │
                                    └────────┬────────┘
                                             │
      ┌──────────┬──────────┬────────┬───────┴───────┬──────────┬──────────┬──────────┐
      │          │          │        │               │          │          │          │
┌─────┴─────┐ ┌──┴───┐ ┌────┴──┐ ┌───┴────┐ ┌───────┴──┐ ┌────┴───┐ ┌────┴───┐ ┌────┴───┐
│  Website  │ │Members│ │Events │ │Dispatch│ │Accounting│ │ Order  │ │Inventar│ │  PDF   │
│  (Nginx)  │ │  API  │ │  API  │ │  API   │ │   API    │ │ System │ │ System │ │Designer│
└───────────┘ └──┬────┘ └───┬───┘ └───┬────┘ └────┬─────┘ └───┬────┘ └───┬────┘ └────────┘
                 │          │         │            │           │          │
                 └──────────┴─────────┴────────────┴───────────┴──────────┘
                                              │
                                     ┌────────┴────────┐
                                     │   PostgreSQL    │
                                     │   16 (Alpine)   │
                                     └─────────────────┘
```

Alle Backend-APIs laufen unter `api.fwv-raura.ch` und werden via Traefik anhand des URL-Pfads zum richtigen Service geroutet.

### Technologie-Stack

| Komponente | Technologie |
|------------|-------------|
| **Backend** | Node.js 18+, Express.js |
| **Datenbank** | PostgreSQL 16 mit Migrations |
| **Frontend** | HTML/CSS/JS, Tailwind CSS, React (Order/Inventory/PDF-Designer) |
| **Auth** | Authentik (OIDC/RS256), IMAP-Login (Vorstand/HS256) |
| **Container** | Docker, Docker Compose |
| **Reverse Proxy** | Traefik mit automatischen SSL-Zertifikaten (Let's Encrypt) |
| **CI/CD** | GitHub Actions, Semantic Release, Watchtower |
| **Android** | Kotlin, Retrofit, Material 3, minSdk 26 |

---

## Projektstruktur

```
Homepage/
├── docker/                          # Docker-basierte Services
│   ├── docker-compose.yml           # Entwicklungs-Konfiguration
│   ├── docker-compose.prod.yml      # Produktions-Konfiguration
│   │
│   ├── backend-members/             # Mitgliederverwaltung API
│   ├── backend-events/              # Event-Management API
│   ├── backend-dispatch/            # E-Mail, Brief-Versand, Newsletter API
│   ├── backend-accounting/          # Buchhaltungs-API
│   ├── shared/                      # Gemeinsame Module (Auth-Middleware)
│   │
│   ├── frontend-website/            # Hauptwebsite (Nginx)
│   │   ├── index.html               # Startseite
│   │   ├── vorstand.html            # Vorstand-Dashboard (~7000 Zeilen)
│   │   ├── mein.html                # Mitgliederbereich
│   │   ├── events.html              # Event-Übersicht & Anmeldung
│   │   ├── calendar.html            # Kalender-Ansicht
│   │   ├── event-dashboard.html     # Event-Organisatoren-Dashboard
│   │   ├── apps.html                # App-Übersicht & Downloads
│   │   ├── menu-fasnacht.html       # Fasnacht-Menükarte
│   │   ├── auth-callback.html       # OAuth/OIDC Callback-Handler
│   │   └── scripts/config.js        # Frontend-API-Konfiguration
│   │
│   ├── frontend-pdf-designer/       # PDF-Vorlagen-Editor (React/Vite)
│   │
│   ├── postgres/                    # Datenbank
│   │   ├── init.sql                 # Initiales Schema
│   │   └── migrations/              # Schema-Migrationen (002-016)
│   │
│   ├── cron/                        # Cronjobs
│   │   └── shift-reminders.sh       # Automatische Schicht-Erinnerungen
│   │
│   └── wiki-docs/                   # Docusaurus Wiki
│
├── simple-order-system/             # Kassensystem
│   ├── backend/                     # Express/TypeScript API + WebSocket
│   ├── frontend/                    # React Kasse-UI
│   ├── kitchen-display/             # React Kitchen Display (PWA)
│   ├── kitchen-display-android/     # Android KDS App (Kotlin)
│   └── register-app/                # Registrierungs-/Checkout-App
│
├── simple-inventory-system/         # Inventarverwaltung
│   ├── backend/                     # Express API
│   └── frontend/                    # React Admin-UI
│
├── vorstand-android/                # Vorstand Android App (Kotlin MVVM)
│   └── app/                         # Kotlin MVVM App
│
├── api/                             # Legacy API (wird schrittweise ersetzt)
├── scripts/                         # Automatisierungs-Scripts
│   ├── pdf-generator.js             # PDF-Generierung (Rechnungen, Arbeitspläne)
│   ├── generate-ics.js              # iCalendar-Datei-Export
│   ├── send-event-email.js          # Event-E-Mail-Benachrichtigungen
│   ├── send-event-letter.js         # Event-Briefversand via Pingen
│   ├── generate-calendar-pdf.js     # Kalender-PDF-Erstellung
│   ├── send-calendar-pingen.js      # Kalender-Versand via Pingen
│   ├── send-letter-via-pingen.js    # Generischer Briefversand
│   ├── html-to-pdf.js              # HTML-zu-PDF-Konvertierung
│   ├── sync-mailcow-distribution-list.js  # Mailcow-Verteiler-Sync
│   └── transform-zustellung.js      # Daten-Transformation Zustellung
│
├── .github/workflows/               # CI/CD Pipelines
│   ├── build-containers.yml         # Docker Container Builds (13 Jobs)
│   ├── build-android-vorstand.yml   # Vorstand App Build
│   └── build-android-kds.yml        # Kitchen Display Build
│
└── events/                          # Event-Markdown-Dateien
```

---

## Backend Services

Alle API-Services laufen unter **`https://api.fwv-raura.ch`** und werden via Traefik-Pfad-Routing zum richtigen Container weitergeleitet.

### 1. Members API (`backend-members`)

Mitgliederverwaltung, Authentifizierung, Rollen, Fotos und Audit-Log.

**Traefik-Pfade:** `/members`, `/auth`, `/roles`, `/audit`, `/vorstand`, `/uploads`, `/member-registrations`, `/funktionen`

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/health` | GET | Health-Check |
| **Authentifizierung** | | |
| `/auth/me` | GET | Aktueller Benutzer (Authentik) |
| `/auth/login` | GET | Authentik-Login initiieren |
| `/auth/callback` | POST | Authentik OAuth Callback |
| `/auth/vorstand/login` | POST | Vorstand-Login (IMAP) |
| `/auth/vorstand/me` | GET | Vorstand-Session prüfen |
| **Mitglieder** | | |
| `/members` | GET | Alle Mitglieder (mit Filtern) |
| `/members/me` | GET | Eigenes Profil |
| `/members/:id` | GET | Mitglied nach ID |
| `/members` | POST | Mitglied erstellen |
| `/members/me` | PUT | Eigenes Profil aktualisieren |
| `/members/:id` | PUT | Mitglied aktualisieren (Vorstand) |
| `/members/:id` | DELETE | Mitglied löschen (Vorstand) |
| **Fotos** | | |
| `/members/me/photo` | POST/DELETE | Eigenes Foto hochladen/löschen |
| `/members/:id/photo` | POST/DELETE | Foto verwalten (Vorstand) |
| **Löschanträge** | | |
| `/deletion-requests` | GET | Offene Löschanträge (Vorstand) |
| `/deletion-requests/:id` | DELETE | Löschantrag ablehnen |
| `/members/deletion-confirm/:token` | GET | Löschung bestätigen |
| **Statistiken & Berichte** | | |
| `/members/stats/overview` | GET | Mitglieder-Statistiken |
| `/members/pdf/telefonliste` | GET | Telefonliste als PDF |
| **E-Mail-Verwaltung** | | |
| `/members/emails/zustellung` | GET | Zustellungs-Verteilerlisten |
| `/members/emails/alias-config` | GET | E-Mail-Alias-Konfiguration |
| `/members/emails/sync-alias` | POST | Aliases mit Mailcow synchronisieren |
| **Rollen & Zugriff** | | |
| `/roles` | GET | Verfügbare Rollen |
| `/vorstand` | GET | Vorstandsmitglieder |
| `/funktionen` | GET | Vereinsfunktionen |
| `/members/me/accesses` | GET | Eigene Cloud-Zugriffe |
| **Nextcloud & Gruppen** | | |
| `/members/:id/nextcloud-admin` | GET/POST | Nextcloud-Admin-Zugriff |
| `/members/:id/vorstand-group` | GET/POST | Vorstand-Gruppe |
| `/members/:id/social-media-group` | GET/POST | Social-Media-Gruppe |
| **Mitgliedschaftsanträge** | | |
| `/member-registrations` | GET | Offene Anträge (Vorstand) |
| `/member-registrations/:id` | GET | Antrag-Details |
| `/member-registrations/count/pending` | GET | Anzahl offener Anträge |
| `/member-registrations/:id/approve` | POST | Antrag genehmigen |
| `/member-registrations/:id/reject` | POST | Antrag ablehnen |
| **Synchronisierung** | | |
| `/members/sync-authentik` | POST | Mitglieder mit Authentik synchronisieren |
| `/members/sync-authentik-groups` | POST | Gruppen synchronisieren |
| **Benachrichtigungen** | | |
| `/members/me/notifications` | GET/PUT | Benachrichtigungs-Einstellungen |
| `/members/me/function-email-password` | PUT | Funktions-E-Mail-Passwort ändern |

### 2. Events API (`backend-events`)

Event-Management mit Schichten, Anmeldungen, Arbeitsplänen und Event-Gruppen.

**Traefik-Pfade:** `/events`, `/shifts`, `/calendar`, `/arbeitsplan`, `/registrations`, `/teilnehmerliste`

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/health` | GET | Health-Check |
| **Events** | | |
| `/events` | GET | Alle Events (mit Filtern) |
| `/events/:id` | GET | Event-Details |
| `/events` | POST | Event erstellen (Vorstand) |
| `/events/:id` | PUT | Event aktualisieren (Vorstand) |
| `/events/:id` | DELETE | Event löschen (Vorstand) |
| **Event-Organisatoren** | | |
| `/events/login` | POST | Organisator-Login |
| `/events/my-event` | GET | Eigenes Event abrufen |
| `/events/my-event/registrations/:id/approve` | POST | Anmeldung genehmigen (Organisator) |
| `/events/my-event/registrations/:id/reject` | POST | Anmeldung ablehnen (Organisator) |
| `/events/my-event/send-arbeitsplan` | POST | Arbeitsplan versenden (Organisator) |
| **Schichten** | | |
| `/shifts` | GET | Alle Schichten (mit Filtern) |
| `/shifts` | POST | Schicht erstellen (Vorstand) |
| `/shifts/:id` | PUT | Schicht aktualisieren |
| `/shifts/:id` | DELETE | Schicht löschen |
| **Anmeldungen** | | |
| `/registrations` | GET | Anmeldungen abrufen |
| `/registrations` | POST | Anmeldung erstellen (authentifiziert) |
| `/registrations/public` | POST | Öffentliche Anmeldung (ohne Auth) |
| `/registrations/manage` | GET | Anmeldungen verwalten (Vorstand) |
| `/registrations/:id/approve` | POST | Anmeldung genehmigen |
| `/registrations/:id/reject` | POST | Anmeldung ablehnen |
| `/registrations/:id/suggest-alternative` | POST | Alternative Schicht vorschlagen |
| `/registrations/alternative-response/:token` | GET | Alternative-Antwort verarbeiten |
| `/registrations/:id` | PUT/DELETE | Anmeldung bearbeiten/löschen |
| **PDFs & Dokumente** | | |
| `/calendar/ics` | GET | iCalendar-Export |
| `/arbeitsplan/pdf` | POST | Arbeitsplan-PDF generieren |
| `/events/:id/pdf/arbeitsplan` | GET | Event-Arbeitsplan PDF |
| `/events/:id/pdf/teilnehmerliste` | GET | Teilnehmerliste PDF |
| `/teilnehmerliste/pdf` | POST | Teilnehmerliste generieren |
| **Erinnerungen** | | |
| `/shifts/send-reminders` | POST | Schicht-Erinnerungen senden (Vorstand) |
| `/shifts/cron-reminders` | POST | Automatische Erinnerungen (Cronjob) |
| `/reminders/send-daily` | POST | Tägliche Erinnerung (Cronjob) |
| `/reminders/preview` | GET | Erinnerungs-Vorschau (Vorstand) |
| `/reminders/send` | POST | Erinnerungen manuell senden |
| **Event-Gruppen** | | |
| `/event-groups` | GET | Alle Event-Gruppen |
| `/event-groups/:id` | GET | Event-Gruppen-Details |
| `/event-groups` | POST | Gruppe erstellen (Vorstand) |
| `/event-groups/:id` | PUT/DELETE | Gruppe bearbeiten/löschen |
| `/event-groups/:id/arbeitsplan-pdf` | POST | Gruppen-Arbeitsplan PDF |

### 3. Dispatch API (`backend-dispatch`)

E-Mail-Versand, Briefversand (Pingen), Newsletter, Kontaktformular, Mailcow-Integration und PDF-Vorlagen.

**Traefik-Pfade:** `/email`, `/pingen`, `/templates`, `/contact`, `/newsletter`, `/dispatch-log`, `/mailcow`, `/pdf-templates`, `/organisation-settings`, `/dispatch`

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/health` | GET | Health-Check |
| **E-Mail-Vorlagen** | | |
| `/templates` | GET/POST | Vorlagen abrufen/erstellen |
| `/templates/:id` | PUT/DELETE | Vorlage bearbeiten/löschen |
| **E-Mail-Versand** | | |
| `/email/send` | POST | Einzelne E-Mail versenden |
| `/email/bulk` | POST | Massen-E-Mail versenden |
| `/dispatch/smart` | POST | Intelligenter Versand (E-Mail/Brief automatisch) |
| **Kontaktformular** | | |
| `/contact` | POST | Kontaktformular absenden |
| `/contact/confirm/:token` | GET | Kontaktanfrage bestätigen |
| **Newsletter** | | |
| `/newsletter/subscribe` | POST | Newsletter abonnieren |
| `/newsletter/confirm` | GET | Abo bestätigen |
| `/newsletter/unsubscribe` | POST | Newsletter abbestellen |
| **Mailcow-Integration** | | |
| `/mailcow/mailboxes` | GET/POST | Postfächer abrufen/erstellen |
| `/mailcow/mailboxes/:email` | GET/PUT/DELETE | Postfach verwalten |
| `/mailcow/aliases` | GET/POST | Aliases abrufen/erstellen |
| `/mailcow/aliases/:id` | PUT/DELETE | Alias bearbeiten/löschen |
| `/mailcow/domain` | GET | Domain-Info |
| `/mailcow/quota` | GET | Speicherplatz-Status |
| **Pingen (Briefversand)** | | |
| `/pingen/send` | POST | Brief versenden |
| `/pingen/letters` | GET | Versandte Briefe |
| `/pingen/letters/:letterId/status` | GET | Brief-Status |
| `/pingen/account` | GET | Pingen-Konto-Info |
| `/pingen/stats` | GET | Versand-Statistiken |
| `/pingen/post-members` | GET | Mitglieder mit Post-Zustellung |
| `/pingen/send-bulk-pdf` | POST | Massen-PDF-Versand |
| `/pingen/send-manual` | POST | Manueller Versand |
| `/pingen/send-arbeitsplan` | POST | Arbeitsplan per Post senden |
| `/pingen/webhook` | POST | Pingen Webhook-Handler |
| `/pingen/webhooks/register` | POST | Webhook registrieren |
| `/pingen/webhooks` | GET | Webhooks abrufen |
| `/pingen/webhooks/:id` | DELETE | Webhook löschen |
| **PDF-Vorlagen** | | |
| `/pdf-templates` | GET/POST | PDF-Vorlagen abrufen/erstellen |
| `/pdf-templates/:id` | GET/PUT/DELETE | Vorlage verwalten |
| `/pdf-templates/layout/active` | GET | Aktives PDF-Layout |
| **Rechnungen** | | |
| `/invoices/generate-qr` | POST | Rechnung mit QR-Code generieren |
| `/invoices/generate-bulk` | POST | Massen-Rechnungen generieren |
| **Organisations-Einstellungen** | | |
| `/organisation-settings` | GET | Einstellungen abrufen |
| `/organisation-settings/:key` | PUT | Einstellung aktualisieren |
| **Versand-Protokoll** | | |
| `/dispatch-log` | GET | Versand-Historie |

### 4. Accounting API (`backend-accounting`)

Buchhaltung mit Kontenplan, Buchungen, Rechnungen und Finanzberichten.

**Traefik-Pfade:** `/invoices`, `/payments`, `/reports`, `/accounts`

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/health` | GET | Health-Check |
| **Kontenplan** | | |
| `/accounts` | GET | Alle Konten abrufen |
| `/accounts` | POST | Konto erstellen |
| **Buchungen** | | |
| `/transactions` | GET | Buchungen abrufen (mit Filtern) |
| `/transactions` | POST | Buchung erstellen |
| **Rechnungen** | | |
| `/invoices` | GET | Alle Rechnungen |
| `/invoices/:id` | GET | Rechnungs-Details |
| `/invoices` | POST | Rechnung erstellen |
| `/invoices/:id/pay` | PATCH | Rechnung als bezahlt markieren |
| **Berichte** | | |
| `/reports/balance` | GET | Bilanz-Bericht |
| `/reports/cashflow` | GET | Cashflow-Bericht |

---

## Authentifizierung

Das System unterstützt zwei Authentifizierungsmethoden:

### 1. Authentik OIDC (Mitglieder)

- OAuth2 Authorization Code Flow
- JWT mit RS256-Signatur (asymmetrisch)
- Zentrale Benutzerverwaltung über Authentik
- Separate Client-IDs für Website, Kassensystem und Inventar

```javascript
// Token-Validierung
const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
```

### 2. IMAP Login (Vorstand)

- Login mit Vereins-Mailbox-Credentials (z.B. praesident@fwv-raura.ch)
- JWT mit HS256-Signatur (symmetrisch, 8h Gültigkeit)
- Token-Typ: `vorstand`
- Cookie-Domain: `.fwv-raura.ch` für Cross-Subdomain-Zugriff

```javascript
// IMAP-Authentifizierung
const client = new ImapFlow({
  host: 'mail.test.juroct.net',
  auth: { user: email, pass: password }
});
```

**Erlaubte Vorstand-E-Mails:** Konfigurierbar via `VORSTAND_EMAILS` Umgebungsvariable (z.B. praesident, aktuar, kassier, materialwart, beisitzer).

---

## Kassensystem (Simple Order System)

Professionelle Bestellverwaltung bei Vereinsanlässen.

### Features

- **Tischbasierte Bestellungen** (1-99 oder Take-Away)
- **Echtzeit-Synchronisation** via WebSocket
- **Kitchen Display** mit Audio-Benachrichtigung
- **Mehrere Drucker** (Bar, Küche, Kasse) via ESC/POS
- **Zahlungsintegration**: Bar, SumUp 3G (Karte), RaiseNow (TWINT)
- **Offline-fähig** auf lokalem Raspberry Pi

### Komponenten

| Komponente | Technologie | Beschreibung |
|------------|-------------|--------------|
| Backend | Node.js/TypeScript + Socket.io | API + WebSocket-Server |
| Frontend | React + PWA | Bestellaufnahme |
| Kitchen Display | React + PWA | Echtzeit-Anzeige |
| Android KDS | Kotlin + OkHttp | Native Kitchen Display |
| Register App | React | Registrierungs-/Checkout-App |

### Workflow

```
Kasse → Bestellung → WebSocket → Kitchen Display
                   ↓
              Drucker (ESC/POS)
                   ↓
              Zubereitung
                   ↓
              Als erledigt markieren
```

---

## Inventarsystem (Simple Inventory System)

Lagerverwaltung mit Rezepturen und Verknüpfung zum Kassensystem.

### Features

- **Artikelverwaltung** mit Kategorien, Preisen, Bildern
- **Rezepturen** mit Zutaten und automatischer Bestandsreduktion
- **Lagerorte** (z.B. Kühlschrank, Lager, Bar)
- **QR-Codes** für schnelle Artikelerfassung
- **Scanner-Integration** für Inventurerfassung
- **POS-Integration** (verkaufbare Artikel im Kassensystem)

### API-Endpunkte

| Endpoint | Beschreibung |
|----------|--------------|
| `/items` | Artikel CRUD |
| `/categories` | Kategorien |
| `/locations` | Lagerorte |
| `/recipes` | Rezepturen |
| `/qrcode/:id` | QR-Code generieren |
| `/scanner` | Artikelinfo per Barcode |

---

## PDF-Designer

Visueller Editor für PDF-Vorlagen (Briefe, Rechnungen, Arbeitspläne).

- **Technologie:** React, Vite, Tailwind CSS
- **URL:** pdf.fwv-raura.ch
- **Speicherung:** PDF-Vorlagen werden über die Dispatch-API in der Datenbank gespeichert

---

## Android Apps

### 1. Vorstand App

Native Android-App für Vorstandsmitglieder.

**Features:**
- Mitgliederverwaltung (CRUD) mit Foto-Upload
- Event-Management mit Schichten
- Anmeldungen bearbeiten (genehmigen/ablehnen)
- Audit-Log einsehen
- Push-Benachrichtigungen für neue Aktivitäten (WorkManager)
- Auto-Update via GitHub Releases (`vorstand-v*` Tags)

**Technologie:**
- Kotlin, MVVM-Architektur
- Retrofit + Gson für API-Kommunikation
- Material 3 Design
- EncryptedSharedPreferences für Token-Speicherung
- WorkManager für Hintergrund-Benachrichtigungen
- minSdk 26 (Android 8.0)

**Build:**
```bash
cd vorstand-android
./gradlew assembleRelease
```

**CI/CD:**
```yaml
# Tag erstellen für automatischen Build + GitHub Release
git tag vorstand-v1.0.0
git push --tags
```

### 2. Kitchen Display App

Native Android-App für Küchen-Tablets.

**Features:**
- WebSocket-Verbindung für Echtzeit-Updates
- Audio-Benachrichtigung bei neuer Bestellung
- Dunkles Theme für Küchen-Umgebung
- Bestellungen als erledigt markieren
- Auto-Update via GitHub Releases (`kds-v*` Tags)

**Technologie:**
- Kotlin, Single-Activity
- OkHttp + WebSocket
- Dark Theme

---

## Datenbank

PostgreSQL 16 (Alpine) mit 16 Migrations-Dateien.

### Haupttabellen

| Tabelle | Beschreibung |
|---------|--------------|
| `members` | Mitglieder mit Kontaktdaten, Funktion, Status |
| `events` | Anlässe mit Datum, Ort, Beschreibung |
| `shifts` | Schichten pro Event |
| `shift_registrations` | Anmeldungen zu Schichten |
| `member_registrations` | Mitgliedschaftsanträge |
| `event_groups` | Event-Gruppierungen |
| `audit_log` | Aktivitätsprotokoll (automatisch via Trigger) |
| `vorstand_sessions` | Vorstand-Login-Sessions |
| `dispatch_templates` | E-Mail/Brief-Vorlagen |
| `pdf_templates` | PDF-Vorlagen (Rechnungen, Briefe) |
| `pdf_template_categories` | Kategorisierung von PDF-Vorlagen |
| `shift_reminders` | Schicht-Erinnerungen |
| `farewell_templates` | Austritts-Vorlagen |
| `shared_mailbox_passwords` | Geteilte Postfach-Passwörter |
| `contact_confirmations` | Kontaktformular-Bestätigungen |
| `member_deletion_requests` | DSGVO-Löschanträge |

### Migrations

```
docker/postgres/migrations/
├── 002_authentik_sync_and_notifications.sql
├── 002_member_registrations.sql
├── 003_vorstand_auth.sql
├── 004_shifts_bereich.sql
├── 005_dispatch_templates.sql
├── 006_event_organizer_access.sql
├── 007_arbeitsplan_tracking.sql
├── 008_member_deletion_requests.sql
├── 009_event_groups.sql
├── 010_shift_reminders.sql
├── 011_farewell_templates.sql
├── 012_pdf_templates.sql
├── 013_pdf_template_categories.sql
├── 014_shared_mailbox_passwords.sql
├── 015_contact_confirmations.sql
└── 016_audit_trigger.sql
```

---

## Deployment

### Voraussetzungen

- Docker & Docker Compose
- Traefik als Reverse Proxy (separater Container)
- Authentik als Identity Provider (separater Container)
- Domain mit DNS-Einträgen (*.fwv-raura.ch)
- SSL-Zertifikate (automatisch via Let's Encrypt)

### Produktion starten

```bash
cd docker
docker-compose -f docker-compose.prod.yml up -d
```

### Logs anzeigen

```bash
docker-compose -f docker-compose.prod.yml logs -f backend-members
```

### Container aktualisieren (Watchtower)

Container werden automatisch aktualisiert wenn neue Images auf ghcr.io verfügbar sind. Ausnahme: Der PostgreSQL-Container wird **nicht** automatisch aktualisiert (Datenverlust-Risiko).

---

## CI/CD Workflows

### 1. Docker Container Build (`build-containers.yml`)

**Trigger:** Push zu `main` (mit Change-Detection) oder manuell via `workflow_dispatch`

**Semantic Release:** Erstellt automatisch Versions-Tags und CHANGELOG.

**Build-Jobs (13 Container):**

| Job | Image | Source |
|-----|-------|--------|
| `build-backend-members` | `ghcr.io/.../fwv-raura-api-members` | `docker/backend-members/` |
| `build-backend-events` | `ghcr.io/.../fwv-raura-api-events` | `docker/backend-events/` |
| `build-backend-dispatch` | `ghcr.io/.../fwv-raura-api-dispatch` | `docker/backend-dispatch/` |
| `build-backend-accounting` | `ghcr.io/.../fwv-raura-api-accounting` | `docker/backend-accounting/` |
| `build-frontend-website` | `ghcr.io/.../fwv-raura-frontend` | `docker/frontend-website/` |
| `build-frontend-pdf-designer` | `ghcr.io/.../fwv-raura-pdf-designer` | `docker/frontend-pdf-designer/` |
| `build-wiki-docs` | `ghcr.io/.../fwv-raura-wiki` | `docker/wiki-docs/` |
| `build-order-backend` | `ghcr.io/.../order-backend` | `simple-order-system/backend/` |
| `build-order-frontend` | `ghcr.io/.../order-frontend` | `simple-order-system/frontend/` |
| `build-order-kitchen` | `ghcr.io/.../order-kitchen` | `simple-order-system/kitchen-display/` |
| `build-order-register` | `ghcr.io/.../order-register` | `simple-order-system/register-app/` |
| `build-inventory-backend` | `ghcr.io/.../inventory-backend` | `simple-inventory-system/backend/` |
| `build-inventory-frontend` | `ghcr.io/.../inventory-frontend` | `simple-inventory-system/frontend/` |

Jeder Job baut nur bei Änderungen im jeweiligen Source-Verzeichnis (via `dorny/paths-filter`).

### 2. Vorstand Android App (`build-android-vorstand.yml`)

**Trigger:** Tag `vorstand-v*`

**Output:** Signierte APK als GitHub Release

**Secrets:** `VORSTAND_KEYSTORE_BASE64`, `VORSTAND_KEYSTORE_PASSWORD`

### 3. Kitchen Display Android (`build-android-kds.yml`)

**Trigger:** Tag `kds-v*`

**Output:** Signierte APK als GitHub Release

---

## Lokale Entwicklung

### Backend starten

```bash
cd docker
docker-compose up -d postgres
cd backend-members
npm install
npm run dev
```

### Frontend starten

```bash
cd docker/frontend-website
npx http-server -p 8080
```

### Kassensystem starten

```bash
cd simple-order-system
docker-compose up -d
```

### Android App bauen

```bash
cd vorstand-android
./gradlew assembleDebug
```

---

## Umgebungsvariablen

### Backend Services (Gemeinsam)

```env
# Datenbank
DATABASE_URL_ENCODED=postgresql://fwv:xxx@postgres:5432/fwv_raura
POSTGRES_USER=fwv
POSTGRES_PASSWORD=xxx
POSTGRES_DB=fwv_raura

# JWT
JWT_SECRET=xxx                    # HS256 Secret für Vorstand-Tokens
API_KEY=xxx                       # API-Key für Cronjobs und Inter-Service-Kommunikation
```

### Members API

```env
# Authentik (Mitglieder-Auth)
AUTHENTIK_URL=https://auth.fwv-raura.ch
AUTHENTIK_CLIENT_ID=xxx
AUTHENTIK_CLIENT_SECRET=xxx
AUTHENTIK_CLIENT_ID_VORSTAND=xxx
AUTHENTIK_CLIENT_SECRET_VORSTAND=xxx
AUTHENTIK_CLIENT_ID_ORDER=xxx
AUTHENTIK_CLIENT_SECRET_ORDER=xxx
AUTHENTIK_API_TOKEN=xxx           # Für Benutzer-Synchronisierung

# IMAP (Vorstand-Login)
IMAP_HOST=mail.test.juroct.net
IMAP_PORT=993
VORSTAND_EMAILS=praesident@fwv-raura.ch,aktuar@fwv-raura.ch,...

# Admin
ADMIN_EMAIL=admin@fwv-raura.ch
ADMIN_PASSWORD=xxx
```

### Dispatch API

```env
# E-Mail (SMTP)
SMTP_HOST=mail.test.juroct.net
SMTP_PORT=587
SMTP_USER=xxx
SMTP_PASSWORD=xxx

# Pingen (Brief-Versand)
PINGEN_CLIENT_ID=xxx
PINGEN_CLIENT_SECRET=xxx
PINGEN_ORGANISATION_ID=xxx
PINGEN_STAGING=false              # true für Testbetrieb

# Mailcow (E-Mail-Verwaltung)
MAILCOW_API_URL=https://mail.test.juroct.net
MAILCOW_API_KEY=xxx
```

### Kassensystem

```env
# SumUp Terminal
SUMUP_AFFILIATE_KEY=xxx
SUMUP_APP_ID=xxx

# RaiseNow (TWINT)
RAISENOW_API_KEY=xxx

# Authentik
VITE_AUTHENTIK_URL=https://auth.fwv-raura.ch
VITE_AUTHENTIK_CLIENT_ID=order-system
```

### Inventarsystem

```env
VITE_API_URL=https://inventar.fwv-raura.ch/api
VITE_AUTHENTIK_URL=https://auth.fwv-raura.ch
VITE_AUTHENTIK_CLIENT_ID=inventory-system
```

---

## Dokumentation

| Dokument | Beschreibung |
|----------|--------------|
| [Wiki](docker/wiki-docs/) | Benutzer-Dokumentation (Docusaurus) |
| [API-Übersicht](docker/wiki-docs/docs/api/) | REST API Dokumentation |
| [Kassensystem](simple-order-system/README.md) | Setup-Anleitung |
| [Inventar](simple-inventory-system/README.md) | Setup-Anleitung |

---

## Bekannte Gotchas

1. **Traefik Routing:** Höhere Priority-Zahl = wird zuerst gematcht. Bei neuen Routes prüfen ob es Konflikte gibt. Dispatch hat Priority 200 für `/invoices/generate` und `/arbeitsplan/pdf`.

2. **Git Push:** Bei CI-Commits (Semantic Release) oft `git pull --rebase` nötig vor dem Push.

3. **Docker Container-Namen:** Bei Konflikten `docker rm -f <name>` vor Neustart.

4. **Android minSdk:** Apps verwenden SDK 26 (Android 8.0), keine Abwärtskompatibilität.

5. **Cookie-Domain:** Vorstand-Session nutzt `.fwv-raura.ch` für Cross-Subdomain-Zugriff. Beim Logout müssen Cookies explizit für diese Domain gelöscht werden.

6. **PostgreSQL:** Der DB-Container wird **nicht** von Watchtower aktualisiert (Label `watchtower.enable=false`).

7. **Inter-Service-Kommunikation:** Events-API und Dispatch-API kommunizieren intern über Docker-Netzwerk (`http://api-members:3000`, `http://api-dispatch:3000`).

---

## Lizenz

Dieses Projekt ist unter der MIT License lizenziert.

---

## Kontakt

- **Website:** https://fwv-raura.ch
- **E-Mail:** webmaster@fwv-raura.ch
- **GitHub:** https://github.com/Feuerwehrverein-Raura

---

**Made with love by Feuerwehrverein Raura Kaiseraugst**
