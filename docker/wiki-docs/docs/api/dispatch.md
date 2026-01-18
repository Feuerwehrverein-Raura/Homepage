---
sidebar_position: 5
---

# Dispatch API

Die Dispatch API wird intern für E-Mail-Versand und Brief-Erstellung verwendet.

:::note Interner Service
Dieser Service ist nicht öffentlich erreichbar und wird nur von anderen APIs verwendet.
:::

## Funktionen

### E-Mail versenden
```http
POST /email/send
X-API-Key: <internal-api-key>
Content-Type: application/json

{
  "to": "empfaenger@example.com",
  "subject": "Betreff",
  "html": "<p>Nachricht</p>",
  "template": "event-confirmation"
}
```

### PDF generieren
```http
POST /pdf/generate
X-API-Key: <internal-api-key>
Content-Type: application/json

{
  "template": "shift-plan",
  "data": { ... }
}
```

### Brief versenden (Pingen)
```http
POST /letter/send
X-API-Key: <internal-api-key>
```

Versendet physische Briefe über Pingen.ch.

## Templates

Verfügbare E-Mail-Templates:
- `event-confirmation` - Event-Bestätigung
- `shift-reminder` - Schicht-Erinnerung
- `registration-approved` - Anmeldung genehmigt
- `registration-rejected` - Anmeldung abgelehnt

## Mailcow Integration

### Postfächer abrufen
```http
GET /mailcow/mailboxes
Authorization: Bearer <token>
```

### Alias erstellen
```http
POST /mailcow/alias
Authorization: Bearer <token>
```
