const express = require('express');
const router = express.Router();
const { sendMail } = require('../utils/mailer');
const { getFile } = require('../utils/github');

/**
 * Extract email from markdown file
 */
function extractEmail(markdown) {
    const match = markdown.match(/email:\s*(.+)/i);
    return match ? match[1].trim() : null;
}

/**
 * POST /api/contact
 * Handle contact form submission
 */
router.post('/', async (req, res) => {
    try {
        const { name, email, subject, message, type, membership } = req.body;

        // Validation
        if (!name || !email || !subject || !message) {
            return res.status(400).json({ error: 'Fehlende Pflichtfelder' });
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
