#!/bin/bash
# Synchronisiert Mitglieder als Kontakte im Nextcloud-Adressbuch "fwv-mitglieder"
# Mitglieder die sich in Nextcloud eingeloggt haben, werden entfernt (haben eigenes Konto)
# Neue Nextcloud-Benutzer erhalten automatisch Lesezugriff auf das Adressbuch
# Wird per Crontab ausgefuehrt: 0 3 * * * /opt/docker/fwv-website/cron/nextcloud-contacts-sync.sh >> /var/log/fwv-nextcloud-contacts.log 2>&1

NEXTCLOUD_URL="https://nextcloud.fwv-raura.ch"
NEXTCLOUD_USER="fwv-system"
NEXTCLOUD_PASS="FwvSysNC2025Raura"
ADDRESSBOOK="fwv-mitglieder"
CARDDAV_BASE="${NEXTCLOUD_URL}/remote.php/dav/addressbooks/users/${NEXTCLOUD_USER}/${ADDRESSBOOK}"

DB_CONTAINER="fwv-postgres"
DB_NAME="fwv_raura"
DB_USER="fwv"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "============================================"
echo "[$TIMESTAMP] Nextcloud Kontakt-Sync gestartet"
echo "============================================"

# 1. Nextcloud-Benutzer mit lastLogin abrufen
echo "Nextcloud-Benutzer abrufen..."
NC_USER_UIDS=$(docker exec -u www-data nextcloud php occ user:list 2>/dev/null | grep "^  - " | sed 's/^  - //' | cut -d: -f1)

NC_LOGGED_IN_EMAILS=""
while read -r uid; do
    [ -z "$uid" ] && continue
    [ "$uid" = "fwv-system" ] && continue

    # User-Info abrufen
    USER_INFO=$(docker exec -u www-data nextcloud php occ user:info "$uid" 2>/dev/null)
    LAST_LOGIN=$(echo "$USER_INFO" | grep "last_login:" | sed 's/.*last_login: *//')
    USER_EMAIL=$(echo "$USER_INFO" | grep "email:" | sed 's/.*email: *//' | tr '[:upper:]' '[:lower:]')

    if [ -n "$LAST_LOGIN" ] && [ "$LAST_LOGIN" != "1970-01-01T00:00:00+00:00" ] && [ -n "$USER_EMAIL" ]; then
        NC_LOGGED_IN_EMAILS="${NC_LOGGED_IN_EMAILS}${USER_EMAIL}\n"
    fi
done <<< "$NC_USER_UIDS"

NC_LOGGED_IN_EMAILS=$(echo -e "$NC_LOGGED_IN_EMAILS" | grep -v '^$')

echo "Eingeloggte Nextcloud-Benutzer: $(echo "$NC_LOGGED_IN_EMAILS" | grep -c . 2>/dev/null || echo 0)"

# 2. Aktive Mitglieder aus der Datenbank abrufen
# Adressbuch ist mit Authentik-Gruppe "Mitglieder" geteilt - alle Gruppenmitglieder sehen es automatisch
echo "Mitglieder aus Datenbank abrufen..."
MEMBERS=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A -F'|' -c "
    SELECT id, vorname, nachname, email, telefon, mobile, strasse, adresszusatz, plz, ort, funktion, status
    FROM members
    WHERE status IN ('Aktivmitglied', 'Passivmitglied', 'Ehrenmitglied')
    ORDER BY nachname, vorname
" 2>/dev/null)

if [ -z "$MEMBERS" ]; then
    echo "FEHLER: Keine Mitglieder gefunden"
    exit 1
fi

MEMBER_COUNT=$(echo "$MEMBERS" | wc -l)
echo "Aktive Mitglieder: $MEMBER_COUNT"

# 3. Bestehende vCards im Adressbuch abrufen
echo "Bestehende Kontakte abrufen..."
EXISTING_VCARDS=$(curl -s -u "${NEXTCLOUD_USER}:${NEXTCLOUD_PASS}" \
    "${CARDDAV_BASE}/" \
    -X PROPFIND -H "Depth: 1" -H "Content-Type: application/xml" \
    -d '<?xml version="1.0" encoding="utf-8"?>
    <d:propfind xmlns:d="DAV:">
        <d:prop><d:getetag/></d:prop>
    </d:propfind>' 2>/dev/null | grep -oP '(?<=href>)[^<]*\.vcf' || true)

echo "Bestehende vCards: $(echo "$EXISTING_VCARDS" | grep -c . 2>/dev/null || echo 0)"

# 4. Mitglieder synchronisieren
CREATED=0
UPDATED=0
REMOVED=0
SKIPPED=0

while IFS='|' read -r id vorname nachname email telefon mobile strasse adresszusatz plz ort funktion status; do
    [ -z "$id" ] && continue

    VCARD_UID="fwv-member-${id}"
    VCARD_FILENAME="${VCARD_UID}.vcf"
    VCARD_URL="${CARDDAV_BASE}/${VCARD_FILENAME}"

    # Pruefen ob Mitglied sich in Nextcloud eingeloggt hat
    MEMBER_EMAIL_LOWER=$(echo "$email" | tr '[:upper:]' '[:lower:]')
    if [ -n "$MEMBER_EMAIL_LOWER" ] && echo "$NC_LOGGED_IN_EMAILS" | grep -qx "$MEMBER_EMAIL_LOWER" 2>/dev/null; then
        # Mitglied hat Nextcloud-Konto -> vCard entfernen falls vorhanden
        if echo "$EXISTING_VCARDS" | grep -q "$VCARD_FILENAME" 2>/dev/null; then
            HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
                -u "${NEXTCLOUD_USER}:${NEXTCLOUD_PASS}" \
                -X DELETE "$VCARD_URL")
            if [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "200" ]; then
                echo "  [-] $vorname $nachname (hat Nextcloud-Konto, vCard entfernt)"
                REMOVED=$((REMOVED + 1))
            fi
        else
            SKIPPED=$((SKIPPED + 1))
        fi
        continue
    fi

    # vCard zusammenbauen
    VCARD="BEGIN:VCARD
VERSION:3.0
UID:${VCARD_UID}
FN:${vorname} ${nachname}
N:${nachname};${vorname};;;
ORG:FWV Raura"

    [ -n "$email" ] && VCARD="${VCARD}
EMAIL;TYPE=WORK:${email}"

    [ -n "$telefon" ] && VCARD="${VCARD}
TEL;TYPE=HOME:${telefon}"

    [ -n "$mobile" ] && VCARD="${VCARD}
TEL;TYPE=CELL:${mobile}"

    [ -n "$strasse" ] && VCARD="${VCARD}
ADR;TYPE=HOME:;;${strasse};${ort};;${plz};Schweiz"

    [ -n "$funktion" ] && VCARD="${VCARD}
TITLE:${funktion}"

    [ -n "$status" ] && VCARD="${VCARD}
NOTE:${status}"

    VCARD="${VCARD}
REV:$(date -u +%Y%m%dT%H%M%SZ)
END:VCARD"

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -u "${NEXTCLOUD_USER}:${NEXTCLOUD_PASS}" \
        -X PUT "$VCARD_URL" \
        -H "Content-Type: text/vcard; charset=utf-8" \
        -d "$VCARD")

    if [ "$HTTP_CODE" = "201" ]; then
        echo "  [+] $vorname $nachname"
        CREATED=$((CREATED + 1))
    elif [ "$HTTP_CODE" = "204" ]; then
        UPDATED=$((UPDATED + 1))
    else
        echo "  [!] $vorname $nachname (HTTP $HTTP_CODE)"
    fi
done <<< "$MEMBERS"

# 5. Verwaiste vCards entfernen (ausgetretene Mitglieder)
ACTIVE_IDS=$(echo "$MEMBERS" | cut -d'|' -f1)
while read -r vcard_path; do
    [ -z "$vcard_path" ] && continue
    FILENAME=$(basename "$vcard_path")
    if [[ "$FILENAME" == fwv-member-*.vcf ]]; then
        MEMBER_ID=$(echo "$FILENAME" | sed 's/fwv-member-//;s/\.vcf//')
        if ! echo "$ACTIVE_IDS" | grep -qx "$MEMBER_ID" 2>/dev/null; then
            HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
                -u "${NEXTCLOUD_USER}:${NEXTCLOUD_PASS}" \
                -X DELETE "${NEXTCLOUD_URL}${vcard_path}")
            if [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "200" ]; then
                echo "  [-] Verwaiste vCard entfernt: $FILENAME"
                REMOVED=$((REMOVED + 1))
            fi
        fi
    fi
done <<< "$EXISTING_VCARDS"

echo "--------------------------------------------"
echo "Ergebnis: $CREATED neu, $UPDATED aktualisiert, $REMOVED entfernt, $SKIPPED uebersprungen"
echo "============================================"
echo ""
