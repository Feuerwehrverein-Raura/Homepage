/**
 * members.js - Mitglieder-Registrierung und -Verwaltung
 *
 * Workflow:
 * 1. Benutzer füllt Registrierungsformular aus
 * 2. OTP wird per E-Mail gesendet zur Verifizierung
 * 3. Nach OTP-Bestätigung: Antrag geht an Vorstand (pending)
 * 4. Vorstand genehmigt -> Mitglied wird in mitglieder_data.json aufgenommen
 *
 * Datenspeicherung: GitHub Repository (JSON-Dateien)
 */
const express = require('express');
const router = express.Router();
const { sendMail } = require('../utils/mailer');
const { loadJSON, saveJSON } = require('../utils/github');  // GitHub API für JSON-Storage
const { generateOTP, storeOTP, verifyOTP } = require('../utils/otp');

// Pfade zu den JSON-Dateien im GitHub Repository
const MEMBERS_FILE = 'mitglieder_data.json';    // Genehmigte Mitglieder
const PENDING_FILE = 'pending_members.json';     // Pendente Anträge

/**
 * POST /api/members/register
 * Startet die Mitglieder-Registrierung
 *
 * Body: { email, memberData: { Vorname, Name, Strasse, PLZ, Ort, ... } }
 * Sendet OTP an die angegebene E-Mail zur Verifizierung
 */
router.post('/register', async (req, res) => {
    try {
        const { email, memberData } = req.body;
        const otp = generateOTP();  // Generiert 6-stelligen Code

        // OTP mit Mitgliederdaten zwischenspeichern (5 Min gültig)
        storeOTP(email, otp, { type: 'register', memberData });

        // Bestätigungs-E-Mail mit OTP senden
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

/**
 * POST /api/members/verify-otp
 * Verifiziert OTP und reicht Registrierung zur Genehmigung ein
 *
 * Body: { email, otp }
 * Bei Erfolg: Antrag wird in pending_members.json gespeichert
 * Benachrichtigt Aktuar per E-Mail
 */
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const data = verifyOTP(email, otp);  // Prüft und löscht OTP (einmalige Verwendung)

        if (!data) {
            return res.status(400).json({ error: 'Ungültiger oder abgelaufener OTP' });
        }

        // Lade aktuelle pending-Liste aus GitHub
        const { data: pending, sha } = await loadJSON(PENDING_FILE);
        const list = pending || { lastUpdated: new Date().toISOString(), pending: [] };

        // Neuen Antrag zur pending-Liste hinzufügen
        list.pending.push({
            ...data.memberData,
            email,
            status: 'pending',
            submittedAt: new Date().toISOString()
        });
        list.lastUpdated = new Date().toISOString();

        // Speichere in GitHub (sha für Konflikt-Erkennung)
        await saveJSON(PENDING_FILE, list, `Neue Mitglieder-Registrierung: ${email}`, sha);

        // Benachrichtige Vorstand (Aktuar) über neuen Antrag
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

/**
 * POST /api/members/request-change
 * Startet eine Datenänderungsanfrage (Mutation)
 *
 * Body: { email, changes: { feldname: neuerWert, ... } }
 * Ermöglicht Mitgliedern, ihre eigenen Daten zu ändern (z.B. Adresse)
 */
router.post('/request-change', async (req, res) => {
    try {
        const { email, changes } = req.body;
        const otp = generateOTP();

        // OTP mit gewünschten Änderungen zwischenspeichern
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

/**
 * POST /api/members/approve
 * Vorstand genehmigt eine Mitgliedschaftsanfrage
 *
 * Body: { email, apiKey }
 * Nur mit gültigem API-Key aufrufbar (Vorstand-Schutz)
 *
 * Workflow:
 * 1. Mitglied aus pending_members.json entfernen
 * 2. Mitglied zu mitglieder_data.json hinzufügen (status: Aktivmitglied)
 * 3. Willkommens-E-Mail an neues Mitglied senden
 */
router.post('/approve', async (req, res) => {
    try {
        const { email, apiKey } = req.body;

        // API-Key Authentifizierung für Vorstand
        if (apiKey !== process.env.API_KEY) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Lade beide Listen aus GitHub
        const { data: pending, sha: pendingSha } = await loadJSON(PENDING_FILE);
        const { data: members, sha: membersSha } = await loadJSON(MEMBERS_FILE);

        // Finde den pendenten Antrag
        const pendingMember = pending.pending.find(m => m.email === email);
        if (!pendingMember) {
            return res.status(404).json({ error: 'Mitglied nicht gefunden' });
        }

        // Zur Mitgliederliste hinzufügen mit Status "Aktivmitglied"
        members.push({ ...pendingMember, status: 'Aktivmitglied' });
        await saveJSON(MEMBERS_FILE, members, `Mitglied genehmigt: ${email}`, membersSha);

        // Aus pending-Liste entfernen
        pending.pending = pending.pending.filter(m => m.email !== email);
        await saveJSON(PENDING_FILE, pending, `Mitglied genehmigt: ${email}`, pendingSha);

        // Willkommens-E-Mail an das neue Mitglied
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
