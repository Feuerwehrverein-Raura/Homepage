-- Migration: Arbeitsplan Tracking
-- Tracks when the work plan PDF was sent to participants

-- Field to track when the arbeitsplan PDF was sent
-- NULL = not sent yet
-- TIMESTAMP = when it was sent
ALTER TABLE events ADD COLUMN IF NOT EXISTS arbeitsplan_sent_at TIMESTAMP;
