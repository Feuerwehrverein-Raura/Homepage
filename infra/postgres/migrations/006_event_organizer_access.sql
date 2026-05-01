-- DEUTSCH: Migration 006 — Event-Organisator Zugangssystem
-- DEUTSCH: Erweitert Events um Organisator-Felder und event-spezifische Login-Daten
-- DEUTSCH: Damit können externe Organisatoren (nicht Vorstandsmitglieder) Events verwalten

-- DEUTSCH: Organisator-Name und E-Mail direkt am Event speichern (statt FK auf members)
ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer_name VARCHAR(200);
ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer_email VARCHAR(200);

-- DEUTSCH: Event-spezifische Login-Felder (temporärer Zugang für den Organisator)
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_email VARCHAR(200);          -- DEUTSCH: Login-E-Mail für Event-Zugang
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_password_hash VARCHAR(255);  -- DEUTSCH: Gehashtes Passwort
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_access_expires TIMESTAMP;    -- DEUTSCH: Ablaufdatum des Zugangs

-- DEUTSCH: Index für schnelle Login-Suche nach Event-E-Mail
CREATE INDEX IF NOT EXISTS idx_events_event_email ON events(event_email) WHERE event_email IS NOT NULL;
