-- Initialize local database for Raspberry Pi deployment
-- Creates schemas for both order and inventory systems

-- Order System Tables (created by order-backend automatically)
-- Inventory System Tables (created by inventory-backend automatically)

-- This file can be used to pre-seed data if needed
-- Example: Default settings, test items, etc.

-- Whitelist disabled by default for local deployment
INSERT INTO settings (key, value) VALUES ('whitelist_enabled', 'false') 
ON CONFLICT (key) DO NOTHING;

-- Default PIN (change this!)
INSERT INTO settings (key, value) VALUES ('whitelist_pin', '1234') 
ON CONFLICT (key) DO NOTHING;
