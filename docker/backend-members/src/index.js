const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { ImapFlow } = require('imapflow');
const { authenticateToken, authenticateAny, authenticateVorstand, requireRole } = require('./auth-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Database
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'api-members' });
});

// ============================================
// AUTH INFO (Authentik handles actual auth)
// ============================================

// Get current user info from Authentik token
app.get('/auth/me', authenticateToken, (req, res) => {
    res.json(req.user);
});

// Redirect to Authentik for login
app.get('/auth/login', (req, res) => {
    const returnUrl = req.query.return || '/';
    res.redirect(`${process.env.AUTHENTIK_URL}/application/o/authorize/?client_id=${process.env.AUTHENTIK_CLIENT_ID}&redirect_uri=${encodeURIComponent(returnUrl)}&response_type=code&scope=openid%20profile%20email`);
});

// ============================================
// VORSTAND IMAP LOGIN
// ============================================

// IMAP-based authentication for Vorstand members
app.post('/auth/vorstand/login', async (req, res) => {
    const { email, password } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }

    // Validate email domain and allowed addresses
    const allowedEmails = (process.env.VORSTAND_EMAILS || 'praesident@fwv-raura.ch,aktuar@fwv-raura.ch,kassier@fwv-raura.ch,vizepraesident@fwv-raura.ch,beisitzer@fwv-raura.ch').split(',').map(e => e.trim().toLowerCase());
    const emailLower = email.toLowerCase();

    if (!allowedEmails.includes(emailLower)) {
        // Log failed attempt
        await logAudit(pool, 'LOGIN_FAILED', null, email, clientIp, { reason: 'Email not in allowed list' });
        return res.status(403).json({ error: 'Unauthorized email address' });
    }

    try {
        // Try to authenticate via IMAP
        const imapConfig = {
            host: process.env.IMAP_HOST || 'mail.test.juroct.net',
            port: parseInt(process.env.IMAP_PORT || '993'),
            secure: true,
            auth: {
                user: email,
                pass: password
            },
            logger: false
        };

        const client = new ImapFlow(imapConfig);

        try {
            // Connect and authenticate
            await client.connect();

            // If we get here, authentication succeeded
            await client.logout();

            // Determine role from email prefix
            const emailPrefix = emailLower.split('@')[0];
            const role = emailPrefix; // praesident, aktuar, kassier, etc.

            // Generate JWT token
            const token = jwt.sign(
                {
                    email: emailLower,
                    role: role,
                    groups: ['vorstand'],
                    type: 'vorstand'
                },
                process.env.JWT_SECRET || 'fwv-raura-secret-key',
                { expiresIn: '8h' }
            );

            // Log successful login
            await logAudit(pool, 'LOGIN_SUCCESS', null, emailLower, clientIp, { role });

            res.json({
                success: true,
                token: token,
                user: {
                    email: emailLower,
                    role: role,
                    name: getRoleName(role)
                }
            });

        } catch (imapError) {
            // Authentication failed
            console.error('IMAP auth failed:', imapError.message);
            await logAudit(pool, 'LOGIN_FAILED', null, email, clientIp, { reason: 'Invalid credentials' });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

    } catch (error) {
        console.error('Vorstand login error:', error);
        await logAudit(pool, 'LOGIN_ERROR', null, email, clientIp, { error: error.message });
        res.status(500).json({ error: 'Authentication service error' });
    }
});

// Get Vorstand user info
app.get('/auth/vorstand/me', authenticateVorstand, async (req, res) => {
    res.json({
        email: req.user.email,
        role: req.user.role,
        name: getRoleName(req.user.role),
        groups: req.user.groups
    });
});

// Helper function to get role display name
function getRoleName(role) {
    const names = {
        'praesident': 'Präsident',
        'vizepraesident': 'Vize-Präsident',
        'aktuar': 'Aktuar',
        'kassier': 'Kassier',
        'beisitzer': 'Beisitzer'
    };
    return names[role] || role.charAt(0).toUpperCase() + role.slice(1);
}

// Audit logging helper
async function logAudit(pool, action, userId, email, ipAddress, details = {}) {
    try {
        await pool.query(`
            INSERT INTO audit_log (action, user_id, email, ip_address, details, created_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
        `, [action, userId, email, ipAddress, JSON.stringify(details)]);
    } catch (error) {
        console.error('Failed to write audit log:', error.message);
    }
}

// OAuth2 callback - exchange code for token
app.post('/auth/callback', async (req, res) => {
    try {
        const { code, redirect_uri, client_type } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'No code provided' });
        }

        // Determine which OAuth2 credentials to use
        let clientId, clientSecret;

        if (client_type === 'vorstand') {
            clientId = process.env.AUTHENTIK_CLIENT_ID_VORSTAND;
            clientSecret = process.env.AUTHENTIK_CLIENT_SECRET_VORSTAND;
        } else {
            // Default to members credentials
            clientId = process.env.AUTHENTIK_CLIENT_ID;
            clientSecret = process.env.AUTHENTIK_CLIENT_SECRET;
        }

        if (!clientId || !clientSecret) {
            console.error(`Missing OAuth2 credentials for client_type: ${client_type || 'members'}`);
            return res.status(500).json({ error: 'OAuth2 configuration error' });
        }

        // Exchange code for access token
        const tokenResponse = await fetch(`${process.env.AUTHENTIK_URL}/application/o/token/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirect_uri,
                client_id: clientId,
                client_secret: clientSecret
            })
        });

        if (!tokenResponse.ok) {
            const error = await tokenResponse.text();
            console.error('Token exchange failed:', error);
            return res.status(401).json({ error: 'Token exchange failed' });
        }

        const tokenData = await tokenResponse.json();

        res.json({
            access_token: tokenData.access_token,
            token_type: tokenData.token_type,
            expires_in: tokenData.expires_in
        });

    } catch (error) {
        console.error('OAuth callback error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// MEMBERS ROUTES (protected)
// ============================================

// Get all members (requires authentication)
app.get('/members', authenticateAny, async (req, res) => {
    try {
        const { status, search } = req.query;
        let query = 'SELECT * FROM members WHERE 1=1';
        const params = [];

        if (status) {
            params.push(status);
            query += ` AND status = $${params.length}`;
        }

        if (search) {
            params.push(`%${search}%`);
            query += ` AND (vorname ILIKE $${params.length} OR nachname ILIKE $${params.length} OR email ILIKE $${params.length})`;
        }

        query += ' ORDER BY nachname, vorname';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single member
app.get('/members/:id', authenticateAny, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM members WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Member not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create member (requires Vorstand role)
app.post('/members', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const {
            anrede, vorname, nachname, geschlecht, geburtstag,
            strasse, adresszusatz, plz, ort,
            telefon, mobile, email, versand_email,
            status, funktion, eintrittsdatum,
            iban, zustellung_email, zustellung_post, bemerkungen
        } = req.body;

        const result = await pool.query(`
            INSERT INTO members (
                anrede, vorname, nachname, geschlecht, geburtstag,
                strasse, adresszusatz, plz, ort,
                telefon, mobile, email, versand_email,
                status, funktion, eintrittsdatum,
                iban, zustellung_email, zustellung_post, bemerkungen
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
            RETURNING *
        `, [
            anrede, vorname, nachname, geschlecht, geburtstag,
            strasse, adresszusatz, plz, ort,
            telefon, mobile, email, versand_email,
            status || 'Aktivmitglied', funktion, eintrittsdatum || new Date(),
            iban, zustellung_email ?? true, zustellung_post ?? false, bemerkungen
        ]);

        // Audit log
        await logAudit(pool, 'MEMBER_CREATE', null, req.user.email, req.ip, {
            member_id: result.rows[0].id,
            member_name: `${vorname} ${nachname}`
        });

        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update member (requires Vorstand role)
app.put('/members/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Build dynamic update query
        const fields = Object.keys(updates);
        const values = Object.values(updates);

        if (fields.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        // Get old values for audit log
        const oldResult = await pool.query('SELECT vorname, nachname FROM members WHERE id = $1', [id]);

        const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
        values.push(id);

        const result = await pool.query(`
            UPDATE members SET ${setClause}, updated_at = NOW()
            WHERE id = $${values.length}
            RETURNING *
        `, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Member not found' });
        }

        // Audit log
        const memberName = oldResult.rows.length > 0
            ? `${oldResult.rows[0].vorname} ${oldResult.rows[0].nachname}`
            : 'Unknown';
        await logAudit(pool, 'MEMBER_UPDATE', null, req.user.email, req.ip, {
            member_id: id,
            member_name: memberName,
            updated_fields: fields
        });

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete member (requires Vorstand role)
app.delete('/members/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;

        // Get member info for audit log before deleting
        const memberResult = await pool.query('SELECT vorname, nachname, email FROM members WHERE id = $1', [id]);

        const result = await pool.query('DELETE FROM members WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Member not found' });
        }

        // Audit log
        const memberName = memberResult.rows.length > 0
            ? `${memberResult.rows[0].vorname} ${memberResult.rows[0].nachname}`
            : 'Unknown';
        await logAudit(pool, 'MEMBER_DELETE', null, req.user.email, req.ip, {
            member_id: id,
            member_name: memberName,
            member_email: memberResult.rows[0]?.email
        });

        res.json({ message: 'Member deleted', id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ROLES ROUTES
// ============================================

app.get('/roles', authenticateAny, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM roles ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/members/:id/roles', authenticateAny, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT r.* FROM roles r
            JOIN member_roles mr ON r.id = mr.role_id
            WHERE mr.member_id = $1
        `, [id]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// AUDIT LOG
// ============================================

// Get audit log (Vorstand only)
app.get('/audit', authenticateVorstand, async (req, res) => {
    try {
        const { limit = 100, offset = 0, action, email } = req.query;

        let query = 'SELECT * FROM audit_log WHERE 1=1';
        const params = [];

        if (action) {
            params.push(action);
            query += ` AND action = $${params.length}`;
        }

        if (email) {
            params.push(`%${email}%`);
            query += ` AND email ILIKE $${params.length}`;
        }

        query += ' ORDER BY created_at DESC';

        params.push(parseInt(limit));
        query += ` LIMIT $${params.length}`;

        params.push(parseInt(offset));
        query += ` OFFSET $${params.length}`;

        const result = await pool.query(query, params);

        // Log that someone viewed the audit log
        await logAudit(pool, 'AUDIT_VIEW', null, req.user.email, req.ip, { filters: { action, email } });

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// STATISTICS
// ============================================

app.get('/members/stats/overview', authenticateAny, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'Aktivmitglied') as aktiv,
                COUNT(*) FILTER (WHERE status = 'Passivmitglied') as passiv,
                COUNT(*) FILTER (WHERE status = 'Ehrenmitglied') as ehren,
                COUNT(*) FILTER (WHERE zustellung_email = true) as email_zustellung,
                COUNT(*) FILTER (WHERE zustellung_post = true) as post_zustellung
            FROM members
        `);
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// AUTHENTIK SYNC
// ============================================

// Sync all members with email to Authentik
app.post('/members/sync-authentik', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const AUTHENTIK_API_URL = process.env.AUTHENTIK_URL || 'https://auth.fwv-raura.ch';
        const AUTHENTIK_API_TOKEN = process.env.AUTHENTIK_API_TOKEN;

        if (!AUTHENTIK_API_TOKEN) {
            return res.status(500).json({ error: 'AUTHENTIK_API_TOKEN not configured' });
        }

        // Get all members with email that haven't been synced yet
        const result = await pool.query(`
            SELECT id, vorname, nachname, email
            FROM members
            WHERE email IS NOT NULL
            AND email != ''
            AND authentik_user_id IS NULL
            ORDER BY nachname, vorname
        `);

        const members = result.rows;
        const synced = [];
        const errors = [];

        for (const member of members) {
            try {
                // Create user in Authentik
                const userData = {
                    username: member.email,
                    name: `${member.vorname} ${member.nachname}`,
                    email: member.email,
                    is_active: true,
                    groups: [], // Will be assigned via Authentik UI or later
                    type: 'internal' // Regular user (not service account)
                };

                const authentikResponse = await axios.post(
                    `${AUTHENTIK_API_URL}/api/v3/core/users/`,
                    userData,
                    {
                        headers: {
                            'Authorization': `Bearer ${AUTHENTIK_API_TOKEN}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                const authentikUser = authentikResponse.data;

                // Update member with Authentik user ID
                await pool.query(`
                    UPDATE members
                    SET authentik_user_id = $1, authentik_synced_at = NOW()
                    WHERE id = $2
                `, [authentikUser.pk.toString(), member.id]);

                // Create default notification preferences
                const notificationTypes = ['shift_reminder', 'event_update', 'newsletter', 'general'];
                for (const type of notificationTypes) {
                    await pool.query(`
                        INSERT INTO notification_preferences (member_id, notification_type, enabled)
                        VALUES ($1, $2, true)
                        ON CONFLICT (member_id, notification_type) DO NOTHING
                    `, [member.id, type]);
                }

                synced.push({
                    member_id: member.id,
                    name: `${member.vorname} ${member.nachname}`,
                    email: member.email,
                    authentik_user_id: authentikUser.pk
                });

            } catch (error) {
                console.error(`Failed to sync member ${member.email}:`, error.response?.data || error.message);
                errors.push({
                    member_id: member.id,
                    name: `${member.vorname} ${member.nachname}`,
                    email: member.email,
                    error: error.response?.data?.username?.[0] || error.message
                });
            }
        }

        res.json({
            success: true,
            total: members.length,
            synced: synced.length,
            errors: errors.length,
            synced_members: synced,
            error_details: errors
        });

    } catch (error) {
        console.error('Authentik sync error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// SELF-SERVICE ROUTES (Member can access their own data)
// ============================================

// Get own member data
app.get('/members/me', authenticateToken, async (req, res) => {
    try {
        // req.user.email comes from JWT token
        const result = await pool.query(
            'SELECT * FROM members WHERE email = $1',
            [req.user.email]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Member profile not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update own member data (limited fields)
app.put('/members/me', authenticateToken, async (req, res) => {
    try {
        const {
            telefon, mobile, email, versand_email,
            strasse, adresszusatz, plz, ort,
            iban, bemerkungen
        } = req.body;

        // Get current member
        const currentResult = await pool.query(
            'SELECT id FROM members WHERE email = $1',
            [req.user.email]
        );

        if (currentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Member profile not found' });
        }

        const memberId = currentResult.rows[0].id;

        // Update allowed fields only
        const result = await pool.query(`
            UPDATE members SET
                telefon = COALESCE($1, telefon),
                mobile = COALESCE($2, mobile),
                email = COALESCE($3, email),
                versand_email = COALESCE($4, versand_email),
                strasse = COALESCE($5, strasse),
                adresszusatz = COALESCE($6, adresszusatz),
                plz = COALESCE($7, plz),
                ort = COALESCE($8, ort),
                iban = COALESCE($9, iban),
                bemerkungen = COALESCE($10, bemerkungen),
                updated_at = NOW()
            WHERE id = $11
            RETURNING *
        `, [telefon, mobile, email, versand_email, strasse, adresszusatz, plz, ort, iban, bemerkungen, memberId]);

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get own notification preferences
app.get('/members/me/notifications', authenticateToken, async (req, res) => {
    try {
        // Get member ID from email
        const memberResult = await pool.query(
            'SELECT id FROM members WHERE email = $1',
            [req.user.email]
        );

        if (memberResult.rows.length === 0) {
            return res.status(404).json({ error: 'Member profile not found' });
        }

        const memberId = memberResult.rows[0].id;

        // Get notification preferences
        const result = await pool.query(
            'SELECT * FROM notification_preferences WHERE member_id = $1 ORDER BY notification_type',
            [memberId]
        );

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update notification preferences
app.put('/members/me/notifications', authenticateToken, async (req, res) => {
    try {
        const { preferences } = req.body; // Array of { notification_type, enabled, alternative_email }

        if (!Array.isArray(preferences)) {
            return res.status(400).json({ error: 'preferences must be an array' });
        }

        // Get member ID from email
        const memberResult = await pool.query(
            'SELECT id FROM members WHERE email = $1',
            [req.user.email]
        );

        if (memberResult.rows.length === 0) {
            return res.status(404).json({ error: 'Member profile not found' });
        }

        const memberId = memberResult.rows[0].id;

        // Update each preference
        for (const pref of preferences) {
            await pool.query(`
                INSERT INTO notification_preferences (member_id, notification_type, enabled, alternative_email)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (member_id, notification_type)
                DO UPDATE SET
                    enabled = $3,
                    alternative_email = $4,
                    updated_at = NOW()
            `, [memberId, pref.notification_type, pref.enabled, pref.alternative_email || null]);
        }

        // Return updated preferences
        const result = await pool.query(
            'SELECT * FROM notification_preferences WHERE member_id = $1 ORDER BY notification_type',
            [memberId]
        );

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`API-Members running on port ${PORT}`);
});
