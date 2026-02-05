/**
 * mailer.js - E-Mail-Versand via SMTP
 *
 * Verwendet Nodemailer für den E-Mail-Versand
 * SMTP-Konfiguration über Umgebungsvariablen:
 * - SMTP_HOST: SMTP Server (z.B. mail.example.com)
 * - SMTP_PORT: Port (Standard: 587 für STARTTLS)
 * - SMTP_USER: Benutzername/E-Mail
 * - SMTP_PASSWORD: Passwort
 */
const nodemailer = require('nodemailer');

// ========== SMTP TRANSPORTER KONFIGURATION ==========
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,     // 587 = STARTTLS, 465 = SSL
    secure: false,  // true nur für Port 465 (implizites SSL)
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
    }
});

// ========== VERBINDUNGSTEST BEIM START ==========
// Prüft ob SMTP-Konfiguration korrekt ist
transporter.verify((error, success) => {
    if (error) {
        console.error('SMTP Configuration Error:', error);
    } else {
        console.log('✅ SMTP Server ready');
    }
});

/**
 * Sendet eine E-Mail
 *
 * @param {Object} options - E-Mail-Optionen
 * @param {string} [options.from] - Absender (Standard: SMTP_USER)
 * @param {string} options.to - Empfänger (kommasepariert für mehrere)
 * @param {string} options.subject - Betreff
 * @param {string} [options.text] - Plain-Text-Inhalt
 * @param {string} [options.html] - HTML-Inhalt
 * @param {string} [options.replyTo] - Antwort-An-Adresse
 * @returns {Promise<{success: boolean, messageId: string}>}
 */
async function sendMail(options) {
    try {
        const mailOptions = {
            from: options.from || process.env.SMTP_USER,  // Standard-Absender
            to: options.to,
            subject: options.subject,
            text: options.text,      // Plain-Text-Fallback
            html: options.html,      // HTML-Version (bevorzugt)
            replyTo: options.replyTo // Für Kontaktformulare: Antwort an Absender
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('✉️ Email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Email send error:', error);
        throw error;  // Fehler weiterwerfen für Error-Handling in Routen
    }
}

module.exports = { sendMail };
