---
sidebar_position: 5
---

# Dispatch API

Die Dispatch API wird intern fuer E-Mail-Versand, Brief-Erstellung und Post-Versand verwendet.

:::note Interner Service
Dieser Service ist nicht oeffentlich erreichbar und wird nur von anderen APIs und dem Vorstand-Dashboard verwendet.
:::

## E-Mail

### E-Mail versenden
```http
POST /email/send
X-API-Key: <internal-api-key>
Content-Type: application/json

{
  "to": "empfaenger@example.com",
  "subject": "Betreff",
  "html": "<p>Nachricht</p>",
  "text": "Nachricht als Plain-Text"
}
```

### Dispatch Log abrufen
```http
GET /dispatch-log?type=email&status=sent&limit=100
Authorization: Bearer <token>
```

Parameter:
- `type` - Filter nach Typ (email, pingen)
- `status` - Filter nach Status
- `member_id` - Filter nach Mitglied
- `event_id` - Filter nach Event
- `limit` - Anzahl Ergebnisse (Standard: 100)

## Post-Versand (Pingen)

### Konto-Informationen abrufen
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

### Statistiken abrufen
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

### Brief-Status abrufen
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

### Mitglieder mit Post-Zustellung abrufen
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
      "email": "max@example.com",
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

## Webhooks

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

### Webhook loeschen
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

Dieser Endpoint empfaengt automatische Status-Updates von Pingen und aktualisiert den Status in der Datenbank.

## Mailcow Integration

### Postfaecher abrufen
```http
GET /mailcow/mailboxes
Authorization: Bearer <token>
```

### Alias erstellen
```http
POST /mailcow/alias
Authorization: Bearer <token>
Content-Type: application/json

{
  "address": "alias@fwv-raura.ch",
  "goto": "ziel@fwv-raura.ch"
}
```

### Alias loeschen
```http
DELETE /mailcow/alias/:id
Authorization: Bearer <token>
```

### Quota abrufen
```http
GET /mailcow/quota
Authorization: Bearer <token>
```

## Staging-Modus

Alle Pingen-Endpoints unterstuetzen einen `staging` Parameter:

- `staging=false` (Standard): Briefe werden tatsaechlich versendet und Kosten entstehen
- `staging=true`: Briefe werden nur in der Testumgebung verarbeitet, keine echten Kosten

Im Vorstand-Dashboard kann der Staging-Modus ueber einen Toggle aktiviert werden.
