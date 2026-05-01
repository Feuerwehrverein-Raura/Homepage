/**
 * Geplante Hintergrund-Jobs.
 *
 * - createTableIfNeeded(): Startup-Migration fuer scheduled_jobs.
 * - startWorker(pool, axios): pollt minuetlich faellige Jobs und fuehrt sie
 *   per Action-Dispatcher aus (SELECT FOR UPDATE SKIP LOCKED gegen Doppel-
 *   ausfuehrung wenn mehrere Replicas laufen).
 * - mountEndpoints(app, pool, requireAuth): mounten der drei REST-Endpoints
 *   (list / create / cancel) mit der bestehenden Auth-Middleware.
 *
 * Action-Handler werden ueber registerHandler(action, fn) registriert.
 * fn(payload, ctx) => Resultat-Objekt (gespeichert in result-Spalte).
 */

const ACTION_HANDLERS = new Map();

/** Action registrieren. fn ist async und gibt JSON-serialisierbares Resultat zurueck. */
function registerHandler(action, fn) {
    ACTION_HANDLERS.set(action, fn);
}

async function createTableIfNeeded(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS scheduled_jobs (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            action VARCHAR(64) NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}',
            label VARCHAR(255),
            scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
            result JSONB,
            started_at TIMESTAMP WITH TIME ZONE,
            finished_at TIMESTAMP WITH TIME ZONE,
            created_by VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_due
            ON scheduled_jobs (scheduled_at) WHERE status = 'scheduled';
        CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_status
            ON scheduled_jobs (status, scheduled_at DESC);
    `);
}

/** Einen einzigen Tick — verarbeitet alle faelligen Jobs. */
async function processDueJobs(pool) {
    const client = await pool.connect();
    try {
        // Faellige Jobs claimen (status='scheduled' AND scheduled_at <= NOW)
        // SKIP LOCKED damit mehrere Replicas nicht den gleichen Job schnappen.
        const claimRes = await client.query(`
            UPDATE scheduled_jobs
            SET status = 'running', started_at = NOW(), updated_at = NOW()
            WHERE id IN (
                SELECT id FROM scheduled_jobs
                WHERE status = 'scheduled' AND scheduled_at <= NOW()
                ORDER BY scheduled_at ASC
                LIMIT 5
                FOR UPDATE SKIP LOCKED
            )
            RETURNING *
        `);

        for (const job of claimRes.rows) {
            const handler = ACTION_HANDLERS.get(job.action);
            if (!handler) {
                await client.query(
                    `UPDATE scheduled_jobs SET status='failed', finished_at=NOW(),
                     result=$2, updated_at=NOW() WHERE id=$1`,
                    [job.id, JSON.stringify({ error: `Unbekannte Action: ${job.action}` })]
                );
                continue;
            }
            try {
                const result = await handler(job.payload || {}, { jobId: job.id });
                await client.query(
                    `UPDATE scheduled_jobs SET status='done', finished_at=NOW(),
                     result=$2, updated_at=NOW() WHERE id=$1`,
                    [job.id, JSON.stringify(result || {})]
                );
            } catch (err) {
                await client.query(
                    `UPDATE scheduled_jobs SET status='failed', finished_at=NOW(),
                     result=$2, updated_at=NOW() WHERE id=$1`,
                    [job.id, JSON.stringify({ error: err.message })]
                );
            }
        }
    } finally {
        client.release();
    }
}

function startWorker(pool, { intervalMs = 60_000, log = console } = {}) {
    let running = false;
    const tick = async () => {
        if (running) return;
        running = true;
        try {
            await processDueJobs(pool);
        } catch (e) {
            log.error?.('scheduled-jobs tick failed', e.message);
        } finally {
            running = false;
        }
    };
    tick(); // initial sofort starten
    return setInterval(tick, intervalMs);
}

/** REST-Endpoints registrieren. */
function mountEndpoints(app, pool, requireAuth) {
    // Liste der Jobs (alle oder nach status gefiltert).
    app.get('/scheduled-jobs', requireAuth, async (req, res) => {
        try {
            const { status, limit = 100 } = req.query;
            const params = [];
            let where = 'WHERE 1=1';
            if (status) {
                params.push(status);
                where += ` AND status = $${params.length}`;
            }
            params.push(parseInt(limit));
            const result = await pool.query(
                `SELECT * FROM scheduled_jobs ${where}
                 ORDER BY scheduled_at ASC LIMIT $${params.length}`,
                params
            );
            res.json(result.rows);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Neuen Job planen.
    app.post('/scheduled-jobs', requireAuth, async (req, res) => {
        try {
            const { action, payload, label, scheduled_at } = req.body || {};
            if (!action) return res.status(400).json({ error: 'action erforderlich' });
            if (!scheduled_at) return res.status(400).json({ error: 'scheduled_at erforderlich' });
            if (!ACTION_HANDLERS.has(action)) {
                return res.status(400).json({ error: `Unbekannte Action: ${action}` });
            }
            const result = await pool.query(
                `INSERT INTO scheduled_jobs (action, payload, label, scheduled_at, created_by)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING *`,
                [action, JSON.stringify(payload || {}), label || null, scheduled_at, req.user?.email || null]
            );
            res.json(result.rows[0]);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Job abbrechen (nur wenn noch 'scheduled').
    app.delete('/scheduled-jobs/:id', requireAuth, async (req, res) => {
        try {
            const result = await pool.query(
                `UPDATE scheduled_jobs SET status='cancelled', finished_at=NOW(), updated_at=NOW()
                 WHERE id=$1 AND status='scheduled' RETURNING *`,
                [req.params.id]
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Job nicht gefunden oder nicht mehr abbrechbar' });
            }
            res.json(result.rows[0]);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}

module.exports = {
    registerHandler,
    createTableIfNeeded,
    startWorker,
    mountEndpoints,
    processDueJobs
};
