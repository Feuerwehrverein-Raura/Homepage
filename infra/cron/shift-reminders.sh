#!/bin/bash
# DEUTSCH: Cron-Script für tägliche Schicht-Erinnerungen
# DEUTSCH: Wird auf dem Server per Crontab ausgeführt, z.B. jeden Morgen um 8 Uhr
# DEUTSCH: Beispiel Crontab-Eintrag: 0 8 * * * /opt/fwv-raura/cron/shift-reminders.sh >> /var/log/fwv-reminders.log 2>&1
# DEUTSCH: Das Script prüft ob morgen Schichten stattfinden und sendet E-Mail-Erinnerungen

# DEUTSCH: Erinnerungen über Docker exec senden (läuft im Container-Netzwerk, kein Auth nötig)
docker exec fwv-api-events wget -qO- --post-data="" http://localhost:3000/reminders/send-daily

# DEUTSCH: Alternative: Über externe API (benötigt Authentifizierung)
# curl -s -X POST https://api.fwv-raura.ch/reminders/send-daily
