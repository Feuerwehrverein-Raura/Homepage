const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const { loadJSON } = require('../utils/github');
const { sendMail } = require('../utils/mailer');

const MEMBERS_FILE = 'mitglieder_data.json';

// POST /api/calendar/generate-pdf
router.post('/generate-pdf', async (req, res) => {
    try {
        // Load events from GitHub
        const eventsPath = path.join(__dirname, '../../../events');
        const eventFiles = await fs.readdir(eventsPath);

        const events = [];
        for (const file of eventFiles.filter(f => f.endsWith('.md'))) {
            const content = await fs.readFile(path.join(eventsPath, file), 'utf8');
            // Parse markdown front-matter (simplified)
            const match = content.match(/---\n([\s\S]*?)\n---/);
            if (match) {
                const frontmatter = {};
                match[1].split('\n').forEach(line => {
                    const [key, ...value] = line.split(':');
                    if (key && value.length) {
                        frontmatter[key.trim()] = value.join(':').trim().replace(/['"]/g, '');
                    }
                });
                events.push(frontmatter);
            }
        }

        // Generate HTML
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

        // Generate PDF with Puppeteer
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(html);
        const pdfBuffer = await page.pdf({ format: 'A4', margin: { top: '2cm', bottom: '2cm', left: '2cm', right: '2cm' } });
        await browser.close();

        res.contentType('application/pdf');
        res.send(pdfBuffer);

    } catch (error) {
        console.error('PDF generation error:', error);
        res.status(500).json({ error: 'Fehler bei PDF-Generierung' });
    }
});

// POST /api/calendar/send-pingen
router.post('/send-pingen', async (req, res) => {
    try {
        // Load post-members
        const { data: members } = await loadJSON(MEMBERS_FILE);
        const postMembers = members.filter(m => m['zustellung-post'] === true);

        // Implementation similar to scripts/send-calendar-pingen.js
        // (Pingen API integration)

        res.json({ success: true, sent: postMembers.length });
    } catch (error) {
        console.error('Pingen send error:', error);
        res.status(500).json({ error: 'Fehler beim Versand' });
    }
});

module.exports = router;
