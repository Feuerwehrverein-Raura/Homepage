-- Migration: Event Groups for combined Arbeitsplan
-- Allows grouping related events (e.g., Fasnacht) together

CREATE TABLE IF NOT EXISTS event_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(255)
);

-- Junction table for many-to-many relationship
CREATE TABLE IF NOT EXISTS event_group_members (
    group_id UUID NOT NULL REFERENCES event_groups(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    sort_order INT DEFAULT 0,
    PRIMARY KEY (group_id, event_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_event_group_members_group ON event_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_event_group_members_event ON event_group_members(event_id);
