# Einkaufs-PWA — Deployment (einkauf.fwv-raura.ch)

Die PWA ist ein statisches Frontend, das das bestehende **Inventar-Backend**
(`inventar.fwv-raura.ch/api`) nutzt. Kein eigenes Backend, keine eigene DB.

## Build (per CI)

Bei Merge auf `main` baut die CI (`build-containers.yml`) **zwei** Images:
`einkauf-frontend:latest` (die PWA) **und** `inventory-backend:latest` (das
Backend hat neue Endpoints/Tabellen für die PWA bekommen). Der Compose-Service
`einkauf-frontend` liegt in `simple-inventory-system/docker-compose.prod.yml`.

> **Deploy ist manuell** — Watchtower zieht die App-Images **nicht** selbst.
> Nach dem CI-Build immer per Hand `pull` + `up -d` (siehe Schritt 3), und zwar
> **beide** Services (`inventory-backend` + `einkauf-frontend`).

## Einmalige manuelle Schritte (vor dem ersten Livegang)

1. **DNS**: A/AAAA-Record `einkauf.fwv-raura.ch` → Server-IP (wie die anderen
   Subdomains). Traefik holt das Let's-Encrypt-Zertifikat automatisch.

2. **Authentik**: In der App **`inventory-system`** (Provider „Inventory System
   OAuth2") die erlaubte **Redirect-URI** ergänzen:
   `https://einkauf.fwv-raura.ch/auth/callback`
   (Sonst schlägt der Login mit „invalid redirect_uri" fehl.)

3. **Deploy** auf dem Server (beide Services — das Backend hat neue Endpoints):
   ```
   cd /opt/docker/simple-inventory-system   # bzw. der Ablageort des Inventar-Stacks
   docker compose -f docker-compose.prod.yml pull inventory-backend einkauf-frontend
   docker compose -f docker-compose.prod.yml up -d inventory-backend einkauf-frontend
   ```
   Das `inventory-backend`-Update ist additiv (idempotente Migrationen), das
   bestehende Inventar-Frontend bleibt unberührt.

## Optional: Push-Erinnerungen aktivieren

Ohne VAPID-Keys sind Push-Erinnerungen inaktiv (der „Erinnerung"-Button meldet
„nicht konfiguriert", die Endpoints liefern 503 — nichts bricht).

Zum Aktivieren:
1. Keys erzeugen: `npx web-push generate-vapid-keys`
2. In das `.env` des Inventar-Stacks eintragen:
   ```
   VAPID_PUBLIC_KEY=…
   VAPID_PRIVATE_KEY=…
   VAPID_SUBJECT=mailto:vorstand@fwv-raura.ch
   ```
3. `docker compose -f docker-compose.prod.yml up -d inventory-backend`

Der Erinnerungs-Job prüft alle 12 h Events mit Deadline in ≤ 3 Tagen und
offenen Positionen und schickt max. 1× pro Tag und Event eine Push-Nachricht.

## Konfiguration (Build-Args / VITE_*)

| Variable | Default |
|---|---|
| `VITE_API_URL` | `https://inventar.fwv-raura.ch/api` |
| `VITE_WS_URL` | `wss://inventar.fwv-raura.ch/ws` |
| `VITE_AUTHENTIK_URL` | `https://auth.fwv-raura.ch` |
| `VITE_AUTHENTIK_CLIENT_ID` | `inventory-system` |
