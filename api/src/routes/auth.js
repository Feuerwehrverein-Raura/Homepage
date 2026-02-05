/**
 * auth.js - OTP-basierte Authentifizierung
 *
 * Endpunkte:
 * - POST /request-otp: Sendet 6-stelligen Code per E-Mail
 * - POST /verify-otp: Prüft den eingegebenen Code
 *
 * Zweck: login, registration, mutation (Datenänderung)
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');  // Für sichere OTP-Generierung
const { runQuery, getOne } = require('../utils/database');
const { sendEmail } = require('../utils/email');

/**
 * POST /api/auth/request-otp
 * Request an OTP code for login
 *
 * Body:
 *  - email: string (required)
 *  - purpose: string (required) - 'login', 'registration', 'mutation'
 */
router.post('/request-otp', async (req, res) => {
    try {
        const { email, purpose = 'login' } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'E-Mail-Adresse ist erforderlich' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
        }

        // For login purpose, check if email is authorized
        if (purpose === 'login') {
            // Check if email exists in authorized users list
            // This could be members, vorstand, or a separate authorized_users table
            const isMember = await checkIfAuthorizedUser(email);

            if (!isMember) {
                // Don't reveal if email exists or not for security
                return res.status(200).json({
                    success: true,
                    message: 'Wenn diese E-Mail-Adresse autorisiert ist, wurde ein Code gesendet.'
                });
            }
        }

        // Generate 6-digit OTP
        const otp = crypto.randomInt(100000, 999999).toString();

        // Calculate expiry time (5 minutes from now)
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        // Mark any existing OTPs for this email/purpose as used
        await runQuery(
            `UPDATE otp_codes SET used = 1 WHERE email = ? AND purpose = ? AND used = 0`,
            [email, purpose]
        );

        // Store OTP in database
        await runQuery(
            `INSERT INTO otp_codes (email, code, purpose, expires_at) VALUES (?, ?, ?, ?)`,
            [email, otp, purpose, expiresAt]
        );

        // Send OTP via email
        const subject = 'Ihr Anmelde-Code für FWV Raura';
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                    .code-box { background: white; border: 2px solid #dc2626; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
                    .code { font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #dc2626; font-family: monospace; }
                    .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
                    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔥 Feuerwehrverein Raura</h1>
                        <p>Ihr Anmelde-Code</p>
                    </div>
                    <div class="content">
                        <p>Hallo,</p>
                        <p>Sie haben einen Anmelde-Code für den geschützten Bereich angefordert.</p>

                        <div class="code-box">
                            <div style="color: #6b7280; font-size: 14px; margin-bottom: 10px;">Ihr Code:</div>
                            <div class="code">${otp}</div>
                        </div>

                        <div class="warning">
                            <strong>⚠️ Wichtig:</strong>
                            <ul style="margin: 10px 0;">
                                <li>Dieser Code ist <strong>5 Minuten</strong> gültig</li>
                                <li>Geben Sie den Code <strong>niemals</strong> an Dritte weiter</li>
                                <li>Falls Sie diesen Code nicht angefordert haben, ignorieren Sie diese E-Mail</li>
                            </ul>
                        </div>

                        <p>Mit freundlichen Grüssen,<br>
                        Ihr Feuerwehrverein Raura Team</p>
                    </div>
                    <div class="footer">
                        <p>© ${new Date().getFullYear()} Feuerwehrverein Raura Kaiseraugst</p>
                        <p>Diese E-Mail wurde automatisch generiert.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        await sendEmail({
            to: email,
            subject,
            html
        });

        // Clean up expired OTPs (older than 24 hours)
        await runQuery(
            `DELETE FROM otp_codes WHERE created_at < datetime('now', '-1 day')`
        );

        res.json({
            success: true,
            message: 'OTP wurde per E-Mail versendet'
        });

    } catch (error) {
        console.error('OTP request error:', error);
        res.status(500).json({ error: 'Interner Serverfehler beim Senden des Codes' });
    }
});

/**
 * POST /api/auth/verify-otp
 * Verify an OTP code
 *
 * Body:
 *  - email: string (required)
 *  - otp: string (required) - 6-digit code
 *  - purpose: string (required) - 'login', 'registration', 'mutation'
 */
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp, purpose = 'login' } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ error: 'E-Mail und Code sind erforderlich' });
        }

        // Validate OTP format (6 digits)
        if (!/^\d{6}$/.test(otp)) {
            return res.status(400).json({ error: 'Code muss 6-stellig sein' });
        }

        // Find valid OTP
        const otpRecord = await getOne(
            `SELECT * FROM otp_codes
             WHERE email = ? AND code = ? AND purpose = ? AND used = 0 AND expires_at > datetime('now')
             ORDER BY created_at DESC LIMIT 1`,
            [email, otp, purpose]
        );

        if (!otpRecord) {
            return res.status(401).json({ error: 'Ungültiger oder abgelaufener Code' });
        }

        // Mark OTP as used
        await runQuery(
            `UPDATE otp_codes SET used = 1 WHERE id = ?`,
            [otpRecord.id]
        );

        // For login purpose, verify user is authorized
        if (purpose === 'login') {
            const isAuthorized = await checkIfAuthorizedUser(email);
            if (!isAuthorized) {
                return res.status(403).json({ error: 'Keine Berechtigung für den Zugriff' });
            }
        }

        res.json({
            success: true,
            message: 'Code erfolgreich verifiziert',
            email: email
        });

    } catch (error) {
        console.error('OTP verification error:', error);
        res.status(500).json({ error: 'Interner Serverfehler bei der Verifizierung' });
    }
});

/**
 * Prüft ob eine E-Mail-Adresse zur Anmeldung berechtigt ist
 *
 * Durchsucht die Markdown-Dateien in:
 * - /vorstand/*.md (Vorstandsmitglieder)
 * - /mitglieder/*.md (Vereinsmitglieder)
 *
 * Die E-Mail wird aus dem Front-Matter (YAML-Header) der MD-Dateien gelesen.
 *
 * @param {string} email - Die zu prüfende E-Mail-Adresse
 * @returns {Promise<boolean>} true wenn berechtigt, false sonst
 */
async function checkIfAuthorizedUser(email) {
    const fs = require('fs').promises;
    const path = require('path');
    const matter = require('gray-matter');  // Parst YAML Front-Matter aus Markdown

    try {
        // Prüfe Vorstand-Verzeichnis (höhere Berechtigung)
        const vorstandDir = path.join(__dirname, '../../../vorstand');
        try {
            const vorstandFiles = await fs.readdir(vorstandDir);
            for (const file of vorstandFiles) {
                if (file.endsWith('.md')) {
                    const content = await fs.readFile(path.join(vorstandDir, file), 'utf-8');
                    const { data } = matter(content);  // Extrahiert Front-Matter
                    // Case-insensitive Vergleich
                    if (data.email && data.email.toLowerCase() === email.toLowerCase()) {
                        return true;
                    }
                }
            }
        } catch (err) {
            console.log('Vorstand directory not found or empty');
        }

        // Prüfe Mitglieder-Verzeichnis
        const mitgliederDir = path.join(__dirname, '../../../mitglieder');
        try {
            const mitgliederFiles = await fs.readdir(mitgliederDir);
            for (const file of mitgliederFiles) {
                if (file.endsWith('.md')) {
                    const content = await fs.readFile(path.join(mitgliederDir, file), 'utf-8');
                    const { data } = matter(content);
                    if (data.email && data.email.toLowerCase() === email.toLowerCase()) {
                        return true;
                    }
                }
            }
        } catch (err) {
            console.log('Mitglieder directory not found or empty');
        }

        // E-Mail in keinem Verzeichnis gefunden
        return false;
    } catch (error) {
        console.error('Error checking authorized user:', error);
        return false;  // Bei Fehler sicherheitshalber ablehnen
    }
}

module.exports = router;
