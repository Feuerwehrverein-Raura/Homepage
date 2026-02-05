/**
 * newsletter.js - Newsletter An- und Abmeldung
 *
 * Workflow (Double Opt-In):
 * 1. Benutzer gibt E-Mail ein -> /subscribe
 * 2. Bestätigungslink per E-Mail
 * 3. Klick auf Link -> /confirm
 * 4. E-Mail wird in GitHub JSON gespeichert
 *
 * Datenspeicherung: GitHub Repository (newsletter_subscribers.json)
 */
const express = require('express');
const router = express.Router();
const { sendMail } = require('../utils/mailer');
const { loadJSON, saveJSON } = require('../utils/github');  // GitHub API für JSON-Storage
const { generateToken } = require('../utils/otp');  // Für Bestätigungstoken

// JSON-Datei im GitHub Repository für Abonnenten
const NEWSLETTER_FILE = 'newsletter_subscribers.json';

/**
 * POST /api/newsletter/subscribe
 * Startet Newsletter-Anmeldung (Double Opt-In Schritt 1)
 *
 * Body: { email }
 * Sendet Bestätigungslink per E-Mail
 */
router.post('/subscribe', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'E-Mail erforderlich' });

        // Generiere einmaligen Token für Bestätigungslink
        const token = generateToken();
        const confirmUrl = `${process.env.WEBSITE_URL}/newsletter-confirm?token=${token}&email=${encodeURIComponent(email)}`;

        // Bestätigungs-E-Mail mit Link senden
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

/**
 * POST /api/newsletter/confirm
 * Bestätigt Newsletter-Anmeldung (Double Opt-In Schritt 2)
 *
 * Body: { email, token }
 * Speichert E-Mail in GitHub JSON-Datei
 */
router.post('/confirm', async (req, res) => {
    try {
        const { email, token } = req.body;

        // Lade aktuelle Abonnentenliste aus GitHub
        const { data: subscribers, sha } = await loadJSON(NEWSLETTER_FILE);
        const list = subscribers || { lastUpdated: new Date().toISOString(), subscribers: [] };

        // Prüfe ob bereits abonniert (Duplikat-Schutz)
        if (list.subscribers.find(s => s.email === email)) {
            return res.json({ success: true, message: 'Bereits abonniert' });
        }

        // Neuen Abonnenten hinzufügen
        list.subscribers.push({
            email,
            subscribedAt: new Date().toISOString(),
            confirmed: true
        });
        list.lastUpdated = new Date().toISOString();

        // In GitHub speichern
        await saveJSON(NEWSLETTER_FILE, list, `Newsletter-Anmeldung: ${email}`, sha);

        res.json({ success: true, message: 'Newsletter abonniert' });
    } catch (error) {
        console.error('Newsletter confirm error:', error);
        res.status(500).json({ error: 'Fehler bei der Bestätigung' });
    }
});

module.exports = router;
