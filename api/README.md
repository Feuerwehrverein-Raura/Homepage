# 🔥 FWV Raura API

REST API Server für dynamische Funktionen der Feuerwehrverein Raura Kaiseraugst Homepage.

## 📋 Übersicht

Diese API bietet alle Backend-Funktionen für die Website:
- **Kontaktformular** mit dynamischem E-Mail-Routing
- **Event-Anmeldungen** für Helfer und Teilnehmer
- **Newsletter-System** mit Double-Opt-In
- **PDF-Kalender-Generierung** mit Pingen-Versand
- **Mitgliederverwaltung** mit OTP-Verifizierung
- **SQLite-Datenbank** mit automatischen Backups

---

## 🚀 Quick Start

### Docker (Empfohlen)

```bash
# Im Hauptverzeichnis
docker-compose up -d

# Logs anzeigen
docker-compose logs -f api
```

### Lokale Entwicklung

```bash
cd api
npm install
cp .env.example .env
# .env bearbeiten mit Credentials
npm run dev
```

### Health Check

```bash
curl http://localhost:3000/health
```

---

## 📡 API Endpoints

### 🔗 Base URL

```
http://localhost:3000
```

### 🔐 Authentifizierung (OTP)

#### `POST /api/auth/request-otp`

Fordert einen OTP-Code per E-Mail an für Login oder andere Zwecke.

**Request Body:**
```json
{
  "email": "user@example.com",
  "purpose": "login"
}
```

**Purpose Optionen:**
- `login` - Für Login-Authentifizierung
- `registration` - Für Mitglieder-Registrierung
- `mutation` - Für Datenänderungen

**Response:**
```json
{
  "success": true,
  "message": "OTP wurde per E-Mail versendet"
}
```

**Hinweise:**
- Generiert 6-stelligen Code
- Code gültig für 5 Minuten
- Bei `purpose: "login"` wird geprüft ob E-Mail in vorstand/*.md oder mitglieder/*.md existiert
- Alte ungenutzte Codes für gleiche E-Mail werden ungültig gemacht

---

#### `POST /api/auth/verify-otp`

Verifiziert einen OTP-Code.

**Request Body:**
```json
{
  "email": "user@example.com",
  "otp": "123456",
  "purpose": "login"
}
```

**Response (Erfolg):**
```json
{
  "success": true,
  "message": "Code erfolgreich verifiziert",
  "email": "user@example.com"
}
```

**Response (Fehler):**
```json
{
  "error": "Ungültiger oder abgelaufener Code"
}
```

**Hinweise:**
- Code wird nach erfolgreicher Verifizierung als verwendet markiert
- Bei `purpose: "login"` wird zusätzlich Berechtigung geprüft
- Kann nur einmal verwendet werden

---

### 📧 Kontaktformular

#### `POST /api/contact`

Sendet eine Kontaktanfrage per E-Mail.

**Request Body:**
```json
{
  "name": "Max Mustermann",
  "email": "max@example.com",
  "subject": "Allgemein",
  "message": "Ich habe eine Frage..."
}
```

**Subject Routing:**
- `"Mitgliedschaft"` → Aktuar & Kassier (aus vorstand/*.md)
- `"Veranstaltung"` → vorstand@fwv-raura.ch
- `"Allgemein"` → vorstand@fwv-raura.ch

**Response:**
```json
{
  "success": true,
  "message": "Nachricht erfolgreich versendet"
}
```

---

### 🎫 Event-Anmeldungen

#### `POST /api/events/register`

Registriert einen Helfer oder Teilnehmer für ein Event.

**Request Body (Helfer):**
```json
{
  "eventId": "chilbi-2025",
  "eventTitle": "Chilbi 2025",
  "type": "helper",
  "name": "Max Mustermann",
  "email": "max@example.com",
  "phone": "+41 79 123 45 67",
  "shiftIds": ["samstag-bar-12-14", "sonntag-kueche-14-16"],
  "notes": "Kann nur am Samstag"
}
```

**Request Body (Teilnehmer):**
```json
{
  "eventId": "grillplausch-2025",
  "eventTitle": "Grillplausch 2025",
  "type": "participant",
  "name": "Maria Muster",
  "email": "maria@example.com",
  "phone": "+41 79 987 65 43",
  "participants": 2,
  "notes": "Vegetarisch"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Anmeldung erfolgreich",
  "registrationId": 42
}
```

**Datenbank:** Speicherung in `event_registrations` Tabelle

---

### 📰 Newsletter

#### `POST /api/newsletter/subscribe`

Startet Newsletter-Anmeldung mit Double-Opt-In.

**Request Body:**
```json
{
  "email": "subscriber@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bestätigungs-E-Mail versendet"
}
```

**Flow:**
1. E-Mail wird gespeichert (unbestätigt)
2. Bestätigungs-E-Mail mit Token versandt
3. User klickt auf Bestätigungslink
4. E-Mail wird aktiviert

---

#### `GET /api/newsletter/confirm/:token`

Bestätigt Newsletter-Anmeldung.

**URL Parameter:**
- `token` - Bestätigungstoken aus E-Mail

**Response:**
```json
{
  "success": true,
  "message": "Newsletter-Anmeldung bestätigt"
}
```

**Datenbank:** `newsletter_subscribers` Tabelle

---

### 📅 Kalender

#### `GET /api/calendar/generate`

Generiert PDF-Kalender für aktuellen Monat.

**Query Parameters:**
- `month` (optional) - Monat (1-12)
- `year` (optional) - Jahr (YYYY)

**Response:**
- PDF-Datei (application/pdf)
- Speichert PDF in `/app/pdfs/calendar-YYYY-MM.pdf`

**Features:**
- Lädt Events aus `events/*.md`
- Generiert HTML-Kalender
- Konvertiert zu PDF mit Puppeteer
- Optimiert für Druck (A4, Hochformat)

**Integration:**
- Wird automatisch von GitHub Actions aufgerufen
- Versand via Pingen an Mitglieder mit `zustellung-post: true`

---

### 👥 Mitgliederverwaltung

#### `POST /api/members/register`

Startet Mitglieder-Registrierung mit OTP-Verifizierung.

**Request Body:**
```json
{
  "email": "neues.mitglied@example.com",
  "data": {
    "name": "Hans Müller",
    "phone": "+41 79 111 22 33",
    "address": "Musterstrasse 1, 4303 Kaiseraugst"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP per E-Mail versendet"
}
```

**Flow:**
1. Generiert 6-stelligen OTP (Gültigkeit: 5 Min.)
2. Speichert Daten temporär in `pending_members`
3. Sendet OTP per E-Mail
4. User verifiziert mit `/api/members/verify-otp`

---

#### `POST /api/members/verify-otp`

Verifiziert OTP und erstellt Mitglieds-Markdown-Datei.

**Request Body:**
```json
{
  "email": "neues.mitglied@example.com",
  "otp": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Mitglied erfolgreich registriert",
  "memberId": "hans-mueller"
}
```

**Aktionen:**
- Verifiziert OTP
- Erstellt `mitglieder/hans-mueller.md` (approval-required: true)
- Benachrichtigt Vorstand
- Löscht OTP aus Datenbank

---

#### `POST /api/members/mutations`

Anfrage für Mitglieder-Datenänderung (mit OTP).

**Request Body:**
```json
{
  "email": "bestehendes.mitglied@example.com",
  "changes": {
    "phone": "+41 79 999 88 77",
    "address": "Neue Strasse 2, 4303 Kaiseraugst"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP per E-Mail versendet"
}
```

**Flow:**
1. Generiert OTP
2. Speichert Änderungen in `member_mutations`
3. User verifiziert mit eigenem Endpoint
4. Vorstand prüft und genehmigt

---

### 🏥 Health Check

#### `GET /health`

Prüft API-Status und Datenbankverbindung.

**Response:**
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2025-01-12T10:30:00.000Z"
}
```

---

## 🗄️ Datenbank-Schema

### SQLite Datenbank: `fwv-raura.db`

**Speicherort:** `/data/fwv-raura.db` (persistent Volume)

### Tabellen

#### `event_registrations`
```sql
CREATE TABLE event_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL,
    event_title TEXT NOT NULL,
    type TEXT NOT NULL,           -- 'helper' oder 'participant'
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    participants INTEGER DEFAULT 1,
    notes TEXT,
    shift_ids TEXT,               -- JSON Array
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `newsletter_subscribers`
```sql
CREATE TABLE newsletter_subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    confirmed BOOLEAN DEFAULT 0,
    subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    confirmed_at DATETIME
);
```

#### `pending_members`
```sql
CREATE TABLE pending_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    data TEXT NOT NULL,           -- JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `member_mutations`
```sql
CREATE TABLE member_mutations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT NOT NULL,
    changes TEXT NOT NULL,        -- JSON
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME
);
```

#### `otp_codes`
```sql
CREATE TABLE otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    purpose TEXT NOT NULL,        -- 'registration', 'mutation'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT 0
);
```

#### `contact_submissions`
```sql
CREATE TABLE contact_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔧 Konfiguration

### Umgebungsvariablen

Erstellen Sie eine `.env` Datei basierend auf `.env.example`:

```env
# Server
PORT=3000
NODE_ENV=production

# Datenbank
DB_PATH=/data/fwv-raura.db
BACKUP_DIR=/sync/backups
BACKUP_INTERVAL=3600000  # 1 Stunde in ms

# E-Mail (SMTP)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=website@fwv-raura.ch
SMTP_PASS=your-password
SMTP_FROM=noreply@fwv-raura.ch

# GitHub (optional, für Backup-Sync)
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx
GITHUB_OWNER=Feuerwehrverein-Raura
GITHUB_REPO=Homepage

# Pingen (Kalender-Postversand)
PINGEN_TOKEN=your-pingen-token
PINGEN_STAGING=false

# OTP & Security
OTP_SECRET=random-secret-string-change-this
API_KEY=api-key-for-protected-endpoints

# Website
WEBSITE_URL=https://www.fwv-raura.ch
```

---

## 📦 Backup-System

### Automatische SQLite-Backups

**Intervall:** Alle 60 Minuten (konfigurierbar)

**Speicherort:** `/sync/backups/`

**Dateiformat:** `fwv-raura-YYYY-MM-DDTHH-MM-SS.db`

**Features:**
- Verwendet SQLite `.backup` Kommando (atomic)
- Erstellt Symlink `fwv-raura-latest.db`
- Cleanup: Löscht Backups > 24 Stunden
- Syncthing-kompatibel

**Manueller Backup:**
```javascript
const { createBackup } = require('./src/utils/backup');
await createBackup();
```

### WAL-Modus

Die Datenbank läuft im WAL (Write-Ahead Logging) Modus für:
- Bessere Concurrent-Access
- Keine Locks beim Lesen
- Syncthing-Kompatibilität

---

## 🐳 Docker

### Dockerfile

```dockerfile
FROM node:18-alpine

# Puppeteer Dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    git

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

### docker-compose.yml

```yaml
services:
  api:
    build: ./api
    ports:
      - "3000:3000"
    volumes:
      - ./events:/app/events:ro
      - ./vorstand:/app/vorstand:ro
      - ./mitglieder:/app/mitglieder
      - ./pdfs:/app/pdfs
      - ./data:/data
      - ./sync:/sync
    env_file:
      - ./api/.env
    restart: unless-stopped
```

---

## 🧪 Testing

### Health Check
```bash
curl http://localhost:3000/health
```

### Kontaktformular
```bash
curl -X POST http://localhost:3000/api/contact \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "subject": "Allgemein",
    "message": "Test message"
  }'
```

### Event-Anmeldung
```bash
curl -X POST http://localhost:3000/api/events/register \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "test-event",
    "eventTitle": "Test Event",
    "type": "participant",
    "name": "Test User",
    "email": "test@example.com",
    "participants": 2
  }'
```

---

## 📊 Monitoring

### Logs

```bash
# Docker
docker-compose logs -f api

# Lokale Entwicklung
npm run dev  # Mit nodemon auto-reload
```

### Database Query

```bash
# Im Container
docker-compose exec api sqlite3 /data/fwv-raura.db

# Lokal
sqlite3 data/fwv-raura.db

# Beispiel-Queries
SELECT * FROM event_registrations ORDER BY timestamp DESC LIMIT 10;
SELECT COUNT(*) FROM newsletter_subscribers WHERE confirmed = 1;
SELECT * FROM otp_codes WHERE used = 0;
```

---

## 🔒 Sicherheit

### Best Practices

- ✅ **Input Validation:** Alle Eingaben werden validiert
- ✅ **SQL Injection:** Prepared Statements mit `?` Placeholders
- ✅ **Rate Limiting:** Express-rate-limit für API-Endpoints
- ✅ **CORS:** Konfiguriert für `fwv-raura.ch` Domain
- ✅ **Helmet:** Security Headers aktiviert
- ✅ **OTP:** 5 Minuten Gültigkeit, einmalige Verwendung
- ✅ **E-Mail:** Keine sensiblen Daten in E-Mails

### Secrets Management

**Niemals committen:**
- `.env` Datei
- Datenbank-Dateien
- Private Keys
- API Tokens

**GitHub Secrets für CI/CD:**
```
SMTP_PASS
GITHUB_TOKEN
PINGEN_TOKEN
```

---

## 🛠️ Entwicklung

### Dependencies

```json
{
  "express": "^4.18.2",
  "nodemailer": "^6.9.7",
  "puppeteer": "^21.6.0",
  "cors": "^2.8.5",
  "dotenv": "^16.3.1",
  "helmet": "^7.1.0",
  "express-rate-limit": "^7.1.5",
  "sqlite3": "^5.1.7"
}
```

### Scripts

```bash
npm start     # Produktions-Server
npm run dev   # Entwicklung mit nodemon
```

### Code-Struktur

```
api/
├── src/
│   ├── server.js           # Express App Entry Point
│   ├── routes/
│   │   ├── contact.js      # Kontaktformular
│   │   ├── events.js       # Event-Anmeldungen
│   │   ├── newsletter.js   # Newsletter
│   │   ├── calendar.js     # Kalender-PDF
│   │   └── members.js      # Mitgliederverwaltung
│   └── utils/
│       ├── database.js     # SQLite Helper
│       ├── backup.js       # Backup-System
│       ├── email.js        # E-Mail-Versand
│       ├── github.js       # GitHub API (deprecated)
│       └── hybrid-storage.js # Hybrid SQLite/GitHub
├── Dockerfile
├── package.json
└── .env.example
```

---

## 📚 Weitere Dokumentation

- [Haupt-README](../README.md) - Projekt-Übersicht
- [Events-README](../events/README.md) - Event-Management
- [Scripts-README](../scripts/README.md) - Automatisierungs-Scripts

---

## 🐛 Troubleshooting

### API startet nicht

```bash
# Logs prüfen
docker-compose logs api

# Häufige Probleme:
# - Port 3000 bereits belegt
# - .env Datei fehlt oder fehlerhaft
# - Volume-Mounts fehlerhaft
```

### Datenbank-Fehler

```bash
# Datenbank neu initialisieren
rm data/fwv-raura.db
docker-compose restart api

# Backup wiederherstellen
cp sync/backups/fwv-raura-latest.db data/fwv-raura.db
```

### E-Mail-Versand schlägt fehl

```bash
# SMTP-Credentials prüfen
# Test-Script erstellen:
node -e "const nodemailer = require('nodemailer'); /* test code */"

# Häufige Probleme:
# - Falsche SMTP-Credentials
# - Firewall blockiert Port 587
# - 2FA aktiviert (App-Passwort verwenden)
```

### PDF-Generierung fehlerhaft

```bash
# Puppeteer Dependencies prüfen
docker-compose exec api chromium-browser --version

# Logs anzeigen
docker-compose logs -f api | grep -i puppeteer
```

---

## 📞 Support

- 🐛 **Issues:** [GitHub Issues](https://github.com/Feuerwehrverein-Raura/Homepage/issues)
- 📧 **E-Mail:** webmaster@fwv-raura.ch
- 📖 **Docs:** [Haupt-README](../README.md)

---

**Made with ❤️ by Feuerwehrverein Raura Kaiseraugst**
