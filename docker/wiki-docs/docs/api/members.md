---
sidebar_position: 3
---

# Members API

Base URL: `https://api.fwv-raura.ch`

## Öffentliche Endpoints

### Vorstand anzeigen
```http
GET /vorstand
```

Gibt alle Vorstandsmitglieder zurück (öffentlich).

**Response:**
```json
[
  {
    "id": 1,
    "vorname": "René",
    "nachname": "Käslin",
    "funktion": "Präsident",
    "foto": null,
    "email": "praesident@fwv-raura.ch"
  }
]
```

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "service": "api-members",
  "version": "1.0.0"
}
```

## Geschützte Endpoints

:::info Authentifizierung erforderlich
Diese Endpoints erfordern einen gültigen Bearer Token.
:::

### Alle Mitglieder
```http
GET /members
Authorization: Bearer <token>
```

**Query Parameter:**
- `status` - Filter nach Status (Aktivmitglied, Passivmitglied, Ehrenmitglied)

### Mitglied erstellen
```http
POST /members
Authorization: Bearer <token>
Content-Type: application/json

{
  "vorname": "Max",
  "nachname": "Muster",
  "email": "max@example.com",
  "status": "Aktivmitglied"
}
```

### Mitglied aktualisieren
```http
PUT /members/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "phone": "+41 79 123 45 67",
  "funktion": "Beisitzer"
}
```

### Mitglied löschen
```http
DELETE /members/:id
Authorization: Bearer <token>
```

## Audit Log

### Log abrufen
```http
GET /audit?limit=50&offset=0
Authorization: Bearer <token>
```

Zeigt alle Aktivitäten im System.
