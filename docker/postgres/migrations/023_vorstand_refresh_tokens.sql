-- DEUTSCH: Refresh-Tokens fuer die Vorstand-App. Beim Login wird ein UUID-Token
-- ausgegeben, der mit 7 Tagen Lebensdauer gespeichert wird. Bei jedem Refresh
-- wird ein neuer Token ausgegeben und der alte invalidiert ("rotating refresh"),
-- die expires_at-Zeit beginnt von neuem zu laufen — solange die App alle 7 Tage
-- einmal genutzt wird, bleibt der User eingeloggt.
CREATE TABLE IF NOT EXISTS vorstand_refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(200) NOT NULL,
    token VARCHAR(80) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    revoked_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vorstand_refresh_tokens_token
    ON vorstand_refresh_tokens(token) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vorstand_refresh_tokens_email
    ON vorstand_refresh_tokens(email) WHERE revoked_at IS NULL;
