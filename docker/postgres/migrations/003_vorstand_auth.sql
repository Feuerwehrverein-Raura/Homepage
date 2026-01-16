-- Migration: Add Vorstand IMAP Authentication Support
-- ============================================

-- Modify audit_log table to support Vorstand login tracking
ALTER TABLE audit_log
    ADD COLUMN IF NOT EXISTS email VARCHAR(200),
    ADD COLUMN IF NOT EXISTS details JSONB;

-- Make entity_type and entity_id optional (for login events)
ALTER TABLE audit_log
    ALTER COLUMN entity_type DROP NOT NULL;

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_audit_email ON audit_log(email);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

-- Insert some initial audit log entry
INSERT INTO audit_log (action, email, ip_address, details)
VALUES ('SYSTEM_START', 'system', '127.0.0.1', '{"message": "Vorstand authentication system initialized"}');
