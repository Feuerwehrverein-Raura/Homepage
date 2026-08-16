#!/bin/bash
# Traegt die Mitglieder der Authentik-Gruppe "admin" in Nextclouds
# eingebaute Gruppe "admin" ein — und nur die.
#
# Warum es dieses Skript ueberhaupt braucht:
# user_oidc legt fuer jede Gruppe aus dem Token eine eigene Nextcloud-
# Gruppe mit gehashter ID an. Die Authentik-Gruppe "admin" wird dadurch zu
# einer gewoehnlichen Gruppe, die nur zufaellig "admin" heisst. Nextcloud
# vergibt Adminrechte aber ausschliesslich an die eingebaute Gruppe mit der
# ID "admin". Ueber OIDC ist die nicht erreichbar; also von aussen.
#
# Voraussetzung: In user_oidc muss groupWhitelistRegex auf ^[0-9a-f]{64}$
# stehen. Sonst raeumt provisionUserGroups() bei jeder Anmeldung alle
# Gruppen weg, die nicht im Token stehen — auch "admin", und dieses Skript
# waere ein Wettlauf gegen die naechste Anmeldung.
#
# Crontab: */5 * * * * /opt/docker/fwv-website/cron/nextcloud-admin-sync.sh \
#            >> /var/log/nc-admin-sync.log 2>&1

set -uo pipefail

NC_CONTAINER="nextcloud"
API_CONTAINER="fwv-api-members"
NC_ADMIN_GROUP="admin"          # die eingebaute Gruppe, nicht die gehashte
LOCAL_ADMIN="admin"             # lokales Notfallkonto, nie anfassen

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$TIMESTAMP] Nextcloud-Admin-Abgleich gestartet"

occ() { docker exec -u www-data "$NC_CONTAINER" php occ "$@" 2>/dev/null; }

# ---------------------------------------------------------------- Authentik
# Der API-Token liegt in der Umgebung des Members-Containers. Er wird
# bewusst dort benutzt und nicht herausgereicht, damit er nirgends im Log
# oder in der Prozessliste auftaucht.
ADMIN_GROUP_ID="${AUTHENTIK_ADMIN_GROUP:-2d29d683-b42d-406e-8d24-e5e39a80f3b3}"

ADMIN_EMAILS=$(docker exec "$API_CONTAINER" sh -c "
    wget -qO- --header=\"Authorization: Bearer \$AUTHENTIK_API_TOKEN\" \
        \"\$AUTHENTIK_URL/api/v3/core/groups/$ADMIN_GROUP_ID/\"
" 2>/dev/null | python3 -c "
import sys, json
try:
    g = json.load(sys.stdin)
except Exception:
    sys.exit(1)
for u in g.get('users_obj', []):
    mail = (u.get('email') or '').strip().lower()
    if mail:
        print(mail)
")

if [ -z "$ADMIN_EMAILS" ]; then
    echo "FEHLER: keine Admin-Adressen von Authentik erhalten — Abbruch."
    echo "        (Sicherheitshalber wird niemand entfernt.)"
    exit 1
fi

echo "Admin-Adressen aus Authentik:"
echo "$ADMIN_EMAILS" | sed 's/^/  - /'

# ------------------------------------------------------------- Nextcloud
# Zuordnung E-Mail -> Nextcloud-UID. Die UIDs sind Hashes, die Adresse ist
# das einzige gemeinsame Merkmal zwischen beiden Systemen.
SOLL_UIDS=""
while read -r uid; do
    [ -z "$uid" ] && continue
    [ "$uid" = "$LOCAL_ADMIN" ] && continue

    mail=$(occ user:info "$uid" --output=json | python3 -c "
import sys, json
try:
    print((json.load(sys.stdin).get('email') or '').strip().lower())
except Exception:
    pass
")
    [ -z "$mail" ] && continue

    if echo "$ADMIN_EMAILS" | grep -qxF "$mail"; then
        SOLL_UIDS="${SOLL_UIDS}${uid}"$'\n'
    fi
done < <(occ user:list --output=json | python3 -c "
import sys, json
for uid in json.load(sys.stdin):
    print(uid)
")

IST_UIDS=$(occ group:list --output=json | python3 -c "
import sys, json
print('\n'.join(json.load(sys.stdin).get('$NC_ADMIN_GROUP', [])))
")

# ------------------------------------------------------------ Abgleichen
while read -r uid; do
    [ -z "$uid" ] && continue
    if ! echo "$IST_UIDS" | grep -qxF "$uid"; then
        echo "  + $uid -> Gruppe $NC_ADMIN_GROUP"
        occ group:adduser "$NC_ADMIN_GROUP" "$uid"
    fi
done <<< "$SOLL_UIDS"

while read -r uid; do
    [ -z "$uid" ] && continue
    [ "$uid" = "$LOCAL_ADMIN" ] && continue
    if ! echo "$SOLL_UIDS" | grep -qxF "$uid"; then
        echo "  - $uid <- Gruppe $NC_ADMIN_GROUP (nicht mehr Admin in Authentik)"
        occ group:removeuser "$NC_ADMIN_GROUP" "$uid"
    fi
done <<< "$IST_UIDS"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Abgleich fertig"
