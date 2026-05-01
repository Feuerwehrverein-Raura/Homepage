#!/bin/bash
# DEUTSCH: Automatisches Einladen von SSO-Benutzern zur Vaultwarden-Organisation
# DEUTSCH: Läuft alle 5 Minuten via Cron und weist Benutzer basierend auf Authentik-Gruppen zu
#
# Cron-Eintrag:
# */5 * * * * /opt/docker/vaultwarden/auto-invite.sh

set -e

# Konfiguration
DB="/opt/docker/vaultwarden/data/db.sqlite3"
ORG_UUID="ff5fc984-7f46-443e-ad75-96ee83038500"
LOG="/opt/docker/vaultwarden/auto-invite.log"

# Vaultwarden-Gruppen-UUIDs
GROUP_MITGLIEDER="9f3c10c5-e3c4-4814-8c6f-1578bac5ee05"
GROUP_VORSTAND="43bf2ea8-6ab2-4c9e-a873-8f870d1d0a7d"
GROUP_ADMINS="b313ecbc-b8f4-4553-ac51-176d4ce0f666"
GROUP_SOCIAL_MEDIA="8ce61311-1aab-48fc-b93d-2a99a5003326"

# Authentik-Gruppen-UUIDs (aus dem Backend)
AUTHENTIK_MITGLIEDER="248db02d-6592-4571-9050-2ccc0fdf0b7e"
AUTHENTIK_VORSTAND="2e5db41b-b867-43e4-af75-e0241f06fb95"
AUTHENTIK_ADMIN="2d29d683-b42d-406e-8d24-e5e39a80f3b3"
AUTHENTIK_SOCIAL_MEDIA="494ef740-41d3-40c3-9e68-8a1e5d3b4ad9"

# Authentik API
AUTHENTIK_URL="${AUTHENTIK_URL:-https://auth.fwv-raura.ch}"
AUTHENTIK_TOKEN="${AUTHENTIK_API_TOKEN:-}"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG"
}

# Prüfe ob Gruppen-UUIDs gesetzt sind
check_config() {
    if [ -z "$GROUP_MITGLIEDER" ] || [ -z "$GROUP_VORSTAND" ] || [ -z "$GROUP_ADMINS" ] || [ -z "$GROUP_SOCIAL_MEDIA" ]; then
        log "FEHLER: Vaultwarden-Gruppen-UUIDs nicht konfiguriert!"
        log "Führe aus: sqlite3 $DB \"SELECT uuid, name FROM groups WHERE organizations_uuid='$ORG_UUID';\""
        exit 1
    fi
}

# Hole Authentik-Gruppen eines Benutzers anhand der E-Mail
get_authentik_groups() {
    local email="$1"

    if [ -z "$AUTHENTIK_TOKEN" ]; then
        log "WARNUNG: AUTHENTIK_API_TOKEN nicht gesetzt - kann Gruppen nicht abrufen"
        echo ""
        return
    fi

    # Suche Benutzer in Authentik
    local user_data=$(curl -s -H "Authorization: Bearer $AUTHENTIK_TOKEN" \
        "${AUTHENTIK_URL}/api/v3/core/users/?search=${email}" 2>/dev/null)

    # Extrahiere Gruppen-UUIDs (einfaches grep, da jq möglicherweise nicht installiert)
    echo "$user_data" | grep -oP '"groups":\s*\[[^\]]*\]' | grep -oP '[a-f0-9-]{36}' || echo ""
}

# Prüfe ob Benutzer in einer bestimmten Authentik-Gruppe ist
is_in_authentik_group() {
    local groups="$1"
    local target_group="$2"

    echo "$groups" | grep -q "$target_group"
}

# Füge Benutzer zu Vaultwarden-Gruppe hinzu
add_to_vaultwarden_group() {
    local user_uuid="$1"
    local group_uuid="$2"
    local group_name="$3"

    # Prüfe ob bereits in Gruppe
    local exists=$(sqlite3 "$DB" "SELECT COUNT(*) FROM groups_users WHERE groups_uuid='$group_uuid' AND users_organizations_uuid IN (SELECT uuid FROM users_organizations WHERE user_uuid='$user_uuid' AND org_uuid='$ORG_UUID');")

    if [ "$exists" -eq 0 ]; then
        # Hole users_organizations UUID
        local uo_uuid=$(sqlite3 "$DB" "SELECT uuid FROM users_organizations WHERE user_uuid='$user_uuid' AND org_uuid='$ORG_UUID' LIMIT 1;")

        if [ -n "$uo_uuid" ]; then
            sqlite3 "$DB" "INSERT INTO groups_users (groups_uuid, users_organizations_uuid) VALUES ('$group_uuid', '$uo_uuid');"
            log "Benutzer $user_uuid zu Gruppe $group_name hinzugefügt"
            return 0
        fi
    fi
    return 1
}

# Entferne Benutzer aus Vaultwarden-Gruppe
remove_from_vaultwarden_group() {
    local user_uuid="$1"
    local group_uuid="$2"
    local group_name="$3"

    local deleted=$(sqlite3 "$DB" "DELETE FROM groups_users WHERE groups_uuid='$group_uuid' AND users_organizations_uuid IN (SELECT uuid FROM users_organizations WHERE user_uuid='$user_uuid' AND org_uuid='$ORG_UUID'); SELECT changes();")

    if [ "$deleted" -gt 0 ]; then
        log "Benutzer $user_uuid aus Gruppe $group_name entfernt"
        return 0
    fi
    return 1
}

# Hauptlogik
main() {
    check_config

    log "=== Auto-Invite gestartet ==="

    # 1. Finde alle Vaultwarden-Benutzer die NICHT in der Organisation sind
    local new_users=$(sqlite3 "$DB" "
        SELECT u.uuid, u.email
        FROM users u
        WHERE u.uuid NOT IN (
            SELECT user_uuid FROM users_organizations WHERE org_uuid='$ORG_UUID'
        );
    ")

    # 2. Lade neue Benutzer zur Organisation ein
    while IFS='|' read -r user_uuid email; do
        [ -z "$user_uuid" ] && continue

        log "Neuer Benutzer gefunden: $email ($user_uuid)"

        # Generiere UUID für users_organizations
        local uo_uuid=$(cat /proc/sys/kernel/random/uuid)

        # Füge zur Organisation hinzu (status=0=Invited, atype=2=User)
        sqlite3 "$DB" "
            INSERT INTO users_organizations (
                uuid, user_uuid, org_uuid,
                access_all, akey, status, atype,
                reset_password_key, external_id
            ) VALUES (
                '$uo_uuid', '$user_uuid', '$ORG_UUID',
                0, '', 0, 2,
                NULL, NULL
            );
        "
        log "Benutzer $email zur Organisation eingeladen"

        # Füge sofort zur Mitglieder-Gruppe hinzu (alle bekommen Mitglieder)
        sqlite3 "$DB" "INSERT INTO groups_users (groups_uuid, users_organizations_uuid) VALUES ('$GROUP_MITGLIEDER', '$uo_uuid');"
        log "Benutzer $email zu Mitglieder-Gruppe hinzugefügt"

    done <<< "$new_users"

    # 3. Synchronisiere Gruppenzugehörigkeit basierend auf Authentik-Gruppen
    if [ -n "$AUTHENTIK_TOKEN" ]; then
        log "Starte Authentik-Gruppen-Sync..."

        # Hole alle Benutzer in der Organisation
        local org_users=$(sqlite3 "$DB" "
            SELECT u.uuid, u.email
            FROM users u
            INNER JOIN users_organizations uo ON u.uuid = uo.user_uuid
            WHERE uo.org_uuid = '$ORG_UUID';
        ")

        while IFS='|' read -r user_uuid email; do
            [ -z "$user_uuid" ] && continue

            # Hole Authentik-Gruppen für diesen Benutzer
            local authentik_groups=$(get_authentik_groups "$email")

            # Vorstand-Gruppe
            if is_in_authentik_group "$authentik_groups" "$AUTHENTIK_VORSTAND"; then
                add_to_vaultwarden_group "$user_uuid" "$GROUP_VORSTAND" "Vorstand"
            else
                remove_from_vaultwarden_group "$user_uuid" "$GROUP_VORSTAND" "Vorstand"
            fi

            # Admins-Gruppe
            if is_in_authentik_group "$authentik_groups" "$AUTHENTIK_ADMIN"; then
                add_to_vaultwarden_group "$user_uuid" "$GROUP_ADMINS" "Admins"
            else
                remove_from_vaultwarden_group "$user_uuid" "$GROUP_ADMINS" "Admins"
            fi

            # Social-Media-Gruppe
            if is_in_authentik_group "$authentik_groups" "$AUTHENTIK_SOCIAL_MEDIA"; then
                add_to_vaultwarden_group "$user_uuid" "$GROUP_SOCIAL_MEDIA" "Social Media"
            else
                remove_from_vaultwarden_group "$user_uuid" "$GROUP_SOCIAL_MEDIA" "Social Media"
            fi

        done <<< "$org_users"
    else
        log "AUTHENTIK_API_TOKEN nicht gesetzt - überspringe Gruppen-Sync"
    fi

    log "=== Auto-Invite beendet ==="
}

main "$@"
