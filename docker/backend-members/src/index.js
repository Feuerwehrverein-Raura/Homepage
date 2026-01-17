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

// Middleware - CORS must be before helmet
const corsOptions = {
    origin: ['https://fwv-raura.ch', 'https://www.fwv-raura.ch', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true
};
app.use(cors(corsOptions));
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
}));
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

// ============================================
// AUTHENTIK AUTO-SYNC HELPERS
// ============================================

async function createAuthentikUser(member) {
    const AUTHENTIK_API_URL = process.env.AUTHENTIK_URL || 'https://auth.fwv-raura.ch';
    const AUTHENTIK_API_TOKEN = process.env.AUTHENTIK_API_TOKEN;
    const MITGLIEDER_GROUP_PK = process.env.AUTHENTIK_MITGLIEDER_GROUP || '248db02d-6592-4571-9050-2ccc0fdf0b7e';

    if (!AUTHENTIK_API_TOKEN) {
        console.warn('AUTHENTIK_API_TOKEN not configured - skipping user creation');
        return null;
    }

    if (!member.email) {
        console.warn('Member has no email - skipping Authentik sync');
        return null;
    }

    try {
        // Generate a username from email (use part before @)
        const username = member.email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');

        const userData = {
            username: username,
            name: `${member.vorname} ${member.nachname}`,
            email: member.email,
            is_active: true,
            path: 'users',
            type: 'internal',
            groups: [MITGLIEDER_GROUP_PK]  // Add to Mitglieder group
        };

        const response = await axios.post(
            `${AUTHENTIK_API_URL}/api/v3/core/users/`,
            userData,
            {
                headers: {
                    'Authorization': `Bearer ${AUTHENTIK_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const authentikUser = response.data;
        console.log(`Created Authentik user: ${username} (pk=${authentikUser.pk})`);

        // Set a random initial password (user will need to reset)
        const tempPassword = `FWV${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
        await axios.post(
            `${AUTHENTIK_API_URL}/api/v3/core/users/${authentikUser.pk}/set_password/`,
            { password: tempPassword },
            {
                headers: {
                    'Authorization': `Bearer ${AUTHENTIK_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return {
            pk: authentikUser.pk,
            username: username,
            tempPassword: tempPassword
        };

    } catch (error) {
        // Check if user already exists
        if (error.response?.status === 400 && error.response?.data?.username) {
            console.warn(`Authentik user might already exist for ${member.email}`);
            return null;
        }
        console.error(`Failed to create Authentik user for ${member.email}:`, error.response?.data || error.message);
        return null;
    }
}

async function deleteAuthentikUser(authentikUserId) {
    const AUTHENTIK_API_URL = process.env.AUTHENTIK_URL || 'https://auth.fwv-raura.ch';
    const AUTHENTIK_API_TOKEN = process.env.AUTHENTIK_API_TOKEN;

    if (!AUTHENTIK_API_TOKEN || !authentikUserId) {
        return false;
    }

    try {
        await axios.delete(
            `${AUTHENTIK_API_URL}/api/v3/core/users/${authentikUserId}/`,
            {
                headers: {
                    'Authorization': `Bearer ${AUTHENTIK_API_TOKEN}`
                }
            }
        );
        console.log(`Deleted Authentik user: pk=${authentikUserId}`);
        return true;
    } catch (error) {
        console.error(`Failed to delete Authentik user ${authentikUserId}:`, error.response?.data || error.message);
        return false;
    }
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

        console.log('Auth callback request:', { redirect_uri, client_type, code_length: code?.length });

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
// PUBLIC ROUTES
// ============================================

// Get Vorstand members (public, for website display)
app.get('/vorstand', async (req, res) => {
    try {
        // Get members with Vorstand functions
        const vorstandFunctions = [
            'Präsident', 'Praesident', 'Vizepräsident', 'Vizepraesident',
            'Aktuar', 'Kassier', 'Beisitzer', 'Materialwart'
        ];

        const result = await pool.query(`
            SELECT
                id, vorname, nachname, funktion, foto, email
            FROM members
            WHERE funktion IS NOT NULL
              AND funktion != ''
              AND funktion != '-'
              AND status = 'Aktivmitglied'
            ORDER BY
                CASE funktion
                    WHEN 'Präsident' THEN 1
                    WHEN 'Praesident' THEN 1
                    WHEN 'Vizepräsident' THEN 2
                    WHEN 'Vizepraesident' THEN 2
                    WHEN 'Aktuar' THEN 3
                    WHEN 'Kassier' THEN 4
                    WHEN 'Materialwart' THEN 5
                    WHEN 'Beisitzer' THEN 6
                    ELSE 10
                END,
                nachname
        `);

        // Filter to only show typical Vorstand functions
        const vorstandMembers = result.rows.filter(m =>
            vorstandFunctions.some(f => m.funktion.toLowerCase().includes(f.toLowerCase()))
        );

        res.json(vorstandMembers);
    } catch (error) {
        console.error('GET /vorstand error:', error.message);
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

// IMPORTANT: These specific routes MUST come before /members/:id to avoid matching 'me' or 'stats' as an ID

// Get own member data (self-service)
app.get('/members/me', authenticateToken, async (req, res) => {
    try {
        console.log('/members/me called for user:', req.user?.email);
        const result = await pool.query(
            'SELECT * FROM members WHERE email = $1',
            [req.user.email]
        );

        if (result.rows.length === 0) {
            console.log('Member not found for email:', req.user.email);
            return res.status(404).json({ error: 'Member profile not found' });
        }

        const member = result.rows[0];

        // Audit log for profile view (self-service)
        await logAudit(pool, 'MEMBER_SELFSERVICE_VIEW', member.id, req.user.email, req.ip, {
            member_id: member.id,
            member_name: `${member.vorname} ${member.nachname}`,
            self_service: true
        });

        console.log('Member found:', member.vorname, member.nachname);
        res.json(member);
    } catch (error) {
        console.error('/members/me error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Get single member (MUST come after /members/me)
app.get('/members/:id', authenticateAny, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM members WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Member not found' });
        }

        const member = result.rows[0];

        // Audit log for member view by Vorstand
        await logAudit(pool, 'MEMBER_VIEW', member.id, req.user.email, req.ip, {
            member_id: member.id,
            member_name: `${member.vorname} ${member.nachname}`,
            viewed_by: req.user.email
        });

        res.json(member);
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
            iban, zustellung_email, zustellung_post, bemerkungen,
            feuerwehr_zugehoerigkeit, foto, tshirt_groesse
        } = req.body;

        const result = await pool.query(`
            INSERT INTO members (
                anrede, vorname, nachname, geschlecht, geburtstag,
                strasse, adresszusatz, plz, ort,
                telefon, mobile, email, versand_email,
                status, funktion, eintrittsdatum,
                iban, zustellung_email, zustellung_post, bemerkungen,
                feuerwehr_zugehoerigkeit, foto, tshirt_groesse
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
            RETURNING *
        `, [
            anrede, vorname, nachname, geschlecht, geburtstag,
            strasse, adresszusatz, plz, ort,
            telefon, mobile, email, versand_email,
            status || 'Aktivmitglied', funktion, eintrittsdatum || new Date(),
            iban, zustellung_email ?? true, zustellung_post ?? false, bemerkungen,
            feuerwehr_zugehoerigkeit, foto, tshirt_groesse
        ]);

        const newMember = result.rows[0];

        // Auto-create Authentik user if email is provided
        if (email) {
            const authentikResult = await createAuthentikUser({
                vorname,
                nachname,
                email
            });

            if (authentikResult) {
                // Update member with Authentik user ID
                await pool.query(`
                    UPDATE members
                    SET authentik_user_id = $1, authentik_synced_at = NOW()
                    WHERE id = $2
                `, [authentikResult.pk.toString(), newMember.id]);

                newMember.authentik_user_id = authentikResult.pk.toString();
                newMember.authentik_username = authentikResult.username;

                // Create default notification preferences
                const notificationTypes = ['shift_reminder', 'event_update', 'newsletter', 'general'];
                for (const type of notificationTypes) {
                    await pool.query(`
                        INSERT INTO notification_preferences (member_id, notification_type, enabled)
                        VALUES ($1, $2, true)
                        ON CONFLICT (member_id, notification_type) DO NOTHING
                    `, [newMember.id, type]);
                }
            }
        }

        // Audit log
        await logAudit(pool, 'MEMBER_CREATE', null, req.user.email, req.ip, {
            member_id: newMember.id,
            member_name: `${vorname} ${nachname}`,
            authentik_synced: !!newMember.authentik_user_id
        });

        res.status(201).json(newMember);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// IMPORTANT: PUT /members/me MUST come before /members/:id to avoid matching 'me' as an ID
// Update own member data (limited fields) - Self-service
app.put('/members/me', authenticateToken, async (req, res) => {
    try {
        const {
            telefon, mobile, email, versand_email,
            strasse, adresszusatz, plz, ort,
            iban, bemerkungen
        } = req.body;

        console.log('PUT /members/me called for user:', req.user?.email);

        // Get current member
        const currentResult = await pool.query(
            'SELECT id, vorname, nachname FROM members WHERE email = $1',
            [req.user.email]
        );

        if (currentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Member profile not found' });
        }

        const memberId = currentResult.rows[0].id;
        const memberName = `${currentResult.rows[0].vorname} ${currentResult.rows[0].nachname}`;

        // Track which fields were updated
        const updatedFields = [];
        if (telefon !== undefined) updatedFields.push('telefon');
        if (mobile !== undefined) updatedFields.push('mobile');
        if (email !== undefined) updatedFields.push('email');
        if (versand_email !== undefined) updatedFields.push('versand_email');
        if (strasse !== undefined) updatedFields.push('strasse');
        if (adresszusatz !== undefined) updatedFields.push('adresszusatz');
        if (plz !== undefined) updatedFields.push('plz');
        if (ort !== undefined) updatedFields.push('ort');
        if (iban !== undefined) updatedFields.push('iban');
        if (bemerkungen !== undefined) updatedFields.push('bemerkungen');

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

        // Audit log for self-service update
        await logAudit(pool, 'MEMBER_SELFSERVICE_UPDATE', memberId, req.user.email, req.ip, {
            member_id: memberId,
            member_name: memberName,
            updated_fields: updatedFields,
            self_service: true
        });

        console.log('Profile updated successfully for:', req.user.email);
        res.json(result.rows[0]);
    } catch (error) {
        console.error('PUT /members/me error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Update member by ID (requires Vorstand role) - MUST come after /members/me
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

        // Audit log for Authentik sync
        await logAudit(pool, 'AUTHENTIK_SYNC', null, req.user.email, req.ip, {
            total_members: members.length,
            synced_count: synced.length,
            error_count: errors.length,
            synced_emails: synced.map(s => s.email)
        });

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
// NOTIFICATION PREFERENCES (Self-service)
// ============================================

// Note: GET /members/me and PUT /members/me are defined earlier (before /members/:id) to avoid route conflicts

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
            'SELECT id, vorname, nachname FROM members WHERE email = $1',
            [req.user.email]
        );

        if (memberResult.rows.length === 0) {
            return res.status(404).json({ error: 'Member profile not found' });
        }

        const memberId = memberResult.rows[0].id;
        const memberName = `${memberResult.rows[0].vorname} ${memberResult.rows[0].nachname}`;

        // Update each preference
        const changedPrefs = [];
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
            changedPrefs.push({ type: pref.notification_type, enabled: pref.enabled });
        }

        // Audit log for notification preference changes
        await logAudit(pool, 'NOTIFICATION_PREFS_UPDATE', memberId, req.user.email, req.ip, {
            member_id: memberId,
            member_name: memberName,
            preferences: changedPrefs,
            self_service: true
        });

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
