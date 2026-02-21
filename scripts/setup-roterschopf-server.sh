#!/bin/bash
# =============================================================================
# Setup-Script: WireGuard (Docker) + Authentik LDAP Outpost
# Auf dem Hetzner VPS (docker.fwv-raura.ch) ausfuehren
#
# WireGuard laeuft als Docker-Container (linuxserver/wireguard) mit host networking.
# Port 51821 (nicht 51820 — belegt durch Netbird).
# Config wird in ./data/wireguard/ abgelegt (Bind Mount).
# =============================================================================
set -euo pipefail

WG_PORT=51821
WG_SERVER_IP="10.10.0.1/24"
WG_CLIENT_IP="10.10.0.2/32"
DOCKER_DIR="/opt/docker"
WG_CONFIG_DIR="${DOCKER_DIR}/data/wireguard/wg_confs"

echo "=== WireGuard Server Setup (Docker) fuer Roter Schopf Laptop ==="
echo "  Port ${WG_PORT} (Netbird belegt 51820)"
echo "  Config: ${WG_CONFIG_DIR}/wg0.conf"
echo ""

# --- Schritt 1: Config-Verzeichnis erstellen ---
echo "[1/4] Erstelle Config-Verzeichnis..."
mkdir -p "${WG_CONFIG_DIR}"

# --- Schritt 2: Keys generieren ---
# wg-tools werden fuer die Schluesselgenerierung benoetigt
if ! command -v wg &> /dev/null; then
    echo "  Installiere wireguard-tools fuer Schluesselgenerierung..."
    apt update && apt install -y wireguard-tools
fi

KEYS_DIR="${DOCKER_DIR}/data/wireguard"
if [ ! -f "${KEYS_DIR}/server_private.key" ]; then
    echo "[2/4] Generiere Server-Keys..."
    wg genkey | tee "${KEYS_DIR}/server_private.key" | wg pubkey > "${KEYS_DIR}/server_public.key"
    chmod 600 "${KEYS_DIR}/server_private.key"
    echo "  Server Public Key: $(cat "${KEYS_DIR}/server_public.key")"
    echo "  -> Diesen Key auf dem Laptop in wg0.conf eintragen!"
else
    echo "[2/4] Server-Keys existieren bereits."
    echo "  Server Public Key: $(cat "${KEYS_DIR}/server_public.key")"
fi

SERVER_PRIVKEY=$(cat "${KEYS_DIR}/server_private.key")

# --- Schritt 3: WireGuard-Konfiguration erstellen ---
if [ ! -f "${WG_CONFIG_DIR}/wg0.conf" ]; then
    echo "[3/4] Erstelle WireGuard-Konfiguration..."
    echo ""
    echo "ACHTUNG: Du musst den Public Key des Laptops eintragen!"
    echo "Fuehre zuerst das Laptop-Script aus und kopiere den Public Key hierhin."
    echo ""
    read -p "Laptop Public Key eingeben (oder Enter zum Ueberspringen): " LAPTOP_PUBKEY

    cat > "${WG_CONFIG_DIR}/wg0.conf" << EOF
[Interface]
Address = ${WG_SERVER_IP}
ListenPort = ${WG_PORT}
PrivateKey = ${SERVER_PRIVKEY}

# Roter Schopf Laptop
[Peer]
PublicKey = ${LAPTOP_PUBKEY:-HIER_LAPTOP_PUBLIC_KEY_EINTRAGEN}
AllowedIPs = ${WG_CLIENT_IP}
EOF

    chmod 600 "${WG_CONFIG_DIR}/wg0.conf"
    echo "  Konfiguration erstellt: ${WG_CONFIG_DIR}/wg0.conf"
else
    echo "[3/4] WireGuard-Konfiguration existiert bereits."
    echo "  Falls der Laptop-Key noch fehlt, editiere: ${WG_CONFIG_DIR}/wg0.conf"
fi

# --- Schritt 4: Docker-Container starten ---
echo "[4/4] Starte WireGuard Docker-Container..."
cd "${DOCKER_DIR}"
docker compose -f docker-compose.prod.yml --env-file .env up -d wireguard

# Kurz warten bis Interface da ist
sleep 3

# Pruefen ob wg0 erstellt wurde
if ip addr show wg0 &>/dev/null; then
    echo "  wg0 Interface erstellt!"
    echo "  $(ip -4 addr show wg0 | grep inet)"
else
    echo "  WARNUNG: wg0 Interface nicht gefunden. Pruefe Container-Logs:"
    echo "  docker logs wireguard"
fi

# Firewall (falls ufw aktiv)
if command -v ufw &> /dev/null && ufw status | grep -q "active"; then
    ufw allow ${WG_PORT}/udp
    echo "  Firewall: Port ${WG_PORT}/UDP geoeffnet"
fi

echo ""
echo "=== WireGuard Server bereit ==="
echo "Server Public Key: $(cat "${KEYS_DIR}/server_public.key")"
echo "Server WireGuard IP: 10.10.0.1"
echo "Server Endpoint: docker.fwv-raura.ch:${WG_PORT}"
echo ""
echo "=== Naechste Schritte ==="
echo "1. Authentik LDAP Outpost in Admin-UI erstellen:"
echo "   https://auth.fwv-raura.ch/if/admin/"
echo "   -> Providers -> Create -> LDAP Provider (Name: ldap-roterschopf)"
echo "   -> Applications -> Create (Name: LDAP Roter Schopf, Provider: ldap-roterschopf)"
echo "   -> Outposts -> Create (Type: LDAP, Application: LDAP Roter Schopf)"
echo ""
echo "2. Outpost-Token in ${DOCKER_DIR}/.env eintragen:"
echo "   AUTHENTIK_LDAP_OUTPOST_TOKEN=<token>"
echo ""
echo "3. LDAP Container starten:"
echo "   cd ${DOCKER_DIR} && docker compose -f docker-compose.prod.yml --env-file .env up -d authentik-ldap"
echo ""
echo "4. Laptop-Script ausfuehren und Laptop-Public-Key hier eintragen:"
echo "   nano ${WG_CONFIG_DIR}/wg0.conf"
echo "   docker restart wireguard"
