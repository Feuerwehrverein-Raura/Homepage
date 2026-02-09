#!/bin/bash
# Setup-Skript fuer Mailcow Absenderbeschraenkung auf mitglieder@fwv-raura.ch
#
# Dieses Skript:
# 1. Kopiert Rspamd-Konfigurationen in die Mailcow-Verzeichnisse
# 2. Richtet den Sync-Cron ein
# 3. Fuehrt den initialen Sync durch
#
# Voraussetzungen:
# - Mailcow installiert unter /opt/mailcow-dockerized
# - INTERNAL_API_KEY gesetzt (gleicher Key wie im Members-Backend)
#
# Ausfuehren auf dem Mailcow-Server:
#   INTERNAL_API_KEY=dein-key bash setup.sh

set -euo pipefail

MAILCOW_DIR="/opt/mailcow-dockerized"
RSPAMD_LOCAL_D="${MAILCOW_DIR}/data/conf/rspamd/local.d"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Mailcow Absenderbeschraenkung Setup ==="
echo ""

# Pruefen ob Mailcow installiert ist
if [ ! -d "$MAILCOW_DIR" ]; then
    echo "FEHLER: Mailcow nicht gefunden unter ${MAILCOW_DIR}"
    exit 1
fi

# Pruefen ob INTERNAL_API_KEY gesetzt ist
if [ -z "${INTERNAL_API_KEY:-}" ]; then
    echo "FEHLER: INTERNAL_API_KEY ist nicht gesetzt"
    echo "Aufruf: INTERNAL_API_KEY=dein-key bash setup.sh"
    exit 1
fi

# Rspamd local.d Verzeichnis erstellen falls noetig
mkdir -p "$RSPAMD_LOCAL_D"

# 1. Map-Dateien kopieren
echo "1. Kopiere Map-Dateien..."
cp "${SCRIPT_DIR}/mitglieder_recipients.map" "${RSPAMD_LOCAL_D}/"
cp "${SCRIPT_DIR}/mitglieder_allowed_domains.map" "${RSPAMD_LOCAL_D}/"
# Leere Senders-Map erstellen (wird vom Sync gefuellt)
touch "${RSPAMD_LOCAL_D}/mitglieder_allowed_senders.map"
echo "   Map-Dateien kopiert nach ${RSPAMD_LOCAL_D}/"

# 2. Rspamd-Konfiguration
echo "2. Rspamd-Konfiguration..."

# Multimap: Pruefen ob bereits vorhanden, sonst anhaengen
if [ -f "${RSPAMD_LOCAL_D}/multimap.conf" ]; then
    if grep -q "MITGLIEDER_RCPT" "${RSPAMD_LOCAL_D}/multimap.conf"; then
        echo "   multimap.conf: Mitglieder-Regeln bereits vorhanden, uebersprungen"
    else
        echo "" >> "${RSPAMD_LOCAL_D}/multimap.conf"
        cat "${SCRIPT_DIR}/multimap.conf" >> "${RSPAMD_LOCAL_D}/multimap.conf"
        echo "   multimap.conf: Mitglieder-Regeln angehaengt"
    fi
else
    cp "${SCRIPT_DIR}/multimap.conf" "${RSPAMD_LOCAL_D}/"
    echo "   multimap.conf: Neu erstellt"
fi

# Composites: Pruefen ob bereits vorhanden
if [ -f "${RSPAMD_LOCAL_D}/composites.conf" ]; then
    if grep -q "REJECT_UNAUTHORIZED_MITGLIEDER" "${RSPAMD_LOCAL_D}/composites.conf"; then
        echo "   composites.conf: Mitglieder-Regel bereits vorhanden, uebersprungen"
    else
        echo "" >> "${RSPAMD_LOCAL_D}/composites.conf"
        cat "${SCRIPT_DIR}/composites.conf" >> "${RSPAMD_LOCAL_D}/composites.conf"
        echo "   composites.conf: Mitglieder-Regel angehaengt"
    fi
else
    cp "${SCRIPT_DIR}/composites.conf" "${RSPAMD_LOCAL_D}/"
    echo "   composites.conf: Neu erstellt"
fi

# 3. Sync-Skript installieren
echo "3. Sync-Skript installieren..."
SYNC_SCRIPT="${MAILCOW_DIR}/scripts/sync-allowed-senders.sh"
mkdir -p "${MAILCOW_DIR}/scripts"
cp "${SCRIPT_DIR}/sync-allowed-senders.sh" "$SYNC_SCRIPT"
chmod +x "$SYNC_SCRIPT"
echo "   Sync-Skript installiert: ${SYNC_SCRIPT}"

# 4. Environment-Datei fuer Cron erstellen
echo "4. Environment-Datei fuer Cron..."
ENV_FILE="${MAILCOW_DIR}/scripts/.env.sender-sync"
cat > "$ENV_FILE" << EOF
MEMBERS_API_URL=https://api.fwv-raura.ch
INTERNAL_API_KEY=${INTERNAL_API_KEY}
EOF
chmod 600 "$ENV_FILE"
echo "   Environment gespeichert: ${ENV_FILE}"

# 5. Cron-Job einrichten (alle 15 Minuten)
echo "5. Cron-Job einrichten..."
CRON_LINE="*/15 * * * * . ${ENV_FILE} && ${SYNC_SCRIPT} >> /var/log/mailcow-sender-sync.log 2>&1"
# Bestehenden Cron entfernen falls vorhanden
(crontab -l 2>/dev/null | grep -v "sync-allowed-senders" ; echo "$CRON_LINE") | crontab -
echo "   Cron eingerichtet: alle 15 Minuten"

# 6. Initialer Sync
echo "6. Initialer Sync durchfuehren..."
export MEMBERS_API_URL="https://api.fwv-raura.ch"
bash "$SYNC_SCRIPT"

# 7. Rspamd neu starten
echo "7. Rspamd neu starten..."
cd "$MAILCOW_DIR"
docker compose restart rspamd-mailcow
echo "   Rspamd neugestartet"

echo ""
echo "=== Setup abgeschlossen ==="
echo ""
echo "Zusammenfassung:"
echo "  - Rspamd prueft nun Absender fuer mitglieder@fwv-raura.ch"
echo "  - Alle @fwv-raura.ch Adressen koennen immer senden"
echo "  - Mitglieder-Emails werden alle 15 Min von der API synchronisiert"
echo "  - Log: /var/log/mailcow-sender-sync.log"
echo ""
echo "Testen: Sende eine Test-E-Mail von einer nicht-erlaubten Adresse"
echo "        an mitglieder@fwv-raura.ch - sie sollte abgelehnt werden."
