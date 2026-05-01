#!/bin/bash
# Synchronisiert Mitgliederdaten in Nextcloud-Benutzerprofile
# Befuellt: Adresse, Telefon, Organisation, Funktion, Geburtstag
# Nur leere Felder werden befuellt (manuelle Aenderungen werden nicht ueberschrieben)
# Verwendet occ user:profile statt direkter DB-Writes
# Wird per Crontab ausgefuehrt: 15 3 * * * /opt/docker/fwv-website/cron/nextcloud-profile-sync.sh >> /var/log/fwv-nextcloud-profiles.log 2>&1

DB_CONTAINER="fwv-postgres"
DB_NAME="fwv_raura"
DB_USER="fwv"

NC_CONTAINER="nextcloud"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "============================================"
echo "[$TIMESTAMP] Nextcloud Profil-Sync gestartet"
echo "============================================"

# 1. Nextcloud-Benutzer mit UIDs und E-Mails abrufen
echo "Nextcloud-Benutzer abrufen..."
NC_USER_UIDS=$(docker exec -u www-data "$NC_CONTAINER" php occ user:list --output=json 2>/dev/null | python3 -c "
import sys, json
users = json.load(sys.stdin)
for uid in users:
    print(uid)
" 2>/dev/null)

NC_USERS=""
while read -r uid; do
    [ -z "$uid" ] && continue
    [ "$uid" = "fwv-system" ] && continue
    [ "$uid" = "admin" ] && continue

    USER_EMAIL=$(docker exec -u www-data "$NC_CONTAINER" php occ user:info "$uid" --output=json 2>/dev/null | python3 -c "
import sys, json
info = json.load(sys.stdin)
print(info.get('email', '').lower())
" 2>/dev/null)

    if [ -n "$USER_EMAIL" ]; then
        NC_USERS="${NC_USERS}${uid}\t${USER_EMAIL}\n"
    fi
done <<< "$NC_USER_UIDS"

NC_USERS=$(echo -e "$NC_USERS" | grep -v '^$')
NC_USER_COUNT=$(echo "$NC_USERS" | grep -c . 2>/dev/null || echo 0)
echo "Nextcloud-Benutzer mit E-Mail: $NC_USER_COUNT"

# 2. Mitglieder aus der Datenbank abrufen
echo "Mitglieder abrufen..."
MEMBERS=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A -F'|' -c "
    SELECT LOWER(email), vorname, nachname, telefon, mobile, strasse, adresszusatz, plz, ort, funktion,
           COALESCE(TO_CHAR(geburtstag, 'YYYY-MM-DD'), '')
    FROM members
    WHERE email IS NOT NULL AND email != ''
    ORDER BY nachname
" 2>/dev/null)

MEMBER_COUNT=$(echo "$MEMBERS" | grep -c . 2>/dev/null || echo 0)
echo "Mitglieder mit E-Mail: $MEMBER_COUNT"

# 3. Fuer jeden NC-Benutzer passende Mitgliederdaten suchen und Profil befuellen
UPDATED=0
SKIPPED=0

while IFS=$'\t' read -r nc_uid nc_email; do
    [ -z "$nc_uid" ] && continue

    # Mitglied anhand E-Mail finden
    MEMBER_DATA=$(echo "$MEMBERS" | grep -i "^${nc_email}|" | head -1)
    if [ -z "$MEMBER_DATA" ]; then
        continue
    fi

    IFS='|' read -r m_email m_vorname m_nachname m_telefon m_mobile m_strasse m_adresszusatz m_plz m_ort m_funktion m_geburtstag <<< "$MEMBER_DATA"

    # Aktuelle NC-Profildaten via occ abrufen
    CURRENT_PROFILE=$(docker exec -u www-data "$NC_CONTAINER" php occ user:profile "$nc_uid" --output=json 2>/dev/null)

    CHANGES=0

    # Hilfsfunktion: Feld setzen wenn NC-Feld leer und Quelldaten vorhanden
    update_field() {
        local field_name="$1"
        local new_value="$2"

        [ -z "$new_value" ] && return

        # Aktuellen Wert pruefen
        local current_value=$(echo "$CURRENT_PROFILE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('$field_name', ''))
except:
    print('')
" 2>/dev/null)

        if [ -n "$current_value" ]; then
            return
        fi

        # Wert via occ setzen
        docker exec -u www-data "$NC_CONTAINER" php occ user:profile "$nc_uid" "$field_name" "$new_value" 2>/dev/null
        CHANGES=$((CHANGES + 1))
    }

    # Adresse zusammenbauen
    ADDRESS=""
    [ -n "$m_strasse" ] && ADDRESS="$m_strasse"
    [ -n "$m_adresszusatz" ] && ADDRESS="${ADDRESS}, ${m_adresszusatz}"
    if [ -n "$m_plz" ] && [ -n "$m_ort" ]; then
        [ -n "$ADDRESS" ] && ADDRESS="${ADDRESS}, "
        ADDRESS="${ADDRESS}${m_plz} ${m_ort}"
    fi

    # Telefon: Mobile bevorzugen, sonst Festnetz
    PHONE=""
    if [ -n "$m_mobile" ]; then
        PHONE="$m_mobile"
    elif [ -n "$m_telefon" ]; then
        PHONE="$m_telefon"
    fi

    update_field "address" "$ADDRESS"
    update_field "phone" "$PHONE"
    update_field "organisation" "Feuerwehrverein Raura"
    update_field "role" "$m_funktion"
    update_field "birthdate" "$m_geburtstag"

    if [ $CHANGES -gt 0 ]; then
        echo "  [+] $m_vorname $m_nachname ($CHANGES Felder)"
        UPDATED=$((UPDATED + 1))
    else
        SKIPPED=$((SKIPPED + 1))
    fi
done <<< "$NC_USERS"

echo "--------------------------------------------"
echo "Ergebnis: $UPDATED aktualisiert, $SKIPPED unveraendert"
echo "============================================"
echo ""
