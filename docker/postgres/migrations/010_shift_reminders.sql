-- Migration: Shift reminder tracking
-- Tracks which reminders have been sent to avoid duplicates

CREATE TABLE IF NOT EXISTS shift_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
    shift_id UUID NOT NULL,
    reminder_type VARCHAR(50) NOT NULL DEFAULT 'day_before', -- 'day_before', 'week_before', etc.
    sent_at TIMESTAMP DEFAULT NOW(),
    email VARCHAR(255),

    -- Prevent duplicate reminders
    UNIQUE(registration_id, shift_id, reminder_type)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_shift_reminders_registration ON shift_reminders(registration_id);
CREATE INDEX IF NOT EXISTS idx_shift_reminders_shift ON shift_reminders(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_reminders_sent ON shift_reminders(sent_at);
