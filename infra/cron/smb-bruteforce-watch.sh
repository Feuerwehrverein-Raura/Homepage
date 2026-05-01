#!/bin/bash
# DEUTSCH: Ueberwacht den Samba-Log auf Brute-Force-Angriffe.
# Wenn eine IP innerhalb 1 Stunde 10+ fehlgeschlagene Login-Versuche hat,
# werden alle Passwoerter sofort rotiert.
# Wird per Crontab alle 5 Minuten ausgefuehrt: */5 * * * * /opt/docker/fwv-website/cron/smb-bruteforce-watch.sh >> /var/log/fwv-smb-bruteforce.log 2>&1

SAMBA_LOG="/opt/docker/data/samba-log/samba.log"
ROTATE_SCRIPT="/opt/docker/fwv-website/cron/smb-rotate-passwords.sh"
STATE_FILE="/tmp/smb-bruteforce-rotated"
THRESHOLD=10
LOG_PREFIX="[SMB-BruteForce]"

# Pruefen ob Samba-Log existiert
if [ ! -f "$SAMBA_LOG" ]; then
    exit 0
fi

# Bereits innerhalb der letzten 30 Minuten rotiert? Dann nicht nochmal.
if [ -f "$STATE_FILE" ]; then
    LAST_ROTATE=$(stat -c %Y "$STATE_FILE" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    DIFF=$((NOW - LAST_ROTATE))
    if [ "$DIFF" -lt 1800 ]; then
        exit 0
    fi
fi

# Fehlgeschlagene Logins der letzten Stunde zaehlen (pro IP)
ONE_HOUR_AGO=$(date -d '1 hour ago' '+%Y/%m/%d %H:%M:%S' 2>/dev/null || date -v-1H '+%Y/%m/%d %H:%M:%S' 2>/dev/null)

# Samba loggt Authentication-Fehler mit "NT_STATUS_LOGON_FAILURE" oder "Authentication for user" failed
# Format variiert je nach Log-Level, suche nach gaengigen Mustern
FAILED_IPS=$(grep -E "NT_STATUS_LOGON_FAILURE|Authentication.*failed|LOGON_FAILURE" "$SAMBA_LOG" 2>/dev/null \
    | grep -oP '\d+\.\d+\.\d+\.\d+' \
    | sort | uniq -c | sort -rn)

if [ -z "$FAILED_IPS" ]; then
    exit 0
fi

# Pruefen ob eine IP den Schwellwert ueberschritten hat
TRIGGER=false
while read -r count ip; do
    [ -z "$count" ] && continue
    if [ "$count" -ge "$THRESHOLD" ]; then
        echo "$LOG_PREFIX $(date '+%Y-%m-%d %H:%M:%S') WARNUNG: IP $ip hat $count fehlgeschlagene Login-Versuche!"
        TRIGGER=true
    fi
done <<< "$FAILED_IPS"

if [ "$TRIGGER" = true ]; then
    echo "$LOG_PREFIX Brute-Force erkannt! Starte sofortige Passwort-Rotation..."

    # Rotation ausfuehren
    bash "$ROTATE_SCRIPT"

    # State-File setzen um doppelte Rotation zu verhindern
    touch "$STATE_FILE"

    # Samba-Log rotieren (alte Eintraege entfernen)
    > "$SAMBA_LOG"
    echo "$LOG_PREFIX Samba-Log geleert nach Rotation"
fi
