#!/bin/bash
# Cron script to send daily shift reminders
# This script should be added to the server's crontab
# Example: 0 8 * * * /opt/fwv-raura/docker/cron/shift-reminders.sh >> /var/log/fwv-reminders.log 2>&1

# Send reminders via the internal Docker network
curl -s -X POST http://fwv-api-events:3000/reminders/send-daily

# Alternative: Use external API
# curl -s -X POST https://api.fwv-raura.ch/reminders/send-daily
