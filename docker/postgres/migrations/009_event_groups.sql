-- DEUTSCH: Migration 009 — Event-Gruppen für kombinierte Arbeitspläne
-- DEUTSCH: Ermöglicht das Gruppieren zusammengehöriger Events (z.B. "Fasnacht 2026" = Aufbau + Fest + Abbau)
-- DEUTSCH: Ein kombinierter Arbeitsplan kann dann alle Events der Gruppe zusammenfassen

-- DEUTSCH: Event-Gruppen — fasst mehrere Events zu einer Gruppe zusammen
CREATE TABLE IF NOT EXISTS event_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,                          -- DEUTSCH: Gruppenname (z.B. "Fasnacht 2026")
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(255)
);

-- DEUTSCH: Verknüpfungstabelle — ordnet Events ihren Gruppen zu (n:m Beziehung)
CREATE TABLE IF NOT EXISTS event_group_members (
    group_id UUID NOT NULL REFERENCES event_groups(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    sort_order INT DEFAULT 0,                             -- DEUTSCH: Sortierreihenfolge innerhalb der Gruppe
    PRIMARY KEY (group_id, event_id)
);

-- DEUTSCH: Indizes für schnelle Suche nach Gruppe und Event
CREATE INDEX IF NOT EXISTS idx_event_group_members_group ON event_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_event_group_members_event ON event_group_members(event_id);
