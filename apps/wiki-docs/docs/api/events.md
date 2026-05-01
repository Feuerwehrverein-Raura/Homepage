---
sidebar_position: 4
---

# Events API

Base URL: `https://api.fwv-raura.ch`

Event-Management mit Schichten, Anmeldungen, Arbeitsplänen, Erinnerungen und Event-Gruppen.

## Öffentliche Endpoints

### Alle Events
```http
GET /events
```

**Query Parameter:**
- `upcoming` - Nur zukünftige Events
- `status` - Filter nach Status (active, draft, cancelled)

**Response:**
```json
[
  {
    "id": 1,
    "slug": "chilbi-2025",
    "title": "Chilbi Kaiseraugst 2025",
    "start_date": "2025-08-15",
    "end_date": "2025-08-17",
    "location": "Kaiseraugst",
    "status": "active"
  }
]
```

### Event Details
```http
GET /events/:id
```

Gibt Event mit allen Schichten und Registrierungen zurück.

### Kalender (iCal)
```http
GET /calendar/ics
```

Gibt alle veröffentlichten Events als iCalendar-Feed zurück. Kann in Google Calendar, Apple Kalender, Outlook etc. abonniert werden.

### Öffentliche Anmeldung
```http
POST /registrations/public
Content-Type: application/json

{
  "event_id": 1,
  "shift_id": 5,
  "name": "Max Muster",
  "email": "max@example.com"
}
```

Ermöglicht Anmeldung ohne Authentifizierung (für Nicht-Mitglieder).

## Geschützte Endpoints

:::info Authentifizierung erforderlich
Diese Endpoints erfordern einen gültigen Bearer Token (Vorstand).
:::

### Event erstellen
```http
POST /events
Authorization: Bearer <token>
Content-Type: application/json

{
  "slug": "gv-2026",
  "title": "Generalversammlung 2026",
  "start_date": "2026-03-15",
  "location": "Restaurant Sonne"
}
```

### Event aktualisieren
```http
PUT /events/:id
Authorization: Bearer <token>
```

### Event löschen
```http
DELETE /events/:id
Authorization: Bearer <token>
```

## Event-Organisatoren

Event-Organisatoren erhalten eingeschränkten Zugriff auf ihr eigenes Event:

### Organisator-Login
```http
POST /events/login
Content-Type: application/json

{
  "event_id": 1,
  "password": "event-passwort"
}
```

### Eigenes Event abrufen
```http
GET /events/my-event
Authorization: Bearer <token>
```

### Anmeldung genehmigen/ablehnen (Organisator)
```http
POST /events/my-event/registrations/:id/approve
POST /events/my-event/registrations/:id/reject
Authorization: Bearer <token>
```

### Arbeitsplan versenden (Organisator)
```http
POST /events/my-event/send-arbeitsplan
Authorization: Bearer <token>
```

## Schichten

### Alle Schichten
```http
GET /shifts
Authorization: Bearer <token>
```

**Query Parameter:**
- `event_id` - Filter nach Event

### Schicht erstellen
```http
POST /shifts
Authorization: Bearer <token>
Content-Type: application/json

{
  "event_id": 1,
  "title": "Bar-Dienst",
  "bereich": "Bar",
  "start_time": "2026-08-15T18:00:00",
  "end_time": "2026-08-15T23:00:00",
  "max_helpers": 4
}
```

### Schicht aktualisieren
```http
PUT /shifts/:id
Authorization: Bearer <token>
```

### Schicht löschen
```http
DELETE /shifts/:id
Authorization: Bearer <token>
```

## Anmeldungen

### Anmeldungen abrufen
```http
GET /registrations?event_id=1
Authorization: Bearer <token>
```

### Anmeldung erstellen (authentifiziert)
```http
POST /registrations
Authorization: Bearer <token>
Content-Type: application/json

{
  "event_id": 1,
  "shift_id": 5
}
```

### Anmeldungen verwalten (Vorstand)
```http
GET /registrations/manage
Authorization: Bearer <token>
```

### Anmeldung genehmigen
```http
POST /registrations/:id/approve
Authorization: Bearer <token>
```

### Anmeldung ablehnen
```http
POST /registrations/:id/reject
Authorization: Bearer <token>
```

### Alternative Schicht vorschlagen
```http
POST /registrations/:id/suggest-alternative
Authorization: Bearer <token>
Content-Type: application/json

{
  "alternative_shift_id": 8,
  "message": "Wäre diese Schicht möglich?"
}
```

Der Helfer erhält eine E-Mail mit einem Token-Link zur Bestätigung.

### Alternative-Antwort verarbeiten
```http
GET /registrations/alternative-response/:token
```

Verarbeitet die Antwort auf einen Alternativ-Vorschlag (per Link aus E-Mail).

### Anmeldung bearbeiten/löschen
```http
PUT /registrations/:id
DELETE /registrations/:id
Authorization: Bearer <token>
```

## PDFs & Dokumente

### Arbeitsplan-PDF generieren
```http
POST /arbeitsplan/pdf
Authorization: Bearer <token>
Content-Type: application/json

{
  "event_id": 1
}
```

### Event-Arbeitsplan PDF
```http
GET /events/:id/pdf/arbeitsplan
Authorization: Bearer <token>
```

### Teilnehmerliste PDF
```http
GET /events/:id/pdf/teilnehmerliste
Authorization: Bearer <token>
```

### Teilnehmerliste generieren
```http
POST /teilnehmerliste/pdf
Authorization: Bearer <token>
```

## Erinnerungen

### Schicht-Erinnerungen senden (Vorstand)
```http
POST /shifts/send-reminders
Authorization: Bearer <token>
```

Sendet Erinnerungen an alle Helfer mit bevorstehenden Schichten.

### Automatische Erinnerungen (Cronjob)
```http
POST /shifts/cron-reminders
X-API-Key: <api-key>
```

Wird vom Cronjob (`docker/cron/shift-reminders.sh`) aufgerufen.

### Tägliche Erinnerung (Cronjob)
```http
POST /reminders/send-daily
X-API-Key: <api-key>
```

### Erinnerungs-Vorschau (Vorstand)
```http
GET /reminders/preview
Authorization: Bearer <token>
```

Zeigt welche Erinnerungen gesendet werden würden, ohne sie tatsächlich zu versenden.

### Erinnerungen manuell senden
```http
POST /reminders/send
Authorization: Bearer <token>
```

## Event-Gruppen

Gruppierung von mehreren Events (z.B. alle Anlässe eines Jahres).

### Alle Gruppen
```http
GET /event-groups
Authorization: Bearer <token>
```

### Gruppen-Details
```http
GET /event-groups/:id
Authorization: Bearer <token>
```

### Gruppe erstellen
```http
POST /event-groups
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Anlässe 2026",
  "event_ids": [1, 2, 3]
}
```

### Gruppe bearbeiten/löschen
```http
PUT /event-groups/:id
DELETE /event-groups/:id
Authorization: Bearer <token>
```

### Gruppen-Arbeitsplan PDF
```http
POST /event-groups/:id/arbeitsplan-pdf
Authorization: Bearer <token>
```

Generiert einen kombinierten Arbeitsplan über alle Events der Gruppe.
