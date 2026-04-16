-- DEUTSCH: Migration 019 - Mitgliedsbeitrags-Verwaltung
-- Erstellt Tabellen fuer jaehrliche Beitragseinstellungen, Zahlungsverfolgung
-- und Zuweisung von Bank-Referenznummern zu Mitgliedern

-- DEUTSCH: Jaehrliche Beitragseinstellungen (Betrag, GV-Datum, Faelligkeit pro Jahr)
CREATE TABLE IF NOT EXISTS membership_fee_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    year INTEGER NOT NULL UNIQUE,
    amount DECIMAL(10,2) NOT NULL,
    gv_date VARCHAR(50),
    due_date DATE,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- DEUTSCH: Mitgliedsbeitrags-Zahlungen pro Mitglied und Jahr
-- Verknuepft Bank-Referenznummer mit Mitglied, trackt Zahlungsstatus
CREATE TABLE IF NOT EXISTS membership_fee_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    reference_nr VARCHAR(20) DEFAULT '',
    bank_reference VARCHAR(50),
    status VARCHAR(20) DEFAULT 'offen',
    paid_date DATE,
    payment_method VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(member_id, year)
);

-- DEUTSCH: Index fuer schnelle Abfragen nach Jahr und Status
CREATE INDEX IF NOT EXISTS idx_fee_payments_year ON membership_fee_payments(year);
CREATE INDEX IF NOT EXISTS idx_fee_payments_status ON membership_fee_payments(status);
CREATE INDEX IF NOT EXISTS idx_fee_payments_reference ON membership_fee_payments(reference_nr);
CREATE INDEX IF NOT EXISTS idx_fee_payments_bank_ref ON membership_fee_payments(bank_reference);

-- DEUTSCH: Bank-Referenz pro Mitglied (wird von der Bank vergeben, bleibt konstant)
ALTER TABLE members ADD COLUMN IF NOT EXISTS bank_reference VARCHAR(20);
