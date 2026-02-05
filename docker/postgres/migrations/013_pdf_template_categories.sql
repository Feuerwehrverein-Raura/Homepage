-- DEUTSCH: Migration 013 — PDF-Template Kategorien mit Standard-Templates
-- DEUTSCH: Erweitert das Template-System um spezifische PDF-Typen mit vorkonfigurierten Layouts
-- ============================================

-- DEUTSCH: Verfügbare Kategorien:
-- DEUTSCH: - 'layout'           : Allgemeines Layout (Header, Footer, Farben)
-- DEUTSCH: - 'mitgliederbeitrag': Rechnung für Jahresbeiträge mit Swiss QR-Bill
-- DEUTSCH: - 'arbeitsplan'      : Arbeitsplan-PDF für Events/Schichten
-- DEUTSCH: - 'telefonliste'     : Mitglieder-Telefonliste
-- DEUTSCH: - 'brief'            : Standard-Brief
-- DEUTSCH: - 'rechnung'         : Generische Rechnung
-- DEUTSCH: - 'mahnbrief'        : Zahlungserinnerung/Mahnung

-- DEUTSCH: Kombinations-Index für schnelle Abfragen nach Kategorie + Status
CREATE INDEX IF NOT EXISTS idx_pdf_templates_category_active
    ON pdf_templates(category, is_active, is_default);

-- DEUTSCH: Standard-Templates für jede Kategorie einfügen
-- DEUTSCH: Diese können im visuellen PDF-Designer (pdf.fwv-raura.ch) angepasst werden

-- DEUTSCH: 1. Mitgliederbeitrag — Rechnungs-Layout mit Platzhaltern für QR-Bill
INSERT INTO pdf_templates (name, slug, category, template_schema, variables, is_default, is_active, description)
VALUES (
    'Standard Mitgliederbeitrag',
    'mitgliederbeitrag-standard',
    'mitgliederbeitrag',
    '{
        "schemas": [[
            {
                "type": "text",
                "name": "absender_name",
                "position": { "x": 118, "y": 15 },
                "width": 75,
                "height": 5,
                "fontSize": 10,
                "alignment": "left"
            },
            {
                "type": "text",
                "name": "absender_adresse",
                "position": { "x": 118, "y": 20 },
                "width": 75,
                "height": 10,
                "fontSize": 10,
                "alignment": "left"
            },
            {
                "type": "text",
                "name": "empfaenger",
                "position": { "x": 25, "y": 50 },
                "width": 85,
                "height": 25,
                "fontSize": 11,
                "alignment": "left"
            },
            {
                "type": "text",
                "name": "titel",
                "position": { "x": 25, "y": 85 },
                "width": 160,
                "height": 8,
                "fontSize": 14,
                "fontWeight": "bold",
                "alignment": "left"
            },
            {
                "type": "text",
                "name": "rechnungsnummer",
                "position": { "x": 25, "y": 95 },
                "width": 80,
                "height": 5,
                "fontSize": 10,
                "alignment": "left"
            },
            {
                "type": "text",
                "name": "datum",
                "position": { "x": 25, "y": 100 },
                "width": 80,
                "height": 5,
                "fontSize": 10,
                "alignment": "left"
            },
            {
                "type": "text",
                "name": "text",
                "position": { "x": 25, "y": 115 },
                "width": 160,
                "height": 30,
                "fontSize": 11,
                "alignment": "left"
            },
            {
                "type": "text",
                "name": "betrag",
                "position": { "x": 118, "y": 130 },
                "width": 70,
                "height": 8,
                "fontSize": 14,
                "fontWeight": "bold",
                "alignment": "right"
            },
            {
                "type": "text",
                "name": "footer",
                "position": { "x": 50, "y": 185 },
                "width": 110,
                "height": 5,
                "fontSize": 8,
                "alignment": "center",
                "fontColor": "#666666"
            }
        ]],
        "basePdf": { "width": 210, "height": 297, "padding": [0,0,0,0] }
    }',
    ARRAY['absender_name', 'absender_adresse', 'empfaenger', 'titel', 'rechnungsnummer', 'datum', 'text', 'betrag', 'footer'],
    true,
    true,
    'Standard-Template für Mitgliederbeitrags-Rechnungen mit Swiss QR-Bill'
)
ON CONFLICT (slug) DO NOTHING;

-- DEUTSCH: 2. Arbeitsplan — Übersicht mit Titel, Event-Name und Datum
INSERT INTO pdf_templates (name, slug, category, template_schema, variables, is_default, is_active, description)
VALUES (
    'Standard Arbeitsplan',
    'arbeitsplan-standard',
    'arbeitsplan',
    '{
        "schemas": [[
            {
                "type": "text",
                "name": "titel",
                "position": { "x": 15, "y": 15 },
                "width": 180,
                "height": 10,
                "fontSize": 18,
                "fontWeight": "bold",
                "alignment": "center"
            },
            {
                "type": "text",
                "name": "event_name",
                "position": { "x": 15, "y": 28 },
                "width": 180,
                "height": 8,
                "fontSize": 14,
                "alignment": "center"
            },
            {
                "type": "text",
                "name": "datum",
                "position": { "x": 15, "y": 38 },
                "width": 180,
                "height": 6,
                "fontSize": 12,
                "alignment": "center"
            }
        ]],
        "basePdf": { "width": 210, "height": 297, "padding": [0,0,0,0] }
    }',
    ARRAY['titel', 'event_name', 'datum', 'schichten'],
    true,
    true,
    'Standard-Template für Arbeitsplan-PDFs'
)
ON CONFLICT (slug) DO NOTHING;

-- DEUTSCH: 3. Telefonliste — Kompakte Mitgliederliste mit Kontaktdaten
INSERT INTO pdf_templates (name, slug, category, template_schema, variables, is_default, is_active, description)
VALUES (
    'Standard Telefonliste',
    'telefonliste-standard',
    'telefonliste',
    '{
        "schemas": [[
            {
                "type": "text",
                "name": "titel",
                "position": { "x": 15, "y": 15 },
                "width": 180,
                "height": 10,
                "fontSize": 16,
                "fontWeight": "bold",
                "alignment": "center"
            },
            {
                "type": "text",
                "name": "datum",
                "position": { "x": 15, "y": 27 },
                "width": 180,
                "height": 5,
                "fontSize": 10,
                "alignment": "center",
                "fontColor": "#666666"
            }
        ]],
        "basePdf": { "width": 210, "height": 297, "padding": [0,0,0,0] }
    }',
    ARRAY['titel', 'datum', 'mitglieder'],
    true,
    true,
    'Standard-Template für Telefonlisten'
)
ON CONFLICT (slug) DO NOTHING;

-- DEUTSCH: 4. Mahnbrief — Zahlungserinnerung mit Mahnstufe und offenem Betrag
INSERT INTO pdf_templates (name, slug, category, template_schema, variables, is_default, is_active, description)
VALUES (
    'Standard Mahnung',
    'mahnbrief-standard',
    'mahnbrief',
    '{
        "schemas": [[
            {
                "type": "text",
                "name": "absender",
                "position": { "x": 118, "y": 15 },
                "width": 75,
                "height": 15,
                "fontSize": 10,
                "alignment": "left"
            },
            {
                "type": "text",
                "name": "empfaenger",
                "position": { "x": 25, "y": 50 },
                "width": 85,
                "height": 25,
                "fontSize": 11,
                "alignment": "left"
            },
            {
                "type": "text",
                "name": "titel",
                "position": { "x": 25, "y": 85 },
                "width": 160,
                "height": 8,
                "fontSize": 14,
                "fontWeight": "bold",
                "alignment": "left"
            },
            {
                "type": "text",
                "name": "mahnstufe",
                "position": { "x": 150, "y": 85 },
                "width": 40,
                "height": 8,
                "fontSize": 12,
                "fontWeight": "bold",
                "alignment": "right",
                "fontColor": "#dc2626"
            },
            {
                "type": "text",
                "name": "text",
                "position": { "x": 25, "y": 100 },
                "width": 160,
                "height": 50,
                "fontSize": 11,
                "alignment": "left"
            },
            {
                "type": "text",
                "name": "offener_betrag",
                "position": { "x": 118, "y": 155 },
                "width": 70,
                "height": 8,
                "fontSize": 14,
                "fontWeight": "bold",
                "alignment": "right"
            }
        ]],
        "basePdf": { "width": 210, "height": 297, "padding": [0,0,0,0] }
    }',
    ARRAY['absender', 'empfaenger', 'titel', 'mahnstufe', 'text', 'offener_betrag', 'frist'],
    true,
    true,
    'Standard-Template für Mahnungen'
)
ON CONFLICT (slug) DO NOTHING;

-- DEUTSCH: Tabellen-Kommentar für Dokumentation in der Datenbank
COMMENT ON TABLE pdf_templates IS 'PDF-Templates für verschiedene Dokumenttypen. Kategorien: layout, mitgliederbeitrag, arbeitsplan, telefonliste, brief, rechnung, mahnbrief';
