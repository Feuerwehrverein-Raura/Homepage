# Projektstruktur

```
simple-order-system/
├── .github/
│   └── workflows/
│       └── build.yml              # GitHub Actions für Container-Builds
├── backend/
│   ├── src/
│   │   └── index.ts               # Backend API & WebSocket Server
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx                # Bestelloberfläche
│   │   ├── main.tsx
│   │   └── index.css
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── tsconfig.json
├── kitchen-display/
│   ├── src/
│   │   ├── App.tsx                # Kitchen Display mit WebSocket
│   │   ├── main.tsx
│   │   └── index.css
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── docker/
│   ├── backend.yml                # Backend Service Definition
│   ├── frontend.yml               # Frontend Service Definition
│   ├── kitchen-display.yml        # Kitchen Display Service Definition
│   └── postgres.yml               # PostgreSQL Service Definition
├── docker-compose.yml             # Haupt-Orchestrierung
├── Makefile                       # Hilfreiche Commands
├── seed.sql                       # Beispiel-Daten
├── seed.sh                        # Seed-Script
├── .env.example                   # Umgebungsvariablen Template
├── .gitignore
├── README.md                      # Haupt-Dokumentation
└── SETUP.md                       # Setup-Anleitung

```

## Hauptkomponenten

### Backend (`backend/`)
- **Technologie**: Node.js, Express, TypeScript, PostgreSQL
- **Port**: 3000
- **Features**: REST API, WebSocket Server, Drucker-Integration

### Frontend (`frontend/`)
- **Technologie**: React, Vite, Tailwind CSS
- **Port**: 8080
- **Features**: Bestelloberfläche, Inventar-Verwaltung

### Kitchen Display (`kitchen-display/`)
- **Technologie**: React, Vite, Tailwind CSS, WebSocket
- **Port**: 8081
- **Features**: Live Order Updates, Station-Filter

### Docker Compose (`docker/`)
- Separate Service-Definitionen für bessere Wartbarkeit
- Modular erweiterbar

### GitHub Actions (`.github/workflows/`)
- Automatische Container-Builds bei Push
- Multi-Architektur Support (x86_64, ARM)
- Caching für schnellere Builds

## Datenfluss

```
Tablet/Handy (Frontend)
    ↓ HTTP POST
Backend API
    ↓ SQL INSERT
PostgreSQL
    ↓ WebSocket Broadcast
Kitchen Display (Live Update)
    ↓ ESC/POS
Bondrucker
```

## Wichtige Dateien

- **docker-compose.yml**: Startet alle Services
- **Makefile**: Vereinfacht Docker-Commands
- **seed.sql**: Beispieldaten für schnellen Start
- **.env.example**: Konfiguration Template
- **README.md**: Vollständige Dokumentation
- **SETUP.md**: Schritt-für-Schritt Setup

## Nächste Schritte

1. `.env` erstellen basierend auf `.env.example`
2. `make up` ausführen
3. `./seed.sh` für Beispieldaten
4. Loslegen! 🚀
