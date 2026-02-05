-- DEUTSCH: Migration 010 — Schicht-Erinnerungen Tracking
-- DEUTSCH: Speichert welche Erinnerungs-E-Mails bereits versendet wurden,
-- DEUTSCH: um doppelte Benachrichtigungen zu verhindern (UNIQUE-Constraint)

CREATE TABLE IF NOT EXISTS shift_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,  -- DEUTSCH: Zu welcher Anmeldung
    shift_id UUID NOT NULL,                              -- DEUTSCH: Für welche Schicht
    reminder_type VARCHAR(50) NOT NULL DEFAULT 'day_before',  -- DEUTSCH: Art: 'day_before' (1 Tag vorher), 'week_before' etc.
    sent_at TIMESTAMP DEFAULT NOW(),                     -- DEUTSCH: Wann wurde die Erinnerung gesendet
    email VARCHAR(255),                                  -- DEUTSCH: An welche E-Mail

    -- DEUTSCH: Verhindert doppelte Erinnerungen (gleiche Anmeldung + Schicht + Typ = nur einmal)
    UNIQUE(registration_id, shift_id, reminder_type)
);

-- DEUTSCH: Indizes für schnelle Abfragen
CREATE INDEX IF NOT EXISTS idx_shift_reminders_registration ON shift_reminders(registration_id);
CREATE INDEX IF NOT EXISTS idx_shift_reminders_shift ON shift_reminders(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_reminders_sent ON shift_reminders(sent_at);
