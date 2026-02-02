#!/bin/bash
# Cron script for WhatsApp shift reminders via Matrix
#
# Sends reminders to all Vorstand members (Aktuar, Kassier) who have Matrix config
#
# Add these entries to the server's crontab:
#
# WhatsApp reminders:
# 0 18 * * * /opt/fwv-raura/cron/whatsapp-shift-reminders.sh evening >> /var/log/fwv-whatsapp-reminders.log 2>&1
# 0 9 * * * /opt/fwv-raura/cron/whatsapp-shift-reminders.sh morning >> /var/log/fwv-whatsapp-reminders.log 2>&1
#
# Email reminders (existing):
# 0 15 * * * /opt/fwv-raura/cron/shift-reminders.sh >> /var/log/fwv-reminders.log 2>&1
#
# Schedule:
# - 15:00: Email reminders for shifts TOMORROW (all shifts)
# - 18:00: WhatsApp reminders for shifts TOMORROW before 12:00 (morning shifts)
# - 09:00: WhatsApp reminders for shifts TODAY after 12:00 (afternoon/evening shifts)

MODE=${1:-evening}
API_KEY=${API_KEY:-$(cat /opt/fwv-raura/.env | grep API_KEY | cut -d'=' -f2)}

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Sending WhatsApp shift reminders (mode: $MODE)"

# Send reminders via Docker exec
docker exec fwv-api-events wget -qO- \
    --header="X-API-Key: $API_KEY" \
    --header="Content-Type: application/json" \
    --post-data="{\"mode\":\"$MODE\"}" \
    http://localhost:3000/reminders/send-whatsapp

echo ""
