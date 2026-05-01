---
sidebar_position: 5
---

# Dispatch API

Base URL: `https://api.fwv-raura.ch`

Die Dispatch API verwaltet E-Mail-Versand, Briefversand (Pingen), Newsletter, Kontaktformular, Mailcow-Integration, PDF-Vorlagen und Organisations-Einstellungen.

## E-Mail-Vorlagen

### Vorlagen abrufen
```http
GET /templates
Authorization: Bearer <token>
```

### Vorlage erstellen
```http
POST /templates
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Einladung GV",
  "subject": "Einladung zur Generalversammlung",
  "html": "<p>Liebe Mitglieder...</p>",
  "text": "Liebe Mitglieder..."
}
```

### Vorlage bearbeiten
```http
PUT /templates/:id
Authorization: Bearer <token>
```

### Vorlage löschen
```http
DELETE /templates/:id
Authorization: Bearer <token>
```

## E-Mail-Versand

### Einzelne E-Mail versenden
```http
POST /email/send
Authorization: Bearer <token>
Content-Type: application/json

{
  "to": "empfaenger@example.com",
  "subject": "Betreff",
  "html": "<p>Nachricht</p>",
  "text": "Nachricht als Plain-Text"
}
```

### Massen-E-Mail versenden
```http
POST /email/bulk
Authorization: Bearer <token>
Content-Type: application/json

{
  "member_ids": ["<uuid>", "<uuid>"],
  "subject": "Rundschreiben",
  "html": "<p>Liebe Mitglieder...</p>",
  "template_id": 1
}
```

### Intelligenter Versand
```http
POST /dispatch/smart
Authorization: Bearer <token>
Content-Type: application/json

{
  "member_ids": ["<uuid>"],
  "subject": "Einladung",
  "html": "<p>...</p>"
}
```

Versendet automatisch per E-Mail oder Brief, je nach Zustellungspräferenz des Mitglieds.

## Kontaktformular

### Kontaktformular absenden
```http
POST /contact
Content-Type: application/json

{
  "name": "Max Muster",
  "email": "max@example.com",
  "message": "Nachricht..."
}
```

Sendet eine Bestätigungs-E-Mail an den Absender.

### Kontaktanfrage bestätigen
```http
GET /contact/confirm/:token
```

Bestätigt die Kontaktanfrage per Token (Double-Opt-In).

## Newsletter

### Newsletter abonnieren
```http
POST /newsletter/subscribe
Content-Type: application/json

{
  "email": "max@example.com"
}
```

### Abo bestätigen
```http
GET /newsletter/confirm?token=xxx
```

### Newsletter abbestellen
```http
POST /newsletter/unsubscribe
Content-Type: application/json

{
  "email": "max@example.com"
}
```

## Mailcow-Integration

Verwaltung von E-Mail-Postfächern und Aliases über die Mailcow-API.

### Postfächer abrufen
```http
GET /mailcow/mailboxes
Authorization: Bearer <token>
```

### Einzelnes Postfach
```http
GET /mailcow/mailboxes/:email
Authorization: Bearer <token>
```

### Postfach erstellen
```http
POST /mailcow/mailboxes
Authorization: Bearer <token>
Content-Type: application/json

{
  "local_part": "neues-postfach",
  "name": "Neues Postfach",
  "password": "xxx",
  "quota": 1024
}
```

### Postfach bearbeiten
```http
PUT /mailcow/mailboxes/:email
Authorization: Bearer <token>
```

### Postfach löschen
```http
DELETE /mailcow/mailboxes/:email
Authorization: Bearer <token>
```

### Aliases abrufen
```http
GET /mailcow/aliases
Authorization: Bearer <token>
```

### Alias erstellen
```http
POST /mailcow/aliases
Authorization: Bearer <token>
Content-Type: application/json

{
  "address": "alias@fwv-raura.ch",
  "goto": "ziel@fwv-raura.ch"
}
```

### Alias bearbeiten/löschen
```http
PUT /mailcow/aliases/:id
DELETE /mailcow/aliases/:id
Authorization: Bearer <token>
```

### Domain-Info
```http
GET /mailcow/domain
Authorization: Bearer <token>
```

### Speicherplatz-Status
```http
GET /mailcow/quota
Authorization: Bearer <token>
```

## Post-Versand (Pingen)

### Konto-Informationen
```http
GET /pingen/account?staging=false
Authorization: Bearer <token>
```

Response:
```json
{
  "name": "Feuerwehrverein Raura",
  "balance": 5000,
  "currency": "CHF",
  "isStaging": false
}
```

### Statistiken
```http
GET /pingen/stats
Authorization: Bearer <token>
```

Response:
```json
{
  "total": 50,
  "sent": 45,
  "pending": 3,
  "failed": 2,
  "last_30_days": 15,
  "last_7_days": 5
}
```

### Alle Briefe abrufen
```http
GET /pingen/letters?event_id=<uuid>&member_id=<uuid>&limit=50
Authorization: Bearer <token>
```

### Brief-Status
```http
GET /pingen/letters/:letterId/status?staging=false
Authorization: Bearer <token>
```

Response:
```json
{
  "letterId": "abc123",
  "status": "sent",
  "price": 125,
  "pages": 2,
  "sentAt": "2026-01-21T10:00:00Z"
}
```

### Brief versenden
```http
POST /pingen/send
Authorization: Bearer <token>
Content-Type: application/json

{
  "member_id": "<uuid>",
  "pdf_base64": "<base64-encoded-pdf>",
  "staging": false
}
```

### Einzelbrief manuell senden
```http
POST /pingen/send-manual
Authorization: Bearer <token>
Content-Type: application/json

{
  "member_id": "<uuid>",
  "event_id": "<uuid>",
  "subject": "Einladung GV",
  "body": "Brieftext hier...",
  "staging": false
}
```

Der Brief wird automatisch formatiert mit Absender, Adresse und Datum.

### Arbeitsplan per Post senden
```http
POST /pingen/send-arbeitsplan
Authorization: Bearer <token>
Content-Type: application/json

{
  "event_id": "<uuid>",
  "member_id": "<uuid>",
  "pdf_base64": "<base64-encoded-pdf>",
  "staging": false
}
```

### Mitglieder mit Post-Zustellung
```http
GET /pingen/post-members
Authorization: Bearer <token>
```

Response:
```json
{
  "count": 12,
  "members": [
    {
      "id": "<uuid>",
      "name": "Max Muster",
      "address": "Musterstrasse 1, 4303 Kaiseraugst",
      "strasse": "Musterstrasse 1",
      "plz": "4303",
      "ort": "Kaiseraugst"
    }
  ]
}
```

### Massen-PDF versenden
```http
POST /pingen/send-bulk-pdf
Authorization: Bearer <token>
Content-Type: application/json

{
  "pdf_base64": "<base64-encoded-pdf>",
  "subject": "Einladung GV 2026",
  "member_ids": ["<uuid>", "<uuid>"],
  "staging": false
}
```

Wenn `member_ids` nicht angegeben wird, wird das PDF an alle Mitglieder mit `zustellung_post = true` gesendet.

Response:
```json
{
  "totalRecipients": 12,
  "successCount": 11,
  "failedCount": 1,
  "success": [
    { "name": "Max Muster", "letterId": "abc123" }
  ],
  "failed": [
    { "name": "Hans Mueller", "error": "Invalid address" }
  ],
  "staging": false
}
```

## Webhooks (Pingen)

### Registrierte Webhooks abrufen
```http
GET /pingen/webhooks?staging=false
Authorization: Bearer <token>
```

### Webhook registrieren
```http
POST /pingen/webhooks/register
Authorization: Bearer <token>
Content-Type: application/json

{
  "webhook_url": "https://api.fwv-raura.ch/pingen/webhook",
  "staging": false
}
```

### Webhook löschen
```http
DELETE /pingen/webhooks/:id?staging=false
Authorization: Bearer <token>
```

### Webhook-Empfang (von Pingen)
```http
POST /pingen/webhook
Content-Type: application/json

{
  "data": { "id": "letterId", "attributes": { "status": "sent" } },
  "meta": { "event": "letter.status_changed" }
}
```

Empfängt automatische Status-Updates von Pingen und aktualisiert den Status in der Datenbank.

## PDF-Vorlagen

Verwaltung von PDF-Vorlagen für Briefe, Rechnungen und andere Dokumente. Die Vorlagen werden im [PDF-Designer](https://pdf.fwv-raura.ch) visuell bearbeitet.

### Alle Vorlagen
```http
GET /pdf-templates
Authorization: Bearer <token>
```

### Vorlage abrufen
```http
GET /pdf-templates/:id
Authorization: Bearer <token>
```

### Vorlage erstellen
```http
POST /pdf-templates
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Rechnung Standard",
  "category": "rechnung",
  "layout": { ... }
}
```

### Vorlage bearbeiten
```http
PUT /pdf-templates/:id
Authorization: Bearer <token>
```

### Vorlage löschen
```http
DELETE /pdf-templates/:id
Authorization: Bearer <token>
```

### Aktives PDF-Layout
```http
GET /pdf-templates/layout/active
Authorization: Bearer <token>
```

Gibt das aktuell aktive Layout (z.B. Briefkopf) zurück.

## Rechnungen

### Rechnung mit QR-Code generieren
```http
POST /invoices/generate-qr
Authorization: Bearer <token>
Content-Type: application/json

{
  "member_id": "<uuid>",
  "amount": 50.00,
  "description": "Jahresbeitrag 2026"
}
```

Generiert eine Swiss QR-Bill (Einzahlungsschein) als PDF.

### Massen-Rechnungen generieren
```http
POST /invoices/generate-bulk
Authorization: Bearer <token>
Content-Type: application/json

{
  "member_ids": ["<uuid>", "<uuid>"],
  "amount": 50.00,
  "description": "Jahresbeitrag 2026"
}
```

## Organisations-Einstellungen

### Einstellungen abrufen
```http
GET /organisation-settings
Authorization: Bearer <token>
```

### Einstellung aktualisieren
```http
PUT /organisation-settings/:key
Authorization: Bearer <token>
Content-Type: application/json

{
  "value": "Neuer Wert"
}
```

## Versand-Protokoll

### Versand-Historie
```http
GET /dispatch-log?type=email&status=sent&limit=100
Authorization: Bearer <token>
```

**Query Parameter:**
- `type` - Filter nach Typ (email, pingen)
- `status` - Filter nach Status (sent, pending, failed)
- `member_id` - Filter nach Mitglied
- `event_id` - Filter nach Event
- `limit` - Anzahl Ergebnisse (Standard: 100)

## Staging-Modus

Alle Pingen-Endpoints unterstützen einen `staging` Parameter:

- `staging=false` (Standard): Briefe werden tatsächlich versendet und Kosten entstehen
- `staging=true`: Briefe werden nur in der Testumgebung verarbeitet, keine echten Kosten

Im Vorstand-Dashboard kann der Staging-Modus über einen Toggle aktiviert werden. Die Umgebungsvariable `PINGEN_STAGING` setzt den Standard-Wert.
