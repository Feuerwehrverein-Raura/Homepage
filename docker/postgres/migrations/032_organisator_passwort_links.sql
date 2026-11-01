-- Links "Passwort festlegen" fuer externe Organisatoren und Mitorganisatoren
-- (backend-events src/mitorganisatoren.js, passwortLinkMail). Statt ein
-- Passwort im Klartext per Mail zu schicken, legt die Person es selbst fest.
-- organizer_id NULL = Haupt-Organisator (events.event_password_hash).
-- Gespeichert ist nur der SHA-256 des Tokens. Legt der Server beim Start
-- auch selbst an (SCHEMA_SQL).
CREATE TABLE IF NOT EXISTS organisator_passwort_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_hash TEXT NOT NULL UNIQUE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    organizer_id UUID REFERENCES event_organizers(id) ON DELETE CASCADE,
    gueltig_bis TIMESTAMP NOT NULL,
    benutzt_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
