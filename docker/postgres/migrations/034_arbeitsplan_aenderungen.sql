-- Arbeitsplan nach dem Versand geaendert (backend-events
-- src/arbeitsplan-update.js): verschickter Stand und eine laufende Aenderung.
-- Legt der Server beim Start auch selbst an (ensureArbeitsplanUpdateSchema).
ALTER TABLE events
    ADD COLUMN IF NOT EXISTS arbeitsplan_stand_json JSONB,
    ADD COLUMN IF NOT EXISTS arbeitsplan_neu_stand TEXT,
    ADD COLUMN IF NOT EXISTS arbeitsplan_neu_seit TIMESTAMP;
