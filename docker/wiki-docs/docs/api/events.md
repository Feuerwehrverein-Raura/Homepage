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
- `upcoming=true` - Nur zukünftige und laufende Events, nächste zuerst;
  "Datum noch offen" am Ende
- `limit` - Höchstens so viele Events (positive Ganzzahl, max. 100, nach
  der Sortierung; ungültig = ohne Limit). Startseite: `upcoming=true&limit=3`
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

### Ein Anlass als .ics
```http
GET /events/:id/ics
```

`:id` ist UUID oder Slug. Liefert eine Datei (`text/calendar`,
`attachment; filename="Chilbi_2026.ics"`) für "Zum Kalender". Zeiten gehen
als Ortszeit mit `TZID=Europe/Zurich` hinaus (mit `VTIMEZONE`), Mitternacht
heisst ganztägig (`VALUE=DATE`, Ende exklusiv). Abgesagte Anlässe tragen
`STATUS:CANCELLED`. Bei "Datum noch offen" (`datum_offen`) gibt es `404`.

### Öffentliche Anmeldung
```http
POST /registrations/public
Content-Type: application/json
Authorization: Bearer <token>   (optional)

{
  "type": "shift",
  "eventId": "chilbi-2026",
  "shiftIds": ["…"],
  "name": "Max Muster",
  "email": "max@example.com",
  "phone": "079 000 00 00"
}
```

Teilnahme: `"type": "participant"`, dazu `participants`, `companions`,
`allergies`, `meal_selection`, `notes`.

- **Ohne Token** (Website): Gehört die E-Mail einem Mitglied, wird die
  Anmeldung mit ihm verknüpft; sonst ist es ein Gast und muss per Link in
  einer E-Mail bestätigen (Double-Opt-in).
- **Mit gültigem Mitglieder-Token** (App): Mitglied, Name und E-Mail kommen
  aus dem Token, nicht aus dem Formular. Kein Opt-in. Ein ungültiges Token
  heisst "Gast", kein Fehler.
- `eventTitle` und `organizerEmail` werden **ignoriert** (ältere Clients
  schicken sie noch). Die Meldung an den Organisator geht an
  `organizer_email` des Anlasses, sonst an `CONTACT_EMAIL`
  (`kontakt@fwv-raura.ch`); GV an `vorstand@fwv-raura.ch`.

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
  "email": "zugang-anlass@example.ch",
  "password": "event-passwort"
}
```

Antwort: `{ "success": true, "token": "…", "event": { "id", "title", "slug",
"organizer_name" } }`. Das Token gilt 24 Stunden.

Ist der Anlass vorbei (Ende bzw. Beginn vor heute, Europe/Zurich) oder
abgesagt, gibt es `403` mit

```json
{
  "error": "Der Anlass ist vorbei – der Organisator-Zugang gilt nicht mehr.",
  "code": "anlass_vorbei"
}
```

(bzw. "… wurde abgesagt …"). Auch schon ausgestellte Tokens gelten dann
nicht mehr: alle `/events/my-event…`-Routen und die Organisator-Übersicht
antworten mit `401` und derselben Meldung. "Datum noch offen" gilt nicht als
vorbei.

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

### Person hinzufügen (Organisator)
```http
POST /events/my-event/registrations
Authorization: Bearer <token>
```

Wie `POST /events/:id/registrations-as-organizer` (siehe
[Person in Schichten eintragen](#person-in-schichten-eintragen)):
`member_id` oder `guest_name`, optional `guest_email`, `guest_phone`,
`participants`, `notes`, `shift_ids`; gleich bestätigt.

### Arbeitsplan versenden (Organisator)
```http
POST /events/my-event/send-arbeitsplan
Authorization: Bearer <token>
```

### Organisator-Übersicht (Apps)
```http
GET /events/organisator-uebersicht
Authorization: Bearer <token>
```

Ein Aufruf für den Organisator-Bereich der Apps: alle eigenen Anlässe mit
anzeigefertigen Anmeldungen und Zahlen (statt einer Abfrage pro Anlass und
Auslesen des `notes`-JSON in der App).

| Token | `zugang` | Anlässe |
|---|---|---|
| Organisator-Login | `organisator-login` | genau sein Anlass (sonst `401`, siehe oben) |
| Vorstand/Admin | `vorstand` | alle aktuellen |
| Mitglied | `mitglied` | die es organisiert (`organizer_id` oder `organizer_email`, wie `organized-by-me`), aktuelle und die der letzten 7 Tage |
| ohne | — | `401` |

Ein Mitglied, das nichts organisiert, bekommt `{ "zugang": "mitglied",
"anlaesse": [] }`. Reihenfolge: aktuelle (Ideen ohne Datum zuletzt), dann
vergangene, neuste zuerst.

Jeder Anlass ist die Zeile aus `events` (ohne Zugangsdaten und ohne
`pdf_attachment`), mit `shifts[]` und `app`-Block wie bei `GET /events`, dazu
`organisator`:

```json
{
  "zugang": "mitglied",
  "anlaesse": [{
    "id": "…", "slug": "helferessen", "title": "Helferessen", "category": "GV",
    "start_date": "2026-10-31 19:00:00", "max_participants": 2,
    "meal_options": ["Fleisch", "Vegi"], "registration_deadline": null,
    "app": { "datum_text": "Samstag, 31. Oktober 2026", "kann_bearbeiten": true, "…": "…" },
    "shifts": [],
    "organisator": {
      "aktuell": true,
      "zahlen": {
        "anmeldungen": 2, "offen": 1, "bestaetigt": 0, "abgelehnt": 1,
        "personen_total": 2, "text": "1 offen · 2 Personen"
      },
      "aktionen": {
        "bestaetigen": true, "hinzufuegen": true, "bearbeiten": true,
        "loeschen": true, "alternative": false, "mitteilen": true,
        "anlass_bearbeiten": true, "schichten": true, "notizen": true,
        "material": true, "einkauf": true, "arbeitsplan_senden": false,
        "pdf_teilnehmerliste": true, "pdf_arbeitsplan": false, "pdf_aushang": false
      },
      "anmeldungen": [{
        "id": "…", "status": "pending", "status_text": "offen", "status_farbe": "gelb",
        "art": "teilnahme", "mitglied": false, "member_id": null,
        "name": "Paar Gast", "email": "paar@example.ch", "phone": "+41 79 111 22 33",
        "personen": 2,
        "begleitpersonen": [{ "name": "Peter Gast", "email": null, "phone": null }],
        "allergien": "Nüsse", "menue": "Vegi", "bemerkung": "Kommen etwas später",
        "shift_ids": [], "schichten": [],
        "alternative": null, "angemeldet_text": "15.09.2026"
      }]
    }
  }]
}
```

- `anmeldungen`: offen zuerst, dann bestätigt, dann abgelehnt; je nach Name.
  `schichten[].beschriftung` wie in "Meine Anmeldungen". `bemerkung` ist
  bei alten Anmeldungen der ganze `notes`-Text. `alternative` ist gesetzt,
  wenn eine andere Schicht vorgeschlagen wurde (`schicht_text`,
  `vorgeschlagen_text`).
- `zahlen.personen_total` zählt Personen (nicht Anmeldungen) mit Status
  offen oder bestätigt — wie die Kapazitätsprüfung.
- `aktionen` sagt, was der Anfragende tun darf. Der Organisator-Login hat
  nur die `/events/my-event…`-Routen (bestätigen, ablehnen, hinzufügen,
  Arbeitsplan senden); alles andere ist dort `false`.

Vertrag mit der App: `test/fixtures/organisator-uebersicht.json`
(`test/app-vertrag.test.js`).

### Organisator-Routen für Mitglieder

Mitglieder, die einen Anlass organisieren (oder Vorstand), mit ihrem
normalen Token:

| Route | Zweck |
|---|---|
| `GET /events/organized-by-me` | eigene Anlässe (Reiter "Organisator" ein/aus) |
| `GET /events/:id/organizer-registrations` | Anmeldungen roh, mit `parsed_notes` |
| `POST /events/:id/registrations/:regId/approve-as-organizer` | bestätigen |
| `POST /events/:id/registrations/:regId/reject-as-organizer` | ablehnen |
| `PUT /events/:id/registrations/:regId/as-organizer` | ändern: nur mitgeschickte Felder (`guest_name`, `guest_email`, `guest_phone`, `participants`, `notes`, `status`, `shift_ids`); das `notes`-JSON wird zusammengeführt, Begleitpersonen, Allergien und Menü bleiben; `shift_ids` ersetzt die Schichten (`[]`/`null` = ohne Schicht, Prüfung siehe unten) |
| `DELETE /events/:id/registrations/:regId/as-organizer` | löschen |
| `POST /events/:id/registrations-as-organizer` | Person hinzufügen (`member_id` oder `guest_name`, optional `shift_ids`), gleich bestätigt |
| `POST /events/:id/registrations/:regId/suggest-alternative-as-organizer` | andere Schicht vorschlagen (`newShiftId`, `shiftInfo`, `comment`, `email`) |
| `POST /events/:id/notify-registrants-as-organizer` | Angemeldete informieren (`subject`, `message`) → `{ emailed, posted, pushed, skipped, unreachable }` |
| `PUT /events/:id/as-organizer` | Anlass ändern (nur mitgeschickte Felder) |
| `POST /events/:id/shifts-as-organizer`, `PUT/DELETE /events/:id/shifts/:shiftId/as-organizer` | Schichten |
| `GET/POST /events/:id/organizer-notes`, `DELETE …/:noteId`, `GET/DELETE …/:noteId/attachments/:attId` | Notizen mit Anhängen (Base64) |
| `GET /events/:id/recipes`, `…/shopping-list`, `POST …/manual-items` usw. | Rezepte und Material (Inventar) |
| `GET /events/:id/organizers` | Haupt-Organisator, Mitorganisatoren, `darf_verwalten` |
| `POST /events/:id/organizers` | Mitorganisator hinzufügen: `{ member_id }` oder `{ name, email }` (extern) — nur Vorstand und Haupt-Organisator |
| `DELETE /events/:id/organizers/:orgId` | Mitorganisator entfernen (sein Login gilt sofort nicht mehr) — nur Vorstand und Haupt-Organisator |

#### Person in Schichten eintragen

Meldet sich jemand mündlich für eine Schicht, trägt ihn der Organisator
(oder der Vorstand) mit `shift_ids` ein — beim Hinzufügen
(`POST /events/:id/registrations-as-organizer`,
`POST /events/my-event/registrations`) und beim Ändern
(`PUT …/registrations/:regId/as-organizer`). Ohne `shift_ids` bleibt alles
wie bisher (Anmeldung ohne Schicht bzw. Schichten unverändert).

```json
{ "member_id": "…", "shift_ids": ["<schicht-uuid>", "<schicht-uuid>"] }
```

- doppelte IDs fallen weg
- alle Schichten müssen zu diesem Anlass gehören, sonst `400`
  (`code: "schicht_fremd"`)
- steht dieselbe Person (Mitglied oder Gäste-Adresse) schon mit einer anderen
  Anmeldung auf der Schicht: `409` (`code: "schicht_doppelt"`), wie bei
  `PUT /registrations/:id`
- ist eine Schicht schon voll (bestätigte Anmeldungen ≥ `needed`), wird
  trotzdem eingetragen; die Antwort enthält dann einen Hinweis:

```json
{
  "success": true,
  "registration": { "id": "…", "shift_ids": ["…"], "status": "approved" },
  "warnung": "Schicht bereits voll, trotzdem eingetragen: Abbau (2026-10-25 10:00) 1/1"
}
```

`warnung` ist `null`, wenn alles frei war. Die eingetragene Person bekommt
eine Nachricht mit Anlass und Schichten (auch beim externen Event-Login).
Prüfung: `src/schicht-eintrag.js`, Tests: `test/schicht-eintrag.test.js`.

### Mitorganisatoren

Neben dem Haupt-Organisator (`organizer_id` bzw. `organizer_name`/
`organizer_email`; Kontaktperson in Mails, Arbeitsplan und Website) kann ein
Anlass beliebig viele Mitorganisatoren haben (Tabelle `event_organizers`).
Sie haben dieselben Rechte wie der Haupt-Organisator (alle Routen oben,
`organized-by-me`, `organisator-uebersicht`) und bekommen die Meldungen zu
neuen Anmeldungen. Den Haupt-Organisator ändern und den Anlass löschen kann
nur der Vorstand; Mitorganisatoren verwalten nur Vorstand und
Haupt-Organisator (`aktionen.organisatoren_verwalten`).

- **Mitglied** (`member_id`): verwaltet den Anlass in der Mitglieder-App;
  bekommt eine E-Mail und eine Push-Nachricht.
- **Extern** (`name`, `email`): eigener Login fürs Event-Dashboard mit der
  eigenen E-Mail und einem zufälligen Passwort (scrypt mit Salz), gültig bis
  drei Monate nach dem Anlass; die Zugangsdaten gehen per E-Mail (gleicher
  Text wie beim externen Haupt-Organisator). `POST /events/login` nimmt
  diese Zugangsdaten an; das Token trägt zusätzlich `organisator_id`.

### Rezepte, Material und Einkauf (Inventar-Proxy)

Das Events-Backend prüft "Vorstand/Admin oder Organisator dieses Anlasses"
und reicht an die Inventar-API (`INVENTORY_URL`, Standard
`https://inventar.fwv-raura.ch`) weiter — mit dem internen Key
(`x-order-api-key`) und der handelnden Person (`x-fwv-user-email`, nur
zusammen mit dem Key gültig). `:id` darf UUID oder Slug sein; die
Inventar-API kennt den Anlass über den Slug.

| Route | Zweck |
|---|---|
| `GET /events/:id/recipes`, `GET …/shopping-list` | verknüpfte Rezepte, Einkaufsliste (Bedarf gegen Lagerbestand) |
| `POST/PUT/DELETE /events/:id/recipes[/:recipeId]` | Rezept verknüpfen, Portionen, lösen |
| `POST /events/:id/manual-items`, `DELETE …/:itemId` | Material von Hand |
| `GET /events/:id/available-recipes`, `…/available-items` | Auswahllisten |
| `PATCH /events/:id/shopping-list/:itemId` | Position abhaken: `{ purchased, actual_quantity?, actual_price?, paid_by?, note? }` |
| `GET /events/:id/receipts` | Belege: `[{ id, image_url, amount, paid_by, note, uploaded_by, created_at }]` |
| `POST /events/:id/receipts` | Beleg hochladen: `multipart/form-data`, Feld `image` (JPEG/PNG/WebP/GIF, max. 10 MB), optional `amount`, `note`, `paid_by` → 201 mit der neuen Zeile |
| `GET /events/:id/receipts/:receiptId/image` | Belegbild (nur Dateien unter `/api/uploads/` der Inventar-API) |
| `DELETE /events/:id/receipts/:receiptId` | Beleg löschen |
| `POST /events/:id/shopping-list/restock` | Gekauftes ins Lager zurückbuchen → `{ restocked, items: [{ item_id, name, quantity }] }` |

Zurückbuchen bucht jede abgehakte, noch nicht eingebuchte Position einmal
ein: die Ist-Menge (`actual_quantity`), sonst Bedarf minus Bestand —
aufgerundet auf ganze Einheiten. Rezept-Zutaten und Material von Hand.
`aktionen.einkauf` in der Organisator-Übersicht sagt, ob der Einkauf
angeboten wird (nicht beim Organisator-Login).

### TWINT-QR für die Kasse

Jeder Anlass kann einen eigenen TWINT-QR haben; die Kasse
(order.fwv-raura.ch) zeigt ihn, solange der Anlass läuft. Ohne eigenen QR
gilt an der Kasse der Vereins-Standard (`twint-qr.png` im Kassen-Frontend).
Das Bild liegt als Base64 in `event_twint_qr` (eigene Tabelle, damit
`SELECT e.*` kein Bild mitschleppt); `events.twint_qr_url` zeigt auf den
Abruf (`/events/<id>/twint-qr?v=<Zeit>`) oder ist `null`. Migration 030,
beim Start auch idempotent (`src/kasse-anlass.js`).

| Route | Wer | Zweck |
|---|---|---|
| `GET /events/:id/twint-qr` | öffentlich (wie das PDF) | das Bild |
| `PUT /events/:id/twint-qr` | Vorstand, Organisator, Mitorganisator | `{ data (Base64 oder data:-URI), content_type? }` → `{ twint_qr_url }`; PNG/JPEG/WebP/GIF nach Inhalt, max. 2 MB, kein SVG |
| `DELETE /events/:id/twint-qr` | dito | eigenen QR entfernen |
| `PUT/DELETE /events/my-event/twint-qr` | externer Organisator-Login | dasselbe für den eigenen Anlass |
| `GET /events/kasse/aktuell` | Kasse (`X-Order-API-Key` = `ORDER_API_KEY`, oder `x-api-key`) | `{ anlass: {id, title, start_date, end_date, location, status, twint_qr_url} \| null, zeitpunkt }` |
| `GET /events/kasse/anlaesse` | Kasse | laufende und kommende Anlässe (Auswahl in den Kassen-Einstellungen) |
| `GET /events/kasse/anlaesse/:id` | Kasse | ein bestimmter Anlass (manuelle Auswahl) |

**Aktueller Anlass:** läuft gerade (Beginn − 2 h bis Ende + 2 h, Ortszeit
Europe/Zurich; ohne Ende gilt der Starttag bis 23:59), nicht abgesagt,
kein Entwurf/Vorschlag/abgelehnt, nicht "Datum noch offen"; bei mehreren
der zuletzt begonnene. Bewusst anders als der Kiosk
(`/arbeitsplan/kiosk`: laufend oder nächster, nur mit Schichten) - für
eine Zahlung darf kein Anlass von nächster Woche gelten.
Tests: `test/kasse-anlass.test.js`.

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

### Tägliche Erinnerung (Cronjob)
```http
POST /reminders/send-daily
X-API-Key: <api-key>
```

Ruft der Cronjob `docker/cron/shift-reminders.sh` im Container ueber
localhost auf; von aussen nur mit API-Schluessel.

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

### Arbeitsplan geaendert (nach dem Versand)
```http
POST /reminders/arbeitsplan-aenderungen
X-API-Key: <api-key>
```

Laeuft alle 5 Minuten im Container (abschalten mit
`ARBEITSPLAN_UPDATE_ENABLED=false`): vergleicht den Plan mit dem verschickten
Stand und schickt Aenderungen gebuendelt an alle Eingeteilten. `POST` prueft
sofort (Ruhezeit gilt trotzdem).

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

