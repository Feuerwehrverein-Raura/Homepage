#!/usr/bin/env node

/**
 * OTP Authentication Backend for Feuerwehrverein Raura
 *
 * Features:
 * - OTP generation and email sending
 * - Session management with JWT
 * - Role-based access control (member vs. vorstand)
 * - Member data editing
 */

const express = require('express');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// Configuration
const SMTP_HOST = process.env.SMTP_HOST || 'mail.fwv-raura.ch';
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.FROM_EMAIL || 'mitglieder@fwv-raura.ch';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const OTP_EXPIRY = 10 * 60 * 1000; // 10 minutes

// In-memory storage (use Redis in production)
const otpStore = new Map(); // email -> {otp, expires, attempts}
const sessionStore = new Map(); // token -> {email, role, expires}

// Load member data
function loadMembers() {
    const memberDataPath = path.join(__dirname, '..', 'mitglieder_data.json');
    return JSON.parse(fs.readFileSync(memberDataPath, 'utf-8'));
}

// Save member data
function saveMembers(members) {
    const memberDataPath = path.join(__dirname, '..', 'mitglieder_data.json');
    fs.writeFileSync(memberDataPath, JSON.stringify(members, null, 2), 'utf-8');
}

// Generate 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate JWT token
function generateToken(email, role) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    sessionStore.set(token, { email, role, expires });
    return token;
}

// Verify token
function verifyToken(token) {
    const session = sessionStore.get(token);
    if (!session) return null;
    if (session.expires < Date.now()) {
        sessionStore.delete(token);
        return null;
    }
    return session;
}

// Check if user is Vorstand
function isVorstand(member) {
    const vorstandFunctions = ['Vorstand', 'Präsident', 'Kassier', 'Aktuar', 'Materialwart'];
    return vorstandFunctions.some(func =>
        (member.Funktion || '').toLowerCase().includes(func.toLowerCase())
    );
}

// Send OTP email
async function sendOTPEmail(email, otp) {
    const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
        }
    });

    const mailOptions = {
        from: `"Feuerwehrverein Raura" <${FROM_EMAIL}>`,
        to: email,
        subject: 'Ihr Login-Code für den Mitgliederbereich',
        html: `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
        .content { background: #f9f9f9; padding: 30px; }
        .otp-box { background: white; border: 2px solid #dc2626; padding: 20px; text-align: center; margin: 20px 0; }
        .otp-code { font-size: 32px; font-weight: bold; color: #dc2626; letter-spacing: 5px; }
        .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Feuerwehrverein Raura Kaiseraugst</h1>
        </div>
        <div class="content">
            <h2>Ihr Login-Code</h2>
            <p>Sie haben einen Login-Code für den Mitgliederbereich angefordert.</p>

            <div class="otp-box">
                <p>Ihr Code lautet:</p>
                <div class="otp-code">${otp}</div>
            </div>

            <p><strong>Wichtig:</strong></p>
            <ul>
                <li>Dieser Code ist 10 Minuten gültig</li>
                <li>Geben Sie den Code niemals an Dritte weiter</li>
                <li>Falls Sie diese E-Mail nicht angefordert haben, ignorieren Sie sie bitte</li>
            </ul>
        </div>
        <div class="footer">
            <p>Feuerwehrverein Raura Kaiseraugst<br>
            www.fwv-raura.ch</p>
        </div>
    </div>
</body>
</html>
        `
    };

    await transporter.sendMail(mailOptions);
}

// API Routes

/**
 * POST /api/auth/request-otp
 * Request OTP for login
 */
app.post('/api/auth/request-otp', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'E-Mail ist erforderlich' });
        }

        // Check if email exists in member data
        const members = loadMembers();
        const member = members.find(m =>
            m['E-Mail'] && m['E-Mail'].toLowerCase() === email.toLowerCase()
        );

        if (!member) {
            return res.status(404).json({ error: 'E-Mail-Adresse nicht gefunden' });
        }

        // Check if member is active
        if (member.Status !== 'Aktivmitglied' && member.Status !== 'Ehrenmitglied') {
            return res.status(403).json({ error: 'Ihr Mitgliedsstatus erlaubt keinen Zugriff' });
        }

        // Generate OTP
        const otp = generateOTP();
        const expires = Date.now() + OTP_EXPIRY;

        // Store OTP
        otpStore.set(email.toLowerCase(), {
            otp,
            expires,
            attempts: 0
        });

        // Send email
        await sendOTPEmail(email, otp);

        res.json({
            success: true,
            message: 'Code wurde per E-Mail versendet',
            expiresIn: OTP_EXPIRY / 1000 // seconds
        });

    } catch (error) {
        console.error('Error requesting OTP:', error);
        res.status(500).json({ error: 'Fehler beim Versenden des Codes' });
    }
});

/**
 * POST /api/auth/verify-otp
 * Verify OTP and create session
 */
app.post('/api/auth/verify-otp', (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ error: 'E-Mail und Code sind erforderlich' });
        }

        const storedData = otpStore.get(email.toLowerCase());

        if (!storedData) {
            return res.status(404).json({ error: 'Kein Code angefordert oder Code abgelaufen' });
        }

        // Check expiry
        if (storedData.expires < Date.now()) {
            otpStore.delete(email.toLowerCase());
            return res.status(401).json({ error: 'Code ist abgelaufen' });
        }

        // Check attempts
        if (storedData.attempts >= 3) {
            otpStore.delete(email.toLowerCase());
            return res.status(429).json({ error: 'Zu viele Fehlversuche. Bitte fordern Sie einen neuen Code an.' });
        }

        // Verify OTP
        if (storedData.otp !== otp) {
            storedData.attempts++;
            return res.status(401).json({ error: 'Ungültiger Code' });
        }

        // OTP verified - create session
        otpStore.delete(email.toLowerCase());

        const members = loadMembers();
        const member = members.find(m =>
            m['E-Mail'] && m['E-Mail'].toLowerCase() === email.toLowerCase()
        );

        const role = isVorstand(member) ? 'vorstand' : 'member';
        const token = generateToken(email.toLowerCase(), role);

        res.json({
            success: true,
            token,
            role,
            member: {
                name: member.Mitglied,
                vorname: member.Vorname,
                name: member.Name,
                email: member['E-Mail']
            }
        });

    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({ error: 'Fehler bei der Verifizierung' });
    }
});

/**
 * GET /api/member/profile
 * Get member profile
 */
app.get('/api/member/profile', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        const session = verifyToken(token);

        if (!session) {
            return res.status(401).json({ error: 'Nicht authentifiziert' });
        }

        const members = loadMembers();
        const member = members.find(m =>
            m['E-Mail'] && m['E-Mail'].toLowerCase() === session.email
        );

        if (!member) {
            return res.status(404).json({ error: 'Mitglied nicht gefunden' });
        }

        // Remove sensitive fields
        const profile = { ...member };
        delete profile.IBAN;
        delete profile['Versand-Email'];

        res.json({ member: profile });

    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ error: 'Fehler beim Laden des Profils' });
    }
});

/**
 * PUT /api/member/profile
 * Update member profile (own data only)
 */
app.put('/api/member/profile', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        const session = verifyToken(token);

        if (!session) {
            return res.status(401).json({ error: 'Nicht authentifiziert' });
        }

        const { updates } = req.body;

        // Only allow certain fields to be updated by members
        const allowedFields = [
            'Telefon', 'Mobile', 'E-Mail',
            'Strasse', 'PLZ', 'Ort', 'Adresszusatz',
            'zustellung-email', 'zustellung-post'
        ];

        const filteredUpdates = {};
        for (const field of allowedFields) {
            if (field in updates) {
                filteredUpdates[field] = updates[field];
            }
        }

        const members = loadMembers();
        const memberIndex = members.findIndex(m =>
            m['E-Mail'] && m['E-Mail'].toLowerCase() === session.email
        );

        if (memberIndex === -1) {
            return res.status(404).json({ error: 'Mitglied nicht gefunden' });
        }

        // Update member data
        members[memberIndex] = { ...members[memberIndex], ...filteredUpdates };
        saveMembers(members);

        res.json({
            success: true,
            message: 'Profil erfolgreich aktualisiert',
            member: members[memberIndex]
        });

    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ error: 'Fehler beim Aktualisieren des Profils' });
    }
});

/**
 * GET /api/admin/members
 * Get all members (Vorstand only)
 */
app.get('/api/admin/members', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        const session = verifyToken(token);

        if (!session) {
            return res.status(401).json({ error: 'Nicht authentifiziert' });
        }

        if (session.role !== 'vorstand') {
            return res.status(403).json({ error: 'Keine Berechtigung' });
        }

        const members = loadMembers();
        res.json({ members });

    } catch (error) {
        console.error('Error fetching members:', error);
        res.status(500).json({ error: 'Fehler beim Laden der Mitglieder' });
    }
});

/**
 * PUT /api/admin/member/:email
 * Update any member (Vorstand only)
 */
app.put('/api/admin/member/:email', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        const session = verifyToken(token);

        if (!session) {
            return res.status(401).json({ error: 'Nicht authentifiziert' });
        }

        if (session.role !== 'vorstand') {
            return res.status(403).json({ error: 'Keine Berechtigung' });
        }

        const { email } = req.params;
        const { updates } = req.body;

        const members = loadMembers();
        const memberIndex = members.findIndex(m =>
            m['E-Mail'] && m['E-Mail'].toLowerCase() === email.toLowerCase()
        );

        if (memberIndex === -1) {
            return res.status(404).json({ error: 'Mitglied nicht gefunden' });
        }

        // Vorstand can update all fields except sensitive ones
        const forbiddenFields = ['IBAN']; // Add more if needed
        const filteredUpdates = {};
        for (const [key, value] of Object.entries(updates)) {
            if (!forbiddenFields.includes(key)) {
                filteredUpdates[key] = value;
            }
        }

        members[memberIndex] = { ...members[memberIndex], ...filteredUpdates };
        saveMembers(members);

        res.json({
            success: true,
            message: 'Mitglied erfolgreich aktualisiert',
            member: members[memberIndex]
        });

    } catch (error) {
        console.error('Error updating member:', error);
        res.status(500).json({ error: 'Fehler beim Aktualisieren' });
    }
});

/**
 * POST /api/auth/logout
 * Logout (invalidate token)
 */
app.post('/api/auth/logout', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
        sessionStore.delete(token);
    }
    res.json({ success: true, message: 'Erfolgreich abgemeldet' });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Cleanup expired OTPs and sessions (run every 5 minutes)
setInterval(() => {
    const now = Date.now();

    // Cleanup OTPs
    for (const [email, data] of otpStore.entries()) {
        if (data.expires < now) {
            otpStore.delete(email);
        }
    }

    // Cleanup sessions
    for (const [token, data] of sessionStore.entries()) {
        if (data.expires < now) {
            sessionStore.delete(token);
        }
    }
}, 5 * 60 * 1000);

// Start server
app.listen(PORT, () => {
    console.log(`🚀 OTP Authentication Server running on port ${PORT}`);
    console.log(`📧 SMTP: ${SMTP_HOST}:${SMTP_PORT}`);
    console.log(`🔑 JWT Secret: ${JWT_SECRET.substring(0, 10)}...`);
});
