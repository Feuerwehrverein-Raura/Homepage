#!/bin/bash
# Synchronisiert Mitgliederdaten in Nextcloud-Benutzerprofile
# Befuellt: Adresse, Ort, Telefon, Organisation, Funktion, Geburtstag
# Nur leere Felder werden befuellt (manuelle Aenderungen werden nicht ueberschrieben)
# Wird per Crontab ausgefuehrt: 15 3 * * * /opt/docker/fwv-website/cron/nextcloud-profile-sync.sh >> /var/log/fwv-nextcloud-profiles.log 2>&1

DB_CONTAINER="fwv-postgres"
DB_NAME="fwv_raura"
DB_USER="fwv"

NC_DB_CONTAINER="nextcloud-db"
NC_DB_USER="nextcloud"
NC_DB_PASS="1adc64d6bf7ebf2d61491b1a33eb4f66"
NC_DB_NAME="nextcloud"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "============================================"
echo "[$TIMESTAMP] Nextcloud Profil-Sync gestartet"
echo "============================================"

# 1. Nextcloud-Benutzer mit ihren E-Mails abrufen
echo "Nextcloud-Benutzer abrufen..."
NC_USERS=$(docker exec "$NC_DB_CONTAINER" mariadb -u "$NC_DB_USER" -p"$NC_DB_PASS" -D "$NC_DB_NAME" -N -B -e "
    SELECT uid, LOWER(value) FROM oc_accounts_data WHERE name = 'email' AND value != ''
" 2>/dev/null)

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
    [ "$nc_uid" = "fwv-system" ] && continue
    [ "$nc_uid" = "admin" ] && continue

    # Mitglied anhand E-Mail finden
    MEMBER_DATA=$(echo "$MEMBERS" | grep -i "^${nc_email}|" | head -1)
    if [ -z "$MEMBER_DATA" ]; then
        continue
    fi

    IFS='|' read -r m_email m_vorname m_nachname m_telefon m_mobile m_strasse m_adresszusatz m_plz m_ort m_funktion m_geburtstag <<< "$MEMBER_DATA"

    # Aktuelle NC-Profildaten abrufen
    CURRENT_DATA=$(docker exec "$NC_DB_CONTAINER" mariadb -u "$NC_DB_USER" -p"$NC_DB_PASS" -D "$NC_DB_NAME" -N -B -e "
        SELECT name, value FROM oc_accounts_data WHERE uid = '$nc_uid' AND name IN ('address', 'phone', 'organisation', 'role', 'birthdate')
    " 2>/dev/null)

    CHANGES=0

    # Hilfsfunktion: Feld setzen wenn NC-Feld leer und Quelldaten vorhanden
    update_field() {
        local field_name="$1"
        local new_value="$2"

        [ -z "$new_value" ] && return

        # Aktuellen Wert pruefen
        local current_value=$(echo "$CURRENT_DATA" | grep "^${field_name}" | cut -f2)
        if [ -n "$current_value" ]; then
            return
        fi

        # Wert setzen (UPDATE da Zeile bereits existiert)
        docker exec "$NC_DB_CONTAINER" mariadb -u "$NC_DB_USER" -p"$NC_DB_PASS" -D "$NC_DB_NAME" -e "
            UPDATE oc_accounts_data SET value = '$(echo "$new_value" | sed "s/'/''/g")' WHERE uid = '$nc_uid' AND name = '$field_name'
        " 2>/dev/null
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
