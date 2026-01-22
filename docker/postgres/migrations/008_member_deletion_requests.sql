-- Migration: Member deletion requests with dual approval
-- Requires confirmation from both Aktuar and Kassier

CREATE TABLE IF NOT EXISTS member_deletion_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES members(id),
    requested_by VARCHAR(255) NOT NULL,
    requested_at TIMESTAMP DEFAULT NOW(),
    reason TEXT,

    -- Confirmation tokens
    aktuar_token UUID DEFAULT gen_random_uuid(),
    kassier_token UUID DEFAULT gen_random_uuid(),

    -- Confirmation status
    aktuar_confirmed_at TIMESTAMP,
    aktuar_confirmed_by VARCHAR(255),
    kassier_confirmed_at TIMESTAMP,
    kassier_confirmed_by VARCHAR(255),

    -- Final status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
    executed_at TIMESTAMP,
    expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '7 days'
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_deletion_requests_member_id ON member_deletion_requests(member_id);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON member_deletion_requests(status);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_aktuar_token ON member_deletion_requests(aktuar_token);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_kassier_token ON member_deletion_requests(kassier_token);
