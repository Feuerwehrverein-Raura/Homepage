-- DEUTSCH: Persistente Login-Tokens fuer die Vorstand-Android-App.
-- Ein Token wird einmal generiert, als QR ausgedruckt und dauerhaft verwendet.
-- Pro Funktions-Account koennen mehrere Tokens existieren (z.B. mehrere Geraete)
-- und sind einzeln widerrufbar.
CREATE TABLE IF NOT EXISTS vorstand_app_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(200) NOT NULL,
    token VARCHAR(80) NOT NULL UNIQUE,
    description VARCHAR(200),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMP,
    revoked_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vorstand_app_tokens_email ON vorstand_app_tokens(email) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vorstand_app_tokens_token ON vorstand_app_tokens(token) WHERE revoked_at IS NULL;
