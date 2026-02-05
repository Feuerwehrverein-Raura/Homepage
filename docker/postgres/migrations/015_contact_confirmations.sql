-- DEUTSCH: Migration 015 — Kontaktformular Double-Opt-In Spam-Schutz
-- DEUTSCH: Speichert unbestätigte Kontaktanfragen bis der Absender per E-Mail-Link bestätigt
-- DEUTSCH: Ablauf: 1) Formular absenden → Token generiert → Bestätigungs-E-Mail
-- DEUTSCH:         2) Besucher klickt Link → confirmed=true → Nachricht wird weitergeleitet
CREATE TABLE IF NOT EXISTS contact_pending (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token VARCHAR(64) UNIQUE NOT NULL,                   -- DEUTSCH: Bestätigungstoken (im E-Mail-Link)
    payload JSONB NOT NULL,                              -- DEUTSCH: Kontaktdaten (name, email, nachricht, betreff)
    ip_address VARCHAR(45),                              -- DEUTSCH: IP des Absenders (für Rate-Limiting)
    confirmed BOOLEAN DEFAULT false,                     -- DEUTSCH: true = Absender hat per E-Mail bestätigt
    expires_at TIMESTAMP NOT NULL,                       -- DEUTSCH: Verfällt nach 24 Stunden
    created_at TIMESTAMP DEFAULT NOW()
);

-- DEUTSCH: Index für schnelle Token-Suche bei Bestätigung
CREATE INDEX IF NOT EXISTS idx_contact_pending_token ON contact_pending(token);

-- DEUTSCH: Abgelaufene Einträge (älter als 24h) sollten regelmässig per Cron gelöscht werden
