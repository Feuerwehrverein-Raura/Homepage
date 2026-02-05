-- DEUTSCH: Migration 004 — Bereich-Spalte für Schichten
-- DEUTSCH: Datum: 2026-01-18
-- DEUTSCH: Fügt eine Bereich-Spalte hinzu, damit Schichten nach Arbeitsbereich
-- DEUTSCH: gruppiert werden können (z.B. Bar, Küche, Kasse, Aufbau, Abbau)

-- DEUTSCH: Neue Spalte "bereich" mit Standardwert "Allgemein"
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS bereich VARCHAR(50) DEFAULT 'Allgemein';
