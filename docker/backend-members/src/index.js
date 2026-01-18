const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool, types } = require('pg');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { ImapFlow } = require('imapflow');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken, authenticateAny, authenticateVorstand, requireRole } = require('./auth-middleware');

// Configure pg to return dates/timestamps as strings (not JS Date objects)
// This prevents timezone conversion issues
types.setTypeParser(1082, val => val); // DATE
types.setTypeParser(1083, val => val); // TIME
types.setTypeParser(1114, val => val); // TIMESTAMP
types.setTypeParser(1184, val => val); // TIMESTAMPTZ

// Configure multer for photo uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = '/app/uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'photo-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Only image files are allowed'));
    }
});

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for correct client IP behind Traefik
app.set('trust proxy', true);

// Helper to get real client IP from proxy headers
function getClientIp(req) {
    // X-Forwarded-For can contain multiple IPs, take the first (original client)
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
        const ips = forwardedFor.split(',').map(ip => ip.trim());
        return ips[0];
    }
    // X-Real-IP is set by some proxies
    if (req.headers['x-real-ip']) {
        return req.headers['x-real-ip'];
    }
    // Fallback to req.ip (which should now work with trust proxy)
    return req.ip;
}

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

// Serve uploaded photos statically
app.use('/uploads', express.static('/app/uploads'));

// Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'api-members',
        version: process.env.APP_VERSION || '0.0.0'
    });
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

// IMAP-based authentication for Vorstand members (with admin fallback)
app.post('/auth/vorstand/login', async (req, res) => {
    const { email, password } = req.body;
    const clientIp = getClientIp(req);

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }

    const emailLower = email.toLowerCase();

    // Check for admin user (doesn't depend on IMAP)
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@fwv-raura.ch').toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (adminPassword && emailLower === adminEmail && password === adminPassword) {
        // Admin login successful
        const token = jwt.sign(
            {
                email: emailLower,
                role: 'admin',
                groups: ['vorstand', 'admin'],
                type: 'vorstand'
            },
            process.env.JWT_SECRET || 'fwv-raura-secret-key',
            { expiresIn: '8h' }
        );

        await logAudit(pool, 'LOGIN_SUCCESS', null, emailLower, clientIp, { role: 'admin', method: 'password' });

        return res.json({
            success: true,
            token: token,
            user: {
                email: emailLower,
                role: 'admin',
                name: 'Administrator'
            }
        });
    }

    // Validate email domain and allowed addresses for IMAP login
    const allowedEmails = (process.env.VORSTAND_EMAILS || 'praesident@fwv-raura.ch,aktuar@fwv-raura.ch,kassier@fwv-raura.ch,vizepraesident@fwv-raura.ch,beisitzer@fwv-raura.ch').split(',').map(e => e.trim().toLowerCase());

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
            let role = emailPrefix; // praesident, aktuar, kassier, etc.
            let groups = ['vorstand'];
            let memberName = getRoleName(role);

            // Check if member has Admin function in database
            try {
                const memberResult = await pool.query(
                    "SELECT vorname, nachname, funktion FROM members WHERE LOWER(email) = $1 OR funktion ILIKE '%Admin%'",
                    [emailLower]
                );
                if (memberResult.rows.length > 0) {
                    const member = memberResult.rows[0];
                    memberName = `${member.vorname} ${member.nachname}`;
                    // Check if member has Admin function
                    if (member.funktion && member.funktion.toLowerCase().includes('admin')) {
                        role = 'admin';
                        groups = ['vorstand', 'admin'];
                    }
                }
            } catch (dbError) {
                console.error('Error checking member function:', dbError.message);
            }

            // Generate JWT token
            const token = jwt.sign(
                {
                    email: emailLower,
                    role: role,
                    groups: groups,
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
                    name: memberName
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

// Send notification email helper - sends to member AND aktuar
async function sendNotificationEmail(memberId, templateName, variables = {}) {
    try {
        const DISPATCH_API = process.env.DISPATCH_API_URL || 'http://api-dispatch:3000';
        const AKTUAR_EMAIL = process.env.AKTUAR_EMAIL || 'aktuar@fwv-raura.ch';

        // Get member data
        const member = await pool.query('SELECT * FROM members WHERE id = $1', [memberId]);
        if (member.rows.length === 0) {
            console.log(`Member ${memberId} not found`);
            return;
        }

        const memberData = member.rows[0];

        // Get template by name
        const templateResult = await pool.query('SELECT * FROM dispatch_templates WHERE name = $1', [templateName]);
        if (templateResult.rows.length === 0) {
            console.warn(`Template '${templateName}' not found`);
            return;
        }

        const template = templateResult.rows[0];

        // Merge member data with custom variables
        const mergedVars = {
            anrede: memberData.anrede || '',
            vorname: memberData.vorname || '',
            nachname: memberData.nachname || '',
            ...variables
        };

        // Send to member (if email enabled)
        if (memberData.email && memberData.zustellung_email) {
            await axios.post(`${DISPATCH_API}/email/send`, {
                to: memberData.versand_email || memberData.email,
                template_id: template.id,
                variables: mergedVars,
                member_id: memberId
            });
            console.log(`Notification email '${templateName}' sent to member ${memberData.email}`);
        } else {
            console.log(`Skipping notification to member ${memberId} - no email or zustellung_email disabled`);
        }

        // Always send to Aktuar for record-keeping
        await axios.post(`${DISPATCH_API}/email/send`, {
            to: AKTUAR_EMAIL,
            template_id: template.id,
            variables: mergedVars,
            member_id: memberId
        });
        console.log(`Notification email '${templateName}' sent to Aktuar ${AKTUAR_EMAIL}`);

    } catch (error) {
        console.error(`Failed to send notification email:`, error.message);
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
        // Mapping from function to official email
        const funktionToEmail = {
            'präsident': 'praesident@fwv-raura.ch',
            'praesident': 'praesident@fwv-raura.ch',
            'vizepräsident': 'vizepraesident@fwv-raura.ch',
            'vizepraesident': 'vizepraesident@fwv-raura.ch',
            'aktuar': 'aktuar@fwv-raura.ch',
            'kassier': 'kassier@fwv-raura.ch',
            'materialwart': 'materialwart@fwv-raura.ch',
            'beisitzer': 'beisitzer@fwv-raura.ch'
        };

        // Query Vorstand members - don't filter by status since Vorstand can be Ehrenmitglied
        const result = await pool.query(`
            SELECT
                id, vorname, nachname, funktion, foto, email
            FROM members
            WHERE funktion IS NOT NULL
              AND funktion != ''
              AND funktion != '-'
              AND (
                  funktion ILIKE '%Präsident%' OR
                  funktion ILIKE '%Praesident%' OR
                  funktion ILIKE '%Vizepräsident%' OR
                  funktion ILIKE '%Vizepraesident%' OR
                  funktion ILIKE '%Aktuar%' OR
                  funktion ILIKE '%Kassier%' OR
                  funktion ILIKE '%Materialwart%' OR
                  funktion ILIKE '%Beisitzer%'
              )
            ORDER BY
                CASE
                    WHEN funktion ILIKE '%Präsident%' AND funktion NOT ILIKE '%Vize%' THEN 1
                    WHEN funktion ILIKE '%Praesident%' AND funktion NOT ILIKE '%Vize%' THEN 1
                    WHEN funktion ILIKE '%Vizepräsident%' THEN 2
                    WHEN funktion ILIKE '%Vizepraesident%' THEN 2
                    WHEN funktion ILIKE '%Aktuar%' THEN 3
                    WHEN funktion ILIKE '%Kassier%' THEN 4
                    WHEN funktion ILIKE '%Materialwart%' THEN 5
                    WHEN funktion ILIKE '%Beisitzer%' THEN 6
                    ELSE 10
                END,
                nachname
        `);

        // Map personal emails to official fwv-raura.ch emails
        const vorstandMembers = result.rows.map(m => {
            const funktionLower = m.funktion.toLowerCase();
            let officialEmail = m.email; // fallback to personal email

            for (const [key, email] of Object.entries(funktionToEmail)) {
                if (funktionLower.includes(key)) {
                    officialEmail = email;
                    break;
                }
            }

            return {
                ...m,
                email: officialEmail
            };
        });

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

        console.log('Member found:', result.rows[0].vorname, result.rows[0].nachname);
        res.json(result.rows[0]);
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
        await logAudit(pool, 'MEMBER_CREATE', null, req.user.email, getClientIp(req), {
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

        console.log('Profile updated successfully for:', req.user.email);
        res.json(result.rows[0]);
    } catch (error) {
        console.error('PUT /members/me error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Upload own photo (self-service)
app.post('/members/me/photo', authenticateToken, upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No photo uploaded' });
        }

        // Get member ID from email
        const memberResult = await pool.query(
            'SELECT id, foto FROM members WHERE email = $1',
            [req.user.email]
        );

        if (memberResult.rows.length === 0) {
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ error: 'Member profile not found' });
        }

        const memberId = memberResult.rows[0].id;
        const oldPhoto = memberResult.rows[0].foto;

        // Build the photo URL
        const photoUrl = `/uploads/${req.file.filename}`;

        // Update member with new photo URL
        await pool.query(`
            UPDATE members SET foto = $1, updated_at = NOW()
            WHERE id = $2
        `, [photoUrl, memberId]);

        // Delete old photo file if it exists
        if (oldPhoto && oldPhoto.startsWith('/uploads/')) {
            const oldPath = '/app' + oldPhoto;
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        res.json({
            success: true,
            photo_url: photoUrl
        });
    } catch (error) {
        if (req.file) {
            try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
        }
        res.status(500).json({ error: error.message });
    }
});

// Delete own photo (self-service)
app.delete('/members/me/photo', authenticateToken, async (req, res) => {
    try {
        // Get member
        const memberResult = await pool.query(
            'SELECT id, foto FROM members WHERE email = $1',
            [req.user.email]
        );

        if (memberResult.rows.length === 0) {
            return res.status(404).json({ error: 'Member profile not found' });
        }

        const memberId = memberResult.rows[0].id;
        const currentPhoto = memberResult.rows[0].foto;

        // Update member to remove photo
        await pool.query(`
            UPDATE members SET foto = NULL, updated_at = NOW()
            WHERE id = $1
        `, [memberId]);

        // Delete photo file if it exists
        if (currentPhoto && currentPhoto.startsWith('/uploads/')) {
            const photoPath = '/app' + currentPhoto;
            if (fs.existsSync(photoPath)) {
                fs.unlinkSync(photoPath);
            }
        }

        res.json({ success: true, message: 'Photo deleted' });
    } catch (error) {
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
        await logAudit(pool, 'MEMBER_UPDATE', null, req.user.email, getClientIp(req), {
            member_id: id,
            member_name: memberName,
            updated_fields: fields
        });

        // Send notification email to member and aktuar
        const changedFieldsList = fields.map(f => `- ${f}`).join('\n');
        sendNotificationEmail(id, 'Datenänderung bestätigt', {
            changed_fields: changedFieldsList
        }).catch(err => console.error('Email notification failed:', err));

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
        await logAudit(pool, 'MEMBER_DELETE', null, req.user.email, getClientIp(req), {
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
// PHOTO UPLOAD
// ============================================

// Upload member photo
app.post('/members/:id/photo', authenticateVorstand, upload.single('photo'), async (req, res) => {
    try {
        const { id } = req.params;

        if (!req.file) {
            return res.status(400).json({ error: 'No photo uploaded' });
        }

        // Build the photo URL
        const photoUrl = `/uploads/${req.file.filename}`;

        // Get old photo to delete
        const oldResult = await pool.query('SELECT foto FROM members WHERE id = $1', [id]);
        const oldPhoto = oldResult.rows[0]?.foto;

        // Update member with new photo URL
        const result = await pool.query(`
            UPDATE members SET foto = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING *
        `, [photoUrl, id]);

        if (result.rows.length === 0) {
            // Delete uploaded file if member not found
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ error: 'Member not found' });
        }

        // Delete old photo file if it exists
        if (oldPhoto && oldPhoto.startsWith('/uploads/')) {
            const oldPath = '/app' + oldPhoto;
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        // Audit log
        await logAudit(pool, 'MEMBER_PHOTO_UPDATE', null, req.user.email, getClientIp(req), {
            member_id: id,
            photo_url: photoUrl
        });

        res.json({
            success: true,
            photo_url: photoUrl,
            member: result.rows[0]
        });
    } catch (error) {
        // Clean up uploaded file on error
        if (req.file) {
            try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
        }
        res.status(500).json({ error: error.message });
    }
});

// Delete member photo
app.delete('/members/:id/photo', authenticateVorstand, async (req, res) => {
    try {
        const { id } = req.params;

        // Get current photo
        const currentResult = await pool.query('SELECT foto FROM members WHERE id = $1', [id]);

        if (currentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Member not found' });
        }

        const currentPhoto = currentResult.rows[0].foto;

        // Update member to remove photo
        await pool.query(`
            UPDATE members SET foto = NULL, updated_at = NOW()
            WHERE id = $1
        `, [id]);

        // Delete photo file if it exists
        if (currentPhoto && currentPhoto.startsWith('/uploads/')) {
            const photoPath = '/app' + currentPhoto;
            if (fs.existsSync(photoPath)) {
                fs.unlinkSync(photoPath);
            }
        }

        // Audit log
        await logAudit(pool, 'MEMBER_PHOTO_DELETE', null, req.user.email, getClientIp(req), {
            member_id: id
        });

        res.json({ success: true, message: 'Photo deleted' });
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
        await logAudit(pool, 'AUDIT_VIEW', null, req.user.email, getClientIp(req), { filters: { action, email } });

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// MEMBER REGISTRATIONS (Pending Applications)
// ============================================

// Get all pending registrations (Vorstand only)
app.get('/registrations', authenticateVorstand, async (req, res) => {
    try {
        const { status = 'pending' } = req.query;

        let query = 'SELECT * FROM member_registrations';
        const params = [];

        if (status && status !== 'all') {
            params.push(status);
            query += ` WHERE status = $${params.length}`;
        }

        query += ' ORDER BY created_at DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single registration
app.get('/registrations/:id', authenticateVorstand, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM member_registrations WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Registration not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Approve registration (creates member)
app.post('/registrations/:id/approve', authenticateVorstand, async (req, res) => {
    try {
        const { id } = req.params;
        const { memberStatus = 'Passivmitglied' } = req.body;

        // Get registration
        const regResult = await pool.query('SELECT * FROM member_registrations WHERE id = $1', [id]);

        if (regResult.rows.length === 0) {
            return res.status(404).json({ error: 'Registration not found' });
        }

        const registration = regResult.rows[0];

        if (registration.status !== 'pending') {
            return res.status(400).json({ error: 'Registration already processed' });
        }

        // Create member from registration
        const memberResult = await pool.query(`
            INSERT INTO members
            (vorname, nachname, strasse, plz, ort, telefon, mobile, email,
             status, zustellung_email, zustellung_post, eintrittsdatum)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
            RETURNING id
        `, [
            registration.vorname,
            registration.nachname,
            registration.strasse,
            registration.plz,
            registration.ort,
            registration.telefon,
            registration.mobile,
            registration.email,
            memberStatus,
            registration.korrespondenz_methode === 'email',
            registration.korrespondenz_methode === 'post'
        ]);

        const memberId = memberResult.rows[0].id;

        // Update registration status
        await pool.query(`
            UPDATE member_registrations
            SET status = 'approved', member_id = $1, processed_by = $2, processed_at = NOW()
            WHERE id = $3
        `, [memberId, req.user.email, id]);

        // Audit log
        await logAudit(pool, 'REGISTRATION_APPROVED', null, req.user.email, getClientIp(req), {
            registration_id: id,
            member_id: memberId,
            member_name: `${registration.vorname} ${registration.nachname}`
        });

        // Send welcome email to new member
        const today = new Date().toLocaleDateString('de-CH');
        sendNotificationEmail(memberId, 'Willkommen neues Mitglied', {
            mitgliedsnummer: memberId.substring(0, 8),
            status: memberStatus,
            eintrittsdatum: today,
            praesident_name: 'René Käslin'
        }).catch(err => console.error('Welcome email failed:', err));

        res.json({
            success: true,
            message: 'Registration approved',
            member_id: memberId
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reject registration
app.post('/registrations/:id/reject', authenticateVorstand, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        // Get registration
        const regResult = await pool.query('SELECT * FROM member_registrations WHERE id = $1', [id]);

        if (regResult.rows.length === 0) {
            return res.status(404).json({ error: 'Registration not found' });
        }

        const registration = regResult.rows[0];

        if (registration.status !== 'pending') {
            return res.status(400).json({ error: 'Registration already processed' });
        }

        // Update registration status
        await pool.query(`
            UPDATE member_registrations
            SET status = 'rejected', rejection_reason = $1, processed_by = $2, processed_at = NOW()
            WHERE id = $3
        `, [reason || null, req.user.email, id]);

        // Audit log
        await logAudit(pool, 'REGISTRATION_REJECTED', null, req.user.email, getClientIp(req), {
            registration_id: id,
            member_name: `${registration.vorname} ${registration.nachname}`,
            reason: reason
        });

        // Send rejection email to applicant and aktuar
        if (registration.email) {
            const DISPATCH_API = process.env.DISPATCH_API_URL || 'http://api-dispatch:3000';
            const AKTUAR_EMAIL = process.env.AKTUAR_EMAIL || 'aktuar@fwv-raura.ch';

            try {
                // Get template
                const templateResult = await pool.query('SELECT * FROM dispatch_templates WHERE name = $1', ['Registrierung abgelehnt']);
                if (templateResult.rows.length > 0) {
                    const template = templateResult.rows[0];
                    const variables = {
                        vorname: registration.vorname,
                        nachname: registration.nachname,
                        ablehnungsgrund: reason || 'Keine Begründung angegeben',
                        praesident_name: 'René Käslin'
                    };

                    // Send to applicant
                    await axios.post(`${DISPATCH_API}/email/send`, {
                        to: registration.email,
                        template_id: template.id,
                        variables
                    });

                    // Send to aktuar
                    await axios.post(`${DISPATCH_API}/email/send`, {
                        to: AKTUAR_EMAIL,
                        template_id: template.id,
                        variables
                    });

                    console.log(`Rejection email sent to ${registration.email} and ${AKTUAR_EMAIL}`);
                }
            } catch (err) {
                console.error('Rejection email failed:', err.message);
            }
        }

        res.json({
            success: true,
            message: 'Registration rejected'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get registration count (for badge in UI)
app.get('/registrations/count/pending', authenticateVorstand, async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT COUNT(*) as count FROM member_registrations WHERE status = 'pending'"
        );
        res.json({ count: parseInt(result.rows[0].count) });
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
