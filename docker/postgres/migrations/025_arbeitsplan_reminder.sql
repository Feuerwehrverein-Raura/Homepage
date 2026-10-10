-- DEUTSCH: Migration 025 — Arbeitsplan-Versand eine Woche vor dem Anlass
-- DEUTSCH: Der taegliche Job in api-events schickt den aktuellen Arbeitsplan
-- DEUTSCH: einmalig an alle eingeteilten Helfer. Unabhaengig von
-- DEUTSCH: arbeitsplan_sent_at (Versand sobald alle Schichten besetzt sind).
-- DEUTSCH: NULL = noch nicht versendet, TIMESTAMP = Versandzeitpunkt
ALTER TABLE events ADD COLUMN IF NOT EXISTS arbeitsplan_reminder_sent_at TIMESTAMP;
