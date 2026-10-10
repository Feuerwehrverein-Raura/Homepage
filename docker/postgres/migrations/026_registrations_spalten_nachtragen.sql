-- Spalten nachtragen, die in der Produktion laengst existieren, im Repo aber
-- fehlten (irgendwann von Hand angelegt). Aufgefallen am 11.10.2026: das
-- Backend fragt r.phone ab, eine aus init.sql + Migrationen frisch gebaute
-- Datenbank kennt die Spalte nicht — GET /events lief dort auf einen Fehler.
-- Typen aus der Produktion uebernommen; IF NOT EXISTS, aendert dort nichts.

ALTER TABLE registrations ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS approved_by VARCHAR(200);
