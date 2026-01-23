# Simple Inventory System

Lagerverwaltung für den Feuerwehrverein Raura mit Barcode-Unterstützung.

## Features

- **Barcode-Scanner** - Kamera oder USB-Scanner (EAN + eigene Codes)
- **Automatische Barcode-Generierung** - FWV000001, FWV000002, ...
- **Kategorien & Lagerorte** - Flexible Organisation
- **Ein-/Ausgangsbuchung** - Mit History
- **Mindestbestand-Warnung** - "Nachbestellen"-Ansicht
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
