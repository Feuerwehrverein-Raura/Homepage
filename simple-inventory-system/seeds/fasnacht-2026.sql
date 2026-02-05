-- Fasnacht 2026 Menu - "Zum Rote Schopf"
-- Alle Artikel für das Kassensystem (1000 Stück pro Artikel)
-- Script ist idempotent - kann mehrfach ausgeführt werden ohne Duplikate

-- Zuerst Kategorien erstellen falls nicht vorhanden
INSERT INTO categories (name, description) VALUES
    ('Getränke', 'Alle Getränke (Alkoholisch und Alkoholfrei)')
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, description) VALUES
    ('Essen', 'Speisen und Snacks')
ON CONFLICT (name) DO NOTHING;

-- Funktion zum Einfügen/Aktualisieren von Fasnacht-Artikeln
-- Prüft ob Artikel mit gleichem Namen existiert und aktualisiert ihn, sonst neuen anlegen
DO $$
DECLARE
    v_getraenke_id INTEGER;
    v_essen_id INTEGER;
BEGIN
    -- Kategorie-IDs holen
    SELECT id INTO v_getraenke_id FROM categories WHERE name = 'Getränke';
    SELECT id INTO v_essen_id FROM categories WHERE name = 'Essen';

    -- ============================================
    -- GETRÄNKE
    -- ============================================

    -- Shots & Klassiker
    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Martini', 5.00, 'Shots & Klassiker', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Martini' AND sale_category = 'Shots & Klassiker');
    UPDATE items SET sale_price = 5.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Martini' AND sale_category = 'Shots & Klassiker';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Ramazzotti', 5.00, 'Shots & Klassiker', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Ramazzotti' AND sale_category = 'Shots & Klassiker');
    UPDATE items SET sale_price = 5.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Ramazzotti' AND sale_category = 'Shots & Klassiker';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Berliner Luft', 5.00, 'Shots & Klassiker', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Berliner Luft' AND sale_category = 'Shots & Klassiker');
    UPDATE items SET sale_price = 5.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Berliner Luft' AND sale_category = 'Shots & Klassiker';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Shot Feigling', 5.00, 'Shots & Klassiker', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Shot Feigling' AND sale_category = 'Shots & Klassiker');
    UPDATE items SET sale_price = 5.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Shot Feigling' AND sale_category = 'Shots & Klassiker';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Shot Jägermeister', 5.00, 'Shots & Klassiker', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Shot Jägermeister' AND sale_category = 'Shots & Klassiker');
    UPDATE items SET sale_price = 5.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Shot Jägermeister' AND sale_category = 'Shots & Klassiker';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Suure Zunge', 5.00, 'Shots & Klassiker', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Suure Zunge' AND sale_category = 'Shots & Klassiker');
    UPDATE items SET sale_price = 5.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Suure Zunge' AND sale_category = 'Shots & Klassiker';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Cüpli', 6.00, 'Shots & Klassiker', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Cüpli' AND sale_category = 'Shots & Klassiker');
    UPDATE items SET sale_price = 6.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Cüpli' AND sale_category = 'Shots & Klassiker';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Baileys', 7.00, 'Shots & Klassiker', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Baileys' AND sale_category = 'Shots & Klassiker');
    UPDATE items SET sale_price = 7.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Baileys' AND sale_category = 'Shots & Klassiker';

    -- Longdrinks
    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Cuba Libre', 10.00, 'Longdrinks', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Cuba Libre' AND sale_category = 'Longdrinks');
    UPDATE items SET sale_price = 10.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Cuba Libre' AND sale_category = 'Longdrinks';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Gin Tonic', 10.00, 'Longdrinks', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Gin Tonic' AND sale_category = 'Longdrinks');
    UPDATE items SET sale_price = 10.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Gin Tonic' AND sale_category = 'Longdrinks';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Tequila Sunrise', 10.00, 'Longdrinks', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Tequila Sunrise' AND sale_category = 'Longdrinks');
    UPDATE items SET sale_price = 10.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Tequila Sunrise' AND sale_category = 'Longdrinks';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Williams Cola', 10.00, 'Longdrinks', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Williams Cola' AND sale_category = 'Longdrinks');
    UPDATE items SET sale_price = 10.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Williams Cola' AND sale_category = 'Longdrinks';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Whisky Cola', 10.00, 'Longdrinks', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Whisky Cola' AND sale_category = 'Longdrinks');
    UPDATE items SET sale_price = 10.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Whisky Cola' AND sale_category = 'Longdrinks';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Campari Orange', 10.00, 'Longdrinks', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Campari Orange' AND sale_category = 'Longdrinks');
    UPDATE items SET sale_price = 10.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Campari Orange' AND sale_category = 'Longdrinks';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Vodka Orange', 10.00, 'Longdrinks', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Vodka Orange' AND sale_category = 'Longdrinks');
    UPDATE items SET sale_price = 10.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Vodka Orange' AND sale_category = 'Longdrinks';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Bacardi Rum', 10.00, 'Longdrinks', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Bacardi Rum' AND sale_category = 'Longdrinks');
    UPDATE items SET sale_price = 10.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Bacardi Rum' AND sale_category = 'Longdrinks';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Fröschli', 10.00, 'Longdrinks', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Fröschli' AND sale_category = 'Longdrinks');
    UPDATE items SET sale_price = 10.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Fröschli' AND sale_category = 'Longdrinks';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Aperol mit Prosecco', 10.00, 'Longdrinks', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Aperol mit Prosecco' AND sale_category = 'Longdrinks');
    UPDATE items SET sale_price = 10.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Aperol mit Prosecco' AND sale_category = 'Longdrinks';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Flying Hirsch', 10.00, 'Longdrinks', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Flying Hirsch' AND sale_category = 'Longdrinks');
    UPDATE items SET sale_price = 10.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Flying Hirsch' AND sale_category = 'Longdrinks';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Vodka Energy', 10.00, 'Longdrinks', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Vodka Energy' AND sale_category = 'Longdrinks');
    UPDATE items SET sale_price = 10.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Vodka Energy' AND sale_category = 'Longdrinks';

    -- Wein
    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Fèchy weiss 5dl', 17.00, 'Wein', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Fèchy weiss 5dl' AND sale_category = 'Wein');
    UPDATE items SET sale_price = 17.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Fèchy weiss 5dl' AND sale_category = 'Wein';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Fèchy weiss 1dl', 3.50, 'Wein', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Fèchy weiss 1dl' AND sale_category = 'Wein');
    UPDATE items SET sale_price = 3.50, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Fèchy weiss 1dl' AND sale_category = 'Wein';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Dole rot 5dl', 17.00, 'Wein', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Dole rot 5dl' AND sale_category = 'Wein');
    UPDATE items SET sale_price = 17.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Dole rot 5dl' AND sale_category = 'Wein';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Dole rot 1dl', 3.50, 'Wein', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Dole rot 1dl' AND sale_category = 'Wein');
    UPDATE items SET sale_price = 3.50, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Dole rot 1dl' AND sale_category = 'Wein';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Los Condos 7dl', 26.00, 'Wein', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Los Condos 7dl' AND sale_category = 'Wein');
    UPDATE items SET sale_price = 26.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Los Condos 7dl' AND sale_category = 'Wein';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Los Condos 1dl', 4.00, 'Wein', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Los Condos 1dl' AND sale_category = 'Wein');
    UPDATE items SET sale_price = 4.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Los Condos 1dl' AND sale_category = 'Wein';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Wein gespritzt rot 2dl', 4.00, 'Wein', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Wein gespritzt rot 2dl' AND sale_category = 'Wein');
    UPDATE items SET sale_price = 4.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Wein gespritzt rot 2dl' AND sale_category = 'Wein';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Wein gespritzt weiss 2dl', 4.00, 'Wein', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Wein gespritzt weiss 2dl' AND sale_category = 'Wein');
    UPDATE items SET sale_price = 4.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Wein gespritzt weiss 2dl' AND sale_category = 'Wein';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Waggis 2dl', 5.00, 'Wein', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Waggis 2dl' AND sale_category = 'Wein');
    UPDATE items SET sale_price = 5.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Waggis 2dl' AND sale_category = 'Wein';

    -- Softdrinks & Mineralwasser
    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Mineral 3dl', 3.00, 'Softdrinks', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Mineral 3dl' AND sale_category = 'Softdrinks');
    UPDATE items SET sale_price = 3.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Mineral 3dl' AND sale_category = 'Softdrinks';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Coca Cola 3dl', 3.00, 'Softdrinks', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Coca Cola 3dl' AND sale_category = 'Softdrinks');
    UPDATE items SET sale_price = 3.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Coca Cola 3dl' AND sale_category = 'Softdrinks';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Citro 3dl', 3.00, 'Softdrinks', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Citro 3dl' AND sale_category = 'Softdrinks');
    UPDATE items SET sale_price = 3.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Citro 3dl' AND sale_category = 'Softdrinks';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Orangina 3dl', 3.00, 'Softdrinks', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Orangina 3dl' AND sale_category = 'Softdrinks');
    UPDATE items SET sale_price = 3.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Orangina 3dl' AND sale_category = 'Softdrinks';

    -- Bier
    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Bier 3dl', 4.50, 'Bier', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Bier 3dl' AND sale_category = 'Bier');
    UPDATE items SET sale_price = 4.50, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Bier 3dl' AND sale_category = 'Bier';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Panaché 3dl', 4.50, 'Bier', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Panaché 3dl' AND sale_category = 'Bier');
    UPDATE items SET sale_price = 4.50, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Panaché 3dl' AND sale_category = 'Bier';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Feldschlösschen alkoholfrei', 4.50, 'Bier', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Feldschlösschen alkoholfrei' AND sale_category = 'Bier');
    UPDATE items SET sale_price = 4.50, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Feldschlösschen alkoholfrei' AND sale_category = 'Bier';

    -- Kaffee
    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Kaffee crème', 3.00, 'Kaffee', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Kaffee crème' AND sale_category = 'Kaffee');
    UPDATE items SET sale_price = 3.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Kaffee crème' AND sale_category = 'Kaffee';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Tee', 3.00, 'Kaffee', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Tee' AND sale_category = 'Kaffee');
    UPDATE items SET sale_price = 3.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Tee' AND sale_category = 'Kaffee';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Kaffee fertig', 5.00, 'Kaffee', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Kaffee fertig' AND sale_category = 'Kaffee');
    UPDATE items SET sale_price = 5.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Kaffee fertig' AND sale_category = 'Kaffee';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Kaffee Lutz', 5.00, 'Kaffee', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Kaffee Lutz' AND sale_category = 'Kaffee');
    UPDATE items SET sale_price = 5.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Kaffee Lutz' AND sale_category = 'Kaffee';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Kaffee Raura', 6.00, 'Kaffee', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Kaffee Raura' AND sale_category = 'Kaffee');
    UPDATE items SET sale_price = 6.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Kaffee Raura' AND sale_category = 'Kaffee';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Kaffee Mucheli', 6.00, 'Kaffee', 'bar', true, 1000, 'Stück', true, v_getraenke_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Kaffee Mucheli' AND sale_category = 'Kaffee');
    UPDATE items SET sale_price = 6.00, quantity = 1000, category_id = v_getraenke_id, active = true
    WHERE name = 'Kaffee Mucheli' AND sale_category = 'Kaffee';

    -- ============================================
    -- ESSEN
    -- ============================================

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Thonbrötli', 4.00, 'Essen', 'kitchen', true, 1000, 'Stück', true, v_essen_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Thonbrötli' AND sale_category = 'Essen');
    UPDATE items SET sale_price = 4.00, quantity = 1000, category_id = v_essen_id, active = true
    WHERE name = 'Thonbrötli' AND sale_category = 'Essen';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Käsewähe', 6.00, 'Essen', 'kitchen', true, 1000, 'Stück', true, v_essen_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Käsewähe' AND sale_category = 'Essen');
    UPDATE items SET sale_price = 6.00, quantity = 1000, category_id = v_essen_id, active = true
    WHERE name = 'Käsewähe' AND sale_category = 'Essen';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Zwiebelwähe', 6.00, 'Essen', 'kitchen', true, 1000, 'Stück', true, v_essen_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Zwiebelwähe' AND sale_category = 'Essen');
    UPDATE items SET sale_price = 6.00, quantity = 1000, category_id = v_essen_id, active = true
    WHERE name = 'Zwiebelwähe' AND sale_category = 'Essen';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Spaghetti Bolognese', 12.00, 'Essen', 'kitchen', true, 1000, 'Stück', true, v_essen_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Spaghetti Bolognese' AND sale_category = 'Essen');
    UPDATE items SET sale_price = 12.00, quantity = 1000, category_id = v_essen_id, active = true
    WHERE name = 'Spaghetti Bolognese' AND sale_category = 'Essen';

    INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active, category_id)
    SELECT 'Spaghetti Napoli', 12.00, 'Essen', 'kitchen', true, 1000, 'Stück', true, v_essen_id
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Spaghetti Napoli' AND sale_category = 'Essen');
    UPDATE items SET sale_price = 12.00, quantity = 1000, category_id = v_essen_id, active = true
    WHERE name = 'Spaghetti Napoli' AND sale_category = 'Essen';

    RAISE NOTICE 'Fasnacht 2026 Menu erfolgreich geladen!';
END $$;

-- Bestätigung
SELECT
    'Fasnacht 2026 Menu Status' AS info,
    (SELECT COUNT(*) FROM items WHERE sale_category IN ('Shots & Klassiker', 'Longdrinks', 'Wein', 'Softdrinks', 'Bier', 'Kaffee', 'Essen') AND sellable = true) AS artikel_anzahl,
    (SELECT name FROM categories WHERE id = (SELECT category_id FROM items WHERE sale_category = 'Longdrinks' LIMIT 1)) AS getraenke_kategorie,
    (SELECT name FROM categories WHERE id = (SELECT category_id FROM items WHERE sale_category = 'Essen' LIMIT 1)) AS essen_kategorie;
