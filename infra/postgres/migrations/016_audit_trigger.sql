-- DEUTSCH: Migration 016 — Automatisches Audit-Logging per Datenbank-Trigger
-- DEUTSCH: Protokolliert ALLE Änderungen an der Mitglieder-Tabelle automatisch,
-- DEUTSCH: egal ob über die API oder direkt per SQL — kein Code im Backend nötig
-- DEUTSCH: Erfasst: INSERT (Mitglied erstellt), UPDATE (geändert), DELETE (gelöscht)

-- DEUTSCH: Trigger-Funktion — wird bei jeder Änderung an der members-Tabelle ausgeführt
CREATE OR REPLACE FUNCTION audit_members_trigger()
RETURNS TRIGGER AS $$
BEGIN
    -- DEUTSCH: Bei INSERT — neues Mitglied erstellt
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (action, entity_type, entity_id, new_values, email, ip_address)
        VALUES (
            'MEMBER_CREATE',
            'members',
            NEW.id,
            to_jsonb(NEW),
            'db-trigger',
            '127.0.0.1'
        );
        RETURN NEW;
    -- DEUTSCH: Bei UPDATE — Mitglied geändert (nur wenn sich tatsächlich etwas geändert hat)
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD IS DISTINCT FROM NEW THEN
            INSERT INTO audit_log (action, entity_type, entity_id, old_values, new_values, email, ip_address)
            VALUES (
                'MEMBER_UPDATE',
                'members',
                NEW.id,
                to_jsonb(OLD),
                to_jsonb(NEW),
                'db-trigger',
                '127.0.0.1'
            );
        END IF;
        RETURN NEW;
    -- DEUTSCH: Bei DELETE — Mitglied gelöscht (speichert alle alten Werte)
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (action, entity_type, entity_id, old_values, email, ip_address)
        VALUES (
            'MEMBER_DELETE',
            'members',
            OLD.id,
            to_jsonb(OLD),
            'db-trigger',
            '127.0.0.1'
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- DEUTSCH: Bestehenden Trigger entfernen (falls vorhanden) bevor er neu erstellt wird
DROP TRIGGER IF EXISTS audit_members ON members;

-- DEUTSCH: Trigger erstellen — wird NACH der Operation ausgeführt (AFTER = stört die Operation nicht)
CREATE TRIGGER audit_members
    AFTER INSERT OR UPDATE OR DELETE ON members
    FOR EACH ROW
    EXECUTE FUNCTION audit_members_trigger();
