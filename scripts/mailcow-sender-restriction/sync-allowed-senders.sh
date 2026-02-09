#!/bin/bash
# Synchronisiert die erlaubten Absender fuer mitglieder@fwv-raura.ch
# Holt die Mitglieder-Emails von der Members-API und schreibt sie in die Rspamd-Map
#
# Aufruf: ./sync-allowed-senders.sh
# Cron:   */15 * * * * /opt/mailcow-dockerized/scripts/sync-allowed-senders.sh >> /var/log/mailcow-sender-sync.log 2>&1

set -euo pipefail

# Konfiguration
API_URL="${MEMBERS_API_URL:-https://api.fwv-raura.ch}"
API_KEY="${INTERNAL_API_KEY:?INTERNAL_API_KEY muss gesetzt sein}"
MAP_FILE="/opt/mailcow-dockerized/data/conf/rspamd/local.d/mitglieder_allowed_senders.map"
RSPAMD_CONTAINER="mailcow-rspamd-mailcow-1"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starte Sync erlaubte Absender..."

# Mitglieder-Emails von API holen
RESPONSE=$(curl -sf "${API_URL}/internal/allowed-senders?key=${API_KEY}" 2>&1) || {
    echo "FEHLER: API nicht erreichbar: ${RESPONSE}"
    exit 1
}

# Pruefen ob die Antwort nicht leer ist
if [ -z "$RESPONSE" ]; then
    echo "WARNUNG: Leere Antwort von API, Map wird nicht aktualisiert"
    exit 0
fi

EMAIL_COUNT=$(echo "$RESPONSE" | wc -l)

# Map-Datei aktualisieren
echo "$RESPONSE" > "${MAP_FILE}.tmp"
mv "${MAP_FILE}.tmp" "$MAP_FILE"

echo "Map aktualisiert: ${EMAIL_COUNT} erlaubte Absender"

# Rspamd Map-Reload (Rspamd prueft Maps automatisch, aber wir koennen es erzwingen)
if docker exec "$RSPAMD_CONTAINER" rspamadm configtest > /dev/null 2>&1; then
    docker exec "$RSPAMD_CONTAINER" kill -HUP 1 2>/dev/null || true
    echo "Rspamd Map-Reload ausgeloest"
else
    echo "WARNUNG: Rspamd Container nicht erreichbar, Map wird beim naechsten Auto-Reload geladen"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Sync abgeschlossen"
