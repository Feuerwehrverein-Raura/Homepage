# Simple Order System

Ein minimalistisches Bestellsystem für Vereinsfeste und Events - inspiriert von Orderjutsu, aber komplett Open Source.

## Features

✅ **Bestelloberfläche** - Tablet/Handy-optimiert mit Tailwind CSS  
✅ **Bondrucker-Integration** - ESC/POS kompatibel (Bar & Küche)  
✅ **Kitchen Display** - Live-Updates via WebSocket  
✅ **Inventar-Verwaltung** - Artikel, Preise, Kategorien  
✅ **💳 Payment-Integration** - SumUp (Karte), TWINT (via RaiseNow), Bar  
✅ **Docker-basiert** - Einfaches Setup mit separaten Compose-Files  
✅ **GitHub Actions** - Automatische Container-Builds  

> 🎯 **Entwickelt für Feuerwehrverein Raura Kaiseraugst**  
> In Zusammenarbeit mit dem [Homepage-Projekt](https://github.com/Feuerwehrverein-Raura/Homepage)

## Architektur

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend   │────▶│   Backend   │────▶│  PostgreSQL │
│ (Port 8080) │     │ (Port 3000) │     │ (Port 5432) │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           │ WebSocket
                           ▼
                    ┌─────────────┐
                    │   Kitchen   │
                    │   Display   │
                    │ (Port 8081) │
                    └─────────────┘
```

**Services:**
- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + Vite + Tailwind CSS
- **Kitchen Display**: React + Vite + Tailwind CSS + WebSocket
- **Database**: PostgreSQL 16

## Schnellstart

### Voraussetzungen

- Docker & Docker Compose
- Git

### Installation

```bash
# Repository klonen
git clone <your-repo-url>
cd simple-order-system

# System starten
docker-compose up -d

# Logs anzeigen
docker-compose logs -f
```

### URLs

- **Bestelloberfläche**: http://localhost:8080
- **Kitchen Display**: http://localhost:8081
- **Backend API**: http://localhost:3000

## Entwicklung

### Lokale Entwicklung ohne Docker

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend
cd frontend
npm install
npm run dev

# Kitchen Display
cd kitchen-display
npm install
npm run dev
```

### Services einzeln starten

```bash
# Nur Datenbank
docker-compose -f docker/postgres.yml up -d

# Backend
docker-compose -f docker/backend.yml up -d

# Frontend
docker-compose -f docker/frontend.yml up -d

# Kitchen Display
docker-compose -f docker/kitchen-display.yml up -d
```

## Konfiguration

### Umgebungsvariablen

Erstelle eine `.env` Datei im Root:

```env
# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=orderdb
DB_USER=orderuser
DB_PASSWORD=your-secure-password

# Backend
PORT=3000
NODE_ENV=production
```

### Bondrucker einrichten

Die Drucker-Integration ist in `backend/src/index.ts` implementiert.

**USB-Drucker:**
```typescript
import escpos from 'escpos';
import USB from 'escpos-usb';

const device = new USB();
const printer = new escpos.Printer(device);

device.open(() => {
  printer
    .text('Tisch 5')
    .text('2x Bier')
    .cut()
    .close();
});
```

**Netzwerk-Drucker:**
```typescript
import escpos from 'escpos';
import Network from 'escpos-network';

const device = new Network('192.168.1.100', 9100);
```

Passe die Funktion `printReceipt()` in `backend/src/index.ts` an deine Drucker an.

## API Dokumentation

### Inventar

**GET** `/api/items` - Alle Artikel abrufen
```json
[
  {
    "id": 1,
    "name": "Bier 0.5l",
    "price": 5.50,
    "category": "Getränke",
    "printer_station": "bar",
    "active": true
  }
]
```

**POST** `/api/items` - Artikel erstellen
```json
{
  "name": "Pommes",
  "price": 4.50,
  "category": "Essen",
  "printer_station": "kitchen"
}
```

### Bestellungen

**GET** `/api/orders` - Offene Bestellungen
```json
[
  {
    "id": 1,
    "table_number": 5,
    "status": "pending",
    "total": 11.00,
    "created_at": "2026-01-23T10:30:00Z",
    "items": [...]
  }
]
```

**POST** `/api/orders` - Bestellung erstellen
```json
{
  "table_number": 5,
  "items": [
    {
      "id": 1,
      "quantity": 2,
      "price": 5.50,
      "notes": "Kalt bitte"
    }
  ]
}
```

**PATCH** `/api/orders/:id/complete` - Bestellung abschließen

## Zahlungsintegration

Das System zeigt die Gesamtsumme an. Die eigentliche Zahlung erfolgt extern:

- **Bar**: Manuell kassieren
- **SumUp**: Terminal nutzen
- **Twint**: Via RaiseNow QR-Code

## Deployment

### GitHub Actions

Bei jedem Push auf `main` werden automatisch Docker-Images gebaut und zu GitHub Container Registry gepusht.

Images abrufen:
```bash
docker pull ghcr.io/<username>/order-system-backend:latest
docker pull ghcr.io/<username>/order-system-frontend:latest
docker pull ghcr.io/<username>/order-system-kitchen:latest
```

### Produktion

Für Production mit eigenen Images:

```bash
# docker-compose.prod.yml erstellen
version: '3.8'
services:
  backend:
    image: ghcr.io/<username>/order-system-backend:latest
    # ... rest der config
```

## Hardware-Empfehlungen

**Bestellterminal:**
- Tablet (Android/iPad) oder Laptop
- Stabiles WLAN

**Kitchen Display:**
- Monitor 24"+ oder Tablet
- Feste Montierung in Küche/Bar

**Bondrucker:**
- ESC/POS-kompatibel (z.B. Epson TM-T20, Star TSP650)
- USB oder Netzwerk-Verbindung
- Thermodrucker (keine Tinte nötig)

**Netzwerk:**
- WLAN Router mit 5 GHz
- Optional: LAN für stabile Verbindung
- USV für Drucker bei Stromausfall

## 📚 Dokumentation

- **[QUICKSTART.md](QUICKSTART.md)** - In 5 Minuten zum laufenden System
- **[SETUP.md](SETUP.md)** - Detaillierte Einrichtung & Konfiguration
- **[STRUCTURE.md](STRUCTURE.md)** - Projektstruktur & Architektur
- **[PAYMENTS.md](PAYMENTS.md)** - 💳 Payment-Integration (SumUp, TWINT, RaiseNow)
- **[SUMUP-3G.md](SUMUP-3G.md)** - 📱 SumUp 3G Terminal Integration (Cloud API)

## Lizenz

MIT - Frei verwendbar für kommerzielle und private Zwecke

## Support

Probleme? Issues auf GitHub erstellen oder PR einreichen!

## Roadmap

- [ ] Mobile App (React Native)
- [ ] Tischplan-Ansicht
- [ ] Statistiken & Reports
- [ ] Multi-Fest Support
- [ ] Offline-Modus
- [ ] Kassenbon-Druck für Kunden
