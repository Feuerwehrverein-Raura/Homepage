-- Example items for a typical event

INSERT INTO items (name, price, category, printer_station) VALUES
-- Getränke (Bar)
('Bier 0.5l', 5.50, 'Getränke', 'bar'),
('Weisswein 2dl', 6.00, 'Getränke', 'bar'),
('Rotwein 2dl', 6.00, 'Getränke', 'bar'),
('Cola 0.5l', 4.00, 'Getränke', 'bar'),
('Sprite 0.5l', 4.00, 'Getränke', 'bar'),
('Wasser 0.5l', 3.00, 'Getränke', 'bar'),
('Kaffee', 3.50, 'Getränke', 'bar'),
('Espresso', 3.00, 'Getränke', 'bar'),

-- Essen (Küche)
('Bratwurst mit Brot', 8.00, 'Essen', 'kitchen'),
('Pommes', 4.50, 'Essen', 'kitchen'),
('Hamburger', 9.50, 'Essen', 'kitchen'),
('Cheeseburger', 10.50, 'Essen', 'kitchen'),
('Chicken Nuggets', 6.00, 'Essen', 'kitchen'),
('Salat', 7.00, 'Essen', 'kitchen'),

-- Snacks (Bar)
('Chips', 3.00, 'Snacks', 'bar'),
('Erdnüsse', 2.50, 'Snacks', 'bar'),
('Schokolade', 2.00, 'Snacks', 'bar');

-- Show items count
SELECT 'Inserted ' || COUNT(*) || ' items' as info FROM items;
