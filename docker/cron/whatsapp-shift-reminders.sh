#!/bin/bash
# Cron script for WhatsApp shift reminders via Matrix
#
# Add these two entries to the server's crontab:
# 0 18 * * * /opt/fwv-raura/cron/whatsapp-shift-reminders.sh evening >> /var/log/fwv-whatsapp-reminders.log 2>&1
# 0 9 * * * /opt/fwv-raura/cron/whatsapp-shift-reminders.sh morning >> /var/log/fwv-whatsapp-reminders.log 2>&1
#
# evening (18:00): Reminds about shifts TOMORROW before 12:00
# morning (09:00): Reminds about shifts TODAY after 12:00

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
