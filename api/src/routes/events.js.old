const express = require('express');
const router = express.Router();
const { sendMail } = require('../utils/mailer');
const { loadJSON, saveJSON } = require('../utils/github');

const ANMELDUNGEN_FILE = 'anmeldungen_data.json';

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

        // Load existing registrations
        const { data: anmeldungen, sha } = await loadJSON(ANMELDUNGEN_FILE);
        const registrations = anmeldungen || { lastUpdated: new Date().toISOString(), registrations: [] };

        // Create registration entry
        const registration = {
            id: Date.now().toString(),
            eventId,
            eventTitle,
            type,
            name,
            email,
            phone,
            participants: participants || 1,
            notes,
            shiftIds: shiftIds || [],
            timestamp: new Date().toISOString()
        };

        registrations.registrations.push(registration);
        registrations.lastUpdated = new Date().toISOString();

        // Save to GitHub
        await saveJSON(
            ANMELDUNGEN_FILE,
            registrations,
            `Event-Anmeldung: ${name} für ${eventTitle}`,
            sha
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

        res.json({ success: true, registration });

    } catch (error) {
        console.error('Event registration error:', error);
        res.status(500).json({ error: 'Fehler bei der Anmeldung' });
    }
});

module.exports = router;
