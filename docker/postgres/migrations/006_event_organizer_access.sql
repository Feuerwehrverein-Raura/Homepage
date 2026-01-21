-- Migration: Event Organizer Access System
-- Adds organizer name/email fields and event-specific login credentials

-- Add organizer fields (replacing organizer_id FK approach)
ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer_name VARCHAR(200);
ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer_email VARCHAR(200);

-- Add event-specific login fields
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_email VARCHAR(200);
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_password_hash VARCHAR(255);
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_access_expires TIMESTAMP;

-- Index for event login lookup
CREATE INDEX IF NOT EXISTS idx_events_event_email ON events(event_email) WHERE event_email IS NOT NULL;
