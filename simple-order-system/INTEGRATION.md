# 🔗 Integration mit Feuerwehrverein Homepage

Dieses Dokument beschreibt, wie das Order System mit dem bestehenden [Feuerwehrverein Raura Homepage-Projekt](https://github.com/Feuerwehrverein-Raura/Homepage) integriert werden kann.

## Übersicht

Beide Systeme können parallel laufen und sich gegenseitig ergänzen:

- **Homepage**: Event-Management, Kalender, Mitgliederverwaltung
- **Order System**: Bestellungen für Events (z.B. Chilbi)

## Gemeinsame Infrastruktur

### Docker Network

Beide Systeme können im selben Docker-Netzwerk laufen:

```yaml
# docker-compose.yml (Order System)
networks:
  fwv-raura:
    external: true
    name: fwv-raura-network

services:
  backend:
    networks:
      - fwv-raura
```

### Shared Database

Optional: Gemeinsame PostgreSQL-Datenbank verwenden:

```yaml
# Order System nutzt Homepage-Datenbank
services:
  backend:
    environment:
      DB_HOST: homepage-postgres
      DB_NAME: fwv_raura
```

### Nginx Reverse Proxy

Ein zentraler Nginx für beide Systeme:

```nginx
# nginx.conf

# Homepage
server {
    listen 80;
    server_name fwv-raura.ch www.fwv-raura.ch;
    
    location / {
        proxy_pass http://homepage-website:80;
    }
    
    location /api/ {
        proxy_pass http://homepage-api:3000/api/;
    }
}

# Order System
server {
    listen 80;
    server_name bestell.fwv-raura.ch;
    
    location / {
        proxy_pass http://order-frontend:80;
    }
    
    location /api/ {
        proxy_pass http://order-backend:3000/api/;
    }
}

# Kitchen Display
server {
    listen 80;
    server_name kueche.fwv-raura.ch;
    
    location / {
        proxy_pass http://kitchen-display:80;
    }
}
```

## Event-Integration

### Events mit Bestellsystem verknüpfen

In der Homepage können Events mit dem Bestellsystem verknüpft werden:

```markdown
---
id: chilbi-2025
title: Chilbi 2025
startDate: 2025-10-18T12:00:00
endDate: 2025-10-19T23:00:00
orderSystem: true
orderSystemUrl: https://bestell.fwv-raura.ch
---

# Chilbi 2025

Unsere jährliche Chilbi mit Bestellsystem!

**Bestellungen:** Online über [Bestellsystem](https://bestell.fwv-raura.ch)
```

### Homepage zeigt Bestellsystem-Link

```html
<!-- events.html -->
<div v-if="event.orderSystem" class="mt-4">
  <a 
    :href="event.orderSystemUrl" 
    class="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700"
    target="_blank"
  >
    🍔 Zum Bestellsystem
  </a>
</div>
```

## Authentifizierung

### Shared OIDC (Authentik)

Beide Systeme können denselben Authentik-Provider nutzen:

```javascript
// Order System - auth-config.js
export const oidcConfig = {
  authority: 'https://auth.fwv-raura.ch/application/o/fwv-raura/',
  client_id: 'order-system',
  redirect_uri: 'https://bestell.fwv-raura.ch/auth-callback.html',
  scope: 'openid profile email',
};
```

### Berechtigungen

Rollenzuordnung in Authentik:
- **Admin**: Voller Zugriff auf beide Systeme
- **Vorstand**: Homepage + Order System (Inventar, Anmeldungen)
- **Mitglied**: Homepage + Order System (nur Bestellungen)
- **Gast**: Nur Bestellungen (keine Authentifizierung nötig)

## Daten-Synchronisation

### Order → Homepage

Bestellungs-Statistiken können in die Homepage integriert werden:

```javascript
// Homepage API Endpoint
app.get('/api/stats/orders', async (req, res) => {
  const response = await fetch('http://order-backend:3000/api/orders/stats');
  const stats = await response.json();
  res.json(stats);
});
```

### Anzeige auf Homepage

```html
<!-- Event-Detail-Seite -->
<div class="stats">
  <h3>Live-Statistiken</h3>
  <p>Heutige Bestellungen: {{ orderStats.today }}</p>
  <p>Gesamtumsatz: CHF {{ orderStats.revenue }}</p>
</div>
```

## Payment-Integration

### Gemeinsame Payment-Provider

Beide Systeme können dieselben Payment-Credentials nutzen:

```bash
# Shared .env
SUMUP_API_KEY=sk_live_xxxxxxxxxxxx
SUMUP_MERCHANT_CODE=MXXXXXXXXX

RAISENOW_API_KEY=your-api-key
RAISENOW_API_SECRET=your-api-secret
```

### RaiseNow für Spenden UND Bestellungen

```javascript
// Homepage: Spenden
createDonation({
  amount: 50,
  purpose: 'Spende',
  reference: 'donation-123'
});

// Order System: Bestellungen
createPayment({
  amount: 45.50,
  purpose: 'Bestellung Tisch 5',
  reference: 'order-123'
});
```

## Docker Compose - Vollständige Integration

```yaml
version: '3.8'

networks:
  fwv-raura:
    driver: bridge

volumes:
  postgres_data:
  homepage_data:

services:
  # Shared PostgreSQL
  postgres:
    image: postgres:16-alpine
    networks:
      - fwv-raura
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: fwv_raura
      POSTGRES_USER: fwv_admin
      POSTGRES_PASSWORD: ${DB_PASSWORD}

  # Homepage API
  homepage-api:
    build: ./Homepage/api
    networks:
      - fwv-raura
    depends_on:
      - postgres
    environment:
      DB_HOST: postgres
      DB_NAME: fwv_raura

  # Homepage Website
  homepage-website:
    build: ./Homepage
    networks:
      - fwv-raura
    depends_on:
      - homepage-api

  # Order System Backend
  order-backend:
    build: ./simple-order-system/backend
    networks:
      - fwv-raura
    depends_on:
      - postgres
    environment:
      DB_HOST: postgres
      DB_NAME: fwv_raura

  # Order System Frontend
  order-frontend:
    build: ./simple-order-system/frontend
    networks:
      - fwv-raura
    depends_on:
      - order-backend

  # Kitchen Display
  kitchen-display:
    build: ./simple-order-system/kitchen-display
    networks:
      - fwv-raura
    depends_on:
      - order-backend

  # Nginx Reverse Proxy
  nginx:
    image: nginx:alpine
    networks:
      - fwv-raura
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - homepage-website
      - order-frontend
      - kitchen-display
```

## Deployment

### Option 1: Separate Repositories

```bash
# Beide Systeme separat deployen
cd Homepage && docker-compose up -d
cd simple-order-system && docker-compose up -d
```

### Option 2: Monorepo

```bash
fwv-raura/
├── homepage/           # Homepage Repository
├── order-system/       # Order System Repository
├── docker-compose.yml  # Gemeinsame Orchestrierung
└── nginx.conf          # Reverse Proxy Config
```

### Option 3: GitHub Actions

```yaml
# .github/workflows/deploy-all.yml
name: Deploy All Services

on:
  push:
    branches: [main]

jobs:
  deploy-homepage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy Homepage
        run: |
          cd homepage
          docker-compose build
          docker-compose up -d

  deploy-order-system:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy Order System
        run: |
          cd order-system
          docker-compose build
          docker-compose up -d
```

## Design-Konsistenz

### Gemeinsame Farbpalette

```css
/* Feuerwehr-Rot */
--primary-red: #dc2626;
--primary-red-hover: #b91c1c;

/* Feuerwehr-Gold */
--accent-gold: #fbbf24;

/* Neutrals */
--gray-900: #111827;
--gray-800: #1f2937;
--gray-50: #f9fafb;
```

### Tailwind Config (Order System)

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        'fwv-red': '#dc2626',
        'fwv-gold': '#fbbf24',
      }
    }
  }
}
```

### Header/Logo konsistent

```html
<!-- Order System Header -->
<header class="bg-fwv-red text-white p-4">
  <div class="flex items-center">
    <img src="/logo.png" alt="FWV Raura" class="h-12">
    <h1 class="ml-4 text-2xl font-bold">Bestellsystem</h1>
  </div>
</header>
```

## Monitoring

### Gemeinsames Monitoring

```yaml
# docker-compose.yml
services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    networks:
      - fwv-raura

  grafana:
    image: grafana/grafana
    networks:
      - fwv-raura
    depends_on:
      - prometheus
```

### Metriken sammeln

```javascript
// Beide APIs exportieren Metriken
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(`
    # HELP orders_total Total number of orders
    orders_total ${await getOrderCount()}
  `);
});
```

## Support & Wartung

### Gemeinsames Issue-Tracking

Issues können in beiden Repositories erstellt werden:
- Homepage-Issues: https://github.com/Feuerwehrverein-Raura/Homepage/issues
- Order-System-Issues: https://github.com/YOUR-ORG/simple-order-system/issues

### Kontakt

- **Webmaster**: webmaster@fwv-raura.ch
- **Technischer Support**: IT-Team Feuerwehrverein Raura

---

**Erstellt für Feuerwehrverein Raura Kaiseraugst** 🔥
