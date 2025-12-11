const express = require('express');
const router = express.Router();
const { sendMail } = require('../utils/mailer');
const { loadJSON, saveJSON } = require('../utils/github');
const { generateToken } = require('../utils/otp');

const NEWSLETTER_FILE = 'newsletter_subscribers.json';

// POST /api/newsletter/subscribe
router.post('/subscribe', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'E-Mail erforderlich' });

        const token = generateToken();
        const confirmUrl = `${process.env.WEBSITE_URL}/newsletter-confirm?token=${token}&email=${encodeURIComponent(email)}`;

        // Send confirmation email
        await sendMail({
            to: email,
            subject: 'Newsletter-Anmeldung bestätigen',
            html: `<p>Bitte bestätigen Sie Ihre Newsletter-Anmeldung:</p><p><a href="${confirmUrl}">Anmeldung bestätigen</a></p>`
        });

        res.json({ success: true, message: 'Bestätigungs-E-Mail versendet' });
    } catch (error) {
        console.error('Newsletter subscribe error:', error);
        res.status(500).json({ error: 'Fehler bei der Anmeldung' });
    }
});

// POST /api/newsletter/confirm
router.post('/confirm', async (req, res) => {
    try {
        const { email, token } = req.body;

        const { data: subscribers, sha } = await loadJSON(NEWSLETTER_FILE);
        const list = subscribers || { lastUpdated: new Date().toISOString(), subscribers: [] };

        // Check if already subscribed
        if (list.subscribers.find(s => s.email === email)) {
            return res.json({ success: true, message: 'Bereits abonniert' });
        }

        list.subscribers.push({
            email,
            subscribedAt: new Date().toISOString(),
            confirmed: true
        });
        list.lastUpdated = new Date().toISOString();

        await saveJSON(NEWSLETTER_FILE, list, `Newsletter-Anmeldung: ${email}`, sha);

        res.json({ success: true, message: 'Newsletter abonniert' });
    } catch (error) {
        console.error('Newsletter confirm error:', error);
        res.status(500).json({ error: 'Fehler bei der Bestätigung' });
    }
});

module.exports = router;
