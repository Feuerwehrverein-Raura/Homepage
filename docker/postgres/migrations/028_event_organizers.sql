-- Mitorganisatoren eines Anlasses (Oktober 2026).
--
-- Ein Anlass hat weiterhin EINEN Haupt-Organisator (events.organizer_id bzw.
-- organizer_name/organizer_email). Dazu kommen beliebig viele
-- Mitorganisatoren mit denselben Rechten: Mitglieder (member_id) oder Externe
-- (name + email) mit eigenem Login fuers Event-Dashboard (password_hash als
-- scrypt mit Salz, eigenes Ablaufdatum).
--
-- api-events legt die Tabelle beim Start ebenfalls an (src/mitorganisatoren.js,
-- SCHEMA_SQL) — beide mit IF NOT EXISTS, gleich gehalten.

CREATE TABLE IF NOT EXISTS event_organizers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    name VARCHAR(200),
    email VARCHAR(200),
    password_hash TEXT,
    access_expires TIMESTAMP,
    created_by VARCHAR(200),
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT event_organizers_mitglied_oder_extern
        CHECK (member_id IS NOT NULL OR (name IS NOT NULL AND email IS NOT NULL))
);

-- Pro Anlass jedes Mitglied bzw. jede externe E-Mail nur einmal.
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_organizers_mitglied
    ON event_organizers(event_id, member_id) WHERE member_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_organizers_email
    ON event_organizers(event_id, LOWER(email)) WHERE member_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_organizers_member ON event_organizers(member_id);
CREATE INDEX IF NOT EXISTS idx_event_organizers_email ON event_organizers(LOWER(email));
