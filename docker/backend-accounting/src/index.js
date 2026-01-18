const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'api-accounting', version: process.env.APP_VERSION || '0.0.0' });
});

// ============================================
// ACCOUNTS (Kontenplan)
// ============================================

app.get('/accounts', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM accounts WHERE is_active = true ORDER BY number');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

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
// TRANSACTIONS (Buchungen)
// ============================================

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
// INVOICES (Rechnungen)
// ============================================

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
// REPORTS
// ============================================

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

app.listen(PORT, () => {
    console.log(`API-Accounting running on port ${PORT}`);
});
