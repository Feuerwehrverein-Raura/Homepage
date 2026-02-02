-- Migration 015: Matrix/WhatsApp Integration
-- Ermöglicht automatische WhatsApp-Benachrichtigungen via Matrix Bridge

-- Benutzerspezifische Matrix-Konfiguration (im Mitgliederprofil)
CREATE TABLE IF NOT EXISTS member_matrix_config (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    homeserver_url VARCHAR(500) NOT NULL,  -- z.B. https://matrix.org
    access_token TEXT NOT NULL,            -- Bot/User Access Token
    user_id VARCHAR(255) NOT NULL,         -- z.B. @bot:matrix.org
    default_room_id VARCHAR(500),          -- Standard-Raum für Gruppen-Benachrichtigungen
    -- WhatsApp Bridge Konfiguration für Direktnachrichten
    whatsapp_bridge_domain VARCHAR(255),   -- z.B. matrix.example.ch (für @whatsapp_xxx:domain)
    send_to_individuals BOOLEAN DEFAULT false, -- true = an Einzelpersonen senden statt Gruppe
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(member_id)
);

-- Tabelle für gesendete WhatsApp-Benachrichtigungen (Logging)
CREATE TABLE IF NOT EXISTS whatsapp_notifications (
    id SERIAL PRIMARY KEY,
    member_id INTEGER REFERENCES members(id),
    room_id VARCHAR(500),
    notification_type VARCHAR(50) NOT NULL,  -- event_created, event_updated, shift_reminder
    reference_type VARCHAR(50),              -- 'event', 'shift'
    reference_id INTEGER,
    message_content TEXT,
    matrix_event_id VARCHAR(500),
    status VARCHAR(20) DEFAULT 'pending',    -- pending, sent, failed
    error_message TEXT,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index für Status-Abfragen
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_status
    ON whatsapp_notifications(status, created_at);

COMMENT ON TABLE member_matrix_config IS 'Matrix-Konfiguration pro Mitglied für WhatsApp-Benachrichtigungen via mautrix-whatsapp Bridge';
COMMENT ON COLUMN member_matrix_config.default_room_id IS 'Matrix Room-ID der WhatsApp-Gruppe (z.B. !abc123:matrix.org)';
