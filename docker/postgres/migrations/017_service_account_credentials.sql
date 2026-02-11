-- DEUTSCH: Migration 017 — Tabelle fuer Service-Account Zugangsdaten
-- DEUTSCH: Speichert das aktuelle Passwort des generischen Service-Accounts (roterschopf)
-- DEUTSCH: Passwort wird alle 7 Tage automatisch rotiert (via Backend-Scheduled-Task)

CREATE TABLE IF NOT EXISTS service_account_credentials (
    id SERIAL PRIMARY KEY,
    account_name VARCHAR(100) NOT NULL UNIQUE,
    username VARCHAR(100) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    encrypted_password TEXT NOT NULL,
    description TEXT,
    rotation_days INTEGER NOT NULL DEFAULT 7,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- DEUTSCH: Index fuer schnellen Zugriff per account_name
CREATE INDEX IF NOT EXISTS idx_service_account_name ON service_account_credentials(account_name);
