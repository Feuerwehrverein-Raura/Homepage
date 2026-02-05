---
sidebar_position: 3
---

# Members API

Base URL: `https://api.fwv-raura.ch`

Verwaltung von Mitgliedern, Authentifizierung, Rollen, Fotos, Löschanträgen und Synchronisierung mit Authentik.

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

### Vereinsfunktionen
```http
GET /funktionen
```

Gibt alle verfügbaren Funktionen/Positionen im Verein zurück.

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "service": "api-members",
  "version": "1.145.0"
}
```

## Authentifizierung

### Authentik-Login (Mitglieder)
```http
GET /auth/login
```

Leitet zur Authentik-Login-Seite weiter (OAuth2 Authorization Code Flow).

### Authentik Callback
```http
POST /auth/callback
```

Verarbeitet den OAuth-Callback von Authentik und erstellt eine Session.

### Aktueller Benutzer (Mitglied)
```http
GET /auth/me
Authorization: Bearer <token>
```

Gibt das aktuelle Mitglieder-Profil zurück.

### Vorstand-Login (IMAP)
```http
POST /auth/vorstand/login
Content-Type: application/json

{
  "email": "praesident@fwv-raura.ch",
  "password": "xxx"
}
```

Authentifiziert über IMAP gegen den Mail-Server. Gibt bei Erfolg einen HS256-JWT (8h gültig) zurück.

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiI...",
  "email": "praesident@fwv-raura.ch",
  "type": "vorstand"
}
```

### Vorstand-Session prüfen
```http
GET /auth/vorstand/me
Authorization: Bearer <token>
```

Prüft ob der Vorstand-Token noch gültig ist.

## Mitglieder CRUD

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

### Eigenes Profil
```http
GET /members/me
Authorization: Bearer <token>
```

### Mitglied nach ID
```http
GET /members/:id
Authorization: Bearer <token>
```

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

### Eigenes Profil aktualisieren
```http
PUT /members/me
Authorization: Bearer <token>
Content-Type: application/json

{
  "phone": "+41 79 123 45 67"
}
```

### Mitglied aktualisieren (Vorstand)
```http
PUT /members/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "phone": "+41 79 123 45 67",
  "funktion": "Beisitzer"
}
```

### Mitglied löschen (Vorstand)
```http
DELETE /members/:id
Authorization: Bearer <token>
```

## Fotos

### Eigenes Foto hochladen
```http
POST /members/me/photo
Authorization: Bearer <token>
Content-Type: multipart/form-data

photo: <Bilddatei>
```

### Eigenes Foto löschen
```http
DELETE /members/me/photo
Authorization: Bearer <token>
```

### Mitglieder-Foto hochladen (Vorstand)
```http
POST /members/:id/photo
Authorization: Bearer <token>
Content-Type: multipart/form-data

photo: <Bilddatei>
```

### Mitglieder-Foto löschen (Vorstand)
```http
DELETE /members/:id/photo
Authorization: Bearer <token>
```

## Löschanträge (DSGVO)

### Löschung bestätigen
```http
GET /members/deletion-confirm/:token
```

Bestätigt einen Löschantrag per Token (aus E-Mail-Link).

### Offene Löschanträge abrufen (Vorstand)
```http
GET /deletion-requests
Authorization: Bearer <token>
```

### Löschantrag ablehnen (Vorstand)
```http
DELETE /deletion-requests/:id
Authorization: Bearer <token>
```

## Statistiken & Berichte

### Mitglieder-Statistiken
```http
GET /members/stats/overview
Authorization: Bearer <token>
```

Gibt eine Übersicht der Mitglieder nach Status, Funktion etc. zurück.

### Telefonliste als PDF (Vorstand)
```http
GET /members/pdf/telefonliste
Authorization: Bearer <token>
```

Generiert eine PDF-Telefonliste aller Mitglieder.

## E-Mail-Verwaltung

### Zustellungs-Verteilerlisten
```http
GET /members/emails/zustellung
Authorization: Bearer <token>
```

Gibt Mitglieder gruppiert nach Zustellungsart (E-Mail/Post) zurück.

### E-Mail-Alias-Konfiguration
```http
GET /members/emails/alias-config
Authorization: Bearer <token>
```

### Aliases synchronisieren
```http
POST /members/emails/sync-alias
Authorization: Bearer <token>
```

Synchronisiert E-Mail-Aliases mit Mailcow basierend auf Vereinsfunktionen.

## Rollen & Zugriff

### Verfügbare Rollen
```http
GET /roles
Authorization: Bearer <token>
```

### Eigene Cloud-Zugriffe
```http
GET /members/me/accesses
Authorization: Bearer <token>
```

Gibt die Cloud-Zugriffe (Nextcloud etc.) des aktuellen Mitglieds zurück.

## Nextcloud & Gruppen

### Nextcloud-Admin-Zugriff
```http
GET /members/:id/nextcloud-admin
POST /members/:id/nextcloud-admin
Authorization: Bearer <token>
```

Prüft/gewährt Nextcloud-Admin-Zugriff für ein Mitglied.

### Vorstand-Gruppe
```http
GET /members/:id/vorstand-group
POST /members/:id/vorstand-group
Authorization: Bearer <token>
```

Prüft/setzt Mitgliedschaft in der Vorstand-Verzeichnisgruppe.

### Social-Media-Gruppe
```http
GET /members/:id/social-media-group
POST /members/:id/social-media-group
Authorization: Bearer <token>
```

## Mitgliedschaftsanträge

### Offene Anträge (Vorstand)
```http
GET /member-registrations
Authorization: Bearer <token>
```

### Antrag-Details
```http
GET /member-registrations/:id
Authorization: Bearer <token>
```

### Anzahl offener Anträge
```http
GET /member-registrations/count/pending
Authorization: Bearer <token>
```

### Antrag genehmigen
```http
POST /member-registrations/:id/approve
Authorization: Bearer <token>
```

### Antrag ablehnen
```http
POST /member-registrations/:id/reject
Authorization: Bearer <token>
```

## Synchronisierung

### Mitglieder mit Authentik synchronisieren
```http
POST /members/sync-authentik
Authorization: Bearer <token>
```

Synchronisiert Mitglieder-Daten zwischen der lokalen Datenbank und Authentik.

### Gruppen synchronisieren
```http
POST /members/sync-authentik-groups
Authorization: Bearer <token>
```

Synchronisiert Authentik-Gruppen mit lokalen Gruppen.

## Benachrichtigungen & Einstellungen

### Benachrichtigungs-Einstellungen
```http
GET /members/me/notifications
PUT /members/me/notifications
Authorization: Bearer <token>
Content-Type: application/json

{
  "email_events": true,
  "email_newsletter": true
}
```

### Funktions-E-Mail-Passwort ändern
```http
PUT /members/me/function-email-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "password": "neuesPasswort"
}
```

## Audit Log

### Log abrufen
```http
GET /audit?limit=50&offset=0
Authorization: Bearer <token>
```

**Query Parameter:**
- `limit` - Anzahl Ergebnisse (Standard: 50)
- `offset` - Offset für Paginierung
- `action` - Filter nach Aktion (create, update, delete)
- `entity` - Filter nach Entität (member, event, etc.)

Zeigt alle Aktivitäten im System. Wird automatisch via Datenbank-Trigger bei Änderungen befüllt.
