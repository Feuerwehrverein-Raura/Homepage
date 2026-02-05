-- DEUTSCH: Migration 007 — Arbeitsplan-Versand-Tracking
-- DEUTSCH: Speichert wann der Arbeitsplan-PDF an die Teilnehmer versendet wurde
-- DEUTSCH: NULL = noch nicht versendet, TIMESTAMP = Versanddatum
-- DEUTSCH: Neue Spalte — Zeitpunkt wann der Arbeitsplan zuletzt versendet wurde
ALTER TABLE events ADD COLUMN IF NOT EXISTS arbeitsplan_sent_at TIMESTAMP;
