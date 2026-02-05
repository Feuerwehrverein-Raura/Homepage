#!/usr/bin/env node

/**
 * send-letter-via-pingen.js - Generischer Briefversand via Pingen
 *
 * Konvertiert eine HTML-Datei zu PDF und versendet sie an alle Mitglieder
 * mit Post-Zustellung. Im Gegensatz zu send-event-letter.js akzeptiert
 * dieses Script beliebige HTML-Dateien (nicht nur Event-Markdown).
 *
 * Verwendung: node scripts/send-letter-via-pingen.js <brief.html>
 *
 * Sicherheitsmechanismus:
 * Die HTML-Datei muss den Marker <!-- SEND-VIA-PINGEN --> enthalten,
 * um versehentlichen Versand zu verhindern.
 *
 * Umgebungsvariablen:
 * - PINGEN_API_KEY: API-Schluessel fuer Pingen
 * - PINGEN_STAGING: 'true' fuer Testumgebung
 * - DRY_RUN: 'true' fuer Simulation ohne echten Versand
 *
 * Workflow:
 * 1. Prueft auf SEND-VIA-PINGEN Marker in HTML
 * 2. Laedt Empfaenger aus mitglieder_data.json
 * 3. Konvertiert HTML zu PDF mit Puppeteer
 * 4. Sendet PDF an alle Empfaenger via Pingen API
 */
const puppeteer = require('puppeteer');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Konfiguration aus Umgebungsvariablen
const PINGEN_API_KEY = process.env.PINGEN_API_KEY;           // Pingen API-Key
const PINGEN_STAGING = process.env.PINGEN_STAGING === 'true'; // Staging-Umgebung?
const DRY_RUN = process.env.DRY_RUN === 'true';               // Nur simulieren?

// Kommandozeilen-Argument: Pfad zur HTML-Datei
const args = process.argv.slice(2);
if (args.length === 0) {
    console.error('Usage: node send-letter-via-pingen.js <letter.html>');
    process.exit(1);
}

const letterFile = args[0];

/**
 * Prueft ob die HTML-Datei den Versand-Marker enthaelt
 *
 * Sicherheitsfeature: Ohne den Marker <!-- SEND-VIA-PINGEN --> im HTML
 * wird der Versand abgebrochen. Verhindert versehentlichen Versand.
 *
 * @param {string} content - HTML-Inhalt der Brief-Datei
 * @returns {boolean} true wenn Marker vorhanden
 */
function hasValidSendMarker(content) {
    return content.includes('<!-- SEND-VIA-PINGEN -->');
}

/**
 * Laedt Brief-Empfaenger aus Mitgliederdaten
 *
 * Filtert: Aktiv/Ehrenmitglieder mit zustellung-post=true
 * und vollstaendiger Adresse (Strasse, PLZ, Ort)
 *
 * @returns {Array<{name: string, address: Object}>} Empfaengerliste
 */
function loadRecipients() {
    const memberDataPath = path.join(__dirname, '..', 'mitglieder_data.json');

    if (!fs.existsSync(memberDataPath)) {
        throw new Error('mitglieder_data.json nicht gefunden!');
    }

    console.log('Lade Brief-Empfaenger aus mitglieder_data.json...');
    const members = JSON.parse(fs.readFileSync(memberDataPath, 'utf-8'));

    // Filter: Nur Aktivmitglieder und Ehrenmitglieder mit Post-Zustellung
    const letterRecipients = members.filter(m => {
        return (m.Status === 'Aktivmitglied' || m.Status === 'Ehrenmitglied') &&
            m['zustellung-post'] === true &&
            m.Strasse && m.PLZ && m.Ort;
    });

    console.log(`${letterRecipients.length} Mitglieder mit Post-Zustellung gefunden`);

    return letterRecipients.map(m => ({
        name: m.Mitglied,
        address: {
            street: m.Strasse,
            zip: m.PLZ,
            city: m.Ort,
            country: 'CH'
        }
    }));
}

/**
 * Konvertiert HTML zu PDF mit Puppeteer (Headless Chrome)
 *
 * - A4-Format ohne Raender (fuer Adressfenster-Briefe)
 * - Hintergrunddruck aktiviert
 * - Speichert in /tmp
 *
 * @param {string} htmlPath - Pfad zur HTML-Datei
 * @returns {Promise<string>} Pfad zur generierten PDF
 */
async function htmlToPdf(htmlPath) {
    console.log('Starte PDF-Konvertierung...');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Load the HTML file
    const absolutePath = path.resolve(htmlPath);
    await page.goto(`file://${absolutePath}`, {
        waitUntil: 'networkidle0'
    });

    // Generate PDF
    const pdfPath = `/tmp/letter-${Date.now()}.pdf`;
    await page.pdf({
        path: pdfPath,
        format: 'A4',
        margin: {
            top: '0',
            right: '0',
            bottom: '0',
            left: '0'
        },
        printBackground: true
    });

    await browser.close();
    console.log(`PDF erstellt: ${pdfPath}`);

    return pdfPath;
}

/**
 * Sendet Brief ueber Pingen API v2
 *
 * Verwendet JSON:API Format mit Base64-kodiertem PDF im meta-Block.
 * auto_send=true fuer sofortigen Versand, delivery_product='cheap' = B-Post.
 *
 * @param {string} pdfPath - Pfad zur PDF-Datei
 * @param {Object} recipient - Empfaenger mit name und address
 * @returns {Promise<Object>} Pingen API Response
 */
async function sendViaPingen(pdfPath, recipient) {
    return new Promise((resolve, reject) => {
        const apiHost = PINGEN_STAGING ? 'api-staging.pingen.com' : 'api.pingen.com';
        const pdfContent = fs.readFileSync(pdfPath);
        const pdfBase64 = pdfContent.toString('base64');

        const payload = JSON.stringify({
            data: {
                type: 'letters',
                attributes: {
                    file_original_name: 'brief.pdf',
                    file_url_signature: null,
                    file_url: null,
                    address_position: 'left',
                    auto_send: true,
                    delivery_product: 'cheap', // B-Post
                    print_mode: 'simplex',
                    print_spectrum: 'grayscale'
                }
            },
            meta: {
                file_content: pdfBase64,
                recipient: {
                    name: recipient.name,
                    street: recipient.address.street,
                    zip: recipient.address.zip,
                    city: recipient.address.city,
                    country: recipient.address.country
                }
            }
        });

        const options = {
            hostname: apiHost,
            port: 443,
            path: '/letters',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PINGEN_API_KEY}`,
                'Content-Type': 'application/vnd.api+json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const response = JSON.parse(data);
                        resolve(response);
                    } catch {
                        resolve({ success: true, raw: data });
                    }
                } else {
                    reject(new Error(`Pingen API Error ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

/**
 * Hauptfunktion - Orchestriert den Brief-Versand
 *
 * Ablauf: Marker pruefen -> Empfaenger laden -> HTML zu PDF ->
 * An alle senden -> Zusammenfassung ausgeben
 */
async function main() {
    try {
        console.log('='.repeat(60));
        console.log('Brief-Versand via Pingen');
        console.log('='.repeat(60));
        console.log();

        // Check API key
        if (!PINGEN_API_KEY && !DRY_RUN) {
            throw new Error('PINGEN_API_KEY environment variable is required');
        }

        // Check file exists
        if (!fs.existsSync(letterFile)) {
            throw new Error(`Brief-Datei nicht gefunden: ${letterFile}`);
        }

        // Read and check for send marker
        const letterContent = fs.readFileSync(letterFile, 'utf-8');
        if (!hasValidSendMarker(letterContent)) {
            console.log('ABBRUCH: Brief enthaelt keinen SEND-VIA-PINGEN Marker.');
            console.log('Fuege <!-- SEND-VIA-PINGEN --> in den HTML-Code ein um den Versand zu aktivieren.');
            process.exit(0);
        }

        console.log(`Brief-Datei: ${letterFile}`);
        console.log(`Modus: ${PINGEN_STAGING ? 'STAGING (Test)' : 'PRODUKTION'}`);
        console.log(`Dry-Run: ${DRY_RUN ? 'JA (kein echter Versand)' : 'NEIN'}`);
        console.log();

        // Load recipients
        const recipients = loadRecipients();

        if (recipients.length === 0) {
            console.log('Keine Empfaenger mit Post-Zustellung gefunden.');
            process.exit(0);
        }

        // Convert to PDF
        const pdfPath = await htmlToPdf(letterFile);

        // Send to all recipients
        console.log();
        console.log(`Versende an ${recipients.length} Empfaenger...`);
        console.log('-'.repeat(60));

        const results = [];

        for (const recipient of recipients) {
            try {
                console.log(`-> ${recipient.name} (${recipient.address.zip} ${recipient.address.city})`);

                if (DRY_RUN) {
                    console.log('   [DRY-RUN] Kein echter Versand');
                    results.push({ name: recipient.name, success: true, dryRun: true });
                } else {
                    const response = await sendViaPingen(pdfPath, recipient);
                    const letterId = response.data?.id || 'N/A';
                    console.log(`   Pingen ID: ${letterId}`);
                    results.push({ name: recipient.name, success: true, letterId });
                }
            } catch (error) {
                console.error(`   FEHLER: ${error.message}`);
                results.push({ name: recipient.name, success: false, error: error.message });
            }
        }

        // Cleanup
        if (fs.existsSync(pdfPath)) {
            fs.unlinkSync(pdfPath);
        }

        // Summary
        console.log();
        console.log('='.repeat(60));
        console.log('ZUSAMMENFASSUNG');
        console.log('='.repeat(60));

        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        console.log(`Erfolgreich: ${successful}`);
        console.log(`Fehlgeschlagen: ${failed}`);

        if (failed > 0) {
            console.log();
            console.log('Fehlgeschlagene Briefe:');
            results.filter(r => !r.success).forEach(r => {
                console.log(`  - ${r.name}: ${r.error}`);
            });
            process.exit(1);
        }

        if (!DRY_RUN && !PINGEN_STAGING) {
            console.log();
            console.log('Briefe werden in 1-2 Werktagen zugestellt (B-Post).');
        }

    } catch (error) {
        console.error();
        console.error('FEHLER:', error.message);
        process.exit(1);
    }
}

main();
