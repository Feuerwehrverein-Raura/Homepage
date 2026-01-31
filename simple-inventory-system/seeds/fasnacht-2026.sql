-- Fasnacht 2026 Menu - "Zum Rote Schopf"
-- Alle Artikel für das Kassensystem

-- Zuerst Kategorie erstellen falls nicht vorhanden
INSERT INTO categories (name, description) VALUES
    ('Fasnacht', 'Fasnacht 2026 - Zum Rote Schopf')
ON CONFLICT (name) DO NOTHING;

-- Shots & Klassiker
INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active)
VALUES
    ('Martini', 5.00, 'Shots & Klassiker', 'bar', true, 100, 'Stück', true),
    ('Ramazzotti', 5.00, 'Shots & Klassiker', 'bar', true, 100, 'Stück', true),
    ('Berliner Luft', 5.00, 'Shots & Klassiker', 'bar', true, 100, 'Stück', true),
    ('Shot Feigling', 5.00, 'Shots & Klassiker', 'bar', true, 100, 'Stück', true),
    ('Shot Jägermeister', 5.00, 'Shots & Klassiker', 'bar', true, 100, 'Stück', true),
    ('Suure Zunge', 5.00, 'Shots & Klassiker', 'bar', true, 100, 'Stück', true),
    ('Cüpli', 6.00, 'Shots & Klassiker', 'bar', true, 100, 'Stück', true),
    ('Baileys', 7.00, 'Shots & Klassiker', 'bar', true, 100, 'Stück', true)
ON CONFLICT DO NOTHING;

-- Longdrinks
INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active)
VALUES
    ('Cuba Libre', 10.00, 'Longdrinks', 'bar', true, 100, 'Stück', true),
    ('Gin Tonic', 10.00, 'Longdrinks', 'bar', true, 100, 'Stück', true),
    ('Tequila Sunrise', 10.00, 'Longdrinks', 'bar', true, 100, 'Stück', true),
    ('Williams Cola', 10.00, 'Longdrinks', 'bar', true, 100, 'Stück', true),
    ('Whisky Cola', 10.00, 'Longdrinks', 'bar', true, 100, 'Stück', true),
    ('Campari Orange', 10.00, 'Longdrinks', 'bar', true, 100, 'Stück', true),
    ('Vodka Orange', 10.00, 'Longdrinks', 'bar', true, 100, 'Stück', true),
    ('Bacardi Rum', 10.00, 'Longdrinks', 'bar', true, 100, 'Stück', true),
    ('Fröschli', 10.00, 'Longdrinks', 'bar', true, 100, 'Stück', true),
    ('Aperol mit Prosecco', 10.00, 'Longdrinks', 'bar', true, 100, 'Stück', true),
    ('Flying Hirsch', 10.00, 'Longdrinks', 'bar', true, 100, 'Stück', true),
    ('Vodka Energy', 10.00, 'Longdrinks', 'bar', true, 100, 'Stück', true)
ON CONFLICT DO NOTHING;

-- Wein
INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active)
VALUES
    ('Fèchy weiss 5dl', 17.00, 'Wein', 'bar', true, 50, 'Stück', true),
    ('Fèchy weiss 1dl', 3.50, 'Wein', 'bar', true, 200, 'Stück', true),
    ('Dole rot 5dl', 17.00, 'Wein', 'bar', true, 50, 'Stück', true),
    ('Dole rot 1dl', 3.50, 'Wein', 'bar', true, 200, 'Stück', true),
    ('Los Condos 7dl', 26.00, 'Wein', 'bar', true, 30, 'Stück', true),
    ('Los Condos 1dl', 4.00, 'Wein', 'bar', true, 200, 'Stück', true),
    ('Wein gespritzt rot 2dl', 4.00, 'Wein', 'bar', true, 100, 'Stück', true),
    ('Wein gespritzt weiss 2dl', 4.00, 'Wein', 'bar', true, 100, 'Stück', true),
    ('Waggis 2dl', 5.00, 'Wein', 'bar', true, 100, 'Stück', true)
ON CONFLICT DO NOTHING;

-- Softdrinks & Mineralwasser
INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active)
VALUES
    ('Mineral 3dl', 3.00, 'Softdrinks', 'bar', true, 200, 'Stück', true),
    ('Coca Cola 3dl', 3.00, 'Softdrinks', 'bar', true, 200, 'Stück', true),
    ('Citro 3dl', 3.00, 'Softdrinks', 'bar', true, 200, 'Stück', true),
    ('Orangina 3dl', 3.00, 'Softdrinks', 'bar', true, 200, 'Stück', true)
ON CONFLICT DO NOTHING;

-- Bier
INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active)
VALUES
    ('Bier 3dl', 4.50, 'Bier', 'bar', true, 200, 'Stück', true),
    ('Panaché 3dl', 4.50, 'Bier', 'bar', true, 200, 'Stück', true),
    ('Feldschlösschen alkoholfrei', 4.50, 'Bier', 'bar', true, 50, 'Stück', true)
ON CONFLICT DO NOTHING;

-- Kaffee
INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active)
VALUES
    ('Kaffee crème', 3.00, 'Kaffee', 'bar', true, 200, 'Stück', true),
    ('Tee', 3.00, 'Kaffee', 'bar', true, 200, 'Stück', true),
    ('Kaffee fertig', 5.00, 'Kaffee', 'bar', true, 200, 'Stück', true),
    ('Kaffee Lutz', 5.00, 'Kaffee', 'bar', true, 200, 'Stück', true),
    ('Kaffee Raura', 6.00, 'Kaffee', 'bar', true, 200, 'Stück', true),
    ('Kaffee Mucheli', 6.00, 'Kaffee', 'bar', true, 200, 'Stück', true)
ON CONFLICT DO NOTHING;

-- Essen (Küchendrucker)
INSERT INTO items (name, sale_price, sale_category, printer_station, sellable, quantity, unit, active)
VALUES
    ('Thonbrötli', 4.00, 'Essen', 'kitchen', true, 50, 'Stück', true),
    ('Käsewähe', 6.00, 'Essen', 'kitchen', true, 50, 'Stück', true),
    ('Zwiebelwähe', 6.00, 'Essen', 'kitchen', true, 50, 'Stück', true),
    ('Spaghetti Bolognese', 12.00, 'Essen', 'kitchen', true, 100, 'Stück', true),
    ('Spaghetti Napoli', 12.00, 'Essen', 'kitchen', true, 100, 'Stück', true)
ON CONFLICT DO NOTHING;

-- Bestätigung
SELECT 'Fasnacht 2026 Menu erfolgreich geladen!' AS status, COUNT(*) AS artikel_anzahl FROM items WHERE sale_category IN ('Shots & Klassiker', 'Longdrinks', 'Wein', 'Softdrinks', 'Bier', 'Kaffee', 'Essen');
