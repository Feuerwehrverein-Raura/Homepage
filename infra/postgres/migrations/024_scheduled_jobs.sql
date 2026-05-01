-- DEUTSCH: Migration 024 - Geplante Hintergrund-Jobs (z.B. zeitgesteuerter Massenversand)
-- Vorstand kann z.B. einen Beitragsversand fuer naechste Woche 09:00 planen.
-- Ein Worker in api-dispatch pollt diese Tabelle minuetlich und fuehrt faellige Jobs aus.

CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Aktions-Bezeichner — der Worker entscheidet anhand dessen welchen Endpoint er aufruft.
    -- Beispiele: 'membership_fees_email_bulk', 'membership_fees_post_bulk'.
    action VARCHAR(64) NOT NULL,
    -- Aktions-spezifische Parameter (z.B. { year: 2026 }).
    payload JSONB NOT NULL DEFAULT '{}',
    -- Klartext-Beschreibung fuer die UI-Liste (z.B. "Beitragsversand E-Mail 2026").
    label VARCHAR(255),
    -- Wann der Job ausgefuehrt werden soll.
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    -- 'scheduled' (wartet) | 'running' (wird gerade ausgefuehrt) | 'done' | 'failed' | 'cancelled'.
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    -- Resultat des Workers (success/failed Counts oder Fehlermeldung).
    result JSONB,
    -- Ausfuehrungs-Zeitstempel.
    started_at TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE,
    -- Wer hat den Job geplant (E-Mail aus dem JWT).
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_due
    ON scheduled_jobs (scheduled_at)
    WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_status
    ON scheduled_jobs (status, scheduled_at DESC);
