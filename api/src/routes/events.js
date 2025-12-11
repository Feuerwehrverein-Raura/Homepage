const express = require('express');
const router = express.Router();
const { sendMail } = require('../utils/mailer');
const { runQuery, getQuery, allQuery } = require('../utils/database');

/**
 * POST /api/events/register
 * Handle event registration
 */
router.post('/register', async (req, res) => {
    try {
        const { eventId, eventTitle, type, name, email, phone, participants, notes, shiftIds } = req.body;

        if (!eventId || !name || !email || !type) {
            return res.status(400).json({ error: 'Fehlende Pflichtfelder' });
        }

        // Insert into database
        const result = await runQuery(
            `INSERT INTO event_registrations
            (event_id, event_title, type, name, email, phone, participants, notes, shift_ids)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [eventId, eventTitle, type, name, email, phone || null, participants || 1, notes || null, JSON.stringify(shiftIds || [])]
        );

        // Send confirmation email
        const confirmationText = type === 'helper'
            ? `Vielen Dank für Ihre Anmeldung als Helfer für "${eventTitle}".`
            : `Vielen Dank für Ihre Anmeldung als Teilnehmer für "${eventTitle}".`;

        await sendMail({
            to: email,
            subject: `Anmeldebestätigung: ${eventTitle}`,
            text: `Guten Tag ${name},\n\n${confirmationText}\n\nWir haben Ihre Anmeldung erhalten.\n\nMit freundlichen Grüssen\nFeuerwehrverein Raurachemme`
        });

        // Notify Vorstand
        await sendMail({
            to: 'aktuar@fwv-raura.ch',
            subject: `Neue Event-Anmeldung: ${eventTitle}`,
            text: `Neue Anmeldung für ${eventTitle}\n\nTyp: ${type === 'helper' ? 'Helfer' : 'Teilnehmer'}\nName: ${name}\nE-Mail: ${email}\nTelefon: ${phone || 'nicht angegeben'}\nAnzahl: ${participants || 1}`
        });

        res.json({ success: true, id: result.id });

    } catch (error) {
        console.error('Event registration error:', error);
        res.status(500).json({ error: 'Fehler bei der Anmeldung' });
    }
});

/**
 * GET /api/events/registrations/:eventId
 * Get registrations for an event
 */
router.get('/registrations/:eventId', async (req, res) => {
    try {
        const { eventId } = req.params;
        const registrations = await allQuery(
            'SELECT * FROM event_registrations WHERE event_id = ? ORDER BY timestamp DESC',
            [eventId]
        );

        res.json({ registrations });
    } catch (error) {
        console.error('Get registrations error:', error);
        res.status(500).json({ error: 'Fehler beim Laden der Anmeldungen' });
    }
});

/**
 * GET /api/events/registrations
 * Get all registrations (for Vorstand dashboard)
 */
router.get('/registrations', async (req, res) => {
    try {
        const { apiKey } = req.query;

        if (apiKey !== process.env.API_KEY) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const registrations = await allQuery(
            'SELECT * FROM event_registrations ORDER BY timestamp DESC'
        );

        res.json({ registrations });
    } catch (error) {
        console.error('Get all registrations error:', error);
        res.status(500).json({ error: 'Fehler beim Laden der Anmeldungen' });
    }
});

module.exports = router;
