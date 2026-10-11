# Simple Inventory System

Lagerverwaltung für den Feuerwehrverein Raura mit Barcode-Unterstützung.

## Features

- **Barcode-Scanner** - Kamera oder USB-Scanner (EAN + eigene Codes)
- **Automatische Barcode-Generierung** - FWV000001, FWV000002, ...
- **Kategorien & Lagerorte** - Flexible Organisation
- **Ein-/Ausgangsbuchung** - Mit History
- **Mindestbestand-Warnung** - "Nachbestellen"-Ansicht
- **Ausleihe** - Mitglieder leihen Artikel und ganze Kisten selbst aus
  (Mitglieder-App), das Lager gibt aus und nimmt zurück
- **Raspberry Pi Support** - Lokal lauffähig mit Sync zum Server

## Architektur

```
┌──────────────────────┐          ┌──────────────────────┐
│   Raspberry Pi       │   Sync   │   Server             │
│   (Lager/lokal)      │ ◄──────► │   (docker.fwv-raura) │
│                      │          │                      │
│ ┌──────────────────┐ │          │ ┌──────────────────┐ │
│ │ Frontend :8082   │ │          │ │ inventory.fwv-   │ │
│ └────────┬─────────┘ │          │ │ raura.ch         │ │
│          │           │          │ └────────┬─────────┘ │
│ ┌────────▼─────────┐ │          │ ┌────────▼─────────┐ │
│ │ Backend :3000    │ │          │ │ Backend          │ │
│ └────────┬─────────┘ │          │ └────────┬─────────┘ │
│          │           │          │          │           │
│ ┌────────▼─────────┐ │          │ ┌────────▼─────────┐ │
│ │ PostgreSQL       │ │          │ │ PostgreSQL       │ │
│ └──────────────────┘ │          │ └──────────────────┘ │
└──────────────────────┘          └──────────────────────┘
```

## Schnellstart

### Server (docker.fwv-raura.ch)

```bash
cd simple-inventory-system
cp .env.example .env
# .env anpassen

docker-compose -f docker-compose.prod.yml up -d
```

Erreichbar unter: https://inventory.fwv-raura.ch

### Raspberry Pi

```bash
cd simple-inventory-system
cp .env.example .env
# .env anpassen (LOCAL_MODE=true, LOCAL_IP, SYNC_SECRET)

docker-compose -f docker-compose.raspi.yml up -d
```

Erreichbar unter: http://192.168.x.x:8082

## API Endpoints

### Items

- `GET /api/items` - Alle Artikel
- `GET /api/items?search=xxx` - Suchen
- `GET /api/items?low_stock=true` - Niedriger Bestand
- `GET /api/items/barcode/:code` - Artikel per Barcode
- `POST /api/items` - Artikel anlegen (Auth erforderlich)
- `PUT /api/items/:id` - Artikel bearbeiten (Auth erforderlich)
- `DELETE /api/items/:id` - Artikel löschen (Auth erforderlich)

### Stock

- `POST /api/items/:id/stock` - Bestand ändern
  ```json
  { "type": "in|out|correction", "quantity": 5, "reason": "Lieferung" }
  ```
- `POST /api/stock/scan` - Schnell-Buchung per Barcode

### Ausleihe

Code: `backend/src/ausleihe.ts` (Regeln), `backend/src/ausleihe-routen.ts`
(Tabellen, Routen, Benachrichtigungen). Tests: `backend/test/ausleihe*.mjs`,
Vertrag mit der App: `flutter/fwv_lager/test/fixtures/ausleihe-api.json`.

Jedes Mitglied (Authentik-Token der Mitglieder-App/-Web, ohne Gruppe):

- `GET /api/ausleihe/angebot?von=2026-10-13&bis=2026-10-15` - ausleihbare
  Artikel (`frei`, `frei_text`) und Kisten (`frei`, `inhalt`)
- `POST /api/ausleihe` - ausleihen, ohne Freigabe; 409 mit deutscher
  Meldung, wenn es nicht mehr passt
  ```json
  { "von": "2026-10-13", "bis": "2026-10-15",
    "positionen": [{ "item_id": 2, "menge": 30 }, { "location_id": 2 }],
    "notizen": "Geburtstag" }
  ```
- `GET /api/ausleihe/meine`, `GET /api/ausleihe/:id` (eigene)
- `POST /api/ausleihe/:id/absagen` - solange reserviert

Gruppe Lager, Vorstand, admin (und die Inventar-PWA):

- `POST /api/ausleihe` mit `"extern": { "name", "organisation", "telefon",
  "email" }`
- `GET /api/ausleihe?filter=aktuell|kommend|ausgegeben|ueberfaellig|erledigt`,
  `GET /api/ausleihe/ueberfaellig`
- `POST /api/ausleihe/:id/ausgeben` - bucht aus (Grund `Ausleihe #id`),
  hält den Inhalt von Kisten fest
- `POST /api/ausleihe/:id/zuruecknehmen` - bucht Zurückgekommenes ein;
  Beschädigtes/Fehlendes bleibt ausgebucht (Verlauf: `correction` mit Grund),
  Fehlendes aus Kisten wird dort abgezogen
  ```json
  { "positionen": [
      { "id": 1, "zurueck": 27, "zustand": "beschaedigt",
        "schaden": "3 kaputt" },
      { "id": 3, "inhalt": [{ "id": 1, "zurueck": 4, "zustand": "fehlt" }] }
    ], "notiz": "Sonst sauber" }
  ```
- `POST /api/ausleihe/:id/fotos` (multipart `image`, `position_id`),
  `DELETE /api/ausleihe/:id/fotos/:fotoId`
- `PATCH /api/items/:id/ausleihbar`, `PATCH /api/locations/:id/ausleihbar`
  `{ "ausleihbar": true }`

Intern: `POST /api/ausleihe/erinnerungen` (`x-order-api-key`) startet die
Erinnerungen sofort.

Verfügbar ist: Bestand + gerade Ausgegebenes − alle Ausleihen (reserviert
oder ausgegeben), die den Zeitraum überschneiden; Kisten zählen mit ihrem
Inhalt. Ausgegebenes belegt bis zur Rückgabe, auch wenn es überfällig ist.

Umgebung (alle optional, `docker-compose.prod.yml`):

| Variable | Standard | Wofür |
|---|---|---|
| `DISPATCH_API_URL` | `http://api-dispatch:3000` | E-Mail-Versand |
| `DISPATCH_API_KEY` | leer = keine E-Mails | `API_KEY` des Haupt-Stacks |
| `MEMBERS_API_URL` | `http://api-members:3000` | Push an Mitglieder |
| `INTERNAL_API_KEY` | leer = kein Push | `INTERNAL_API_KEY` des Haupt-Stacks |
| `LAGER_EMAIL` | `lager@fwv-raura.ch` | Meldungen ans Lager |
| `AUSLEIHE_ERINNERUNG_ENABLED` | `false` | tägliche Erinnerungen |

### Barcode

- `GET /api/barcode/generate/:code` - Barcode als PNG
- `GET /api/barcode/next` - Nächster freier Code

### Sync

- `GET /api/sync/export` - Alle Daten exportieren
- `GET /api/sync/changes?since=2024-01-01` - Änderungen seit Datum
- `POST /api/sync/push` - Daten importieren

## Barcode-Scanner

### Kamera (Smartphone/Tablet)

- Tab "Scanner" öffnen
- Kamera-Zugriff erlauben
- Barcode vor Kamera halten

### USB-Scanner

- Scanner anschliessen
- Scanner sendet Code + Enter
- Eingabefeld im Scanner-Tab fokussieren

## Authentifizierung

### Server (Online)

- Authentik via OAuth2/OpenID
- Application: "inventory-system"

### Raspberry Pi (Lokal)

- Einfaches Passwort
- Standard: `fwv2026`
- `LOCAL_MODE=true` in .env

## Sync-Konfiguration

Der Raspberry Pi synchronisiert automatisch alle 5 Minuten mit dem Server.

```env
INVENTORY_SYNC_SECRET=gleiches-secret-auf-beiden-seiten
```

Manueller Sync:

```bash
# Export vom Raspberry
curl -H "x-sync-key: SECRET" http://localhost:3000/api/sync/export

# Push zum Server
curl -X POST -H "x-sync-key: SECRET" -H "Content-Type: application/json" \
  -d @data.json https://inventory.fwv-raura.ch/api/sync/push
```
