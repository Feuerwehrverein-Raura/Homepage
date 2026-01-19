-- Migration: Add member_registrations table
-- Run this on production if the table doesn't exist

CREATE TABLE IF NOT EXISTS member_registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Persönliche Daten
    vorname VARCHAR(100) NOT NULL,
    nachname VARCHAR(100) NOT NULL,
    strasse VARCHAR(200),
    plz VARCHAR(10),
    ort VARCHAR(100),
    telefon VARCHAR(50),
    mobile VARCHAR(50),
    email VARCHAR(200) NOT NULL,

    -- Feuerwehr-Status
    feuerwehr_status VARCHAR(50), -- 'active', 'former', 'no'

    -- Korrespondenz
    korrespondenz_methode VARCHAR(50), -- 'email', 'post'
    korrespondenz_adresse TEXT,

    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    processed_by VARCHAR(200),
    processed_at TIMESTAMP,
    rejection_reason TEXT,

    -- Referenz zum erstellten Mitglied (wenn genehmigt)
    member_id UUID REFERENCES members(id),

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registrations_status ON member_registrations(status);
CREATE INDEX IF NOT EXISTS idx_registrations_email ON member_registrations(email);

-- Verify
SELECT 'member_registrations table created successfully' AS result;
