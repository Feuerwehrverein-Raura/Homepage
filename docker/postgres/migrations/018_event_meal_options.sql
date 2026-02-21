-- DEUTSCH: Migration 018 — Essensauswahl fuer GV-Events
-- DEUTSCH: Speichert die verfuegbaren Menue-Optionen als JSON-Array auf dem Event
-- DEUTSCH: z.B. ["Schweinsbraten mit Kartoffelstock", "Vegi Lasagne", "Vegan Bowl"]
-- DEUTSCH: Die Auswahl der Teilnehmer wird im bestehenden notes-JSON der Registrierung gespeichert

ALTER TABLE events ADD COLUMN IF NOT EXISTS meal_options JSONB;

-- DEUTSCH: Bestaetigung
DO $$ BEGIN RAISE NOTICE 'Migration 018 erfolgreich: meal_options Spalte hinzugefuegt'; END $$;
