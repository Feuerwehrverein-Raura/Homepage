-- DEUTSCH: Migration 031 — Push "zur Anmeldung offen" einmal je Anlass
-- DEUTSCH: api-events meldet allen Mitgliedern per App-Push, wenn ein Anlass
-- DEUTSCH: zur Anmeldung offen ist (beim Anlegen oder spaeter, z.B. Vorschlag
-- DEUTSCH: genehmigt). NULL = noch nicht gemeldet, TIMESTAMP = Meldezeitpunkt
ALTER TABLE events ADD COLUMN IF NOT EXISTS anmeldung_gemeldet_at TIMESTAMP;
