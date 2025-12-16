# 🔥 Feuerwehrverein Raura Kaiseraugst - Homepage

> **Moderne Website mit Event-Management, Kalender-Integration, Schichtplanung und Docker-API**

[![Docker](https://img.shields.io/badge/Docker-Ready-blue)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57)](https://www.sqlite.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 🎯 Features

### 📅 **Kalender & Events**
- **Interaktiver Kalender** mit Monats-, Wochen- und Listenansicht
- **ICS-Feed** für Kalender-Apps (Google Calendar, Apple Calendar, Outlook)
- **Automatische Event-Synchronisation** via GitHub Actions
- **Status-Tracking:** Vergangene, laufende und zukünftige Events
- **Online-Anmeldungen** mit REST API und Datenbank-Speicherung

### 👷 **Schichtplanung**
- **Helfer-Management** für Großveranstaltungen (z.B. Chilbi)
- **Interaktiver Schichtplan-Manager** mit Drag & Drop
- **PDF-Export** im Original-Arbeitsplan-Format
- **Automatische Statistiken:** Offene vs. besetzte Plätze

### 📧 **Anmeldungen & Newsletter**
- **Helfer-Anmeldung** mit Schichtauswahl (z.B. Chilbi)
- **Teilnehmer-Anmeldungen** für gesellige Events (z.B. Grillplausch)
- **Newsletter-System** mit Double-Opt-In
- **Kontaktformular** mit automatischem E-Mail-Versand
- **SQLite-Datenbank** für persistente Datenspeicherung

### 🎪 **Event-Management**
- **Markdown-basierte Events** - einfach zu erstellen und bearbeiten
- **Kategorien und Tags** für bessere Organisation
- **Responsive Design** - funktioniert auf allen Geräten
- **Bilderunterstützung** mit Lazy Loading

### 🐳 **Docker Container System**
- **Express.js REST API** für alle dynamischen Funktionen
- **SQLite Datenbank** mit WAL-Modus
- **Automatische Backups** via Syncthing
- **Nginx Webserver** für statische Inhalte
- **Multi-Container Setup** mit docker-compose

### 🔐 **Authentifizierung**
- **OIDC/OAuth2 Login** mit Authentik
- **Geschützter Bereich** für Vorstand und Mitglieder
- **Passwort-Fallback** für Legacy-Zugriff
- **Session Management** mit sessionStorage

### 🤖 **Automation**
- **GitHub Actions** für automatische ICS-Generierung und PDF-Kalender
- **Versionskontrolle** für alle Änderungen
- **CI/CD Pipeline** für Docker Container Builds
- **Pingen Integration** für physischen Kalender-Versand per Post

---

## 📁 Projektstruktur

```
Homepage/
├── 🏠 index.html                    # Hauptseite
├── 📅 calendar.html                 # Interaktive Kalenderseite
├── 🎫 events.html                   # Veranstaltungsübersicht mit Anmeldung
├── 👷 schichtplan-manager.html      # Schichtplan-Verwaltungstool (geschützt)
├── 📋 anmeldungen.html              # Anmeldungen-Dashboard (geschützt)
├── 👤 members-dynamic.html          # Mitgliederverwaltung (geschützt)
├── 🔐 login.html                    # Login-Seite (OIDC + Passwort)
├── 🔄 auth-callback.html            # OIDC Callback Handler
├── 📄 calendar.ics                  # Automatisch generierter ICS-Feed
│
├── 📂 events/                       # Event-Markdown-Dateien
│   ├── 📝 README.md                 # Event-Dokumentation
│   ├── 🎪 chilbi-2024.md           # Beispiel: Chilbi mit Helfer-Schichten
│   ├── 📋 chilbi-2024-assignments.md  # Schichtplan-Zuweisungen
│   ├── 🎪 chilbi-2025.md           # Zukünftige Chilbi
│   └── 🍖 grillplausch-2024.md     # Beispiel: Teilnehmer-Event
│
├── 📂 vorstand/                     # Vorstandsinformationen
│   └── *.md                         # Vorstandsmitglieder-Dateien
│
├── 📂 mitglieder/                   # Mitgliederinformationen
│   └── *.md                         # Mitglieder-Dateien
│
├── 🖼️ images/                       # Bilder und Assets
│   ├── 🔥 logo.png                  # Vereinslogo
│   ├── 📸 hero-bg.jpg               # Hero-Bild
│   └── 🎪 event-images/             # Event-spezifische Bilder
│
├── 📜 js/                           # JavaScript-Module
│   ├── 🗓️ calendar.js               # Kalender-Logik
│   ├── 🎫 events.js                 # Event-Verwaltung
│   └── 👷 schichtplan.js            # Schichtplan-Manager
│
├── 🎨 css/                          # Stylesheets
│   └── 🎨 styles.css                # Haupt-Stylesheet (Tailwind)
│
├── 📦 pdfs/                         # Generierte PDF-Dateien
│   ├── 📄 arbeitsplan-chilbi-2024.pdf
│   ├── 📄 arbeitsplan-chilbi-2025.pdf
│   └── 📊 calendar-*.pdf            # Monatliche Kalender-PDFs
│
├── ⚙️ scripts/                      # Automatisierungs-Scripts
│   ├── 📝 README.md                 # Scripts-Dokumentation
│   ├── 📊 generate-ics.js           # ICS-Generator
│   ├── 📋 generate-shift-plans.js   # PDF-Generator
│   └── 🧪 test-pdf.js               # PDF-Test-Script
│
├── 🐳 api/                          # Docker API Container
│   ├── 📝 README.md                 # API-Dokumentation
│   ├── 🐳 Dockerfile                # API Container Image
│   ├── 📦 package.json              # Node.js Dependencies
│   └── src/
│       ├── 🚀 server.js             # Express.js Server
│       ├── routes/                  # API Endpoints
│       │   ├── contact.js           # Kontaktformular
│       │   ├── events.js            # Event-Anmeldungen
│       │   ├── newsletter.js        # Newsletter-System
│       │   ├── members.js           # Mitgliederverwaltung
│       │   └── calendar.js          # Kalender-PDF-Generierung
│       └── utils/
│           ├── database.js          # SQLite Helper
│           ├── backup.js            # Automatische Backups
│           ├── email.js             # E-Mail-Versand
│           ├── github.js            # GitHub API (deprecated)
│           └── hybrid-storage.js    # Hybrid SQLite/GitHub
│
├── 🐳 docker-compose.yml            # Multi-Container Orchestrierung
├── 🐳 Dockerfile.website            # Website Container Image
├── ⚙️ nginx.conf                    # Nginx Konfiguration
│
├── 📂 data/                         # SQLite Datenbank (persistent)
│   └── 🗄️ fwv-raura.db             # SQLite Datenbank-Datei
│
├── 🔄 .github/workflows/
│   ├── ⚡ generate-calendar.yml     # ICS-Generierung
│   ├── 📄 generate-calendar-pdf.yml # PDF-Kalender + Pingen
│   └── 🐳 build-containers.yml      # Docker Builds
│
├── 📋 README.md                     # Diese Dokumentation
├── 📦 package.json                  # Node.js Konfiguration
└── 🔐 .gitignore                    # Git Ignore-Regeln
```

---

## 🚀 Quick Start

### **Option 1: Docker (Empfohlen)**

#### **Voraussetzungen**
- Docker & Docker Compose installiert
- Git installiert

#### **1. Repository klonen**
```bash
git clone https://github.com/Feuerwehrverein-Raura/Homepage.git
cd Homepage
```

#### **2. Umgebungsvariablen konfigurieren**
```bash
# .env Datei erstellen
cp api/.env.example api/.env

# Variablen anpassen:
# - SMTP_HOST, SMTP_USER, SMTP_PASS
# - GITHUB_TOKEN (optional, für GitHub Backup)
# - PINGEN_TOKEN (für Kalender-Postversand)
```

#### **3. Container starten**
```bash
docker-compose up -d
```

#### **4. Website öffnen**
```
http://localhost:8080          # Website
http://localhost:3000          # API
http://localhost:3000/health   # API Health Check
```

#### **5. Logs anzeigen**
```bash
docker-compose logs -f          # Alle Container
docker-compose logs -f api      # Nur API
docker-compose logs -f website  # Nur Website
```

#### **6. Container stoppen**
```bash
docker-compose down             # Stoppen
docker-compose down -v          # Stoppen + Volumes löschen
```

---

### **Option 2: Lokale Entwicklung**

#### **Voraussetzungen**
- Node.js >= 18.0.0
- Python 3 oder Node.js für lokalen Webserver
- SQLite3

#### **1. Repository klonen**
```bash
git clone https://github.com/Feuerwehrverein-Raura/Homepage.git
cd Homepage
```

#### **2. API Dependencies installieren**
```bash
cd api
npm install
```

#### **3. API starten**
```bash
cd api
npm start              # Produktion
# oder
npm run dev            # Entwicklung mit nodemon
```

#### **4. Website lokal servieren**
```bash
# In neuem Terminal
cd Homepage

# Option 1: Python
python -m http.server 8000

# Option 2: Node.js
npx http-server

# Option 3: Live Server (VS Code Extension)
# Rechtsklick auf index.html → "Open with Live Server"
```

#### **5. Website öffnen**
```
http://localhost:8000          # Website
http://localhost:3000          # API
```

---

## 📝 Event-Management

### **Neue Veranstaltung erstellen**

#### **1. Markdown-Datei erstellen**
```bash
# Namenskonvention: [typ]-[name]-[jahr].md
events/silvester-party-2025.md
```

#### **2. Frontmatter-Template verwenden**
```markdown
---
id: silvester-party-2025
title: Silvester-Party 2025
subtitle: Gemeinsam ins neue Jahr
startDate: 2025-12-31T20:00:00
endDate: 2026-01-01T02:00:00
location: Vereinslokal Roter Schopf
category: Gesellschaftsanlass
organizer: Max Mustermann
email: max@feuerwehrverein-raura.ch
registrationRequired: true
registrationDeadline: 2025-12-20T23:59:59
cost: CHF 25.- pro Person
tags: [Party, Silvester, Geselligkeit]
participantRegistration: true
maxParticipants: 50
status: confirmed
---

# Silvester-Party 2025

Beschreibung der Veranstaltung mit **Markdown-Formatierung**.

## Programm
- 20:00 Uhr: Einlass und Apéro
- 21:00 Uhr: Buffet
- 00:00 Uhr: Mitternachts-Toast
- 02:00 Uhr: Ende

Anmeldung erforderlich!
```

#### **3. Datei committen und pushen**
```bash
git add events/silvester-party-2025.md
git commit -m "✨ Neue Veranstaltung: Silvester-Party 2025"
git push
```

**→ Die Website wird automatisch aktualisiert! 🎉**

### **Event-Typen**

#### **Typ 1: Helfer-Events (mit Schichten)**
*Beispiel: Chilbi, Arbeitseinsätze*

```yaml
registrationRequired: true
shifts:
  - id: aufbau-1
    name: Aufbau Tag 1
    date: 2025-10-05
    time: 17:00-20:00
    needed: 5
    description: Grundaufbau und Vorbereitung
```

**Features:**
- ✅ Schichtauswahl mit Checkboxen
- ✅ Schichtplan-Manager Integration
- ✅ PDF-Arbeitsplan-Export
- ✅ Automatische Statistiken

#### **Typ 2: Teilnehmer-Events**
*Beispiel: Grillplausch, Vereinsausflug*

```yaml
registrationRequired: true
participantRegistration: true
cost: CHF 35.- pro Person
maxParticipants: 40
```

**Features:**
- ✅ Personenzahl-Auswahl
- ✅ Kosten-Information
- ✅ Teilnehmer-Limit
- ✅ E-Mail-Anmeldung

#### **Typ 3: Info-Events**
*Beispiel: Vorstandssitzungen*

```yaml
registrationRequired: false
```

**Features:**
- ✅ Nur Informationsanzeige
- ✅ ICS-Download
- ✅ Kalender-Integration

---

## 👷 Schichtplanung

### **Schichtplan-Dateien**

Für Events mit Schichten erstellen Sie eine entsprechende Assignment-Datei:

```bash
# Namenskonvention
events/[event-id]-assignments.md

# Beispiel
events/chilbi-2025-assignments.md
```

### **Schichtplan-Format**
```markdown
# Schichtplan Chilbi 2025

**Event:** chilbi-2025
**Generiert:** 2025-01-12
**Status:** In Planung

---

## Aufbau
### aufbau (16.10.2025, 17:00-20:00) - 5 Personen benötigt
- René Käslin
- Stefan Müller
- Giuseppe Costanza
- **[OFFEN - 2 Plätze]**

---

## Samstag, 18.10.2025

### samstag-bar-12-14 (12:00-14:00) - 2 Personen benötigt
- Ramon Kahl
- **[OFFEN - 1 Platz]**

### samstag-kueche-12-14 (12:00-14:00) - 2 Personen benötigt
- Edi Grossenbacher
- Brigitte Käslin

---

## Statistik
- **Aufbau:** 3/5 zugeteilt (2 offen)
- **Samstag Schichten:** 3/36 zugeteilt (33 offen)
- **GESAMT:** 6/82 Plätze zugeteilt (**76 Plätze noch offen**)
```

### **Schichtplan-Manager verwenden**

1. **Öffnen:** `schichtplan-manager.html` im Browser
2. **Event laden:** Dropdown-Menü
3. **Personen zuweisen:** Namen in Felder eingeben
4. **Export:**
   - Markdown herunterladen
   - PDF-Arbeitsplan generieren

---

## 🐳 Docker API System

### **Architektur**

Das System besteht aus zwei Docker-Containern:

1. **Website Container** (Nginx)
   - Serviert statische HTML/CSS/JS Dateien
   - Port 8080 (extern) → 80 (intern)
   - Leichtgewichtig, basiert auf Alpine Linux

2. **API Container** (Node.js + Express)
   - REST API für alle dynamischen Funktionen
   - SQLite Datenbank mit WAL-Modus
   - Automatische Backups alle 60 Minuten
   - Port 3000 (extern & intern)

### **API Endpoints**

```
POST /api/contact           # Kontaktformular
POST /api/events/register   # Event-Anmeldungen
POST /api/newsletter/subscribe        # Newsletter-Anmeldung
POST /api/newsletter/confirm/:token   # Newsletter-Bestätigung
POST /api/members/register  # Mitglieder-Registrierung (mit OTP)
POST /api/members/mutations # Mitglieder-Mutationen
GET  /api/calendar/generate # PDF-Kalender-Generierung
GET  /health                # Health Check
```

Ausführliche API-Dokumentation: [api/README.md](api/README.md)

### **SQLite Datenbank**

**Speicherort:** `./data/fwv-raura.db` (persistent)

**Tabellen:**
- `event_registrations` - Event-Anmeldungen (Helfer & Teilnehmer)
- `newsletter_subscribers` - Newsletter-Abonnenten
- `pending_members` - Ausstehende Mitglieder-Registrierungen
- `member_mutations` - Mitglieder-Änderungen
- `otp_codes` - One-Time-Passwords (5 Min. Gültigkeit)
- `contact_submissions` - Kontaktformular-Anfragen

**Features:**
- WAL-Modus für bessere Concurrent-Access
- Automatische Backups alle 60 Minuten nach `/sync/backups`
- Cleanup von alten Backups (> 24h)
- Symlink `fwv-raura-latest.db` für Syncthing

### **Syncthing Integration**

```yaml
volumes:
  - ./sync:/sync  # Syncthing-Verzeichnis
```

**Backup-Verzeichnis:** `/sync/backups`
- Stündliche SQLite-Backups
- Format: `fwv-raura-YYYY-MM-DDTHH-MM-SS.db`
- Automatisches Cleanup (> 24h)
- Latest-Symlink für einfachen Zugriff

### **Umgebungsvariablen**

Siehe [api/.env.example](api/.env.example):

```env
# Server
PORT=3000
NODE_ENV=production

# Database
DB_PATH=/data/fwv-raura.db
BACKUP_DIR=/sync/backups
BACKUP_INTERVAL=3600000  # 1 Stunde

# Email (SMTP)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
SMTP_FROM=noreply@fwv-raura.ch

# GitHub (optional, für Backup)
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx
GITHUB_OWNER=Feuerwehrverein-Raura
GITHUB_REPO=Homepage

# Pingen (für Kalender-Postversand)
PINGEN_TOKEN=your-pingen-token
```

---

## 🤖 Automation & Scripts

### **ICS-Generierung (Automatisch)**

**GitHub Actions** generiert automatisch `calendar.ics`:

**Trigger:**
- Push zu `events/*.md`
- Täglich um 6:00 Uhr UTC

**Manueller Aufruf:**
```bash
npm run generate-ics
# oder
node scripts/generate-ics.js
```

### **PDF-Kalender-Generierung (Automatisch)**

**GitHub Actions** generiert monatliche PDF-Kalender:

**Trigger:**
- Push zu `events/*.md`
- Monatlich am 1. um 6:00 Uhr UTC
- Manual Trigger via `repository_dispatch`

**Features:**
- Generiert PDF-Kalender für aktuellen Monat
- Versendet per Pingen an Mitglieder mit `zustellung-post: true`
- Speichert PDF in `pdfs/calendar-YYYY-MM.pdf`

### **Schichtplan-PDF-Generierung (Manuell)**

```bash
npm run generate-pdfs
# oder
node scripts/generate-shift-plans.js
```

**Output:**
- `pdfs/arbeitsplan-[event-id].pdf`
- `pdfs/arbeitsplan-[event-id].html`
- `pdfs/overview-all-events.pdf`

### **Docker Container Builds (Automatisch)**

**GitHub Actions** baut automatisch Docker Images:

**Trigger:**
- Push zu `main` Branch

**Output:**
- `ghcr.io/feuerwehrverein-raura/homepage-website:latest`
- `ghcr.io/feuerwehrverein-raura/homepage-api:latest`

### **Verfügbare npm Scripts**

```json
{
  "generate-shifts": "node scripts/generate-shift-plans.js",
  "generate-ics": "node scripts/generate-ics.js",
  "generate-pdfs": "node scripts/generate-shift-plans.js",
  "test": "node scripts/test-pdf.js"
}
```

---

## 🔐 Authentifizierung & Geschützter Bereich

### **Login-Methoden**

Das System unterstützt zwei Authentifizierungs-Methoden:

1. **OIDC/OAuth2 mit Authentik (Empfohlen)**
   - OAuth2 Authorization Code Flow
   - State & Nonce für Sicherheit
   - Zentrale Benutzerverwaltung
   - Single Sign-On

2. **OTP (One-Time Password) per E-Mail**
   - 6-stelliger Code per E-Mail
   - Gültig für 5 Minuten
   - Nur für autorisierte E-Mail-Adressen (Vorstand & Mitglieder)
   - Keine Passwörter nötig

### **Geschützte Seiten**

Folgende Seiten erfordern Authentifizierung:

- [anmeldungen.html](anmeldungen.html) - Event-Anmeldungen Dashboard
- [schichtplan-manager.html](schichtplan-manager.html) - Schichtplan-Verwaltung
- [members-dynamic.html](members-dynamic.html) - Mitgliederverwaltung

### **Authentik Konfiguration**

**Provider-Settings:**
```yaml
Authority: https://auth.fwv-raura.ch/application/o/fwv-raura/
Client ID: fwv-raura-website
Redirect URI: https://fwv-raura.ch/auth-callback.html
Response Type: code
Scope: openid profile email
```

**Application-Setup in Authentik:**
1. Provider erstellen: OAuth2/OpenID Provider
2. Application erstellen: fwv-raura-website
3. Redirect URIs konfigurieren
4. Client ID notieren
5. Scopes: openid, profile, email

### **Implementierung**

**OIDC Login-Flow:**
1. User klickt "Mit Authentik anmelden"
2. Redirect zu Authentik Authorization Endpoint
3. User authentifiziert sich bei Authentik
4. Redirect zurück zu `/auth-callback.html`
5. Token-Austausch & Session-Setup
6. Redirect zur ursprünglich angeforderten Seite

**OTP Login-Flow:**
1. User klickt "OTP per E-Mail senden"
2. User gibt E-Mail-Adresse ein
3. API prüft ob E-Mail in vorstand/*.md oder mitglieder/*.md existiert
4. 6-stelliger Code wird per E-Mail versendet
5. User gibt Code ein
6. API verifiziert Code und gibt Berechtigung
7. Session wird erstellt und User zur Zielseite weitergeleitet

**Session-Management:**
```javascript
// Check Authentication
if (sessionStorage.getItem('authenticated') !== 'true') {
    window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
}
```

**Autorisierte Benutzer:**
- E-Mail-Adressen in `vorstand/*.md` Dateien (Frontmatter: `email`)
- E-Mail-Adressen in `mitglieder/*.md` Dateien (Frontmatter: `email`)

---

## 🐛 Troubleshooting

### **Problem: ICS-Generierung schlägt fehl**

**Fehler:**
```
Error generating ICS file: RangeError: Invalid time value
```

**Lösung:**
```yaml
# ✅ Korrektes Datumsformat (ISO 8601)
startDate: 2025-10-14T14:00:00
endDate: 2025-10-14T18:00:00

# ❌ Falsche Formate
startDate: 14.10.2025 14:00
startDate: October 14, 2025
startDate: 2025-10-14  # Zeit fehlt!
```

**Debug:**
```bash
# Script lokal ausführen für detaillierte Logs
node scripts/generate-ics.js
```

### **Problem: Event erscheint nicht auf Website**

**Checkliste:**
1. ✅ Frontmatter-Syntax korrekt? (YAML-Format)
2. ✅ Pflichtfelder vorhanden? (`id`, `title`, `startDate`, `endDate`)
3. ✅ Dateiname endet auf `.md`?
4. ✅ Datei im `events/` Ordner?
5. ✅ GitHub Actions erfolgreich? (Actions-Tab prüfen)
6. ✅ Browser-Cache gelöscht?

### **Problem: Schichtplan-Manager funktioniert nicht**

**Checkliste:**
1. ✅ Event-ID im Schichtplan-Dateinamen korrekt?
2. ✅ Schichtplan-Format korrekt? (siehe Beispiel)
3. ✅ Alle Schicht-IDs eindeutig?
4. ✅ Browser-Konsole auf Fehler prüfen (F12)

### **Problem: PDF-Export schlägt fehl**

**Lösung:**
```bash
# Puppeteer neu installieren
npm install puppeteer

# Test-Script ausführen
npm test
# oder
node scripts/test-pdf.js
```

---

## 📚 Dokumentation

### **README-Dateien**

| Datei | Inhalt |
|-------|--------|
| [`README.md`](README.md) | Haupt-Dokumentation (diese Datei) |
| [`events/README.md`](events/README.md) | Event-Management Details |
| [`scripts/README.md`](scripts/README.md) | Scripts-Dokumentation |

### **Wichtige Dateien**

| Datei | Zweck |
|-------|-------|
| `calendar.ics` | ICS-Feed für Kalender-Apps |
| `package.json` | npm Konfiguration und Scripts |
| `.github/workflows/generate-calendar.yml` | GitHub Actions Workflow |

---

## 🎨 Design & Layout

### **Design-Prinzipien**

- ✅ **Responsive First:** Mobile, Tablet, Desktop
- ✅ **Accessibility:** WCAG 2.1 konform
- ✅ **Performance:** Lazy Loading, optimierte Bilder
- ✅ **Modern:** Tailwind CSS, Glassmorphism-Effekte

### **Farbschema**

```css
/* Primärfarben */
--primary-red: #dc2626;      /* Feuerwehr-Rot */
--primary-gold: #fbbf24;     /* Akzent-Gold */

/* Sekundärfarben */
--gray-50: #f9fafb;
--gray-800: #1f2937;
--gray-900: #111827;
```

### **Layout-Anpassungen**

**WICHTIG:** Bei Layout-Änderungen:
- ✅ Bestehende Struktur beibehalten
- ✅ Responsive Breakpoints beachten
- ✅ Accessibility nicht beeinträchtigen
- ✅ Features nicht entfernen ohne Rücksprache

---

## 🔒 Sicherheit

### **Best Practices**

- ✅ Keine sensiblen Daten in Markdown-Dateien
- ✅ E-Mail-Adressen nur für öffentliche Kontakte
- ✅ GitHub Secrets für API-Keys verwenden
- ✅ Dependencies regelmäßig aktualisieren

### **Datenschutz**

- ✅ Keine personenbezogenen Daten ohne Einwilligung
- ✅ Schichtplan-Assignments sind öffentlich sichtbar
- ✅ E-Mail-Anmeldungen via `mailto:` (lokal verarbeitet)

---

## 🤝 Beitragen

### **Workflow**

1. **Fork** das Repository
2. **Branch** erstellen: `git checkout -b feature/neue-funktion`
3. **Änderungen** committen: `git commit -m '✨ Neue Funktion'`
4. **Push** zum Branch: `git push origin feature/neue-funktion`
5. **Pull Request** erstellen

### **Commit-Konventionen**

```bash
✨ feat: Neue Funktion
🐛 fix: Bugfix
📝 docs: Dokumentation
🎨 style: Formatierung
♻️ refactor: Code-Refactoring
🧪 test: Tests
⚡ perf: Performance
🔧 chore: Konfiguration
```

---

## 📞 Support & Kontakt

### **Technischer Support**

- 🐛 **Bug Reports:** [GitHub Issues](https://github.com/Feuerwehrverein-Raura/Homepage/issues)
- 📧 **Webmaster:** webmaster@feuerwehrverein-raura.ch
- 💬 **Fragen:** [GitHub Discussions](https://github.com/Feuerwehrverein-Raura/Homepage/discussions)

### **Verein Kontakt**

- 🌐 **Website:** https://feuerwehrverein-raura.github.io/Homepage/
- 📧 **Präsident:** praesident@fwv-raura.ch
- 📧 **Aktuar:** aktuar@fwv-raura.ch
- 📍 **Adresse:** Feuerwehrverein Raura, 4303 Kaiseraugst

---

## 📜 Lizenz

Dieses Projekt ist unter der **MIT License** lizenziert - siehe [LICENSE](LICENSE) Datei für Details.

---

## 🙏 Danksagungen

- **Vorstand:** Für die Unterstützung und Ideen
- **Mitglieder:** Für Feedback und Testing
- **Contributors:** Alle die zum Projekt beitragen

---

## 📊 Status

### **Aktuelle Version**

- **Version:** 1.0.0
- **Status:** ✅ Produktiv
- **Letztes Update:** Oktober 2025

### **Feature-Status**

| Feature | Status |
|---------|--------|
| 📅 Kalender | ✅ Vollständig |
| 🎫 Events | ✅ Vollständig |
| 👷 Schichtplanung | ✅ Vollständig |
| 📄 PDF-Export | ✅ Vollständig |
| 🤖 Automation | ✅ Vollständig |
| 📱 Mobile | ✅ Vollständig |

### **Bekannte Probleme**

- Keine bekannten kritischen Issues
- Minor: PDF-Export benötigt Puppeteer (groß ~300MB)

### **Geplante Features**

- [ ] Mehrsprachigkeit (DE/FR)
- [ ] Mitgliederverwaltung
- [ ] Bildergalerie
- [ ] Nachrichtenarchiv
- [ ] Integration mit Nextcloud

---

**💡 Tipp:** Schauen Sie sich die Beispiel-Events in `events/` an, um zu sehen wie alles funktioniert!

**🔥 Made with ❤️ by Feuerwehrverein Raura Kaiseraugst**

---

**Navigation:**
- [📝 Event-Dokumentation](events/README.md)
- [📜 Scripts-Dokumentation](scripts/README.md)
- [🏠 Zur Website](https://feuerwehrverein-raura.github.io/Homepage/)
