-- DEUTSCH: Migration 020 — PDF-Anhang fuer Events
-- Ermoeglicht das Hochladen von PDFs (z.B. Flyer, Programme) zu Events
ALTER TABLE events ADD COLUMN IF NOT EXISTS pdf_attachment TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS pdf_filename VARCHAR(255);
