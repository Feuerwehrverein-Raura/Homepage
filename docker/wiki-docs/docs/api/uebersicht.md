---
sidebar_position: 1
---

# API Übersicht

Die FWV Raura Website verwendet mehrere REST APIs, die alle unter `api.fwv-raura.ch` erreichbar sind. Traefik routet anhand des URL-Pfads zum richtigen Backend-Service.

## Services & Basis-URLs

| API | Basis-URL | Traefik-Pfade | Beschreibung |
|-----|-----------|---------------|--------------|
| [Members](/api/members) | `https://api.fwv-raura.ch` | `/members`, `/auth`, `/roles`, `/audit`, `/vorstand`, `/uploads`, `/member-registrations`, `/funktionen` | Mitglieder, Auth, Rollen, Fotos |
| [Events](/api/events) | `https://api.fwv-raura.ch` | `/events`, `/shifts`, `/calendar`, `/arbeitsplan`, `/registrations`, `/teilnehmerliste` | Events, Schichten, Kalender |
| [Dispatch](/api/dispatch) | `https://api.fwv-raura.ch` | `/email`, `/pingen`, `/templates`, `/contact`, `/newsletter`, `/dispatch-log`, `/mailcow`, `/pdf-templates`, `/organisation-settings`, `/dispatch` | E-Mail, Briefe, Newsletter, PDF-Vorlagen |
| [Accounting](/api/accounting) | `https://api.fwv-raura.ch` | `/invoices`, `/payments`, `/reports`, `/accounts` | Kontenplan, Buchungen, Rechnungen |

Alle Services laufen intern auf Port 3000 und kommunizieren über das Docker-Netzwerk miteinander (z.B. `http://api-members:3000`).

## Authentifizierung

Alle geschützten Endpoints erfordern einen der folgenden Auth-Methoden:

### Bearer Token (JWT)

Für Mitglieder (Authentik OIDC, RS256) und Vorstand (IMAP, HS256):

```http
Authorization: Bearer <token>
```

**Mitglieder-Token:** RS256-signiert von Authentik, validiert mit Public Key.
**Vorstand-Token:** HS256-signiert, 8 Stunden gültig, enthält `type: "vorstand"`.

### API Key (intern)

Für Cronjobs und Inter-Service-Kommunikation:

```http
X-API-Key: <api-key>
```

### Cookie

Vorstand-Sessions setzen einen Cookie auf `.fwv-raura.ch` für Cross-Subdomain-Zugriff.

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
| 400 | Bad Request - Ungültige Parameter |
| 401 | Unauthorized - Token fehlt oder ungültig |
| 403 | Forbidden - Keine Berechtigung |
| 404 | Not Found |
| 409 | Conflict - Ressource existiert bereits |
| 429 | Too Many Requests - Rate Limit erreicht |
| 500 | Server Error |

## Health Checks

Jeder Service hat einen Health-Endpoint:

```bash
curl https://api.fwv-raura.ch/health
# {"status":"ok","service":"api-members","version":"1.145.0"}
```

## CORS

Die APIs erlauben Cross-Origin-Requests von den konfigurierten Domains (fwv-raura.ch und Subdomains).

## Traefik Routing-Prioritäten

Bei überlappenden Pfaden wird die Priorität über Traefik-Labels gesteuert. Höhere Zahl = wird zuerst gematcht:

| Pfad | Priorität | Service |
|------|-----------|---------|
| `/invoices/generate*` | 200 | Dispatch |
| `/arbeitsplan/pdf` | 200 | Dispatch |
| Alle anderen | Standard | Je nach Pfad-Prefix |
