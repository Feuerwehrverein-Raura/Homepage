#!/bin/bash
# Tägliches PostgreSQL-Backup für alle Datenbanken
# Wird per Crontab ausgeführt: 0 2 * * * /opt/docker/fwv-website/cron/postgres-backup.sh >> /var/log/fwv-postgres-backup.log 2>&1

BACKUP_DIR="/opt/docker/backups/postgres"
RETENTION_DAYS=7
DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Alle PostgreSQL-Container mit ihren Zugangsdaten
# Format: container:datenbank:user
DATABASES=(
    "fwv-postgres:fwv_raura:fwv"
    "order-postgres:orderdb:orderuser"
    "authentik-postgresql:authentik:authentik"
    "inventory-postgres:inventorydb:inventoryuser"
)

echo "============================================"
echo "[$TIMESTAMP] PostgreSQL Backup gestartet"
echo "============================================"

# Backup-Verzeichnis erstellen
mkdir -p "$BACKUP_DIR"

SUCCESS=0
FAILED=0

for entry in "${DATABASES[@]}"; do
    IFS=':' read -r container db user <<< "$entry"
    BACKUP_FILE="${BACKUP_DIR}/${container}_${db}_${DATE}.sql.gz"

    echo -n "[$container] $db -> $BACKUP_FILE ... "

    if docker exec "$container" pg_dump -U "$user" -d "$db" --clean --if-exists 2>/dev/null | gzip > "$BACKUP_FILE"; then
        SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        echo "OK ($SIZE)"
        SUCCESS=$((SUCCESS + 1))
    else
        echo "FEHLER"
        rm -f "$BACKUP_FILE"
        FAILED=$((FAILED + 1))
    fi
done

# Alte Backups löschen (älter als RETENTION_DAYS Tage)
DELETED=$(find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
    echo "[$DELETED] alte Backups gelöscht (älter als $RETENTION_DAYS Tage)"
fi

echo "--------------------------------------------"
echo "Ergebnis: $SUCCESS OK, $FAILED fehlgeschlagen"
echo "Speicherplatz: $(du -sh "$BACKUP_DIR" | cut -f1)"
echo "============================================"
echo ""
