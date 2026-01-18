-- Migration: Add bereich column to shifts table
-- Date: 2026-01-18

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS bereich VARCHAR(50) DEFAULT 'Allgemein';
