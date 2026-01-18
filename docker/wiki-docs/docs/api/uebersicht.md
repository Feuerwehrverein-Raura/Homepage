---
sidebar_position: 1
---

# API Übersicht

Die FWV Raura Website verwendet mehrere REST APIs.

## Basis-URLs

| API | URL | Beschreibung |
|-----|-----|--------------|
| Members | `https://api.fwv-raura.ch` | Mitgliederverwaltung |
| Events | `https://events.fwv-raura.ch` | Event-Management |
| Dispatch | intern | E-Mail & Briefe |

## Authentifizierung

Alle geschützten Endpoints erfordern einen der folgenden Auth-Methoden:

### Bearer Token (JWT)
```http
Authorization: Bearer <token>
```

### API Key (intern)
```http
X-API-Key: <api-key>
```

## Response Format

Alle APIs verwenden JSON:

```json
{
  "success": true,
  "data": { ... }
}
```

### Fehler
```json
{
  "error": "Fehlerbeschreibung"
}
```

## HTTP Status Codes

| Code | Bedeutung |
|------|-----------|
| 200 | OK |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 500 | Server Error |
