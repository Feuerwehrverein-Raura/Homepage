# FWV Raura API

API Server für dynamische Funktionen der Feuerwehrverein Raurachemme Homepage.

## Features

- **Kontaktformular** - E-Mail Versand mit dynamischem Routing
- **Event-Anmeldungen** - Helfer & Teilnehmer Registrierung mit JSON-Speicherung
- **Newsletter** - Double-Opt-In System
- **PDF-Kalender** - Generierung und Versand via Pingen
- **Mitgliederverwaltung** - Selbstregistrierung und Daten-Mutation mit OTP
- **Approval-System** - Vorstand-Genehmigung für neue Mitglieder

## Endpoints

### Kontakt
- `POST /api/contact` - Kontaktformular absenden

### Events
- `POST /api/events/register` - Event-Anmeldung

### Newsletter
- `POST /api/newsletter/subscribe` - Newsletter abonnieren
- `POST /api/newsletter/confirm` - Newsletter-Anmeldung bestätigen

### Kalender
- `POST /api/calendar/generate-pdf` - PDF generieren
- `POST /api/calendar/send-pingen` - Via Pingen versenden

### Mitglieder
- `POST /api/members/register` - Registrierung starten (OTP)
- `POST /api/members/verify-otp` - OTP verifizieren
- `POST /api/members/request-change` - Datenänderung anfragen (OTP)
- `POST /api/members/approve` - Mitglied genehmigen (Vorstand)

## Environment Variables

```env
PORT=3000
NODE_ENV=production
SMTP_HOST=mail.test.juroct.net
SMTP_PORT=587
SMTP_USER=website@fwv-raura.ch
SMTP_PASSWORD=
GITHUB_TOKEN=
PINGEN_CLIENT_ID=
PINGEN_CLIENT_SECRET=
PINGEN_ORGANISATION_ID=
PINGEN_STAGING=true
OTP_SECRET=
API_KEY=
WEBSITE_URL=https://www.fwv-raura.ch
```

## Development

```bash
cd api
npm install
cp .env.example .env
# Edit .env with your credentials
npm run dev
```

## Docker

```bash
docker-compose up -d
```
