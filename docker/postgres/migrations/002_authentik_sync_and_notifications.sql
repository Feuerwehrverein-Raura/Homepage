-- DEUTSCH: Migration 002 — Authentik-Sync und Benachrichtigungseinstellungen
-- DEUTSCH: Datum: 2026-01-15
-- DEUTSCH: Zweck: Verknüpft Mitglieder mit ihrem Authentik-Konto (SSO) und
-- DEUTSCH: erstellt eine Tabelle für individuelle Benachrichtigungseinstellungen pro Mitglied

-- ============================================
-- DEUTSCH: Neue Spalten in der Mitglieder-Tabelle für Authentik-Sync
-- ============================================

-- DEUTSCH: Speichert die Authentik-User-ID und den Zeitpunkt der letzten Synchronisierung
ALTER TABLE members
    ADD COLUMN IF NOT EXISTS authentik_user_id VARCHAR(100),  -- DEUTSCH: Authentik-Benutzer-ID (für SSO-Verknüpfung)
    ADD COLUMN IF NOT EXISTS authentik_synced_at TIMESTAMP;  -- DEUTSCH: Wann zuletzt mit Authentik synchronisiert

-- DEUTSCH: Index für schnelle Suche nach Authentik-User-ID
CREATE INDEX IF NOT EXISTS idx_members_authentik_user ON members(authentik_user_id);

-- ============================================
-- DEUTSCH: Benachrichtigungseinstellungen pro Mitglied
-- DEUTSCH: Jedes Mitglied kann individuell festlegen, welche Benachrichtigungen es erhalten möchte
-- ============================================

CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,

    -- DEUTSCH: Typ der Benachrichtigung (welche Art von Nachricht)
    notification_type VARCHAR(50) NOT NULL,               -- DEUTSCH: 'shift_reminder', 'event_update', 'newsletter', 'general'

    -- DEUTSCH: Einstellungen
    enabled BOOLEAN DEFAULT true,                         -- DEUTSCH: Ist diese Benachrichtigung aktiviert?
    alternative_email VARCHAR(200),                       -- DEUTSCH: Optional: Andere E-Mail für diesen Typ

    -- Meta
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(member_id, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_member ON notification_preferences(member_id);

-- ============================================
-- DEUTSCH: Standard-Einstellungen für alle bestehenden Mitglieder setzen
-- DEUTSCH: Alle 4 Benachrichtigungstypen werden auf "aktiviert" gesetzt
-- ============================================

-- DEUTSCH: Schicht-Erinnerungen für alle Mitglieder mit E-Mail aktivieren
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
