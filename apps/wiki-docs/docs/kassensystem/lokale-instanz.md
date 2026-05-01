---
sidebar_position: 5
---

# Lokale Instanz

Für Anlässe ohne stabile Internetverbindung kann eine lokale Instanz auf einem Raspberry Pi betrieben werden.

## Vorteile

- **Offline-fähig**: Funktioniert ohne Internet
- **Schneller**: Keine Latenz zur Cloud
- **Direkter Druckerzugriff**: Drucker im lokalen Netzwerk
- **Automatische Sync**: Synchronisation mit Cloud wenn online

## Hardware

### Empfohlene Konfiguration
- Raspberry Pi 4 (4GB RAM)
- SD-Karte (32GB+)
- Ethernet-Anschluss
- Netzteil 5V/3A

### Netzwerk
- Lokaler Router/Switch
- Statische IP für Pi empfohlen
- Drucker im gleichen Netzwerk

## Installation

### Docker-Compose
Die lokale Instanz nutzt `docker-compose.local.yml`:

```yaml
services:
  postgres:
    image: postgres:15-alpine
  order-backend:
    environment:
      - CLOUD_SYNC_ENABLED=true
      - CLOUD_API_URL=https://order.fwv-raura.ch/api
  order-frontend:
    # Kasse unter kasse.local
  order-kitchen:
    # Kitchen Display unter kitchen.local
  inventory-backend:
    # Inventar-API
  inventory-frontend:
    # Inventar unter inventar.local
  nginx:
    # Routing für alle Services
```

### Lokale Domains
Konfiguriere im Router oder `/etc/hosts`:
- `kasse.local` → Raspberry Pi IP
- `kitchen.local` → Raspberry Pi IP
- `inventar.local` → Raspberry Pi IP

## Synchronisation

### Echtzeit-Sync
- Jede Bestellung wird zur Cloud gesynct
- Alle 30 Sekunden werden Updates abgerufen
- Bei Verbindungsausfall wird Queue aufgebaut

### Sync-Queue
Offline-Änderungen werden in einer Queue gespeichert:
- Bestellungen (neu/geändert)
- Status-Updates
- Automatischer Sync bei Verbindung

### Konflikt-Vermeidung
- Jede Instanz hat eine `SYNC_SOURCE` ID
- Bestellungen werden mit Quelle markiert
- Duplikate werden erkannt und übersprungen

## Umgebungsvariablen

```bash
# .env.local
CLOUD_SYNC_ENABLED=true
CLOUD_API_URL=https://order.fwv-raura.ch/api
CLOUD_SYNC_KEY=geheimer-sync-schlüssel
SYNC_SOURCE=raspberry-01

# Drucker
PRINTER_BAR_IP=192.168.1.100
PRINTER_KITCHEN_IP=192.168.1.101
```

## Drucker-Konfiguration

### Epson TM-m30III
- Netzwerkdrucker im lokalen LAN
- Port 9100 (ESC/POS)
- Konfiguration in Einstellungen oder ENV

### Drucker-Test
Im Vorstand-Portal unter Einstellungen:
1. IP-Adresse eingeben
2. "Testdruck" klicken
3. Testbon wird gedruckt

## Überwachung

### Sync-Status
```
GET /api/sync/stats
```

### Pending Queue
```
SELECT COUNT(*) FROM sync_queue WHERE synced_at IS NULL;
```
