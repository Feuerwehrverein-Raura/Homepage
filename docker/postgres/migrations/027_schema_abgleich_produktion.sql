-- Schema-Abgleich mit der Produktion (11.10.2026).
--
-- Diese Spalten existieren in der Produktion, wurden aber weder in init.sql
-- noch in einer Migration noch beim Start eines Backends angelegt — vermutlich
-- einst von Hand. Eine aus dem Repo neu gebaute Datenbank (Server-Umzug,
-- Wiederherstellung, Tests) haette sie nicht: Profilfotos, Passwort-Login,
-- "Termin steht noch nicht fest" und Teile der Beitrittsanmeldung waeren
-- kaputt. Typen aus der Produktion (information_schema) uebernommen;
-- IF NOT EXISTS, aendert dort nichts.
--
-- Gefunden per Vergleich aller Spalten Produktion gegen frisch gebautes
-- Repo-Schema. Tabellen, die die Backends beim Start selbst anlegen
-- (fcm_tokens, kiosk_*, event_organizer_notes, ...), sind bewusst nicht hier.

ALTER TABLE members ADD COLUMN IF NOT EXISTS feuerwehr_zugehoerigkeit VARCHAR(200);
ALTER TABLE members ADD COLUMN IF NOT EXISTS foto VARCHAR(500);
ALTER TABLE members ADD COLUMN IF NOT EXISTS mitgliederbild VARCHAR(500);
ALTER TABLE members ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS tshirt_groesse VARCHAR(10);

ALTER TABLE member_registrations ADD COLUMN IF NOT EXISTS anrede VARCHAR;
ALTER TABLE member_registrations ADD COLUMN IF NOT EXISTS geburtstag DATE;
ALTER TABLE member_registrations ADD COLUMN IF NOT EXISTS geschlecht VARCHAR;

-- Termin steht noch nicht fest (siehe Commit 27b473c): start_date bleibt als
-- grobe Einordnung gesetzt, angezeigt wird "Datum noch offen".
ALTER TABLE events ADD COLUMN IF NOT EXISTS datum_offen BOOLEAN DEFAULT false;
