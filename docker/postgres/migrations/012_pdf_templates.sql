-- Migration 012: PDF Templates (pdfme) and Organisation Settings
-- ============================================

-- PDF Templates für pdfme Layout-Editor
CREATE TABLE IF NOT EXISTS pdf_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identifikation
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    category VARCHAR(50), -- 'rechnung', 'arbeitsplan', 'mitgliederliste', 'brief', etc.

    -- pdfme Template Schema (JSON)
    template_schema JSONB NOT NULL,

    -- Basis-PDF (optional, als Base64)
    base_pdf TEXT,

    -- Verfügbare Variablen für dieses Template
    variables TEXT[],

    -- Status
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,

    -- Meta
    created_by UUID REFERENCES members(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdf_templates_slug ON pdf_templates(slug);
CREATE INDEX IF NOT EXISTS idx_pdf_templates_category ON pdf_templates(category);

-- Organisation Settings (für Logo, Farben, Bankdaten etc.)
CREATE TABLE IF NOT EXISTS organisation_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    value_json JSONB,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Default Organisation Settings einfügen (nur wenn nicht existiert)
INSERT INTO organisation_settings (key, value, description)
SELECT * FROM (VALUES
    ('org_name', 'Feuerwehrverein Raura', 'Name der Organisation'),
    ('org_address', 'Ruswil', 'Adresse'),
    ('org_plz', '6017', 'PLZ'),
    ('org_ort', 'Ruswil', 'Ort'),
    ('org_email', 'info@fwv-raura.ch', 'E-Mail'),
    ('org_website', 'www.fwv-raura.ch', 'Website'),
    ('org_phone', '', 'Telefon'),
    ('bank_name', 'Raiffeisenbank', 'Bank Name'),
    ('bank_iban', 'CH93 0076 2011 6238 5295 7', 'IBAN'),
    ('bank_qr_iban', '', 'QR-IBAN für QR-Rechnungen'),
    ('primary_color', '#dc2626', 'Primärfarbe (Hex)'),
    ('secondary_color', '#1f2937', 'Sekundärfarbe (Hex)')
) AS v(key, value, description)
WHERE NOT EXISTS (SELECT 1 FROM organisation_settings LIMIT 1);
