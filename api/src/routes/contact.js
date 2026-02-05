/**
 * contact.js - Kontaktformular mit Anti-Spam-Schutz
 *
 * Spam-Schutzmassnahmen:
 * 1. Cloudflare Turnstile (Captcha-Alternative)
 * 2. Honeypot-Feld (_honeypot muss leer sein)
 * 3. Zeit-Check (Formular muss min. 3 Sek. ausgefüllt werden)
 * 4. Rate Limiting (max. 3 Anfragen pro IP/Stunde)
 * 5. Content-Filtering (Spam-Muster erkennen)
 *
 * Empfänger wird basierend auf Betreff dynamisch bestimmt
 */
const express = require('express');
const router = express.Router();
const { sendMail } = require('../utils/mailer');
const { getFile } = require('../utils/github');

// Cloudflare Turnstile Secret Key (Umgebungsvariable)
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY || '';

/**
 * Verifiziert Cloudflare Turnstile Token
 * Turnstile ist eine benutzerfreundliche Captcha-Alternative von Cloudflare
 *
 * @param {string} token - Vom Frontend übermittelter Turnstile-Token
 * @param {string} ip - Client-IP-Adresse
 * @returns {Promise<boolean>} true wenn gültig, false wenn Spam
 */
async function verifyTurnstile(token, ip) {
    // Wenn kein Secret konfiguriert, Prüfung überspringen
    if (!TURNSTILE_SECRET) {
        console.log('[Turnstile] No secret key configured, skipping verification');
        return true;
    }

    if (!token) {
        console.log('[Turnstile] No token provided');
        return false;
    }

    try {
        // Turnstile API aufrufen zur Token-Verifizierung
        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                secret: TURNSTILE_SECRET,
                response: token,
                remoteip: ip
            })
        });

        const result = await response.json();
        if (!result.success) {
            console.log('[Turnstile] Verification failed:', result['error-codes']);
        }
        return result.success;
    } catch (error) {
        console.error('[Turnstile] Verification error:', error);
        return true;  // Bei Fehler durchlassen um echte Benutzer nicht zu blockieren
    }
}

// ========== RATE LIMITING KONFIGURATION ==========
// In-Memory-Speicher für Rate-Limiting (IP -> { count, firstRequest })
const rateLimitStore = new Map();
const RATE_LIMIT_MAX = 3;              // Max. 3 Anfragen pro IP
const RATE_LIMIT_WINDOW = 60 * 60 * 1000;  // Zeitfenster: 1 Stunde
const MIN_SUBMIT_TIME = 3000;          // Min. 3 Sekunden für Formular-Ausfüllen

/**
 * Bereinigt abgelaufene Rate-Limit-Einträge (stündlich)
 * Verhindert Memory-Leaks bei vielen verschiedenen IPs
 */
setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of rateLimitStore.entries()) {
        if (now - data.firstRequest > RATE_LIMIT_WINDOW) {
            rateLimitStore.delete(ip);
        }
    }
}, RATE_LIMIT_WINDOW);

/**
 * Prüft Inhalt auf typische Spam-Muster
 *
 * Erkannte Muster:
 * - BBCode Links ([url=...], [link=...])
 * - HTML Links (<a href=...>)
 * - Typische Spam-Wörter (viagra, casino, crypto invest, etc.)
 * - Verdächtige TLDs (.ru, .cn, .tk, etc.)
 *
 * @param {string} text - Zu prüfender Text
 * @returns {boolean} true wenn Spam erkannt
 */
function containsSpamPatterns(text) {
    const spamPatterns = [
        /\[url=/i,                                              // BBCode URL
        /\[link=/i,                                             // BBCode Link
        /<a\s+href/i,                                           // HTML Link
        /viagra|cialis|casino|lottery|crypto.*invest|bitcoin.*profit/i,  // Spam-Wörter
        /click\s+here.*http/i,                                  // "Click here" + URL
        /earn\s+\$?\d+.*day/i,                                  // "Earn $X per day"
        /http[s]?:\/\/[^\s]+\.(ru|cn|tk|ml|ga|cf)\//i,         // Verdächtige TLDs
    ];
    return spamPatterns.some(pattern => pattern.test(text));
}

/**
 * Extrahiert E-Mail-Adresse aus Markdown-Datei (Front-Matter)
 *
 * @param {string} markdown - Markdown-Inhalt
 * @returns {string|null} E-Mail-Adresse oder null
 */
function extractEmail(markdown) {
    const match = markdown.match(/email:\s*(.+)/i);
    return match ? match[1].trim() : null;
}

/**
 * POST /api/contact
 * Verarbeitet Kontaktformular-Anfragen
 *
 * Body:
 * - name, email, subject, message: Pflichtfelder
 * - membership: Optional, für Mitgliedschaftsanfragen
 * - _honeypot: Anti-Spam (muss leer sein)
 * - _timestamp: Anti-Spam (Zeit seit Formular-Laden)
 * - _turnstile: Cloudflare Turnstile Token
 *
 * Sendet E-Mail an Vorstand und Bestätigung an Absender
 */
router.post('/', async (req, res) => {
    try {
        const { name, email, subject, message, type, membership, _honeypot, _timestamp, _turnstile } = req.body;
        const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

        // ========== ANTI-SPAM PRÜFUNGEN ==========

        // Anti-Spam: Turnstile verification (if configured)
        if (TURNSTILE_SECRET) {
            const turnstileValid = await verifyTurnstile(_turnstile, clientIp);
            if (!turnstileValid) {
                console.log(`[SPAM] Turnstile verification failed from IP: ${clientIp}`);
                return res.status(400).json({ error: 'Captcha-Überprüfung fehlgeschlagen. Bitte versuchen Sie es erneut.' });
            }
        }

        // Anti-Spam: Honeypot check (should be empty)
        if (_honeypot) {
            console.log(`[SPAM] Honeypot triggered from IP: ${clientIp}`);
            // Return success to not alert the bot
            return res.json({ success: true, message: 'Nachricht erfolgreich versendet' });
        }

        // Anti-Spam: Time-based check (form should take at least 3 seconds to fill)
        if (_timestamp) {
            const submitTime = Date.now() - parseInt(_timestamp, 10);
            if (submitTime < MIN_SUBMIT_TIME) {
                console.log(`[SPAM] Too fast submission (${submitTime}ms) from IP: ${clientIp}`);
                return res.json({ success: true, message: 'Nachricht erfolgreich versendet' });
            }
        }

        // Anti-Spam: Rate limiting
        const now = Date.now();
        const rateData = rateLimitStore.get(clientIp) || { count: 0, firstRequest: now };

        if (now - rateData.firstRequest > RATE_LIMIT_WINDOW) {
            // Reset if window expired
            rateData.count = 1;
            rateData.firstRequest = now;
        } else {
            rateData.count++;
        }
        rateLimitStore.set(clientIp, rateData);

        if (rateData.count > RATE_LIMIT_MAX) {
            console.log(`[SPAM] Rate limit exceeded for IP: ${clientIp}`);
            return res.status(429).json({ error: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.' });
        }

        // Validation
        if (!name || !email || !subject || !message) {
            return res.status(400).json({ error: 'Fehlende Pflichtfelder' });
        }

        // Anti-Spam: Content filtering
        const fullContent = `${name} ${email} ${message}`;
        if (containsSpamPatterns(fullContent)) {
            console.log(`[SPAM] Spam pattern detected from IP: ${clientIp}`);
            return res.json({ success: true, message: 'Nachricht erfolgreich versendet' });
        }

        // Determine recipient based on subject
        let toEmail = 'vorstand@fwv-raura.ch';

        if (subject === 'Mitgliedschaft') {
            // Load emails from Vorstand markdown files
            try {
                const aktuarFile = await getFile('vorstand/aktuar.md');
                const kassierFile = await getFile('vorstand/kassier.md');

                const aktuarEmail = aktuarFile ? extractEmail(aktuarFile.content) : null;
                const kassierEmail = kassierFile ? extractEmail(kassierFile.content) : null;

                if (aktuarEmail && kassierEmail) {
                    toEmail = `${aktuarEmail}, ${kassierEmail}`;
                }
            } catch (error) {
                console.error('Error loading Vorstand emails:', error);
            }
        }

        // Build email body
        let emailBody = `
Neue Kontaktanfrage vom Formular

Von: ${name}
E-Mail: ${email}
Betreff: ${subject}

Nachricht:
${message}
`;

        if (membership) {
            emailBody += `\n\nMitgliedschaftsdetails:\n${JSON.stringify(membership, null, 2)}`;
        }

        // Send email to Vorstand
        await sendMail({
            to: toEmail,
            subject: `Kontaktformular: ${subject}`,
            text: emailBody,
            replyTo: email
        });

        // Send confirmation to sender
        await sendMail({
            to: email,
            subject: 'Ihre Anfrage beim Feuerwehrverein Raurachemme',
            text: `Guten Tag ${name},\n\nVielen Dank für Ihre Anfrage. Wir haben Ihre Nachricht erhalten und werden uns so bald wie möglich bei Ihnen melden.\n\nMit freundlichen Grüssen\nFeuerwehrverein Raurachemme`,
            html: `
<p>Guten Tag ${name},</p>
<p>Vielen Dank für Ihre Anfrage. Wir haben Ihre Nachricht erhalten und werden uns so bald wie möglich bei Ihnen melden.</p>
<p>Mit freundlichen Grüssen<br>Feuerwehrverein Raurachemme</p>
`
        });

        res.json({ success: true, message: 'Nachricht erfolgreich versendet' });

    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({ error: 'Fehler beim Versenden der Nachricht' });
    }
});

module.exports = router;
