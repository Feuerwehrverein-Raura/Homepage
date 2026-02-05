/**
 * calendar.js - Kalender-PDF-Generierung und Pingen-Versand
 *
 * Endpunkte:
 * - POST /generate-pdf: Erstellt Kalender-PDF aus Event-Markdown-Dateien
 * - POST /send-pingen: Sendet Kalender per Post via Pingen API
 *
 * Verwendet Puppeteer für PDF-Rendering (Headless Chrome)
 */
const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');  // Headless Chrome für PDF-Generierung
const fs = require('fs').promises;
const path = require('path');
const { loadJSON } = require('../utils/github');
const { sendMail } = require('../utils/mailer');

// Mitgliederdaten für Pingen-Versand (Post-Zustellung)
const MEMBERS_FILE = 'mitglieder_data.json';

/**
 * POST /api/calendar/generate-pdf
 * Generiert ein PDF mit allen Veranstaltungen
 *
 * Liest alle Event-Markdown-Dateien und erstellt eine Tabelle
 * Rückgabe: PDF-Binary (application/pdf)
 */
router.post('/generate-pdf', async (req, res) => {
    try {
        // Lade alle Event-Dateien aus dem lokalen events-Verzeichnis
        const eventsPath = path.join(__dirname, '../../../events');
        const eventFiles = await fs.readdir(eventsPath);

        // Parse jede Markdown-Datei
        const events = [];
        for (const file of eventFiles.filter(f => f.endsWith('.md'))) {
            const content = await fs.readFile(path.join(eventsPath, file), 'utf8');
            // Extrahiere YAML Front-Matter (vereinfachter Parser)
            const match = content.match(/---\n([\s\S]*?)\n---/);
            if (match) {
                const frontmatter = {};
                // Parse YAML-Zeilen (key: value)
                match[1].split('\n').forEach(line => {
                    const [key, ...value] = line.split(':');
                    if (key && value.length) {
                        frontmatter[key.trim()] = value.join(':').trim().replace(/['"]/g, '');
                    }
                });
                events.push(frontmatter);
            }
        }

        // Generiere HTML für PDF (FWV-Branding: Rot #C41E3A)
        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; padding: 20mm; }
        h1 { text-align: center; color: #C41E3A; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background-color: #C41E3A; color: white; }
    </style>
</head>
<body>
    <h1>Kalender - Feuerwehrverein Raurachemme</h1>
    <table>
        <thead>
            <tr>
                <th>Datum</th>
                <th>Veranstaltung</th>
                <th>Ort</th>
            </tr>
        </thead>
        <tbody>
            ${events.map(e => `
                <tr>
                    <td>${e.date || ''}</td>
                    <td>${e.title || ''}</td>
                    <td>${e.location || ''}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
</body>
</html>
`;

        // PDF mit Puppeteer (Headless Chrome) generieren
        const browser = await puppeteer.launch({
            headless: 'new',  // Neuer Headless-Modus
            args: ['--no-sandbox', '--disable-setuid-sandbox']  // Für Docker/Container
        });
        const page = await browser.newPage();
        await page.setContent(html);
        // A4-PDF mit 2cm Rand auf allen Seiten
        const pdfBuffer = await page.pdf({ format: 'A4', margin: { top: '2cm', bottom: '2cm', left: '2cm', right: '2cm' } });
        await browser.close();

        // PDF als Binary-Response zurückgeben
        res.contentType('application/pdf');
        res.send(pdfBuffer);

    } catch (error) {
        console.error('PDF generation error:', error);
        res.status(500).json({ error: 'Fehler bei PDF-Generierung' });
    }
});

/**
 * POST /api/calendar/send-pingen
 * Sendet Kalender per Post an Mitglieder ohne E-Mail-Zustellung
 *
 * Filtert Mitglieder mit 'zustellung-post' = true
 * Verwendet Pingen API für Briefversand
 */
router.post('/send-pingen', async (req, res) => {
    try {
        // Lade Mitglieder und filtere nach Post-Zustellung
        const { data: members } = await loadJSON(MEMBERS_FILE);
        const postMembers = members.filter(m => m['zustellung-post'] === true);

        // TODO: Pingen API Integration
        // Siehe scripts/send-calendar-pingen.js für vollständige Implementierung

        res.json({ success: true, sent: postMembers.length });
    } catch (error) {
        console.error('Pingen send error:', error);
        res.status(500).json({ error: 'Fehler beim Versand' });
    }
});

module.exports = router;
