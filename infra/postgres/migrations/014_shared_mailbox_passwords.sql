-- DEUTSCH: Migration 014 — Geteilte Funktions-Postfach-Passwörter
-- DEUTSCH: Speichert verschlüsselte Passwörter für gemeinsam genutzte E-Mail-Postfächer
-- DEUTSCH: (z.B. kassier@fwv-raura.ch, aktuar@fwv-raura.ch)
-- DEUTSCH: Damit kann der Vorstand die Passwörter im Dashboard einsehen/ändern

CREATE TABLE IF NOT EXISTS shared_mailbox_passwords (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,                  -- DEUTSCH: E-Mail-Adresse (z.B. kassier@fwv-raura.ch)
    encrypted_password TEXT NOT NULL,                     -- DEUTSCH: AES-256-GCM verschlüsseltes Passwort
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),   -- DEUTSCH: Wann zuletzt geändert
    updated_by UUID REFERENCES members(id) ON DELETE SET NULL  -- DEUTSCH: Wer hat es geändert
);

-- DEUTSCH: Index für schnelle Suche nach E-Mail-Adresse
CREATE INDEX IF NOT EXISTS idx_shared_mailbox_email ON shared_mailbox_passwords(email);

-- DEUTSCH: Datenbank-Kommentare für Dokumentation
COMMENT ON TABLE shared_mailbox_passwords IS 'Speichert verschlüsselte Passwörter für geteilte Funktions-Postfächer';
COMMENT ON COLUMN shared_mailbox_passwords.encrypted_password IS 'AES-256-GCM verschlüsseltes Passwort';
