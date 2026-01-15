-- Migration: Authentik Sync und Benachrichtigungseinstellungen
-- Datum: 2026-01-15
-- Beschreibung: Fügt Felder für Authentik-Sync hinzu und erstellt notification_preferences Tabelle

-- ============================================
-- Erweitere members Tabelle
-- ============================================

-- Füge Authentik Sync Felder hinzu
ALTER TABLE members
    ADD COLUMN IF NOT EXISTS authentik_user_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS authentik_synced_at TIMESTAMP;

-- Index für schnelle Authentik-User-Lookups
CREATE INDEX IF NOT EXISTS idx_members_authentik_user ON members(authentik_user_id);

-- ============================================
-- Notification Preferences Tabelle
-- ============================================

CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,

    -- Benachrichtigungstyp
    notification_type VARCHAR(50) NOT NULL, -- 'shift_reminder', 'event_update', 'newsletter', 'general'

    -- Einstellungen
    enabled BOOLEAN DEFAULT true,
    alternative_email VARCHAR(200), -- Optional: Alternative Email für diesen Benachrichtigungstyp

    -- Meta
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(member_id, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_member ON notification_preferences(member_id);

-- ============================================
-- Standard-Benachrichtigungseinstellungen für existierende Mitglieder
-- ============================================

-- Erstelle Standard-Präferenzen für alle Mitglieder mit Email
INSERT INTO notification_preferences (member_id, notification_type, enabled)
SELECT id, 'shift_reminder', true
FROM members
WHERE email IS NOT NULL
ON CONFLICT (member_id, notification_type) DO NOTHING;

INSERT INTO notification_preferences (member_id, notification_type, enabled)
SELECT id, 'event_update', true
FROM members
WHERE email IS NOT NULL
ON CONFLICT (member_id, notification_type) DO NOTHING;

INSERT INTO notification_preferences (member_id, notification_type, enabled)
SELECT id, 'newsletter', true
FROM members
WHERE email IS NOT NULL
ON CONFLICT (member_id, notification_type) DO NOTHING;

INSERT INTO notification_preferences (member_id, notification_type, enabled)
SELECT id, 'general', true
FROM members
WHERE email IS NOT NULL
ON CONFLICT (member_id, notification_type) DO NOTHING;
