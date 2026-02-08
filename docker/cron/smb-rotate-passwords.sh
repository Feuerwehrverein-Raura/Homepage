#!/bin/bash
# DEUTSCH: Rotiert die SMB-Passwoerter fuer alle 3 Benutzer (vorstand, socialmedia, mitglied)
# Generiert neue zufaellige Passwoerter, aktualisiert die JSON-Datei und startet den Samba-Container neu.
# Wird monatlich per Crontab ausgefuehrt: 0 0 1 * * /opt/docker/fwv-website/cron/smb-rotate-passwords.sh >> /var/log/fwv-smb-rotate.log 2>&1
# Kann auch manuell oder vom Brute-Force-Watcher aufgerufen werden.

CREDENTIALS_FILE="/opt/docker/data/smb-credentials.json"
COMPOSE_DIR="/opt/docker"
COMPOSE_FILE="docker-compose.yml"
LOG_PREFIX="[SMB-Rotate]"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "============================================"
echo "$LOG_PREFIX $TIMESTAMP Passwort-Rotation gestartet"
echo "============================================"

# 1. Neue Passwoerter generieren (16 Zeichen, alphanumerisch)
PW_VORSTAND=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)
PW_SOCIALMEDIA=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)
PW_MITGLIED=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)

echo "$LOG_PREFIX Neue Passwoerter generiert"

# 2. JSON-Datei schreiben
mkdir -p "$(dirname "$CREDENTIALS_FILE")"
cat > "$CREDENTIALS_FILE" << EOF
{
  "updatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "users": {
    "vorstand": {
      "password": "$PW_VORSTAND",
      "shares": ["Vorstand", "Social-Media", "Buero", "Website", "Fotos", "Roter-Schopf"]
    },
    "socialmedia": {
      "password": "$PW_SOCIALMEDIA",
      "shares": ["Social-Media", "Buero", "Website", "Fotos", "Roter-Schopf"]
    },
    "mitglied": {
      "password": "$PW_MITGLIED",
      "shares": ["Fotos", "Roter-Schopf"]
    }
  }
}
EOF

chmod 600 "$CREDENTIALS_FILE"
echo "$LOG_PREFIX Credentials-Datei aktualisiert: $CREDENTIALS_FILE"

# 3. Samba-Container mit neuen Passwoertern neu starten
# dperson/samba: -u "user;pass" erstellt Benutzer, -s "name;path;browse;ro;guest;users;admins;writelist;comment" definiert Share
echo "$LOG_PREFIX Starte Samba-Container neu..."

docker stop samba 2>/dev/null
docker rm samba 2>/dev/null

docker run -d \
    --name samba \
    --restart unless-stopped \
    -p 445:445 \
    -v /opt/docker/nextcloud/data/__groupfolders/1/files:/share/Vorstand \
    -v /opt/docker/nextcloud/data/__groupfolders/2/files:/share/Social-Media \
    -v /opt/docker/nextcloud/data/__groupfolders/3/files:/share/Buero \
    -v /opt/docker/nextcloud/data/__groupfolders/4/files:/share/Website \
    -v /opt/docker/nextcloud/data/__groupfolders/5/files:/share/Fotos \
    -v /opt/docker/nextcloud/data/__groupfolders/6/files:/share/Roter-Schopf \
    -v /opt/docker/data/samba-log:/var/log/samba \
    -e TZ=Europe/Zurich \
    -e USERID=33 \
    -e GROUPID=33 \
    dperson/samba \
    -u "vorstand;$PW_VORSTAND" \
    -u "socialmedia;$PW_SOCIALMEDIA" \
    -u "mitglied;$PW_MITGLIED" \
    -s "Vorstand;/share/Vorstand;yes;no;no;vorstand" \
    -s "Social-Media;/share/Social-Media;yes;no;no;vorstand,socialmedia" \
    -s "Buero;/share/Buero;yes;no;no;vorstand,socialmedia" \
    -s "Website;/share/Website;yes;no;no;vorstand,socialmedia" \
    -s "Fotos;/share/Fotos;yes;no;no;vorstand,socialmedia,mitglied" \
    -s "Roter-Schopf;/share/Roter-Schopf;yes;yes;no;vorstand,socialmedia;;;mitglied" \
    -g "server min protocol = SMB2" \
    -g "server max protocol = SMB3" \
    -g "log level = 1 auth_audit:3" \
    -g "log file = /var/log/samba/samba.log" \
    -g "max log size = 5000"

if [ $? -eq 0 ]; then
    echo "$LOG_PREFIX Samba-Container erfolgreich gestartet"
else
    echo "$LOG_PREFIX FEHLER: Samba-Container konnte nicht gestartet werden"
    exit 1
fi

echo "--------------------------------------------"
echo "$LOG_PREFIX Rotation abgeschlossen"
echo "============================================"
echo ""
