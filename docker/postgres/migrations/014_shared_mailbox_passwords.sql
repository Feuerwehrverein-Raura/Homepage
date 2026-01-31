-- Migration: Shared Mailbox Passwords
-- Speichert Passwörter für geteilte Funktions-Postfächer
-- Damit mehrere Personen mit gleicher Funktion das gleiche Passwort sehen können

CREATE TABLE IF NOT EXISTS shared_mailbox_passwords (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,           -- z.B. kassier@fwv-raura.ch
    encrypted_password TEXT NOT NULL,              -- AES-256 verschlüsseltes Passwort
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES members(id) ON DELETE SET NULL
);

-- Index für schnelle Suche nach E-Mail
CREATE INDEX IF NOT EXISTS idx_shared_mailbox_email ON shared_mailbox_passwords(email);

-- Kommentar zur Tabelle
COMMENT ON TABLE shared_mailbox_passwords IS 'Speichert verschlüsselte Passwörter für geteilte Funktions-Postfächer';
COMMENT ON COLUMN shared_mailbox_passwords.encrypted_password IS 'AES-256-GCM verschlüsseltes Passwort';
