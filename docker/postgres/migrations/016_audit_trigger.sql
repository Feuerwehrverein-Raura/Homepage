-- Automatic audit logging via database trigger
-- Captures all INSERT/UPDATE/DELETE on members table regardless of source (API or direct SQL)

CREATE OR REPLACE FUNCTION audit_members_trigger()
RETURNS TRIGGER AS $$
BEGIN
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
    ELSIF TG_OP = 'UPDATE' THEN
        -- Only log if something actually changed
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

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS audit_members ON members;

-- Create trigger (fires AFTER to not interfere with the operation)
CREATE TRIGGER audit_members
    AFTER INSERT OR UPDATE OR DELETE ON members
    FOR EACH ROW
    EXECUTE FUNCTION audit_members_trigger();
