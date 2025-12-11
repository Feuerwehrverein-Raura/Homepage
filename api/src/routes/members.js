const express = require('express');
const router = express.Router();
const { sendMail } = require('../utils/mailer');
const { loadJSON, saveJSON } = require('../utils/github');
const { generateOTP, storeOTP, verifyOTP } = require('../utils/otp');

const MEMBERS_FILE = 'mitglieder_data.json';
const PENDING_FILE = 'pending_members.json';

// POST /api/members/register - Start registration
router.post('/register', async (req, res) => {
    try {
        const { email, memberData } = req.body;
        const otp = generateOTP();

        storeOTP(email, otp, { type: 'register', memberData });

        await sendMail({
            to: email,
            subject: 'OTP-Code für Mitglieder-Registrierung',
            text: `Ihr OTP-Code: ${otp}\n\nDieser Code ist 5 Minuten gültig.`
        });

        res.json({ success: true, message: 'OTP versendet' });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Fehler bei der Registrierung' });
    }
});

// POST /api/members/verify-otp - Verify OTP and submit for approval
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const data = verifyOTP(email, otp);

        if (!data) {
            return res.status(400).json({ error: 'Ungültiger oder abgelaufener OTP' });
        }

        const { data: pending, sha } = await loadJSON(PENDING_FILE);
        const list = pending || { lastUpdated: new Date().toISOString(), pending: [] };

        list.pending.push({
            ...data.memberData,
            email,
            status: 'pending',
            submittedAt: new Date().toISOString()
        });
        list.lastUpdated = new Date().toISOString();

        await saveJSON(PENDING_FILE, list, `Neue Mitglieder-Registrierung: ${email}`, sha);

        // Notify Vorstand
        await sendMail({
            to: 'aktuar@fwv-raura.ch',
            subject: 'Neue Mitglieder-Registrierung zur Genehmigung',
            text: `Neue Registrierung: ${data.memberData.Vorname} ${data.memberData.Name}\nE-Mail: ${email}`
        });

        res.json({ success: true, message: 'Registrierung eingereicht' });
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ error: 'Fehler bei der Verifizierung' });
    }
});

// POST /api/members/request-change - Request data mutation
router.post('/request-change', async (req, res) => {
    try {
        const { email, changes } = req.body;
        const otp = generateOTP();

        storeOTP(email, otp, { type: 'mutation', changes });

        await sendMail({
            to: email,
            subject: 'OTP-Code für Datenänderung',
            text: `Ihr OTP-Code: ${otp}\n\nDieser Code ist 5 Minuten gültig.`
        });

        res.json({ success: true, message: 'OTP versendet' });
    } catch (error) {
        console.error('Request change error:', error);
        res.status(500).json({ error: 'Fehler bei der Anfrage' });
    }
});

// POST /api/members/approve - Vorstand approves member
router.post('/approve', async (req, res) => {
    try {
        const { email, apiKey } = req.body;

        if (apiKey !== process.env.API_KEY) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { data: pending, sha: pendingSha } = await loadJSON(PENDING_FILE);
        const { data: members, sha: membersSha } = await loadJSON(MEMBERS_FILE);

        const pendingMember = pending.pending.find(m => m.email === email);
        if (!pendingMember) {
            return res.status(404).json({ error: 'Mitglied nicht gefunden' });
        }

        // Add to members
        members.push({ ...pendingMember, status: 'Aktivmitglied' });
        await saveJSON(MEMBERS_FILE, members, `Mitglied genehmigt: ${email}`, membersSha);

        // Remove from pending
        pending.pending = pending.pending.filter(m => m.email !== email);
        await saveJSON(PENDING_FILE, pending, `Mitglied genehmigt: ${email}`, pendingSha);

        // Notify member
        await sendMail({
            to: email,
            subject: 'Mitgliedschaft genehmigt',
            text: 'Ihre Mitgliedschaft wurde genehmigt. Willkommen!'
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Approve error:', error);
        res.status(500).json({ error: 'Fehler bei der Genehmigung' });
    }
});

module.exports = router;
