/**
 * html-to-pdf.js - Konvertiert calendar-events.html zu PDF
 *
 * Einfaches Script zur PDF-Generierung mit Puppeteer (Headless Chrome).
 * Wird typischerweise nach generate-calendar-pdf.js ausgefuehrt,
 * das die HTML-Datei erstellt.
 *
 * Verwendung: node scripts/html-to-pdf.js
 *
 * Ein-/Ausgabe:
 * - Input: calendar-events.html (im Wurzelverzeichnis)
 * - Output: calendar-events.pdf (im Wurzelverzeichnis)
 *
 * PDF-Einstellungen:
 * - A4-Format
 * - 2cm Rand auf allen Seiten
 * - Hintergrunddruck aktiviert (CSS backgrounds)
 */
const puppeteer = require('puppeteer');
const path = require('path');

/**
 * Generiert die PDF-Datei
 *
 * Startet Headless Chrome, laedt die HTML-Datei,
 * wartet bis alle Ressourcen geladen sind und
 * exportiert als PDF.
 */
async function generatePDF() {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Load the HTML file
    const htmlPath = path.join(__dirname, '..', 'calendar-events.html');
    await page.goto(`file://${htmlPath}`, {
        waitUntil: 'networkidle0'
    });

    // Generate PDF
    const pdfPath = path.join(__dirname, '..', 'calendar-events.pdf');
    await page.pdf({
        path: pdfPath,
        format: 'A4',
        margin: {
            top: '2cm',
            right: '2cm',
            bottom: '2cm',
            left: '2cm'
        },
        printBackground: true
    });

    await browser.close();

    console.log(`PDF generated: ${pdfPath}`);
}

// Hauptprogramm: PDF generieren, bei Fehler mit Exit-Code 1 beenden
generatePDF().catch(error => {
    console.error('Fehler bei PDF-Generierung:', error);
    process.exit(1);
});
