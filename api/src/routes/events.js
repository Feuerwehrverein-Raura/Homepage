/**
 * events.js - Event-Registrierungen
 *
 * Endpunkte:
 * - POST /register: Anmeldung als Helfer oder Teilnehmer
 * - GET /registrations/:eventId: Anmeldungen für ein Event
 * - GET /registrations: Alle Anmeldungen (Vorstand, API-Key geschützt)
 *
 * Typen: 'helper' (Helfer) oder 'participant' (Teilnehmer)
 * Speicherung: SQLite Datenbank
 */
const express = require('express');
const router = express.Router();
const { sendMail } = require('../utils/mailer');
const { runQuery, getQuery, allQuery } = require('../utils/database');  // SQLite-Wrapper

/**
 * POST /api/events/register
 * Verarbeitet Event-Anmeldungen (Helfer oder Teilnehmer)
 *
 * Body:
 * - eventId: Event-Kennung (Pflicht)
 * - eventTitle: Anzeigename des Events
 * - type: 'helper' oder 'participant' (Pflicht)
 * - name, email: Kontaktdaten (Pflicht)
 * - phone, participants, notes, shiftIds: Optional
 */
router.post('/register', async (req, res) => {
    try {
        const { eventId, eventTitle, type, name, email, phone, participants, notes, shiftIds } = req.body;

        // Validierung der Pflichtfelder
        if (!eventId || !name || !email || !type) {
            return res.status(400).json({ error: 'Fehlende Pflichtfelder' });
        }

        // Anmeldung in SQLite speichern
        const result = await runQuery(
            `INSERT INTO event_registrations
            (event_id, event_title, type, name, email, phone, participants, notes, shift_ids)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [eventId, eventTitle, type, name, email, phone || null, participants || 1, notes || null, JSON.stringify(shiftIds || [])]
        );

        // Bestätigungs-E-Mail an den Anmelder
        const confirmationText = type === 'helper'
            ? `Vielen Dank für Ihre Anmeldung als Helfer für "${eventTitle}".`
            : `Vielen Dank für Ihre Anmeldung als Teilnehmer für "${eventTitle}".`;

        await sendMail({
            to: email,
            subject: `Anmeldebestätigung: ${eventTitle}`,
            text: `Guten Tag ${name},\n\n${confirmationText}\n\nWir haben Ihre Anmeldung erhalten.\n\nMit freundlichen Grüssen\nFeuerwehrverein Raurachemme`
        });

        // Benachrichtigung an Vorstand (Aktuar)
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
 * Holt alle Anmeldungen für ein bestimmtes Event
 *
 * Öffentlich zugänglich (für Event-Dashboard)
 * Rückgabe: { registrations: [...] }
 */
router.get('/registrations/:eventId', async (req, res) => {
    try {
        const { eventId } = req.params;
        // Alle Anmeldungen für dieses Event, neueste zuerst
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
 * Holt ALLE Anmeldungen (für Vorstand-Dashboard)
 *
 * Geschützt durch API-Key (Query-Parameter)
 * Verwendet für Übersicht aller Event-Anmeldungen
 */
router.get('/registrations', async (req, res) => {
    try {
        const { apiKey } = req.query;

        // API-Key Authentifizierung
        if (apiKey !== process.env.API_KEY) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Alle Anmeldungen über alle Events
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
