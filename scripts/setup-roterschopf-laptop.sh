#!/bin/bash
# =============================================================================
# Setup-Script: Linux Mint Laptop "Roter Schopf"
# WireGuard Client + SSSD (Authentik LDAP Login) + lokaler Fallback-Account
#
# Auf dem Laptop als root ausfuehren:
#   sudo bash setup-roterschopf-laptop.sh
# =============================================================================
set -euo pipefail

# --- Konfiguration ---
# HINWEIS: Port 51821 weil Netbird auf dem Server bereits 51820 belegt
WG_SERVER_ENDPOINT="docker.fwv-raura.ch:51821"
WG_SERVER_IP="10.10.0.1"
WG_CLIENT_IP="10.10.0.2/24"
LDAP_URI="ldap://${WG_SERVER_IP}:389"
LDAP_BASE_DN="dc=ldap,dc=goauthentik,dc=io"
LOCAL_USER="roterschopf"

echo "=== Roter Schopf Laptop Setup ==="
echo "Linux Mint + WireGuard VPN + Authentik LDAP Login"
echo ""

# Pruefe ob root
if [ "$(id -u)" -ne 0 ]; then
    echo "FEHLER: Bitte als root ausfuehren (sudo bash $0)"
    exit 1
fi

# =============================================================================
# TEIL 1: WireGuard Client
# =============================================================================
echo "--- Teil 1: WireGuard VPN ---"

apt update
apt install -y wireguard

# Keys generieren
if [ ! -f /etc/wireguard/client_private.key ]; then
    echo "Generiere WireGuard-Keys..."
    wg genkey | tee /etc/wireguard/client_private.key | wg pubkey > /etc/wireguard/client_public.key
    chmod 600 /etc/wireguard/client_private.key
fi

CLIENT_PRIVKEY=$(cat /etc/wireguard/client_private.key)
CLIENT_PUBKEY=$(cat /etc/wireguard/client_public.key)

echo ""
echo "========================================="
echo "  LAPTOP PUBLIC KEY (auf Server eintragen!):"
echo "  ${CLIENT_PUBKEY}"
echo "========================================="
echo ""

# Server Public Key abfragen
if [ ! -f /etc/wireguard/wg0.conf ]; then
    read -p "Server Public Key eingeben: " SERVER_PUBKEY

    if [ -z "$SERVER_PUBKEY" ]; then
        echo "FEHLER: Server Public Key ist erforderlich!"
        echo "Fuehre zuerst das Server-Script aus und kopiere den Public Key."
        exit 1
    fi

    cat > /etc/wireguard/wg0.conf << EOF
[Interface]
Address = ${WG_CLIENT_IP}
PrivateKey = ${CLIENT_PRIVKEY}

[Peer]
PublicKey = ${SERVER_PUBKEY}
Endpoint = ${WG_SERVER_ENDPOINT}
AllowedIPs = ${WG_SERVER_IP}/32
PersistentKeepalive = 25
EOF

    chmod 600 /etc/wireguard/wg0.conf
    echo "WireGuard-Konfiguration erstellt."
else
    echo "WireGuard-Konfiguration existiert bereits."
fi

# WireGuard starten
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0 2>/dev/null || systemctl restart wg-quick@wg0

echo "Teste VPN-Verbindung..."
if ping -c 2 -W 3 "${WG_SERVER_IP}" > /dev/null 2>&1; then
    echo "  VPN-Verbindung OK!"
else
    echo "  WARNUNG: VPN-Verbindung fehlgeschlagen!"
    echo "  Stelle sicher, dass der Server-Key korrekt ist und WireGuard auf dem Server laeuft."
    echo "  Weiter mit SSSD-Setup (kann spaeter getestet werden)..."
fi

# =============================================================================
# TEIL 2: SSSD (LDAP Login via Authentik)
# =============================================================================
echo ""
echo "--- Teil 2: SSSD (Authentik LDAP Login) ---"

apt install -y sssd sssd-ldap libpam-sss libnss-sss

# Service-Account fuer LDAP-Suche
echo ""
echo "SSSD braucht einen Service-Account fuer LDAP-Suchen."
echo "Erstelle in Authentik einen User 'ldapservice' und notiere das Passwort."
echo ""
read -p "LDAP Service-Account Benutzername [ldapservice]: " LDAP_BIND_USER
LDAP_BIND_USER=${LDAP_BIND_USER:-ldapservice}
read -sp "LDAP Service-Account Passwort: " LDAP_BIND_PASS
echo ""

LDAP_BIND_DN="cn=${LDAP_BIND_USER},ou=users,${LDAP_BASE_DN}"

cat > /etc/sssd/sssd.conf << EOF
[sssd]
services = nss, pam
domains = fwv-raura

[nss]
# Nicht in LDAP suchen wenn User am Login-Screen aufgelistet werden
# (verhindert haengendes Login wenn VPN offline)
filter_users = root,nobody
filter_groups = root,nogroup

[pam]
# Offline-Authentifizierung erlauben
offline_credentials_expiration = 7
offline_failed_login_attempts = 3

[domain/fwv-raura]
id_provider = ldap
auth_provider = ldap
chpass_provider = ldap

ldap_uri = ${LDAP_URI}
ldap_search_base = ${LDAP_BASE_DN}
ldap_user_search_base = ou=users,${LDAP_BASE_DN}
ldap_group_search_base = ou=groups,${LDAP_BASE_DN}

# Bind-Account (Authentik Service-User mit Suchrechten)
ldap_default_bind_dn = ${LDAP_BIND_DN}
ldap_default_authtok = ${LDAP_BIND_PASS}

# Authentik LDAP Outpost Attribute Mapping
ldap_user_object_class = user
ldap_user_name = cn
ldap_user_uid_number = uidNumber
ldap_user_gid_number = gidNumber
ldap_user_home_directory = homeDirectory
ldap_user_shell = loginShell
ldap_group_object_class = group
ldap_group_name = cn

# Sicherheit & Performance
ldap_id_use_start_tls = false
cache_credentials = true
entry_cache_timeout = 300

# UID/GID Bereich (keine Kollision mit lokalen Accounts)
min_id = 10000
max_id = 60000

# Defaults fuer LDAP-User
default_shell = /bin/bash
fallback_homedir = /home/%u

# Verbindungs-Timeouts (wichtig wenn VPN mal offline)
ldap_network_timeout = 5
ldap_opt_timeout = 5
dns_resolver_timeout = 5
EOF

chmod 600 /etc/sssd/sssd.conf
chown root:root /etc/sssd/sssd.conf

# NSSwitch konfigurieren
echo "Konfiguriere NSSwitch..."
if ! grep -q "sss" /etc/nsswitch.conf; then
    sed -i 's/^passwd:.*/passwd:         files sss/' /etc/nsswitch.conf
    sed -i 's/^group:.*/group:          files sss/' /etc/nsswitch.conf
    sed -i 's/^shadow:.*/shadow:         files sss/' /etc/nsswitch.conf
    echo "  NSSwitch angepasst."
else
    echo "  NSSwitch bereits konfiguriert."
fi

# PAM: Automatische Home-Verzeichnis-Erstellung
echo "Aktiviere automatische Home-Verzeichnis-Erstellung..."
pam-auth-update --enable mkhomedir

# SSSD starten
systemctl enable sssd
systemctl restart sssd

echo "SSSD konfiguriert und gestartet."

# =============================================================================
# TEIL 3: Lokaler Fallback-Account "roterschopf"
# =============================================================================
echo ""
echo "--- Teil 3: Lokaler Fallback-Account ---"

if ! id "${LOCAL_USER}" &>/dev/null; then
    echo "Erstelle lokalen Account '${LOCAL_USER}'..."
    adduser --gecos "Roter Schopf" "${LOCAL_USER}"
    echo "  Account '${LOCAL_USER}' erstellt."
else
    echo "  Account '${LOCAL_USER}' existiert bereits."
fi

# =============================================================================
# TEIL 4: Firewall (optional)
# =============================================================================
echo ""
echo "--- Teil 4: Firewall ---"

if command -v ufw &> /dev/null; then
    ufw --force enable
    ufw default deny incoming
    ufw default allow outgoing
    echo "  Firewall aktiviert (eingehend blockiert, ausgehend erlaubt)."
else
    echo "  ufw nicht installiert, ueberspringe Firewall-Setup."
fi

# =============================================================================
# FERTIG
# =============================================================================
echo ""
echo "==========================================="
echo "  SETUP ABGESCHLOSSEN!"
echo "==========================================="
echo ""
echo "Laptop Public Key (auf Server eintragen!):"
echo "  ${CLIENT_PUBKEY}"
echo ""
echo "Zusammenfassung:"
echo "  - WireGuard VPN: ${WG_CLIENT_IP} -> ${WG_SERVER_ENDPOINT}"
echo "  - SSSD/LDAP: Authentik-User koennen sich am Desktop anmelden"
echo "  - Fallback: Lokaler Account '${LOCAL_USER}' vorhanden"
echo "  - Offline: Cached Credentials aktiv (7 Tage gueltig)"
echo ""
echo "Testen:"
echo "  1. VPN:  ping ${WG_SERVER_IP}"
echo "  2. LDAP: ldapsearch -x -H ${LDAP_URI} -b '${LDAP_BASE_DN}'"
echo "  3. User: id <authentik-username>"
echo "  4. Login: Abmelden und mit Authentik-Benutzername einloggen"
echo ""
echo "Troubleshooting:"
echo "  - SSSD Logs:     journalctl -u sssd -f"
echo "  - WireGuard:     wg show"
echo "  - SSSD Cache:    sss_cache -E  (Cache leeren)"
echo "  - SSSD Neustart: systemctl restart sssd"
