// DEUTSCH: Buchhaltungs-Backend (API-Accounting)
// Verwaltet: Kontenplan, Buchungen, Rechnungen und Finanzberichte
// Läuft als Docker-Container, erreichbar über Traefik unter api.fwv-raura.ch/accounts, /transactions, /invoices, /reports

const express = require('express');   // DEUTSCH: Web-Framework für HTTP-Server
const cors = require('cors');         // DEUTSCH: Cross-Origin Requests erlauben (für Frontend-Zugriff)
const helmet = require('helmet');     // DEUTSCH: Sicherheits-Headers setzen (XSS-Schutz etc.)
const { Pool } = require('pg');       // DEUTSCH: PostgreSQL-Verbindungspool

const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_NAME = 'api-accounting';
// DEUTSCH: Datenbankverbindung über Connection-String aus Umgebungsvariable
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ===========================================
// DEUTSCH: LOGGING — Strukturierte JSON-Logs mit Zeitstempel und Service-Name
// ===========================================
function log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, service: SERVICE_NAME, level, message, ...data };
    console.log(JSON.stringify(logEntry));
}
function logInfo(message, data = {}) { log('INFO', message, data); }   // DEUTSCH: Info-Log
function logWarn(message, data = {}) { log('WARN', message, data); }   // DEUTSCH: Warnung
function logError(message, data = {}) { log('ERROR', message, data); } // DEUTSCH: Fehler

// DEUTSCH: Ermittelt die echte Client-IP (hinter Cloudflare/Traefik Proxy)
function getClientIp(req) {
    if (req.headers['cf-connecting-ip']) return req.headers['cf-connecting-ip'];     // Cloudflare
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) return forwardedFor.split(',')[0].trim();                      // Proxy-Kette
    if (req.headers['x-real-ip']) return req.headers['x-real-ip'];                   // Nginx
    return req.ip;                                                                    // Fallback
}

app.use(helmet());              // DEUTSCH: Sicherheits-Headers aktivieren
app.use(cors());                // DEUTSCH: CORS für Frontend-Zugriff erlauben
app.use(express.json());        // DEUTSCH: JSON-Body in Requests parsen
app.set('trust proxy', true);   // DEUTSCH: Proxy-Headers vertrauen (für korrekte IP hinter Traefik)

// ===========================================
// DEUTSCH: REQUEST-LOGGING — Loggt jede Anfrage (ausser /health) mit Dauer und Statuscode
// ===========================================
app.use((req, res, next) => {
    if (req.path === '/health') return next(); // DEUTSCH: Health-Checks nicht loggen

    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    req.requestId = requestId;

    logInfo('REQUEST', { requestId, method: req.method, path: req.path, ip: getClientIp(req) });

    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const logFn = res.statusCode >= 400 ? logWarn : logInfo;
        logFn('RESPONSE', { requestId, method: req.method, path: req.path, statusCode: res.statusCode, duration: `${duration}ms` });
    });

    next();
});

// DEUTSCH: Health-Check Endpunkt — wird von Docker/Traefik abgefragt um zu prüfen ob der Service läuft
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'api-accounting', version: process.env.APP_VERSION || '0.0.0' });
});

// ============================================
// DEUTSCH: KONTENPLAN (Accounts) — Verwaltung der Buchhaltungskonten
// ============================================

// DEUTSCH: GET /accounts — Alle aktiven Konten abrufen, sortiert nach Kontonummer
app.get('/accounts', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM accounts WHERE is_active = true ORDER BY number');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: POST /accounts — Neues Konto anlegen (Nummer, Name, Typ, optional: Übergeordnetes Konto)
app.post('/accounts', async (req, res) => {
    try {
        const { number, name, type, parent_id, description } = req.body;
        const result = await pool.query(`
            INSERT INTO accounts (number, name, type, parent_id, description)
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `, [number, name, type, parent_id, description]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// DEUTSCH: BUCHUNGEN (Transactions) — Soll/Haben Buchungen zwischen Konten
// ============================================

// DEUTSCH: GET /transactions — Buchungen abrufen, optional gefiltert nach Datum (from/to) und Konto (account_id)
app.get('/transactions', async (req, res) => {
    try {
        const { from, to, account_id } = req.query;
        let query = `
            SELECT t.*,
                   da.number as debit_number, da.name as debit_name,
                   ca.number as credit_number, ca.name as credit_name
            FROM transactions t
            LEFT JOIN accounts da ON t.debit_account_id = da.id
            LEFT JOIN accounts ca ON t.credit_account_id = ca.id
            WHERE 1=1
        `;
        const params = [];

        if (from) {
            params.push(from);
            query += ` AND t.date >= $${params.length}`;
        }
        if (to) {
            params.push(to);
            query += ` AND t.date <= $${params.length}`;
        }
        if (account_id) {
            params.push(account_id);
            query += ` AND (t.debit_account_id = $${params.length} OR t.credit_account_id = $${params.length})`;
        }

        query += ' ORDER BY t.date DESC, t.created_at DESC';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: POST /transactions — Neue Buchung erstellen (Datum, Beschreibung, Soll-/Haben-Konto, Betrag)
app.post('/transactions', async (req, res) => {
    try {
        const {
            date, description, debit_account_id, credit_account_id,
            amount, member_id, event_id, receipt_url
        } = req.body;

        const result = await pool.query(`
            INSERT INTO transactions (
                date, description, debit_account_id, credit_account_id,
                amount, member_id, event_id, receipt_url
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
        `, [date, description, debit_account_id, credit_account_id, amount, member_id, event_id, receipt_url]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// DEUTSCH: RECHNUNGEN (Invoices) — Erstellen, abrufen und als bezahlt markieren
// ============================================

// DEUTSCH: GET /invoices — Rechnungen abrufen, optional gefiltert nach Status und Mitglied
app.get('/invoices', async (req, res) => {
    try {
        const { status, member_id } = req.query;
        let query = 'SELECT * FROM invoices WHERE 1=1';
        const params = [];

        if (status) {
            params.push(status);
            query += ` AND status = $${params.length}`;
        }
        if (member_id) {
            params.push(member_id);
            query += ` AND member_id = $${params.length}`;
        }

        query += ' ORDER BY issued_date DESC';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: GET /invoices/:id — Einzelne Rechnung nach ID abrufen
app.get('/invoices/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: POST /invoices — Neue Rechnung erstellen (generiert automatisch Rechnungsnummer im Format YYYY-0001)
app.post('/invoices', async (req, res) => {
    try {
        const {
            member_id, recipient_name, recipient_address,
            items, subtotal, tax, total, due_date, notes
        } = req.body;

        // Generate invoice number
        const year = new Date().getFullYear();
        const countResult = await pool.query(
            "SELECT COUNT(*) FROM invoices WHERE number LIKE $1",
            [`${year}-%`]
        );
        const count = parseInt(countResult.rows[0].count) + 1;
        const number = `${year}-${String(count).padStart(4, '0')}`;

        const result = await pool.query(`
            INSERT INTO invoices (
                number, member_id, recipient_name, recipient_address,
                items, subtotal, tax, total, due_date, notes,
                status, issued_date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'issued', NOW())
            RETURNING *
        `, [number, member_id, recipient_name, recipient_address, JSON.stringify(items), subtotal, tax, total, due_date, notes]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: PATCH /invoices/:id/pay — Rechnung als bezahlt markieren (setzt Status auf 'paid' und Bezahldatum)
app.patch('/invoices/:id/pay', async (req, res) => {
    try {
        const result = await pool.query(`
            UPDATE invoices SET status = 'paid', paid_date = NOW()
            WHERE id = $1 RETURNING *
        `, [req.params.id]);
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// DEUTSCH: BERICHTE (Reports) — Finanzübersichten und Cashflow-Analysen
// ============================================

// DEUTSCH: GET /reports/balance — Kontensaldo: Summiert Soll- und Haben-Beträge pro Konto
app.get('/reports/balance', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                a.number, a.name, a.type,
                COALESCE(SUM(CASE WHEN t.debit_account_id = a.id THEN t.amount ELSE 0 END), 0) as debit_total,
                COALESCE(SUM(CASE WHEN t.credit_account_id = a.id THEN t.amount ELSE 0 END), 0) as credit_total
            FROM accounts a
            LEFT JOIN transactions t ON a.id = t.debit_account_id OR a.id = t.credit_account_id
            WHERE a.is_active = true
            GROUP BY a.id, a.number, a.name, a.type
            ORDER BY a.number
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: GET /reports/cashflow — Cashflow pro Monat: Einnahmen vs. Ausgaben für ein bestimmtes Jahr
app.get('/reports/cashflow', async (req, res) => {
    try {
        const { year } = req.query;
        const targetYear = year || new Date().getFullYear();

        const result = await pool.query(`
            SELECT
                EXTRACT(MONTH FROM date) as month,
                SUM(CASE WHEN da.type = 'asset' THEN amount ELSE 0 END) as income,
                SUM(CASE WHEN ca.type = 'asset' THEN amount ELSE 0 END) as expense
            FROM transactions t
            LEFT JOIN accounts da ON t.debit_account_id = da.id
            LEFT JOIN accounts ca ON t.credit_account_id = ca.id
            WHERE EXTRACT(YEAR FROM date) = $1
            GROUP BY EXTRACT(MONTH FROM date)
            ORDER BY month
        `, [targetYear]);

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Server starten und auf dem konfigurierten Port lauschen
app.listen(PORT, () => {
    console.log(`API-Accounting running on port ${PORT}`);
});
