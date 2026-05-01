-- DEUTSCH: Spalte fuer verschluesseltes Event-Passwort, damit bei einem
-- Organisator-Wechsel das gleiche Passwort wiederverwendet und in der
-- Benachrichtigungs-E-Mail mitgesendet werden kann (Hash allein reicht nicht).
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_password_encrypted TEXT;
