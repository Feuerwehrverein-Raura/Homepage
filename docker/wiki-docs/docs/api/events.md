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
- `aktuell=true` - Für die Mitglieder-App: nicht abgesagt und noch nicht
  vorbei (Ende bzw. Beginn ist heute oder später, Ortszeit Zürich),
  sortiert nach Beginn
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

### `app`-Block (anzeigefertig)

`GET /events` und `GET /events/:id` hängen an jeden Anlass einen Block
`app` und an jede Schicht in `shifts[]` ebenfalls einen `app`. Die Apps
zeigen diese Werte nur an und rechnen nichts selbst (Logik in
`docker/backend-events/src/app-ansicht.js`). Die bisherigen Felder bleiben
unverändert. Das Token ist optional: Mit Authentik-, Mitglieder- oder
Organisator-Token (Event-Login) stimmt `kann_bearbeiten`, ohne Token ist es
immer `false`.

```json
"app": {
  "datum_text": "Sa 17.10. – So 18.10.2026",
  "zeit_text": "ab 10:00 Uhr",
  "abgesagt": false,
  "anmeldung": {
    "moeglich": true,
    "grund": null,
    "art": "schicht",
    "pflicht": true,
    "anmeldeschluss_text": "Donnerstag, 15. Oktober 2026, 23:59 Uhr",
    "plaetze_frei": null,
    "plaetze_text": null
  },
  "kann_bearbeiten": false
}
```

- `datum_text`: ein Tag ausgeschrieben ("Samstag, 17. Oktober 2026"),
  mehrere Tage als Spanne.
- `zeit_text`: "17:00–22:00 Uhr", "17:00 Uhr", bei mehreren Tagen
  "ab 10:00 Uhr", ohne Uhrzeit `null`.
- `anmeldung.art`: `schicht` (hat Schichten), `teilnahme` (Anmeldung nötig,
  ohne Schichten) oder `null`. `pflicht` kommt aus `registration_required`
  oder der Kategorie (Liste: `GET /event-optionen`).
- `anmeldung.grund` (wenn `moeglich` false): "Anlass abgesagt",
  "Anlass ist vorbei", "Keine Anmeldung nötig", "Anmeldeschluss vorbei",
  "Ausgebucht" (Teilnehmer-Limit), "Alle Schichten sind besetzt".
- `plaetze_frei`/`plaetze_text`: nur bei `teilnahme` mit
  `max_participants`.
- `kann_bearbeiten`: Vorstand, Organisator des Anlasses (gleiche Regel wie
  `GET /events/organized-by-me`) oder Organisator-Login dieses Anlasses.

Schicht:

```json
"app": {
  "datum_text": "Samstag, 17. Oktober 2026",
  "zeit_text": "17:00–20:00 Uhr",
  "bereich_text": "Küche",
  "belegung": { "besetzt": 1, "gebraucht": 2, "offen": 1, "angefragt": 1,
                "text": "1 Platz frei" },
  "waehlbar": true
}
```

`bereich_text` ist der lesbare Bereich, bei `Allgemein` der Schichtname.
`besetzt` zählt bestätigte, `angefragt` offene Anmeldungen. `text` ist
"1 Platz frei", "3 Plätze frei" oder "voll". `waehlbar` ist false, wenn
die Schicht voll oder vorbei ist oder am Anlass keine Anmeldung mehr geht.

Vertrag mit der Flutter-App: `docker/backend-events/test/fixtures/`
(`anlaesse-app.json`, `meine-anmeldungen.json`, `kalender-app.json`).

### Auswahllisten für Anlass-Formulare
```http
GET /event-optionen
```

Kategorien, anmeldepflichtige Kategorien, Bereiche (`wert`/`text`) und
Status-Werte — die einzige Quelle für diese Listen.

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

### Meine Anmeldungen
```http
GET /registrations/mine
Authorization: Bearer <token>
```

Anmeldungen des angemeldeten Mitglieds. Zusätzlich anzeigefertig:
`status_text` ("offen", "bestätigt", "abgelehnt"), `status_farbe` ("gelb",
"gruen", "rot"), `event_datum_text` und pro Schicht `beschriftung`, z.B.
"Bar – Schicht 1 · Sa 17.10. · 12:00–14:00" (Bereich `Allgemein` entfällt).

### Kalender-Einträge
```http
GET /calendar/items
Authorization: Bearer <token>
```

Anlässe, Beitragsfälligkeiten und bezahlte Beiträge, sortiert nach Datum,
jeder Eintrag mit `datum_text`. Versendete E-Mails und Briefe (`email`,
`letter`) nur für den Vorstand.

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

### Arbeitsplan eine Woche vorher
```http
POST /reminders/arbeitsplan
X-API-Key: <api-key>

GET /reminders/arbeitsplan/preview
Authorization: Bearer <token>
```

Läuft stündlich im Container (ab 08:00 Uhr), aber nur mit
`ARBEITSPLAN_REMINDER_ENABLED=true` — ohne die Variable ist er aus. `POST` löst den Lauf sofort aus
(`{"dry_run": true}` = nur Vorschau). Siehe Vorstand-Doku "Event-Management".

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
