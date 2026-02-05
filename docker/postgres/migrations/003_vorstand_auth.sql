-- DEUTSCH: Migration 003 — Vorstand IMAP-Authentifizierung
-- DEUTSCH: Erweitert die Audit-Tabelle um E-Mail- und Details-Felder für Login-Protokollierung
-- DEUTSCH: Vorstandsmitglieder loggen sich mit ihrer Vereins-E-Mail + Passwort (via IMAP) ein
-- ============================================

-- DEUTSCH: Neue Spalten für die Login-Protokollierung im Audit-Log
ALTER TABLE audit_log
    ADD COLUMN IF NOT EXISTS email VARCHAR(200),
    ADD COLUMN IF NOT EXISTS details JSONB;

-- DEUTSCH: entity_type wird optional — Login-Events haben keinen Entity-Typ
ALTER TABLE audit_log
    ALTER COLUMN entity_type DROP NOT NULL;

-- DEUTSCH: Indizes für schnelle Suche nach E-Mail, Aktion und Zeitstempel
CREATE INDEX IF NOT EXISTS idx_audit_email ON audit_log(email);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

-- DEUTSCH: Initialer Audit-Eintrag — markiert den Start des Vorstand-Auth-Systems
INSERT INTO audit_log (action, email, ip_address, details)
VALUES ('SYSTEM_START', 'system', '127.0.0.1', '{"message": "Vorstand authentication system initialized"}');
