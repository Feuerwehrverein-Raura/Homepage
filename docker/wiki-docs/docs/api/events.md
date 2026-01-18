---
sidebar_position: 4
---

# Events API

Base URL: `https://events.fwv-raura.ch`

## Öffentliche Endpoints

### Alle Events
```http
GET /events
```

**Query Parameter:**
- `upcoming` - Nur zukünftige Events

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
GET /events/:slug
```

### Kalender (iCal)
```http
GET /calendar/ics
```

Gibt alle Events als iCal-Feed zurück.

## Geschützte Endpoints

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

## Schichten

### Schichten abrufen
```http
GET /events/:id/shifts
```

### Schicht erstellen
```http
POST /events/:id/shifts
Authorization: Bearer <token>
```

## Anmeldungen

### Anmeldungen abrufen
```http
GET /registrations?event_id=1
Authorization: Bearer <token>
```

### Anmeldung Status ändern
```http
PUT /registrations/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "approved"
}
```
