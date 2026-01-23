#!/bin/bash
# Cron script to send daily shift reminders
# This script should be added to the server's crontab
# Example: 0 8 * * * /opt/fwv-raura/cron/shift-reminders.sh >> /var/log/fwv-reminders.log 2>&1

# Send reminders via Docker exec (runs inside container network)
docker exec fwv-api-events wget -qO- --post-data="" http://localhost:3000/reminders/send-daily

# Alternative: Use external API (requires authentication)
# curl -s -X POST https://api.fwv-raura.ch/reminders/send-daily
