-- Contact confirmations for Double Opt-In spam protection
CREATE TABLE IF NOT EXISTS contact_pending (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token VARCHAR(64) UNIQUE NOT NULL,
    payload JSONB NOT NULL,
    ip_address VARCHAR(45),
    confirmed BOOLEAN DEFAULT false,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for token lookups
CREATE INDEX IF NOT EXISTS idx_contact_pending_token ON contact_pending(token);

-- Auto-cleanup: delete expired entries (older than 24h)
-- This can be run periodically via cron or on each request
