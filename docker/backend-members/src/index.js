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
const PDFDocument = require('pdfkit');
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
const SERVICE_NAME = 'api-members';

// ===========================================
// LOGGING UTILITIES
// ===========================================
function log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        service: SERVICE_NAME,
        level,
        message,
        ...data
    };
    console.log(JSON.stringify(logEntry));
}

function logInfo(message, data = {}) { log('INFO', message, data); }
function logWarn(message, data = {}) { log('WARN', message, data); }
function logError(message, data = {}) { log('ERROR', message, data); }
function logDebug(message, data = {}) {
    if (process.env.DEBUG === 'true') log('DEBUG', message, data);
}

// Trust proxy for correct client IP behind Traefik
app.set('trust proxy', true);

// Helper to get real client IP from proxy headers
function getClientIp(req) {
    // Debug logging for IP detection
    console.log('IP Detection Headers:', {
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-real-ip': req.headers['x-real-ip'],
        'cf-connecting-ip': req.headers['cf-connecting-ip'],
        'req.ip': req.ip,
        'req.connection.remoteAddress': req.connection?.remoteAddress
    });

    // Cloudflare sets CF-Connecting-IP
    if (req.headers['cf-connecting-ip']) {
        return req.headers['cf-connecting-ip'];
    }
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
    origin: ['https://fwv-raura.ch', 'https://www.fwv-raura.ch', 'http://localhost:3000', 'http://localhost:8080'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Explicit preflight handling for all routes
app.options('*', cors(corsOptions));
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
}));
app.use(express.json());

// ===========================================
// REQUEST LOGGING MIDDLEWARE
// ===========================================
app.use((req, res, next) => {
    // Skip health checks for cleaner logs
    if (req.path === '/health') return next();

    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    req.requestId = requestId;

    // Log request
    logInfo('REQUEST', {
        requestId,
        method: req.method,
        path: req.path,
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
        ip: getClientIp(req),
        userAgent: req.headers['user-agent']?.substring(0, 100)
    });

    // Log response when finished
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const logFn = res.statusCode >= 400 ? logWarn : logInfo;
        logFn('RESPONSE', {
            requestId,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            user: req.user?.email
        });
    });

    next();
});

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
    const allowedEmails = (process.env.VORSTAND_EMAILS || 'praesident@fwv-raura.ch,aktuar@fwv-raura.ch,kassier@fwv-raura.ch,materialwart@fwv-raura.ch,beisitzer@fwv-raura.ch').split(',').map(e => e.trim().toLowerCase());

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
        'aktuar': 'Aktuar',
        'kassier': 'Kassier',
        'materialwart': 'Materialwart',
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
            groups: [MITGLIEDER_GROUP_PK],  // Add to Mitglieder group
            attributes: {
                settings: {
                    locale: 'de_CH'  // German (Switzerland) as default
                },
                organisation: 'Feuerwehrverein Raura',
                role: getPrimaryRole(member.funktion),
                phone: member.telefon || '',
                mobile: member.mobile || '',
                street: member.strasse || '',
                postal_code: member.plz || '',
                city: member.ort || ''
            }
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

// Authentik group constants (used for group membership management)
const VORSTAND_GROUP = process.env.AUTHENTIK_VORSTAND_GROUP || '2e5db41b-b867-43e4-af75-e0241f06fb95';
const SOCIAL_MEDIA_GROUP = process.env.AUTHENTIK_SOCIAL_MEDIA_GROUP || '494ef740-41d3-40c3-9e68-8a1e5d3b4ad9';
const MITGLIEDER_GROUP = process.env.AUTHENTIK_MITGLIEDER_GROUP || '248db02d-6592-4571-9050-2ccc0fdf0b7e';
const ADMIN_GROUP = process.env.AUTHENTIK_ADMIN_GROUP || '2d29d683-b42d-406e-8d24-e5e39a80f3b3';

// Authentik group membership management

async function addUserToAuthentikGroup(authentikUserId, groupId) {
    const AUTHENTIK_API_URL = process.env.AUTHENTIK_URL || 'https://auth.fwv-raura.ch';
    const AUTHENTIK_API_TOKEN = process.env.AUTHENTIK_API_TOKEN;

    if (!AUTHENTIK_API_TOKEN || !authentikUserId) {
        console.warn('Missing AUTHENTIK_API_TOKEN or user ID');
        return false;
    }

    try {
        // First get current user groups
        const userResponse = await axios.get(
            `${AUTHENTIK_API_URL}/api/v3/core/users/${authentikUserId}/`,
            {
                headers: { 'Authorization': `Bearer ${AUTHENTIK_API_TOKEN}` }
            }
        );

        const currentGroups = userResponse.data.groups || [];
        if (currentGroups.includes(groupId)) {
            console.log(`User ${authentikUserId} already in group ${groupId}`);
            return true;
        }

        // Add the new group
        const updatedGroups = [...currentGroups, groupId];
        await axios.patch(
            `${AUTHENTIK_API_URL}/api/v3/core/users/${authentikUserId}/`,
            { groups: updatedGroups },
            {
                headers: {
                    'Authorization': `Bearer ${AUTHENTIK_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log(`Added user ${authentikUserId} to group ${groupId}`);
        return true;
    } catch (error) {
        console.error(`Failed to add user ${authentikUserId} to group ${groupId}:`, error.response?.data || error.message);
        return false;
    }
}

async function removeUserFromAuthentikGroup(authentikUserId, groupId) {
    const AUTHENTIK_API_URL = process.env.AUTHENTIK_URL || 'https://auth.fwv-raura.ch';
    const AUTHENTIK_API_TOKEN = process.env.AUTHENTIK_API_TOKEN;

    if (!AUTHENTIK_API_TOKEN || !authentikUserId) {
        console.warn('Missing AUTHENTIK_API_TOKEN or user ID');
        return false;
    }

    try {
        // First get current user groups
        const userResponse = await axios.get(
            `${AUTHENTIK_API_URL}/api/v3/core/users/${authentikUserId}/`,
            {
                headers: { 'Authorization': `Bearer ${AUTHENTIK_API_TOKEN}` }
            }
        );

        const currentGroups = userResponse.data.groups || [];
        if (!currentGroups.includes(groupId)) {
            console.log(`User ${authentikUserId} not in group ${groupId}`);
            return true;
        }

        // Remove the group
        const updatedGroups = currentGroups.filter(g => g !== groupId);
        await axios.patch(
            `${AUTHENTIK_API_URL}/api/v3/core/users/${authentikUserId}/`,
            { groups: updatedGroups },
            {
                headers: {
                    'Authorization': `Bearer ${AUTHENTIK_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log(`Removed user ${authentikUserId} from group ${groupId}`);
        return true;
    } catch (error) {
        console.error(`Failed to remove user ${authentikUserId} from group ${groupId}:`, error.response?.data || error.message);
        return false;
    }
}

async function isUserInAuthentikGroup(authentikUserId, groupId) {
    const AUTHENTIK_API_URL = process.env.AUTHENTIK_URL || 'https://auth.fwv-raura.ch';
    const AUTHENTIK_API_TOKEN = process.env.AUTHENTIK_API_TOKEN;

    if (!AUTHENTIK_API_TOKEN || !authentikUserId) {
        return false;
    }

    try {
        const userResponse = await axios.get(
            `${AUTHENTIK_API_URL}/api/v3/core/users/${authentikUserId}/`,
            {
                headers: { 'Authorization': `Bearer ${AUTHENTIK_API_TOKEN}` }
            }
        );
        return (userResponse.data.groups || []).includes(groupId);
    } catch (error) {
        console.error(`Failed to check user ${authentikUserId} group membership:`, error.response?.data || error.message);
        return false;
    }
}

// Get primary role from function list (Vorstand functions have priority)
function getPrimaryRole(funktion) {
    if (!funktion) return '';

    // Priority order for Vorstand functions
    const vorstandPriority = ['präsident', 'praesident', 'aktuar', 'kassier', 'materialwart', 'beisitzer'];

    // Parse functions (comma-separated)
    const funktionen = funktion.split(',').map(f => f.trim()).filter(f => f);

    if (funktionen.length === 0) return '';
    if (funktionen.length === 1) return funktionen[0];

    // Check for Vorstand functions first (in priority order)
    for (const priority of vorstandPriority) {
        const found = funktionen.find(f => f.toLowerCase().includes(priority));
        if (found) return found;
    }

    // No Vorstand function found, return first function
    return funktionen[0];
}

// Sync member profile data to Authentik
async function syncMemberToAuthentik(authentikUserId, member) {
    const AUTHENTIK_API_URL = process.env.AUTHENTIK_URL || 'https://auth.fwv-raura.ch';
    const AUTHENTIK_API_TOKEN = process.env.AUTHENTIK_API_TOKEN;

    if (!AUTHENTIK_API_TOKEN || !authentikUserId) {
        console.warn('Missing AUTHENTIK_API_TOKEN or user ID - skipping profile sync');
        return false;
    }

    try {
        // Build attributes object for Authentik
        const attributes = {
            // Default settings for all users
            settings: {
                locale: 'de_CH'  // German (Switzerland)
            }
        };

        // Contact info
        if (member.telefon) attributes.phone = member.telefon;
        if (member.mobile) attributes.mobile = member.mobile;

        // Address
        if (member.strasse) attributes.street = member.strasse;
        if (member.plz) attributes.postal_code = member.plz;
        if (member.ort) attributes.city = member.ort;

        // Other profile fields
        if (member.geburtstag) attributes.birthdate = member.geburtstag;

        // Organisation is always Feuerwehrverein Raura
        attributes.organisation = 'Feuerwehrverein Raura';

        // Role: Use primary role only (Vorstand functions have priority)
        if (member.funktion) {
            attributes.role = getPrimaryRole(member.funktion);
        }

        // Avatar URL (not base64 - that caused token size issues)
        // Authentik is configured to read avatar from attributes.avatar_url
        if (member.foto) {
            // Public URL to the member's photo
            const apiUrl = process.env.API_URL || 'https://api.fwv-raura.ch';
            attributes.avatar_url = `${apiUrl}${member.foto}`;
        }

        const updateData = {
            name: `${member.vorname} ${member.nachname}`.trim(),
            attributes: attributes
        };

        // Only update email if it changed (email is the login identifier)
        if (member.email) {
            updateData.email = member.email;
        }

        await axios.patch(
            `${AUTHENTIK_API_URL}/api/v3/core/users/${authentikUserId}/`,
            updateData,
            {
                headers: {
                    'Authorization': `Bearer ${AUTHENTIK_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Avatar sync disabled - storing base64 in user attributes makes tokens too large
        // causing "header too big" errors in browsers
        // if (member.foto) {
        //     await syncMemberAvatarToAuthentik(authentikUserId, member.foto);
        // }

        console.log(`Synced member profile to Authentik: ${member.vorname} ${member.nachname} (${authentikUserId})`);
        return true;
    } catch (error) {
        console.error(`Failed to sync member to Authentik:`, error.response?.data || error.message);
        return false;
    }
}

// Sync member avatar/photo to Authentik
async function syncMemberAvatarToAuthentik(authentikUserId, fotoPath) {
    const AUTHENTIK_API_URL = process.env.AUTHENTIK_URL || 'https://auth.fwv-raura.ch';
    const AUTHENTIK_API_TOKEN = process.env.AUTHENTIK_API_TOKEN;

    if (!AUTHENTIK_API_TOKEN || !authentikUserId || !fotoPath) {
        return false;
    }

    try {
        // Photo path is like /uploads/photo-xxx.jpg
        // Files are stored in /app/uploads/ inside the container
        const fullPath = path.join('/app', fotoPath);

        if (!fs.existsSync(fullPath)) {
            console.log(`Avatar file not found: ${fullPath}`);
            return false;
        }

        // Read photo and convert to base64 data URL
        const photoData = fs.readFileSync(fullPath);
        const ext = path.extname(fotoPath).toLowerCase().replace('.', '');
        const mimeType = ext === 'jpg' ? 'jpeg' : ext;
        const base64Photo = `data:image/${mimeType};base64,${photoData.toString('base64')}`;

        // First get current user attributes
        const userRes = await axios.get(
            `${AUTHENTIK_API_URL}/api/v3/core/users/${authentikUserId}/`,
            { headers: { 'Authorization': `Bearer ${AUTHENTIK_API_TOKEN}` } }
        );

        // Store avatar in user attributes (Authentik doesn't have a direct avatar API)
        await axios.patch(
            `${AUTHENTIK_API_URL}/api/v3/core/users/${authentikUserId}/`,
            {
                attributes: {
                    ...userRes.data.attributes,
                    picture: base64Photo
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${AUTHENTIK_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(`Synced avatar for user ${authentikUserId}`);
        return true;
    } catch (error) {
        console.error(`Failed to sync avatar:`, error.response?.data || error.message);
        return false;
    }
}

// Sync Authentik user profile to member database
async function syncAuthentikToMember(pool, authentikUserId) {
    const AUTHENTIK_API_URL = process.env.AUTHENTIK_URL || 'https://auth.fwv-raura.ch';
    const AUTHENTIK_API_TOKEN = process.env.AUTHENTIK_API_TOKEN;

    if (!AUTHENTIK_API_TOKEN || !authentikUserId) {
        return null;
    }

    try {
        // Get Authentik user data
        const userResponse = await axios.get(
            `${AUTHENTIK_API_URL}/api/v3/core/users/${authentikUserId}/`,
            { headers: { 'Authorization': `Bearer ${AUTHENTIK_API_TOKEN}` } }
        );

        const authentikUser = userResponse.data;
        const attributes = authentikUser.attributes || {};

        // Find member by authentik_user_id
        const memberResult = await pool.query(
            'SELECT * FROM members WHERE authentik_user_id = $1',
            [authentikUserId.toString()]
        );

        if (memberResult.rows.length === 0) {
            return null;
        }

        const member = memberResult.rows[0];
        const updates = {};
        const changes = [];

        // Check for changes (Authentik → Website)
        // Only sync if Authentik has the data and it differs
        if (attributes.phone && attributes.phone !== member.telefon) {
            updates.telefon = attributes.phone;
            changes.push('telefon');
        }
        if (attributes.mobile && attributes.mobile !== member.mobile) {
            updates.mobile = attributes.mobile;
            changes.push('mobile');
        }
        if (attributes.street && attributes.street !== member.strasse) {
            updates.strasse = attributes.street;
            changes.push('strasse');
        }
        if (attributes.postal_code && attributes.postal_code !== member.plz) {
            updates.plz = attributes.postal_code;
            changes.push('plz');
        }
        if (attributes.city && attributes.city !== member.ort) {
            updates.ort = attributes.city;
            changes.push('ort');
        }

        // Parse name if changed
        if (authentikUser.name) {
            const nameParts = authentikUser.name.trim().split(' ');
            if (nameParts.length >= 2) {
                const vorname = nameParts[0];
                const nachname = nameParts.slice(1).join(' ');
                if (vorname !== member.vorname) {
                    updates.vorname = vorname;
                    changes.push('vorname');
                }
                if (nachname !== member.nachname) {
                    updates.nachname = nachname;
                    changes.push('nachname');
                }
            }
        }

        if (changes.length === 0) {
            return { member_id: member.id, changes: [] };
        }

        // Apply updates
        const fields = Object.keys(updates);
        const values = Object.values(updates);
        const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
        values.push(member.id);

        await pool.query(
            `UPDATE members SET ${setClause}, updated_at = NOW() WHERE id = $${values.length}`,
            values
        );

        console.log(`Synced Authentik profile to member: ${member.vorname} ${member.nachname} - changed: ${changes.join(', ')}`);
        return { member_id: member.id, changes };
    } catch (error) {
        console.error(`Failed to sync Authentik to member:`, error.response?.data || error.message);
        return null;
    }
}

// Audit logging helper
async function logAudit(pool, action, userId, email, ipAddress, details = {}) {
    try {
        // Map action to entity_type
        let entityType = 'auth';
        if (action.startsWith('MEMBER_')) entityType = 'member';
        else if (action.startsWith('LOGIN_')) entityType = 'auth';
        else if (action.startsWith('EVENT_')) entityType = 'event';

        // Store email and details in new_values JSON
        const newValues = { email, ...details };

        await pool.query(`
            INSERT INTO audit_log (action, entity_type, user_id, email, ip_address, new_values, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [action, entityType, userId, email, ipAddress, JSON.stringify(newValues)]);
    } catch (error) {
        console.error('Failed to write audit log:', error.message);
    }
}

// ===========================================
// PHONE NUMBER FORMATTING
// ===========================================
// Formats phone numbers to international format with spaces
// Swiss: +41 XX XXX XX XX
// German: +49 XXX XXXXXXX (or +49 XXXX XXXXXXX for landlines)
function formatPhoneNumber(phone) {
    if (!phone) return null;

    // Remove all non-digit characters except leading +
    let cleaned = phone.replace(/[^\d+]/g, '');

    // If no country code, assume Swiss
    if (!cleaned.startsWith('+')) {
        // Remove leading 0 if present
        if (cleaned.startsWith('0')) {
            cleaned = cleaned.substring(1);
        }
        // Default to Swiss +41
        cleaned = '+41' + cleaned;
    }

    // Swiss numbers: +41 XX XXX XX XX
    if (cleaned.startsWith('+41')) {
        const digits = cleaned.substring(3);
        if (digits.length === 9) {
            return `+41 ${digits.substring(0, 2)} ${digits.substring(2, 5)} ${digits.substring(5, 7)} ${digits.substring(7, 9)}`;
        }
    }

    // German numbers: +49 XXX XXXXXXX or +49 XXXX XXXXXXX
    if (cleaned.startsWith('+49')) {
        const digits = cleaned.substring(3);
        // Remove leading 0 if present (common mistake)
        const cleanDigits = digits.startsWith('0') ? digits.substring(1) : digits;

        // Mobile numbers (15x, 16x, 17x) - 10 digits: +49 XXX XXXXXXX
        if (cleanDigits.match(/^1[567]/)) {
            if (cleanDigits.length >= 10) {
                return `+49 ${cleanDigits.substring(0, 3)} ${cleanDigits.substring(3, 10)}`;
            }
        }
        // Landline - format with area code
        if (cleanDigits.length >= 10) {
            return `+49 ${cleanDigits.substring(0, 4)} ${cleanDigits.substring(4)}`;
        }
    }

    // Return original if we couldn't format it
    return phone;
}

// Helper to get the current Aktuar's name from the database
async function getAktuarName() {
    try {
        const result = await pool.query(`
            SELECT vorname, nachname
            FROM members
            WHERE funktion ILIKE '%aktuar%' AND funktion NOT ILIKE '%vize%'
            LIMIT 1
        `);
        if (result.rows.length > 0) {
            return `${result.rows[0].vorname} ${result.rows[0].nachname}`;
        }
    } catch (err) {
        console.error('Failed to get Aktuar name:', err.message);
    }
    return 'Der Vorstand';
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

// Send farewell message to departing member based on delivery preferences
async function sendFarewellMessage(memberData) {
    try {
        const DISPATCH_API = process.env.DISPATCH_API_URL || 'http://api-dispatch:3000';

        // Get Aktuar info for signature (letters are sent in the name of the Vorstand/Aktuar)
        const aktuarResult = await pool.query(`
            SELECT vorname, nachname, strasse, plz, ort
            FROM members
            WHERE funktion ILIKE '%aktuar%' AND funktion NOT ILIKE '%vize%'
            LIMIT 1
        `);
        const aktuar = aktuarResult.rows[0] || {};
        const aktuarName = aktuar.vorname && aktuar.nachname
            ? `${aktuar.vorname} ${aktuar.nachname}`
            : 'Der Vorstand';

        // Format entry date
        const eintrittsdatum = memberData.eintrittsdatum
            ? new Date(memberData.eintrittsdatum).toLocaleDateString('de-CH')
            : 'unbekannt';

        // Determine formal address (Sie-Form for letters)
        const anredeFormal = memberData.anrede === 'Frau'
            ? 'Liebe Frau'
            : memberData.anrede === 'Herr'
                ? 'Lieber Herr'
                : 'Liebe/r';

        console.log(`Sending farewell message to ${memberData.vorname} ${memberData.nachname} (email: ${memberData.zustellung_email}, post: ${memberData.zustellung_post})`);

        // Send farewell EMAIL if preference is set
        if (memberData.zustellung_email && memberData.email) {
            try {
                // Get email template
                const emailTemplate = await pool.query(
                    "SELECT * FROM dispatch_templates WHERE name = 'Verabschiedung Mitglied' AND type = 'email'"
                );

                if (emailTemplate.rows.length > 0) {
                    const template = emailTemplate.rows[0];
                    await axios.post(`${DISPATCH_API}/email/send`, {
                        to: memberData.versand_email || memberData.email,
                        cc: 'vorstand@fwv-raura.ch',
                        template_id: template.id,
                        variables: {
                            anrede: memberData.anrede || '',
                            vorname: memberData.vorname || '',
                            nachname: memberData.nachname || '',
                            eintrittsdatum: eintrittsdatum,
                            aktuar_name: aktuarName
                        }
                    });
                    console.log(`Farewell email sent to ${memberData.email} (CC: vorstand@fwv-raura.ch)`);
                } else {
                    console.warn('Farewell email template not found');
                }
            } catch (emailError) {
                console.error('Failed to send farewell email:', emailError.message);
            }
        }

        // Send farewell LETTER if preference is set
        if (memberData.zustellung_post && memberData.strasse && memberData.plz && memberData.ort) {
            try {
                // Get letter template
                const letterTemplate = await pool.query(
                    "SELECT * FROM dispatch_templates WHERE name = 'Verabschiedung Mitglied Brief' AND type = 'post'"
                );

                if (letterTemplate.rows.length > 0) {
                    const template = letterTemplate.rows[0];
                    const datum = new Date().toLocaleDateString('de-CH', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                    });

                    // Get logo as base64 (same as invoice generation)
                    let logoBase64 = '';
                    try {
                        const logoPath = '/app/logo.png';
                        if (fs.existsSync(logoPath)) {
                            logoBase64 = fs.readFileSync(logoPath).toString('base64');
                        }
                    } catch (logoErr) {
                        console.warn('Could not load logo for farewell letter');
                    }

                    // Replace variables in template
                    let html = template.body;
                    const variables = {
                        anrede: memberData.anrede || '',
                        vorname: memberData.vorname || '',
                        nachname: memberData.nachname || '',
                        anrede_formal: anredeFormal,
                        eintrittsdatum: eintrittsdatum,
                        aktuar_name: aktuarName,
                        aktuar_adresse: aktuar.strasse || '',
                        aktuar_plz: aktuar.plz || '',
                        aktuar_ort: aktuar.ort || '',
                        datum: datum,
                        empfaenger_anrede: memberData.anrede || '',
                        empfaenger_vorname: memberData.vorname || '',
                        empfaenger_nachname: memberData.nachname || '',
                        empfaenger_strasse: memberData.strasse || '',
                        empfaenger_plz: memberData.plz || '',
                        empfaenger_ort: memberData.ort || '',
                        logo_base64: logoBase64
                    };

                    for (const [key, value] of Object.entries(variables)) {
                        html = html.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
                    }

                    // Build recipient address for Pingen
                    const recipientAddress = [
                        `${memberData.anrede || ''} ${memberData.vorname} ${memberData.nachname}`.trim(),
                        memberData.strasse,
                        memberData.adresszusatz,
                        `${memberData.plz} ${memberData.ort}`
                    ].filter(Boolean).join('\n');

                    // Send via Pingen
                    await axios.post(`${DISPATCH_API}/pingen/send`, {
                        html: html,
                        recipientAddress: recipientAddress,
                        recipientName: `${memberData.vorname} ${memberData.nachname}`,
                        recipientCountry: 'CH'
                    });

                    console.log(`Farewell letter sent to ${memberData.vorname} ${memberData.nachname}`);
                } else {
                    console.warn('Farewell letter template not found');
                }
            } catch (letterError) {
                console.error('Failed to send farewell letter:', letterError.message);
            }
        }

        // If neither preference is set, log it
        if (!memberData.zustellung_email && !memberData.zustellung_post) {
            console.log(`No farewell message sent - member has no delivery preferences set`);
        }

    } catch (error) {
        console.error('Failed to send farewell message:', error.message);
        // Don't throw - we don't want farewell message failure to block deletion
    }
}

// Sync mitglieder@fwv-raura.ch alias with all zustellung emails
async function syncMitgliederAlias() {
    try {
        const DISPATCH_API = process.env.DISPATCH_API_URL || 'http://fwv-api-dispatch:3000';
        const ALIAS_ADDRESS = 'mitglieder@fwv-raura.ch';

        // Get all zustellung emails
        const result = await pool.query(`
            SELECT COALESCE(versand_email, email) as email
            FROM members
            WHERE zustellung_email = true
            AND (email IS NOT NULL AND email != '')
            AND status NOT IN ('Ausgetreten', 'Verstorben')
            ORDER BY email
        `);
        const emails = result.rows.map(r => r.email).filter(e => e);

        if (emails.length === 0) {
            console.log('No emails with zustellung_email enabled for alias sync');
            return;
        }

        // Get existing aliases to find the mitglieder alias ID
        const aliasesResponse = await axios.get(`${DISPATCH_API}/mailcow/aliases`);
        const existingAlias = aliasesResponse.data.find(a => a.address === ALIAS_ADDRESS);

        if (existingAlias) {
            // Update existing alias
            await axios.put(`${DISPATCH_API}/mailcow/aliases/${existingAlias.id}`, {
                goto: emails.join(','),
                active: true
            });
            console.log(`Updated mitglieder alias with ${emails.length} recipients`);
        } else {
            // Create new alias
            await axios.post(`${DISPATCH_API}/mailcow/aliases`, {
                address: ALIAS_ADDRESS,
                goto: emails.join(','),
                active: true
            });
            console.log(`Created mitglieder alias with ${emails.length} recipients`);
        }
    } catch (error) {
        console.error('Failed to sync mitglieder alias:', error.message);
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
                  funktion ILIKE '%Aktuar%' OR
                  funktion ILIKE '%Kassier%' OR
                  funktion ILIKE '%Materialwart%' OR
                  funktion ILIKE '%Beisitzer%'
              )
            ORDER BY
                CASE
                    WHEN funktion ILIKE '%Präsident%' THEN 1
                    WHEN funktion ILIKE '%Praesident%' THEN 1
                    WHEN funktion ILIKE '%Aktuar%' THEN 2
                    WHEN funktion ILIKE '%Kassier%' THEN 3
                    WHEN funktion ILIKE '%Materialwart%' THEN 4
                    WHEN funktion ILIKE '%Beisitzer%' THEN 5
                    ELSE 10
                END,
                nachname
        `);

        // Vorstand function priority (only show primary Vorstand function publicly)
        const vorstandFunctions = ['präsident', 'praesident', 'aktuar', 'kassier', 'materialwart', 'beisitzer'];

        // Map personal emails to official fwv-raura.ch emails and extract primary Vorstand function
        const vorstandMembers = result.rows.map(m => {
            const funktionLower = m.funktion.toLowerCase();
            let officialEmail = m.email; // fallback to personal email
            let primaryFunction = m.funktion; // fallback to full function

            // Find the primary Vorstand function (first match in priority order)
            const funktionen = m.funktion.split(',').map(f => f.trim());
            for (const vf of vorstandFunctions) {
                const found = funktionen.find(f => f.toLowerCase().includes(vf));
                if (found) {
                    primaryFunction = found;
                    break;
                }
            }

            for (const [key, email] of Object.entries(funktionToEmail)) {
                if (funktionLower.includes(key)) {
                    officialEmail = email;
                    break;
                }
            }

            return {
                ...m,
                funktion: primaryFunction,
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

// ===========================================
// PDF EXPORTS
// ===========================================

// Generate member phone list PDF (Vorstand only)
app.get('/members/pdf/telefonliste', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { status } = req.query;
        let query = `
            SELECT vorname, nachname, telefon, mobile, email, status, funktion
            FROM members
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            params.push(status);
            query += ` AND status = $${params.length}`;
        }

        query += ' ORDER BY nachname, vorname';

        const result = await pool.query(query, params);
        const members = result.rows;

        // Create PDF
        const doc = new PDFDocument({
            size: 'A4',
            margin: 40,
            info: {
                Title: 'Telefonliste Feuerwehrverein Raura',
                Author: 'Feuerwehrverein Raura'
            }
        });

        // Set response headers
        const filename = `Telefonliste_FWV_${new Date().toISOString().split('T')[0]}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        doc.pipe(res);

        // Header
        doc.fontSize(18).font('Helvetica-Bold').text('Feuerwehrverein Raura', { align: 'center' });
        doc.fontSize(14).font('Helvetica').text('Telefonliste', { align: 'center' });
        doc.fontSize(10).text(`Stand: ${new Date().toLocaleDateString('de-CH')}`, { align: 'center' });
        doc.moveDown(1.5);

        // Table settings
        const tableTop = doc.y;
        const colName = 40;
        const colTelefon = 200;
        const colMobile = 320;
        const colStatus = 440;
        const rowHeight = 20;

        // Table header
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Name', colName, tableTop);
        doc.text('Telefon', colTelefon, tableTop);
        doc.text('Mobile', colMobile, tableTop);
        doc.text('Status', colStatus, tableTop);

        // Draw header line
        doc.moveTo(colName, tableTop + 15).lineTo(555, tableTop + 15).stroke();

        // Table rows
        doc.font('Helvetica').fontSize(9);
        let y = tableTop + rowHeight;
        let currentStatus = null;

        for (const member of members) {
            // Check if we need a new page
            if (y > 750) {
                doc.addPage();
                y = 50;

                // Repeat header on new page
                doc.fontSize(10).font('Helvetica-Bold');
                doc.text('Name', colName, y);
                doc.text('Telefon', colTelefon, y);
                doc.text('Mobile', colMobile, y);
                doc.text('Status', colStatus, y);
                doc.moveTo(colName, y + 15).lineTo(555, y + 15).stroke();
                doc.font('Helvetica').fontSize(9);
                y += rowHeight;
            }

            const name = `${member.nachname}, ${member.vorname}`;
            const telefon = member.telefon || '-';
            const mobile = member.mobile || '-';
            const statusText = member.funktion ? `${member.status} (${member.funktion})` : member.status || '-';

            doc.text(name, colName, y, { width: 155 });
            doc.text(telefon, colTelefon, y, { width: 115 });
            doc.text(mobile, colMobile, y, { width: 115 });
            doc.text(statusText, colStatus, y, { width: 115 });

            y += rowHeight;
        }

        // Footer with count
        doc.moveDown(2);
        doc.fontSize(9).font('Helvetica-Oblique');
        doc.text(`Total: ${members.length} Mitglieder`, { align: 'right' });

        doc.end();

    } catch (error) {
        console.error('PDF generation error:', error);
        res.status(500).json({ error: 'PDF Generierung fehlgeschlagen' });
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

        // Format phone numbers to international format
        const formattedTelefon = formatPhoneNumber(telefon);
        const formattedMobile = formatPhoneNumber(mobile);

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
            formattedTelefon, formattedMobile, email, versand_email,
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

                // Sync Authentik groups based on function
                if (funktion) {
                    syncMemberAuthentikGroups(authentikResult.pk.toString(), funktion)
                        .catch(err => console.error('Authentik group sync failed:', err));
                }

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

        // Sync mitglieder alias in background (don't await to not delay response)
        if (zustellung_email && email) {
            syncMitgliederAlias();
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// IMPORTANT: PUT /members/me MUST come before /members/:id to avoid matching 'me' as an ID
// Update own member data (limited fields) - Self-service
app.put('/members/me', authenticateToken, async (req, res) => {
    try {
        // Format phone numbers before processing
        const telefon = formatPhoneNumber(req.body.telefon);
        const mobile = formatPhoneNumber(req.body.mobile);
        const { email, versand_email, strasse, adresszusatz, plz, ort, iban, bemerkungen } = req.body;

        console.log('PUT /members/me called for user:', req.user?.email);

        // Get current member data to track changes
        const currentResult = await pool.query(
            'SELECT * FROM members WHERE email = $1',
            [req.user.email]
        );

        if (currentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Member profile not found' });
        }

        const currentMember = currentResult.rows[0];
        const memberId = currentMember.id;

        // Track which fields changed with old and new values
        const changedFields = [];
        const fieldLabels = {
            telefon: 'Telefon',
            mobile: 'Mobile',
            email: 'E-Mail',
            versand_email: 'Versand E-Mail',
            strasse: 'Strasse',
            adresszusatz: 'Adresszusatz',
            plz: 'PLZ',
            ort: 'Ort',
            iban: 'IBAN',
            bemerkungen: 'Bemerkungen'
        };

        const updates = { telefon, mobile, email, versand_email, strasse, adresszusatz, plz, ort, iban, bemerkungen };
        for (const [field, value] of Object.entries(updates)) {
            if (value !== undefined && value !== currentMember[field]) {
                const oldValue = currentMember[field] || '(leer)';
                const newValue = value || '(leer)';
                changedFields.push({
                    label: fieldLabels[field] || field,
                    oldValue,
                    newValue
                });
            }
        }

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

        // Send notification email if fields changed
        if (changedFields.length > 0) {
            const changedFieldsList = changedFields.map(f =>
                `- ${f.label}: ${f.oldValue} → ${f.newValue}`
            ).join('\n');
            sendNotificationEmail(memberId, 'Datenänderung bestätigt', {
                changed_fields: changedFieldsList
            }).catch(err => console.error('Email notification failed:', err));

            // Write audit log with real client IP
            const clientIp = getClientIp(req);
            logAudit(pool, 'member_self_update', memberId, req.user.email, clientIp, {
                updated_fields: changedFields.map(f => f.label)
            });
        }

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
        const updates = { ...req.body };

        // Format phone numbers if provided
        if (updates.telefon !== undefined) {
            updates.telefon = formatPhoneNumber(updates.telefon);
        }
        if (updates.mobile !== undefined) {
            updates.mobile = formatPhoneNumber(updates.mobile);
        }

        // Build dynamic update query
        const fields = Object.keys(updates);
        const values = Object.values(updates);

        if (fields.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        // Get old values for comparison and audit log
        const oldResult = await pool.query('SELECT * FROM members WHERE id = $1', [id]);
        const oldMember = oldResult.rows[0] || {};

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

        // Send notification email to member - only show actually changed fields
        const fieldLabels = {
            vorname: 'Vorname',
            nachname: 'Nachname',
            email: 'E-Mail',
            versand_email: 'Versand E-Mail',
            telefon: 'Telefon',
            mobile: 'Mobile',
            strasse: 'Strasse',
            adresszusatz: 'Adresszusatz',
            plz: 'PLZ',
            ort: 'Ort',
            geburtstag: 'Geburtstag',
            eintrittsdatum: 'Eintrittsdatum',
            funktion: 'Funktion',
            status: 'Status',
            iban: 'IBAN',
            bemerkungen: 'Bemerkungen',
            zustellung_post: 'Zustellung Post',
            zustellung_email: 'Zustellung E-Mail'
        };

        // Filter to only fields that actually changed
        const actuallyChangedFields = fields.filter(f => {
            const oldVal = oldMember[f];
            const newVal = updates[f];
            // Compare as strings to handle null/undefined/empty consistently
            const oldStr = oldVal === null || oldVal === undefined ? '' : String(oldVal);
            const newStr = newVal === null || newVal === undefined ? '' : String(newVal);
            return oldStr !== newStr;
        });

        if (actuallyChangedFields.length > 0) {
            const changedFieldsList = actuallyChangedFields.map(f => {
                const label = fieldLabels[f] || f;
                const oldVal = oldMember[f] || '(leer)';
                const newVal = updates[f] || '(leer)';
                return `- ${label}: ${oldVal} → ${newVal}`;
            }).join('\n');

            sendNotificationEmail(id, 'Datenänderung bestätigt', {
                changed_fields: changedFieldsList
            }).catch(err => console.error('Email notification failed:', err));
        }

        res.json(result.rows[0]);

        // Sync mitglieder alias if zustellung_email or email changed
        if (fields.includes('zustellung_email') || fields.includes('email') || fields.includes('versand_email')) {
            syncMitgliederAlias();
        }

        // Sync Authentik groups if funktion changed
        if (fields.includes('funktion') && result.rows[0].authentik_user_id) {
            syncMemberAuthentikGroups(result.rows[0].authentik_user_id, result.rows[0].funktion)
                .catch(err => console.error('Authentik group sync failed:', err));
        }

        // Sync profile to Authentik if relevant fields changed
        const profileFields = ['vorname', 'nachname', 'email', 'telefon', 'mobile', 'strasse', 'plz', 'ort', 'geburtstag'];
        const hasProfileChanges = fields.some(f => profileFields.includes(f));
        if (hasProfileChanges && result.rows[0].authentik_user_id) {
            syncMemberToAuthentik(result.rows[0].authentik_user_id, result.rows[0])
                .catch(err => console.error('Authentik profile sync failed:', err));
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Request member deletion (requires Vorstand role) - sends confirmation emails to Aktuar and Kassier
app.delete('/members/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body || {};

        // Get member info
        const memberResult = await pool.query('SELECT vorname, nachname, email FROM members WHERE id = $1', [id]);
        if (memberResult.rows.length === 0) {
            return res.status(404).json({ error: 'Member not found' });
        }
        const member = memberResult.rows[0];
        const memberName = `${member.vorname} ${member.nachname}`;

        // Check for existing pending request
        const existingRequest = await pool.query(
            'SELECT id FROM member_deletion_requests WHERE member_id = $1 AND status = $2',
            [id, 'pending']
        );
        if (existingRequest.rows.length > 0) {
            return res.status(400).json({ error: 'Eine Löschanfrage für dieses Mitglied ist bereits ausstehend' });
        }

        // Create deletion request
        const requestResult = await pool.query(`
            INSERT INTO member_deletion_requests (member_id, requested_by, reason)
            VALUES ($1, $2, $3)
            RETURNING id, aktuar_token, kassier_token
        `, [id, req.user.email, reason || null]);

        const request = requestResult.rows[0];
        const DISPATCH_API = process.env.DISPATCH_API_URL || 'http://api-dispatch:3000';
        const API_BASE_URL = process.env.API_BASE_URL || 'https://api.fwv-raura.ch';

        // Get Aktuar and Kassier emails from database
        const aktuarResult = await pool.query(
            "SELECT vorname, email FROM members WHERE funktion ILIKE '%Aktuar%' LIMIT 1"
        );
        const kassierResult = await pool.query(
            "SELECT vorname, email FROM members WHERE funktion ILIKE '%Kassier%' LIMIT 1"
        );

        if (aktuarResult.rows.length === 0 || kassierResult.rows.length === 0) {
            // Rollback the request if we can't find Aktuar or Kassier
            await pool.query('DELETE FROM member_deletion_requests WHERE id = $1', [request.id]);
            return res.status(500).json({
                error: 'Aktuar oder Kassier nicht gefunden. Bitte stellen Sie sicher, dass beide Funktionen in der Mitgliederliste zugewiesen sind.'
            });
        }

        const aktuar = aktuarResult.rows[0];
        const kassier = kassierResult.rows[0];

        // Send confirmation email to Aktuar
        const aktuarConfirmUrl = `${API_BASE_URL}/members/deletion-confirm/${request.aktuar_token}`;
        await axios.post(`${DISPATCH_API}/email/send`, {
            to: aktuar.email,
            subject: `Bestätigung Mitglieder-Löschung: ${memberName}`,
            body: `Hallo ${aktuar.vorname},\n\n${req.user.email} möchte das Mitglied "${memberName}" (${member.email}) löschen.\n\n${reason ? `Grund: ${reason}\n\n` : ''}Bitte bestätige diese Löschung durch Klick auf folgenden Link:\n${aktuarConfirmUrl}\n\nDie Löschung wird erst durchgeführt wenn sowohl Aktuar als auch Kassier bestätigt haben.\n\nDieser Link ist 7 Tage gültig.\n\nFeuerwehrverein Raura`
        });

        // Send confirmation email to Kassier
        const kassierConfirmUrl = `${API_BASE_URL}/members/deletion-confirm/${request.kassier_token}`;
        await axios.post(`${DISPATCH_API}/email/send`, {
            to: kassier.email,
            subject: `Bestätigung Mitglieder-Löschung: ${memberName}`,
            body: `Hallo ${kassier.vorname},\n\n${req.user.email} möchte das Mitglied "${memberName}" (${member.email}) löschen.\n\n${reason ? `Grund: ${reason}\n\n` : ''}Bitte bestätige diese Löschung durch Klick auf folgenden Link:\n${kassierConfirmUrl}\n\nDie Löschung wird erst durchgeführt wenn sowohl Aktuar als auch Kassier bestätigt haben.\n\nDieser Link ist 7 Tage gültig.\n\nFeuerwehrverein Raura`
        });

        // Audit log
        await logAudit(pool, 'MEMBER_DELETE_REQUESTED', null, req.user.email, getClientIp(req), {
            member_id: id,
            member_name: memberName,
            request_id: request.id
        });

        res.json({
            message: 'Löschanfrage erstellt. Aktuar und Kassier wurden per Email benachrichtigt.',
            request_id: request.id,
            requires_confirmation: ['aktuar', 'kassier']
        });
    } catch (error) {
        console.error('Delete request error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Confirm member deletion (via email link)
app.get('/members/deletion-confirm/:token', async (req, res) => {
    try {
        const { token } = req.params;

        // Find the request by token
        const requestResult = await pool.query(`
            SELECT dr.*, m.vorname, m.nachname, m.email as member_email, m.authentik_user_id
            FROM member_deletion_requests dr
            JOIN members m ON m.id = dr.member_id
            WHERE (dr.aktuar_token = $1 OR dr.kassier_token = $1)
            AND dr.status = 'pending'
            AND dr.expires_at > NOW()
        `, [token]);

        // Helper function for styled HTML pages (matching FWV website design)
        const renderPage = (title, content, type = 'info') => {
            const colors = {
                success: { bg: '#dcfce7', border: '#22c55e', icon: '✓' },
                warning: { bg: '#fef3c7', border: '#f59e0b', icon: '⏳' },
                error: { bg: '#fee2e2', border: '#ef4444', icon: '✗' },
                info: { bg: '#dbeafe', border: '#3b82f6', icon: 'ℹ' }
            };
            const c = colors[type] || colors.info;
            return `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - FWV Raura</title>
    <link rel="icon" type="image/png" href="https://fwv-raura.ch/images/favicon.png">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .card { background: white; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); max-width: 500px; width: 100%; overflow: hidden; }
        .header { background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%); color: white; padding: 28px 24px; text-align: center; }
        .header h1 { font-size: 20px; font-weight: 600; margin-top: 8px; }
        .header .logo { width: 56px; height: 56px; background: white; border-radius: 50%; padding: 6px; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
        .header .logo img { width: 100%; height: 100%; object-fit: contain; }
        .content { padding: 24px; }
        .alert { background: ${c.bg}; border-left: 4px solid ${c.border}; padding: 16px; border-radius: 8px; margin-bottom: 20px; display: flex; align-items: flex-start; gap: 12px; }
        .alert-icon { font-size: 24px; line-height: 1; }
        .alert-text h2 { font-size: 16px; font-weight: 600; margin-bottom: 4px; color: #1f2937; }
        .alert-text p { font-size: 14px; color: #4b5563; line-height: 1.5; }
        .status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 20px; }
        .status-item { background: #f9fafb; border-radius: 8px; padding: 16px; text-align: center; border: 1px solid #e5e7eb; }
        .status-item.confirmed { background: #dcfce7; border-color: #86efac; }
        .status-item.pending { background: #fef3c7; border-color: #fcd34d; }
        .status-label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500; }
        .status-value { font-size: 18px; font-weight: 600; margin-top: 4px; }
        .status-item.confirmed .status-value { color: #16a34a; }
        .status-item.pending .status-value { color: #d97706; }
        .footer { padding: 16px 24px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #6b7280; }
        .footer a { color: #b91c1c; text-decoration: none; }
        .footer a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <div class="logo"><img src="https://fwv-raura.ch/images/logo.png" alt="FWV Raura Logo"></div>
            <h1>Feuerwehrverein Raura</h1>
        </div>
        <div class="content">${content}</div>
        <div class="footer"><a href="https://fwv-raura.ch">Feuerwehrverein Raura Kaiseraugst</a></div>
    </div>
</body>
</html>`;
        };

        if (requestResult.rows.length === 0) {
            return res.status(404).send(renderPage('Link ungültig', `
                <div class="alert">
                    <span class="alert-icon">✗</span>
                    <div class="alert-text">
                        <h2>Ungültiger oder abgelaufener Link</h2>
                        <p>Der Bestätigungslink ist ungültig, wurde bereits verwendet oder ist abgelaufen.</p>
                    </div>
                </div>
            `, 'error'));
        }

        const request = requestResult.rows[0];
        const memberName = `${request.vorname} ${request.nachname}`;
        const isAktuar = request.aktuar_token === token;
        const role = isAktuar ? 'aktuar' : 'kassier';

        // Check if this person already confirmed
        const alreadyConfirmed = isAktuar ? request.aktuar_confirmed_at : request.kassier_confirmed_at;
        if (alreadyConfirmed) {
            const otherConfirmed = isAktuar ? request.kassier_confirmed_at : request.aktuar_confirmed_at;
            return res.send(renderPage('Bereits bestätigt', `
                <div class="alert">
                    <span class="alert-icon">ℹ</span>
                    <div class="alert-text">
                        <h2>Du hast bereits bestätigt</h2>
                        <p>Deine Bestätigung für die Löschung von <strong>${memberName}</strong> wurde bereits registriert.</p>
                    </div>
                </div>
                <div class="status-grid">
                    <div class="status-item confirmed">
                        <div class="status-label">Aktuar</div>
                        <div class="status-value">✓ Bestätigt</div>
                    </div>
                    <div class="status-item ${otherConfirmed ? 'confirmed' : 'pending'}">
                        <div class="status-label">Kassier</div>
                        <div class="status-value">${otherConfirmed ? '✓ Bestätigt' : '⏳ Ausstehend'}</div>
                    </div>
                </div>
            `, 'info'));
        }

        // Update confirmation
        if (isAktuar) {
            await pool.query(
                'UPDATE member_deletion_requests SET aktuar_confirmed_at = NOW(), aktuar_confirmed_by = $1 WHERE id = $2',
                [role, request.id]
            );
        } else {
            await pool.query(
                'UPDATE member_deletion_requests SET kassier_confirmed_at = NOW(), kassier_confirmed_by = $1 WHERE id = $2',
                [role, request.id]
            );
        }

        // Check if both have confirmed
        const updatedRequest = await pool.query(
            'SELECT * FROM member_deletion_requests WHERE id = $1',
            [request.id]
        );
        const req2 = updatedRequest.rows[0];

        if (req2.aktuar_confirmed_at && req2.kassier_confirmed_at) {
            // Both confirmed - execute deletion
            const memberId = request.member_id;

            // Fetch full member data BEFORE deletion for farewell message
            const memberResult = await pool.query('SELECT * FROM members WHERE id = $1', [memberId]);
            if (memberResult.rows.length > 0) {
                const memberData = memberResult.rows[0];
                // Send farewell message based on delivery preferences (email and/or letter)
                await sendFarewellMessage(memberData);
            }

            // Delete Authentik user if exists
            if (request.authentik_user_id) {
                await deleteAuthentikUser(request.authentik_user_id);
            }

            // Clean up related records
            await pool.query('UPDATE dispatch_log SET member_id = NULL WHERE member_id = $1', [memberId]);
            await pool.query('UPDATE audit_log SET user_id = NULL WHERE user_id = $1', [memberId]);
            await pool.query('UPDATE transactions SET member_id = NULL WHERE member_id = $1', [memberId]);
            await pool.query('UPDATE transactions SET created_by = NULL WHERE created_by = $1', [memberId]);
            await pool.query('UPDATE invoices SET member_id = NULL WHERE member_id = $1', [memberId]);
            await pool.query('UPDATE events SET organizer_id = NULL WHERE organizer_id = $1', [memberId]);
            await pool.query('DELETE FROM member_roles WHERE member_id = $1', [memberId]);
            await pool.query('DELETE FROM notification_preferences WHERE member_id = $1', [memberId]);
            await pool.query('DELETE FROM registrations WHERE member_id = $1', [memberId]);
            await pool.query('DELETE FROM member_registrations WHERE member_id = $1', [memberId]);

            // Delete the deletion request BEFORE deleting member (FK constraint)
            // The request info is saved to audit log below
            await pool.query('DELETE FROM member_deletion_requests WHERE id = $1', [request.id]);

            // Delete member
            await pool.query('DELETE FROM members WHERE id = $1', [memberId]);

            // Audit log
            await logAudit(pool, 'MEMBER_DELETE_EXECUTED', null, 'system', '0.0.0.0', {
                member_id: memberId,
                member_name: memberName,
                request_id: request.id,
                aktuar_confirmed: req2.aktuar_confirmed_at,
                kassier_confirmed: req2.kassier_confirmed_at
            });

            // Sync mitglieder alias in background (member removed)
            syncMitgliederAlias();

            return res.send(renderPage('Mitglied gelöscht', `
                <div class="alert">
                    <span class="alert-icon">✓</span>
                    <div class="alert-text">
                        <h2>Mitglied erfolgreich gelöscht</h2>
                        <p><strong>${memberName}</strong> wurde aus der Mitgliederliste entfernt.</p>
                    </div>
                </div>
                <div class="status-grid">
                    <div class="status-item confirmed">
                        <div class="status-label">Aktuar</div>
                        <div class="status-value">✓ Bestätigt</div>
                    </div>
                    <div class="status-item confirmed">
                        <div class="status-label">Kassier</div>
                        <div class="status-value">✓ Bestätigt</div>
                    </div>
                </div>
            `, 'success'));
        }

        // Only one confirmed so far
        const otherRole = isAktuar ? 'Kassier' : 'Aktuar';
        const otherConfirmed = isAktuar ? req2.kassier_confirmed_at : req2.aktuar_confirmed_at;
        res.send(renderPage('Bestätigung erfolgreich', `
            <div class="alert">
                <span class="alert-icon">✓</span>
                <div class="alert-text">
                    <h2>Deine Bestätigung wurde registriert</h2>
                    <p>Die Löschung von <strong>${memberName}</strong> wird durchgeführt, sobald auch der ${otherRole} bestätigt hat.</p>
                </div>
            </div>
            <div class="status-grid">
                <div class="status-item ${isAktuar ? 'confirmed' : (otherConfirmed ? 'confirmed' : 'pending')}">
                    <div class="status-label">Aktuar</div>
                    <div class="status-value">${isAktuar || otherConfirmed ? '✓ Bestätigt' : '⏳ Ausstehend'}</div>
                </div>
                <div class="status-item ${!isAktuar ? 'confirmed' : (otherConfirmed ? 'confirmed' : 'pending')}">
                    <div class="status-label">Kassier</div>
                    <div class="status-value">${!isAktuar || otherConfirmed ? '✓ Bestätigt' : '⏳ Ausstehend'}</div>
                </div>
            </div>
        `, 'warning'));

    } catch (error) {
        console.error('Deletion confirm error:', error);
        res.status(500).send(`<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fehler - FWV Raura</title>
    <style>
        body { font-family: -apple-system, sans-serif; background: #f3f4f6; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .card { background: white; border-radius: 12px; padding: 24px; max-width: 400px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        h1 { color: #ef4444; margin-bottom: 8px; }
        p { color: #6b7280; }
    </style>
</head>
<body>
    <div class="card">
        <h1>Fehler</h1>
        <p>Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es später erneut.</p>
    </div>
</body>
</html>`);
    }
});

// Get pending deletion requests (for Vorstand dashboard)
app.get('/deletion-requests', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT dr.*, m.vorname, m.nachname, m.email as member_email
            FROM member_deletion_requests dr
            JOIN members m ON m.id = dr.member_id
            WHERE dr.status = 'pending'
            ORDER BY dr.requested_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cancel deletion request
app.delete('/deletion-requests/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(
            'UPDATE member_deletion_requests SET status = $1 WHERE id = $2 AND status = $3',
            ['cancelled', id, 'pending']
        );
        res.json({ message: 'Löschanfrage abgebrochen' });
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

        // Auto-create Authentik user if email is provided
        let authentikResult = null;
        if (registration.email) {
            authentikResult = await createAuthentikUser({
                vorname: registration.vorname,
                nachname: registration.nachname,
                email: registration.email
            });

            if (authentikResult) {
                // Update member with Authentik user ID
                await pool.query(`
                    UPDATE members
                    SET authentik_user_id = $1, authentik_synced_at = NOW()
                    WHERE id = $2
                `, [authentikResult.pk.toString(), memberId]);

                // Create default notification preferences
                const notificationTypes = ['shift_reminder', 'event_update', 'newsletter', 'general'];
                for (const type of notificationTypes) {
                    await pool.query(`
                        INSERT INTO notification_preferences (member_id, notification_type, enabled)
                        VALUES ($1, $2, true)
                        ON CONFLICT (member_id, notification_type) DO NOTHING
                    `, [memberId, type]);
                }
            }
        }

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
            member_name: `${registration.vorname} ${registration.nachname}`,
            authentik_synced: !!authentikResult
        });

        // Send welcome email to new member
        const today = new Date().toLocaleDateString('de-CH');
        getAktuarName().then(aktuarName => {
            sendNotificationEmail(memberId, 'Willkommen neues Mitglied', {
                mitgliedsnummer: memberId.substring(0, 8),
                status: memberStatus,
                eintrittsdatum: today,
                aktuar_name: aktuarName
            }).catch(err => console.error('Welcome email failed:', err));
        });

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
                    const aktuarName = await getAktuarName();
                    const variables = {
                        vorname: registration.vorname,
                        nachname: registration.nachname,
                        ablehnungsgrund: reason || 'Keine Begründung angegeben',
                        aktuar_name: aktuarName
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
// EMAIL LIST FOR DISPATCH
// ============================================

// Get all email addresses with zustellung_email = true
app.get('/members/emails/zustellung', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                vorname,
                nachname,
                COALESCE(versand_email, email) as email,
                status
            FROM members
            WHERE zustellung_email = true
            AND (email IS NOT NULL AND email != '')
            AND status NOT IN ('Ausgetreten', 'Verstorben')
            ORDER BY nachname, vorname
        `);

        // Return emails as array and formatted list
        const emails = result.rows.map(r => r.email).filter(e => e);
        const members = result.rows;

        res.json({
            count: emails.length,
            emails: emails,
            formatted: emails.join(', '),
            members: members
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get email alias configuration (for Mailcow/Mailserver)
app.get('/members/emails/alias-config', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT COALESCE(versand_email, email) as email
            FROM members
            WHERE zustellung_email = true
            AND (email IS NOT NULL AND email != '')
            AND status NOT IN ('Ausgetreten', 'Verstorben')
            ORDER BY email
        `);

        const emails = result.rows.map(r => r.email).filter(e => e);

        // Format for different mail systems
        res.json({
            count: emails.length,
            // For Mailcow/Postfix alias format
            alias_destinations: emails.join(','),
            // For DNS/MX records (one per line)
            alias_list: emails.join('\n'),
            // JSON array for API integration
            emails: emails
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Sync mitglieder@fwv-raura.ch alias with all zustellung emails
app.post('/members/emails/sync-alias', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const DISPATCH_API = process.env.DISPATCH_API || 'http://fwv-api-dispatch:3000';
        const ALIAS_ADDRESS = 'mitglieder@fwv-raura.ch';

        // Get all zustellung emails
        const result = await pool.query(`
            SELECT COALESCE(versand_email, email) as email
            FROM members
            WHERE zustellung_email = true
            AND (email IS NOT NULL AND email != '')
            AND status NOT IN ('Ausgetreten', 'Verstorben')
            ORDER BY email
        `);
        const emails = result.rows.map(r => r.email).filter(e => e);

        if (emails.length === 0) {
            return res.status(400).json({ error: 'No emails with zustellung_email enabled' });
        }

        // Get existing aliases to find the mitglieder alias ID
        const aliasesResponse = await axios.get(`${DISPATCH_API}/mailcow/aliases`, {
            headers: { 'Authorization': req.headers.authorization }
        });

        const existingAlias = aliasesResponse.data.find(a => a.address === ALIAS_ADDRESS);

        if (existingAlias) {
            // Update existing alias
            await axios.put(`${DISPATCH_API}/mailcow/aliases/${existingAlias.id}`, {
                goto: emails.join(','),
                active: true
            }, {
                headers: { 'Authorization': req.headers.authorization }
            });
            res.json({
                success: true,
                action: 'updated',
                alias: ALIAS_ADDRESS,
                recipients: emails.length,
                emails: emails
            });
        } else {
            // Create new alias
            await axios.post(`${DISPATCH_API}/mailcow/aliases`, {
                address: ALIAS_ADDRESS,
                goto: emails.join(','),
                active: true
            }, {
                headers: { 'Authorization': req.headers.authorization }
            });
            res.json({
                success: true,
                action: 'created',
                alias: ALIAS_ADDRESS,
                recipients: emails.length,
                emails: emails
            });
        }
    } catch (error) {
        console.error('Alias sync error:', error.response?.data || error.message);
        res.status(500).json({ error: error.response?.data?.error || error.message });
    }
});

// ============================================
// AUTHENTIK SYNC
// ============================================

// Toggle Nextcloud admin status for a member
app.post('/members/:id/nextcloud-admin', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { enabled } = req.body;

        // Get member's Authentik user ID
        const memberResult = await pool.query(
            'SELECT authentik_user_id, vorname, nachname FROM members WHERE id = $1',
            [id]
        );

        if (memberResult.rows.length === 0) {
            return res.status(404).json({ error: 'Mitglied nicht gefunden' });
        }

        const member = memberResult.rows[0];
        if (!member.authentik_user_id) {
            return res.status(400).json({ error: 'Mitglied hat keinen Authentik-Account' });
        }

        let success;
        if (enabled) {
            success = await addUserToAuthentikGroup(member.authentik_user_id, ADMIN_GROUP);
        } else {
            success = await removeUserFromAuthentikGroup(member.authentik_user_id, ADMIN_GROUP);
        }

        if (!success) {
            return res.status(500).json({ error: 'Fehler bei der Authentik-Gruppenanpassung' });
        }

        // Audit log
        await logAudit(pool, 'MEMBER_NEXTCLOUD_ADMIN', null, req.user.email, getClientIp(req), {
            member_id: id,
            member_name: `${member.vorname} ${member.nachname}`,
            nextcloud_admin: enabled
        });

        res.json({
            success: true,
            member_id: id,
            nextcloud_admin: enabled,
            message: enabled ? 'Nextcloud-Admin-Rechte erteilt' : 'Nextcloud-Admin-Rechte entzogen'
        });
    } catch (error) {
        console.error('Nextcloud admin toggle error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Get Nextcloud admin status for a member
app.get('/members/:id/nextcloud-admin', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;

        // Get member's Authentik user ID
        const memberResult = await pool.query(
            'SELECT authentik_user_id FROM members WHERE id = $1',
            [id]
        );

        if (memberResult.rows.length === 0) {
            return res.status(404).json({ error: 'Mitglied nicht gefunden' });
        }

        const member = memberResult.rows[0];
        if (!member.authentik_user_id) {
            return res.json({ has_authentik: false, nextcloud_admin: false });
        }

        const isAdmin = await isUserInAuthentikGroup(member.authentik_user_id, ADMIN_GROUP);

        res.json({
            has_authentik: true,
            nextcloud_admin: isAdmin
        });
    } catch (error) {
        console.error('Nextcloud admin check error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Mapping from functions to Authentik groups (constants defined at top of group section)
const FUNCTION_TO_GROUPS = {
    // Vorstand functions -> Vorstand group
    'präsident': VORSTAND_GROUP,
    'praesident': VORSTAND_GROUP,
    'aktuar': VORSTAND_GROUP,
    'kassier': VORSTAND_GROUP,
    'materialwart': VORSTAND_GROUP,
    'beisitzer': VORSTAND_GROUP,
    'vorstand': VORSTAND_GROUP,
    // Social Media function -> Social Media group
    'social media': SOCIAL_MEDIA_GROUP,
    'social-media': SOCIAL_MEDIA_GROUP,
    'socialmedia': SOCIAL_MEDIA_GROUP,
    // Admin function -> admin group (grants Nextcloud admin rights)
    'admin': ADMIN_GROUP,
};

// Sync Authentik groups based on member's functions
async function syncMemberAuthentikGroups(authentikUserId, funktion) {
    if (!authentikUserId) {
        console.warn('No Authentik user ID - skipping group sync');
        return false;
    }

    try {
        // Parse functions (comma-separated)
        const funktionen = funktion ? funktion.split(',').map(f => f.trim().toLowerCase()).filter(f => f) : [];

        // Determine which groups the member should be in
        const shouldBeInGroups = new Set([MITGLIEDER_GROUP]); // Everyone gets Mitglieder

        for (const f of funktionen) {
            for (const [key, groupId] of Object.entries(FUNCTION_TO_GROUPS)) {
                if (f.includes(key)) {
                    shouldBeInGroups.add(groupId);
                }
            }
        }

        // Get current groups from Authentik
        const AUTHENTIK_API_URL = process.env.AUTHENTIK_URL || 'https://auth.fwv-raura.ch';
        const AUTHENTIK_API_TOKEN = process.env.AUTHENTIK_API_TOKEN;

        if (!AUTHENTIK_API_TOKEN) {
            console.warn('AUTHENTIK_API_TOKEN not configured - skipping group sync');
            return false;
        }

        const userResponse = await axios.get(
            `${AUTHENTIK_API_URL}/api/v3/core/users/${authentikUserId}/`,
            { headers: { 'Authorization': `Bearer ${AUTHENTIK_API_TOKEN}` } }
        );

        const currentGroups = new Set(userResponse.data.groups || []);

        // Groups we manage (only sync these, leave others untouched)
        const managedGroups = [MITGLIEDER_GROUP, VORSTAND_GROUP, SOCIAL_MEDIA_GROUP, ADMIN_GROUP];

        // Calculate changes
        let changed = false;
        for (const groupId of managedGroups) {
            const shouldBeIn = shouldBeInGroups.has(groupId);
            const isIn = currentGroups.has(groupId);

            if (shouldBeIn && !isIn) {
                currentGroups.add(groupId);
                changed = true;
                console.log(`Adding user ${authentikUserId} to group ${groupId}`);
            } else if (!shouldBeIn && isIn) {
                currentGroups.delete(groupId);
                changed = true;
                console.log(`Removing user ${authentikUserId} from group ${groupId}`);
            }
        }

        if (changed) {
            await axios.patch(
                `${AUTHENTIK_API_URL}/api/v3/core/users/${authentikUserId}/`,
                { groups: Array.from(currentGroups) },
                {
                    headers: {
                        'Authorization': `Bearer ${AUTHENTIK_API_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            console.log(`Synced Authentik groups for user ${authentikUserId}: ${Array.from(shouldBeInGroups).join(', ')}`);
        }

        return true;
    } catch (error) {
        console.error(`Failed to sync Authentik groups for user ${authentikUserId}:`, error.response?.data || error.message);
        return false;
    }
}

// Toggle Vorstand group status for a member
app.post('/members/:id/vorstand-group', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { enabled } = req.body;

        // Get member's Authentik user ID
        const memberResult = await pool.query(
            'SELECT authentik_user_id, vorname, nachname FROM members WHERE id = $1',
            [id]
        );

        if (memberResult.rows.length === 0) {
            return res.status(404).json({ error: 'Mitglied nicht gefunden' });
        }

        const member = memberResult.rows[0];
        if (!member.authentik_user_id) {
            return res.status(400).json({ error: 'Mitglied hat keinen Authentik-Account' });
        }

        let success;
        if (enabled) {
            success = await addUserToAuthentikGroup(member.authentik_user_id, VORSTAND_GROUP);
        } else {
            success = await removeUserFromAuthentikGroup(member.authentik_user_id, VORSTAND_GROUP);
        }

        if (!success) {
            return res.status(500).json({ error: 'Fehler bei der Authentik-Gruppenanpassung' });
        }

        // Audit log
        await logAudit(pool, 'MEMBER_VORSTAND_GROUP', null, req.user.email, getClientIp(req), {
            member_id: id,
            member_name: `${member.vorname} ${member.nachname}`,
            vorstand_group: enabled
        });

        res.json({
            success: true,
            member_id: id,
            vorstand_group: enabled,
            message: enabled ? 'Zur Vorstand-Gruppe hinzugefuegt' : 'Aus Vorstand-Gruppe entfernt'
        });
    } catch (error) {
        console.error('Vorstand group toggle error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Get Vorstand group status for a member
app.get('/members/:id/vorstand-group', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;

        // Get member's Authentik user ID
        const memberResult = await pool.query(
            'SELECT authentik_user_id FROM members WHERE id = $1',
            [id]
        );

        if (memberResult.rows.length === 0) {
            return res.status(404).json({ error: 'Mitglied nicht gefunden' });
        }

        const member = memberResult.rows[0];
        if (!member.authentik_user_id) {
            return res.json({ has_authentik: false, vorstand_group: false });
        }

        const inGroup = await isUserInAuthentikGroup(member.authentik_user_id, VORSTAND_GROUP);

        res.json({
            has_authentik: true,
            vorstand_group: inGroup
        });
    } catch (error) {
        console.error('Vorstand group check error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Social Media group management
app.post('/members/:id/social-media-group', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { enabled } = req.body;

        const memberResult = await pool.query(
            'SELECT authentik_user_id, vorname, nachname FROM members WHERE id = $1',
            [id]
        );

        if (memberResult.rows.length === 0) {
            return res.status(404).json({ error: 'Mitglied nicht gefunden' });
        }

        const member = memberResult.rows[0];
        if (!member.authentik_user_id) {
            return res.status(400).json({ error: 'Mitglied hat keinen Authentik-Account' });
        }

        let success;
        if (enabled) {
            success = await addUserToAuthentikGroup(member.authentik_user_id, SOCIAL_MEDIA_GROUP);
        } else {
            success = await removeUserFromAuthentikGroup(member.authentik_user_id, SOCIAL_MEDIA_GROUP);
        }

        if (!success) {
            return res.status(500).json({ error: 'Fehler bei der Authentik-Gruppenanpassung' });
        }

        await logAudit(pool, 'MEMBER_SOCIAL_MEDIA_GROUP', null, req.user.email, getClientIp(req), {
            member_id: id,
            member_name: `${member.vorname} ${member.nachname}`,
            social_media_group: enabled
        });

        res.json({
            success: true,
            member_id: id,
            social_media_group: enabled,
            message: enabled ? 'Zur Social-Media-Gruppe hinzugefuegt' : 'Aus Social-Media-Gruppe entfernt'
        });
    } catch (error) {
        console.error('Social media group toggle error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.get('/members/:id/social-media-group', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;

        const memberResult = await pool.query(
            'SELECT authentik_user_id FROM members WHERE id = $1',
            [id]
        );

        if (memberResult.rows.length === 0) {
            return res.status(404).json({ error: 'Mitglied nicht gefunden' });
        }

        const member = memberResult.rows[0];
        if (!member.authentik_user_id) {
            return res.json({ has_authentik: false, social_media_group: false });
        }

        const inGroup = await isUserInAuthentikGroup(member.authentik_user_id, SOCIAL_MEDIA_GROUP);

        res.json({
            has_authentik: true,
            social_media_group: inGroup
        });
    } catch (error) {
        console.error('Social media group check error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

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

// Sync Authentik groups for all members based on their functions
app.post('/members/sync-authentik-groups', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        // Get all members with Authentik user ID
        const result = await pool.query(`
            SELECT id, vorname, nachname, email, funktion, authentik_user_id
            FROM members
            WHERE authentik_user_id IS NOT NULL
            ORDER BY nachname, vorname
        `);

        const members = result.rows;
        const synced = [];
        const errors = [];

        for (const member of members) {
            try {
                const success = await syncMemberAuthentikGroups(member.authentik_user_id, member.funktion);
                if (success) {
                    synced.push({
                        member_id: member.id,
                        name: `${member.vorname} ${member.nachname}`,
                        funktion: member.funktion
                    });
                } else {
                    errors.push({
                        member_id: member.id,
                        name: `${member.vorname} ${member.nachname}`,
                        error: 'Sync returned false'
                    });
                }
            } catch (error) {
                console.error(`Failed to sync groups for member ${member.email}:`, error.message);
                errors.push({
                    member_id: member.id,
                    name: `${member.vorname} ${member.nachname}`,
                    error: error.message
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
        console.error('Authentik groups sync error:', error);
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

// ============================================
// FUNCTION EMAIL PASSWORD CHANGE
// ============================================

// Map functions to email addresses
const FUNCTION_EMAIL_MAP = {
    'Präsident': 'praesident@fwv-raura.ch',
    'Praesident': 'praesident@fwv-raura.ch',
    'Aktuar': 'aktuar@fwv-raura.ch',
    'Kassier': 'kassier@fwv-raura.ch',
    'Beisitzer': 'beisitzer@fwv-raura.ch',
    'Beisitzerin': 'beisitzer@fwv-raura.ch',
    'Materialwart': 'materialwart@fwv-raura.ch',
    'Admin': 'admin@fwv-raura.ch'
};

// Change function email password (self-service)
app.put('/members/me/function-email-password', authenticateToken, async (req, res) => {
    try {
        const { password, email: targetEmail } = req.body;

        if (!password || password.length < 8) {
            return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen lang sein' });
        }

        // Get member with function
        const memberResult = await pool.query(
            'SELECT id, funktion FROM members WHERE email = $1',
            [req.user.email]
        );

        if (memberResult.rows.length === 0) {
            return res.status(404).json({ error: 'Mitglied nicht gefunden' });
        }

        const member = memberResult.rows[0];
        const funktion = member.funktion;

        if (!funktion) {
            return res.status(403).json({ error: 'Sie haben keine Funktion mit E-Mail-Adresse' });
        }

        // Parse multiple functions (comma-separated)
        const funktionen = funktion.split(',').map(f => f.trim()).filter(f => f);
        const allowedEmails = funktionen
            .filter(f => FUNCTION_EMAIL_MAP[f])
            .map(f => FUNCTION_EMAIL_MAP[f]);

        if (allowedEmails.length === 0) {
            return res.status(403).json({ error: 'Sie haben keine Funktion mit E-Mail-Adresse' });
        }

        // Determine which email to change
        let functionEmail;
        if (targetEmail) {
            // Validate user has access to this specific email
            if (!allowedEmails.includes(targetEmail)) {
                return res.status(403).json({ error: 'Sie haben keinen Zugriff auf diese E-Mail-Adresse' });
            }
            functionEmail = targetEmail;
        } else {
            // Backward compatibility: use first email
            functionEmail = allowedEmails[0];
        }

        // Call Mailcow API via dispatch service
        const DISPATCH_API = process.env.DISPATCH_API_URL || 'http://api-dispatch:3000';

        const mailcowResponse = await fetch(`${DISPATCH_API}/mailcow/mailboxes/${encodeURIComponent(functionEmail)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        if (!mailcowResponse.ok) {
            const errorData = await mailcowResponse.json().catch(() => ({}));
            console.error('Mailcow password change failed:', mailcowResponse.status, errorData);
            throw new Error(errorData.error || 'Passwortänderung fehlgeschlagen');
        }

        // Log the change with real client IP
        await logAudit(pool, 'FUNCTION_EMAIL_PASSWORD_CHANGED', member.id, req.user.email, getClientIp(req), {
            function_email: functionEmail,
            funktion
        });

        res.json({ success: true, message: 'Passwort erfolgreich geändert' });

    } catch (error) {
        console.error('Function email password change error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Periodic sync of Authentik groups and profiles (every hour)
async function periodicAuthentikSync() {
    console.log('Starting periodic Authentik sync (groups + profiles)...');
    try {
        const result = await pool.query(`
            SELECT id, vorname, nachname, funktion, authentik_user_id
            FROM members
            WHERE authentik_user_id IS NOT NULL
        `);

        let groupsSynced = 0;
        let profilesUpdated = 0;

        for (const member of result.rows) {
            try {
                // Sync groups (Website → Authentik)
                await syncMemberAuthentikGroups(member.authentik_user_id, member.funktion);
                groupsSynced++;

                // Sync profiles (Authentik → Website) - check for changes made in Authentik/Nextcloud
                const profileResult = await syncAuthentikToMember(pool, member.authentik_user_id);
                if (profileResult && profileResult.changes && profileResult.changes.length > 0) {
                    profilesUpdated++;
                    console.log(`  Profile updated from Authentik: ${member.vorname} ${member.nachname} - ${profileResult.changes.join(', ')}`);
                }
            } catch (error) {
                console.error(`Periodic sync failed for ${member.vorname} ${member.nachname}:`, error.message);
            }
        }

        console.log(`Periodic Authentik sync completed: ${groupsSynced}/${result.rows.length} groups synced, ${profilesUpdated} profiles updated from Authentik`);
    } catch (error) {
        console.error('Periodic Authentik sync error:', error.message);
    }
}

// Start server
app.listen(PORT, () => {
    console.log(`API-Members running on port ${PORT}`);

    // Run initial sync after 30 seconds (to allow container to fully start)
    setTimeout(() => {
        periodicAuthentikSync();
    }, 30000);

    // Then run every hour
    setInterval(() => {
        periodicAuthentikSync();
    }, 60 * 60 * 1000); // 1 hour
});
