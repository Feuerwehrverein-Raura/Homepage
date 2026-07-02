-- Taco-Abend 2026 – Zutaten, Rezepte & Event-Verknüpfung
-- Auténtico: weiche Maistortillas, kein Tex-Mex. Kalkuliert für 30 Personen.
--
-- Modell: Rezepte sind PRO PORTION definiert (Batch-für-30 / 30). Über
-- event_recipes.servings = 30 skaliert die Einkaufsliste
-- (GET /api/events/taco-abend-2026/shopping-list) auf die echten Mengen.
-- Pantry-Gewürze (Kreuzkümmel, Oregano, Zimt, Lorbeer, Tomatenmark) sind
-- bewusst weggelassen ("ggf. vorhanden", siehe Rezept-PDF).
--
-- Script ist idempotent – kann mehrfach ausgeführt werden ohne Duplikate.

-- ============================================================
-- Kategorien
-- ============================================================
INSERT INTO categories (name, description)
SELECT 'Taco-Zutaten', 'Frische Zutaten & Trockenwaren für den Taco-Abend'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Taco-Zutaten');

INSERT INTO recipe_categories (name, sort_order)
SELECT 'Salsas & Beilagen', 6
WHERE NOT EXISTS (SELECT 1 FROM recipe_categories WHERE name = 'Salsas & Beilagen');

-- ============================================================
-- Zutaten (items) – Bestand 0, Einkaufspreis pro Einheit
-- ============================================================
INSERT INTO items (name, unit, purchase_price, quantity, category_id, active)
SELECT v.name, v.unit, v.price, 0, (SELECT id FROM categories WHERE name = 'Taco-Zutaten'), true
FROM (VALUES
  ('Schweineschulter',      'kg',    15.00),
  ('Pouletschenkel',        'kg',    15.00),
  ('Tomaten',               'kg',     5.00),
  ('Tomatillos',            'kg',    13.00),
  ('Zwiebel weiss',         'Stück',  0.50),
  ('Zwiebel rot',           'Stück',  0.60),
  ('Knoblauchzehe',         'Stück',  0.10),
  ('Avocado',               'Stück',  2.00),
  ('Jalapeño',              'Stück',  0.40),
  ('Limette',               'Stück',  0.50),
  ('Orange',                'Stück',  0.75),
  ('Koriander',             'Bund',   2.00),
  ('Maistortilla',          'Stück',  0.20),
  ('Guajillo-Chili',        'Stück',  1.30),
  ('Chipotle',              'Stück',  2.00),
  ('Schweineschmalz',       'kg',    30.00)
) AS v(name, unit, price)
WHERE NOT EXISTS (SELECT 1 FROM items i WHERE i.name = v.name);

-- ============================================================
-- Rezepte (pro Portion; servings dokumentiert den Batch = 30)
-- ============================================================
INSERT INTO recipes (name, description, recipe_category_id, servings, active)
SELECT v.name, v.descr, (SELECT id FROM recipe_categories WHERE name = v.cat), 30, true
FROM (VALUES
  ('Carnitas',             'Schwein, langsam geschmort – butterzart mit knusprigen Kanten', 'Hauptgerichte'),
  ('Pollo adobado',        'Poulet in Guajillo-Chili-Marinade',                             'Hauptgerichte'),
  ('Salsa Roja',           'Mittelscharf, geröstete Tomaten & Chili',                       'Salsas & Beilagen'),
  ('Salsa Verde',          'Frisch-säuerlich aus Tomatillos',                               'Salsas & Beilagen'),
  ('Guacamole',            'Cremig aus reifen Avocados',                                    'Salsas & Beilagen'),
  ('Pico de Gallo',        'Frische Tomaten-Zwiebel-Salsa',                                 'Salsas & Beilagen'),
  ('Tortillas & Garnitur', 'Weiche Maistortillas, Zwiebel, Koriander, Limette',             'Salsas & Beilagen')
) AS v(name, descr, cat)
WHERE NOT EXISTS (SELECT 1 FROM recipes r WHERE r.name = v.name);

-- ============================================================
-- Rezept-Zutaten (Menge PRO PORTION = Batch-für-30 / 30)
-- ============================================================
INSERT INTO recipe_ingredients (recipe_id, item_id, quantity, unit)
SELECT (SELECT id FROM recipes WHERE name = v.recipe),
       (SELECT id FROM items   WHERE name = v.item),
       v.qty, v.unit
FROM (VALUES
  -- Carnitas (für 30): 4kg Schwein, 2 Orangen, 1 Zwiebel, 6 Knoblauch, 200g Schmalz
  ('Carnitas',             'Schweineschulter', 0.133, 'kg'),
  ('Carnitas',             'Orange',           0.067, 'Stück'),
  ('Carnitas',             'Zwiebel weiss',    0.033, 'Stück'),
  ('Carnitas',             'Knoblauchzehe',    0.200, 'Stück'),
  ('Carnitas',             'Schweineschmalz',  0.007, 'kg'),
  -- Pollo adobado (für 30): 3kg Poulet, 6 Guajillo, 2 Chipotle, 4 Knoblauch, 1 Zwiebel, 2 Limetten
  ('Pollo adobado',        'Pouletschenkel',   0.100, 'kg'),
  ('Pollo adobado',        'Guajillo-Chili',   0.200, 'Stück'),
  ('Pollo adobado',        'Chipotle',         0.067, 'Stück'),
  ('Pollo adobado',        'Knoblauchzehe',    0.133, 'Stück'),
  ('Pollo adobado',        'Zwiebel weiss',    0.033, 'Stück'),
  ('Pollo adobado',        'Limette',          0.067, 'Stück'),
  -- Salsa Roja (~1.5L): 2kg Tomaten, 4 Jalapeños, 1 Zwiebel, 4 Knoblauch, 1 Limette
  ('Salsa Roja',           'Tomaten',          0.067, 'kg'),
  ('Salsa Roja',           'Jalapeño',         0.133, 'Stück'),
  ('Salsa Roja',           'Zwiebel weiss',    0.033, 'Stück'),
  ('Salsa Roja',           'Knoblauchzehe',    0.133, 'Stück'),
  ('Salsa Roja',           'Limette',          0.033, 'Stück'),
  -- Salsa Verde (~1L): 1.5kg Tomatillos, 3 Jalapeños, 1 Zwiebel, 3 Knoblauch, 1 Bund Koriander
  ('Salsa Verde',          'Tomatillos',       0.050, 'kg'),
  ('Salsa Verde',          'Jalapeño',         0.100, 'Stück'),
  ('Salsa Verde',          'Zwiebel weiss',    0.033, 'Stück'),
  ('Salsa Verde',          'Knoblauchzehe',    0.100, 'Stück'),
  ('Salsa Verde',          'Koriander',        0.033, 'Bund'),
  -- Guacamole (für 30): 12 Avocados, 2 Zwiebeln, 3 Limetten, 2 Jalapeños, 1 Bund Koriander
  ('Guacamole',            'Avocado',          0.400, 'Stück'),
  ('Guacamole',            'Zwiebel weiss',    0.067, 'Stück'),
  ('Guacamole',            'Limette',          0.100, 'Stück'),
  ('Guacamole',            'Jalapeño',         0.067, 'Stück'),
  ('Guacamole',            'Koriander',        0.033, 'Bund'),
  -- Pico de Gallo (für 30): 1kg Tomaten, 2 rote Zwiebeln, 2 Jalapeños, 1 Bund Koriander, 3 Limetten
  ('Pico de Gallo',        'Tomaten',          0.033, 'kg'),
  ('Pico de Gallo',        'Zwiebel rot',      0.067, 'Stück'),
  ('Pico de Gallo',        'Jalapeño',         0.067, 'Stück'),
  ('Pico de Gallo',        'Koriander',        0.033, 'Bund'),
  ('Pico de Gallo',        'Limette',          0.100, 'Stück'),
  -- Tortillas & Garnitur (für 30): ~200 Tortillas, Garnitur (Zwiebel, Koriander, Limette)
  ('Tortillas & Garnitur', 'Maistortilla',     6.667, 'Stück'),
  ('Tortillas & Garnitur', 'Zwiebel weiss',    0.033, 'Stück'),
  ('Tortillas & Garnitur', 'Koriander',        0.067, 'Bund'),
  ('Tortillas & Garnitur', 'Limette',          0.167, 'Stück')
) AS v(recipe, item, qty, unit)
ON CONFLICT (recipe_id, item_id) DO UPDATE
  SET quantity = EXCLUDED.quantity, unit = EXCLUDED.unit;

-- ============================================================
-- Event-Verknüpfung: alle Rezepte an "taco-abend-2026" (30 Portionen)
-- ============================================================
INSERT INTO event_recipes (event_slug, recipe_id, servings)
SELECT 'taco-abend-2026', r.id, 30
FROM recipes r
WHERE r.name IN ('Carnitas','Pollo adobado','Salsa Roja','Salsa Verde',
                 'Guacamole','Pico de Gallo','Tortillas & Garnitur')
ON CONFLICT (event_slug, recipe_id) DO UPDATE
  SET servings = EXCLUDED.servings;

-- ============================================================
-- Bezugsquellen-Empfehlungen (kostengünstig + lieferbar / Region Basel)
-- Mexikanische Spezialzutaten: Chilin Limón (Arlesheim, Abholung + Online),
-- Mi Adelita (CH-Tortillas), La Guadalupana ZH (online lieferbar).
-- Grossgebinde: Cash & Carry Prodega/Transgourmet (Pratteln). Frisches:
-- Grossverteiler Migros/Coop/Aldi/Lidl/Denner in der Region.
-- ============================================================
INSERT INTO event_shopping_status (event_slug, item_id, recommendation)
SELECT 'taco-abend-2026', (SELECT id FROM items WHERE name = v.item), v.rec
FROM (VALUES
  ('Schweineschulter', 'Cash & Carry Prodega/Transgourmet (Pratteln) – Grossgebinde günstig; oder lokale Metzgerei'),
  ('Pouletschenkel',   'Cash & Carry Prodega/Transgourmet (Pratteln) – Grossgebinde; oder lokale Metzgerei'),
  ('Schweineschmalz',  'Metzgerei oder Grossverteiler (Region Basel)'),
  ('Tomaten',          'Grossverteiler (Migros/Coop/Aldi/Lidl); günstig als Kiste bei Prodega Pratteln'),
  ('Tomatillos',       'Chilin Limón Arlesheim (Abholung/Online) oder La Guadalupana ZH (online); Ersatz: grüne Tomaten + mehr Limette'),
  ('Zwiebel weiss',    'Grossverteiler; Sackware günstig bei Prodega Pratteln'),
  ('Zwiebel rot',      'Grossverteiler (Region Basel)'),
  ('Knoblauchzehe',    'Grossverteiler (Region Basel)'),
  ('Avocado',          'Grossverteiler (Aldi/Lidl oft günstig) – rechtzeitig reif kaufen'),
  ('Jalapeño',         'Grossverteiler oder lateinamerik. Laden; alt. Chilin Limón Arlesheim'),
  ('Limette',          'Grossverteiler (Region Basel)'),
  ('Orange',           'Grossverteiler (Region Basel)'),
  ('Koriander',        'Grossverteiler / Markt Basel; grosse Bunde im Asia-/Lateinamerika-Laden'),
  ('Maistortilla',     'Mi Adelita (CH-Produzent) oder Chilin Limón Arlesheim (Abholung/Online) – rechtzeitig VORBESTELLEN!'),
  ('Guajillo-Chili',   'Chilin Limón Arlesheim oder La Guadalupana ZH (online lieferbar)'),
  ('Chipotle',         'Chilin Limón Arlesheim oder La Guadalupana ZH (getrocknet od. in Adobo, online)')
) AS v(item, rec)
WHERE (SELECT id FROM items WHERE name = v.item) IS NOT NULL
ON CONFLICT (event_slug, item_id) DO UPDATE SET recommendation = EXCLUDED.recommendation;

