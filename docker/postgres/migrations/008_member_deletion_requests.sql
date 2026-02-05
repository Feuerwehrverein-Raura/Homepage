-- DEUTSCH: Migration 008 — Mitglieder-Löschanfragen mit Doppelbestätigung
-- DEUTSCH: Ein Mitglied kann nur gelöscht werden wenn sowohl Aktuar ALS AUCH Kassier bestätigen
-- DEUTSCH: Anfrage verfällt nach 7 Tagen automatisch (expires_at)

CREATE TABLE IF NOT EXISTS member_deletion_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES members(id),      -- DEUTSCH: Welches Mitglied soll gelöscht werden
    requested_by VARCHAR(255) NOT NULL,                  -- DEUTSCH: Wer hat die Löschung beantragt (E-Mail)
    requested_at TIMESTAMP DEFAULT NOW(),
    reason TEXT,                                         -- DEUTSCH: Begründung für die Löschung

    -- DEUTSCH: Bestätigungstoken — werden per E-Mail an Aktuar und Kassier gesendet
    aktuar_token UUID DEFAULT gen_random_uuid(),          -- DEUTSCH: Geheimer Link-Token für Aktuar
    kassier_token UUID DEFAULT gen_random_uuid(),          -- DEUTSCH: Geheimer Link-Token für Kassier

    -- DEUTSCH: Bestätigungsstatus — beide müssen bestätigen
    aktuar_confirmed_at TIMESTAMP,                       -- DEUTSCH: Wann hat der Aktuar bestätigt
    aktuar_confirmed_by VARCHAR(255),
    kassier_confirmed_at TIMESTAMP,                      -- DEUTSCH: Wann hat der Kassier bestätigt
    kassier_confirmed_by VARCHAR(255),

    -- DEUTSCH: Endstatus der Löschanfrage
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
    executed_at TIMESTAMP,                               -- DEUTSCH: Wann wurde das Mitglied tatsächlich gelöscht
    expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '7 days'  -- DEUTSCH: Verfällt nach 7 Tagen
);

-- DEUTSCH: Indizes für schnelle Suche nach Mitglied, Status und Bestätigungstoken
CREATE INDEX IF NOT EXISTS idx_deletion_requests_member_id ON member_deletion_requests(member_id);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON member_deletion_requests(status);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_aktuar_token ON member_deletion_requests(aktuar_token);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_kassier_token ON member_deletion_requests(kassier_token);
