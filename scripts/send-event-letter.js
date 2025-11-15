#!/usr/bin/env node

/**
 * Event Letter Sender via Pingen API
 * Sends beautiful PDF letters via Swiss Post for members who prefer postal mail
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration from environment variables
const PINGEN_API_KEY = process.env.PINGEN_API_KEY;
const PINGEN_STAGING = process.env.PINGEN_STAGING === 'true'; // Use staging for tests

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
    console.error('❌ Usage: node send-event-letter.js <event-file.md>');
    process.exit(1);
}

const eventFile = args[0];

/**
 * Parse event markdown file
 */
function parseEventFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

    if (!frontmatterMatch) {
        throw new Error('No frontmatter found in event file');
    }

    const [, frontmatterStr, markdown] = frontmatterMatch;
    const frontmatter = parseFrontmatter(frontmatterStr);

    return {
        ...frontmatter,
        description: markdown.trim()
    };
}

/**
 * Parse YAML frontmatter
 */
function parseFrontmatter(str) {
    const result = {};
    const lines = str.split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const colonIndex = trimmed.indexOf(':');
        if (colonIndex > -1) {
            const key = trimmed.substring(0, colonIndex).trim();
            const value = trimmed.substring(colonIndex + 1).trim();
            result[key] = value;
        }
    }

    return result;
}

/**
 * Format date for display
 */
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('de-CH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(date);
}

/**
 * Format time for display
 */
function formatTime(dateStr) {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('de-CH', {
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

/**
 * Load letter recipients from member data
 */
function loadRecipients() {
    // Load from mitglieder_data.json
    const memberDataPath = path.join(__dirname, '..', 'mitglieder_data.json');

    if (!fs.existsSync(memberDataPath)) {
        throw new Error('mitglieder_data.json nicht gefunden!');
    }

    console.log('📋 Lade Brief-Empfänger aus mitglieder_data.json...');
    const members = JSON.parse(fs.readFileSync(memberDataPath, 'utf-8'));

    // Filter: Nur Aktivmitglieder mit Post-Zustellung
    const letterRecipients = members.filter(m =>
        m.Status === 'Aktivmitglied' &&
        m.Zustellung === 'Post' &&
        m.Strasse && m.PLZ && m.Ort
    );

    console.log(`✅ ${letterRecipients.length} Mitglieder mit Post-Zustellung gefunden`);

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
 * Generate PDF content for letter using LaTeX/HTML
 */
function generateLetterHTML(event, recipient) {
    const today = new Date().toLocaleDateString('de-CH');

    return `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <style>
        @page {
            size: A4;
            margin: 2cm 2.5cm 2cm 2.5cm;
        }
        body {
            font-family: 'Helvetica', 'Arial', sans-serif;
            font-size: 11pt;
            line-height: 1.6;
            color: #000;
        }
        .header {
            margin-bottom: 3cm;
        }
        .logo {
            width: 80px;
            margin-bottom: 1cm;
        }
        .sender-address {
            font-size: 9pt;
            margin-bottom: 0.5cm;
        }
        .recipient-address {
            margin-top: 2cm;
            margin-bottom: 2cm;
        }
        .date-place {
            text-align: right;
            margin-bottom: 1.5cm;
        }
        h1 {
            font-size: 14pt;
            font-weight: bold;
            margin-bottom: 1cm;
            color: #dc2626;
        }
        .content {
            margin-bottom: 1.5cm;
        }
        .event-details {
            background: #f5f5f5;
            padding: 1cm;
            margin: 1cm 0;
            border-left: 4px solid #dc2626;
        }
        .detail-item {
            margin: 0.3cm 0;
        }
        .detail-label {
            font-weight: bold;
            display: inline-block;
            width: 4cm;
        }
        .signature {
            margin-top: 2cm;
        }
        .footer {
            position: fixed;
            bottom: 1cm;
            left: 2.5cm;
            right: 2.5cm;
            font-size: 8pt;
            color: #666;
            border-top: 1px solid #ccc;
            padding-top: 0.3cm;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="sender-address">
            Feuerwehrverein Raura Kaiseraugst<br>
            Postfach 123, 4303 Kaiseraugst
        </div>
    </div>

    <div class="recipient-address">
        ${recipient.name}<br>
        ${recipient.address.street}<br>
        ${recipient.address.zip} ${recipient.address.city}
    </div>

    <div class="date-place">
        Kaiseraugst, ${today}
    </div>

    <h1>${event.title}</h1>

    <div class="content">
        <p>Liebe Vereinsmitglieder</p>

        <p>Wir laden Sie herzlich zu folgender Veranstaltung ein:</p>

        <div class="event-details">
            <div class="detail-item">
                <span class="detail-label">Veranstaltung:</span>
                ${event.title}
            </div>
            ${event.subtitle ? `
            <div class="detail-item">
                <span class="detail-label">Untertitel:</span>
                ${event.subtitle}
            </div>` : ''}
            <div class="detail-item">
                <span class="detail-label">Datum:</span>
                ${formatDate(event.startDate)}
            </div>
            <div class="detail-item">
                <span class="detail-label">Zeit:</span>
                ${formatTime(event.startDate)} ${event.endDate ? '- ' + formatTime(event.endDate) : ''} Uhr
            </div>
            <div class="detail-item">
                <span class="detail-label">Ort:</span>
                ${event.location}
            </div>
            ${event.cost ? `
            <div class="detail-item">
                <span class="detail-label">Kosten:</span>
                ${event.cost}
            </div>` : ''}
            ${event.organizer ? `
            <div class="detail-item">
                <span class="detail-label">Organisator:</span>
                ${event.organizer}
            </div>` : ''}
        </div>

        ${event.registrationRequired === 'true' ? `
        <p><strong>Anmeldung erforderlich:</strong><br>
        Bitte melden Sie sich bis ${event.registrationDeadline ? formatDate(event.registrationDeadline) : 'zum angegebenen Datum'}
        ${event.email ? 'per E-Mail an ' + event.email : ''}
        ${event.organizer ? 'bei ' + event.organizer : ''} an.
        ${event.maxParticipants ? 'Die Teilnehmerzahl ist auf ' + event.maxParticipants + ' Personen begrenzt.' : ''}
        </p>` : ''}

        <p>Wir freuen uns auf Ihre Teilnahme!</p>
    </div>

    <div class="signature">
        <p>Mit freundlichen Grüssen</p>
        <p>Feuerwehrverein Raura Kaiseraugst<br>
        ${event.organizer || 'Der Vorstand'}</p>
    </div>

    <div class="footer">
        Feuerwehrverein Raura Kaiseraugst | www.fwv-raura.ch | kontakt@fwv-raura.ch
    </div>
</body>
</html>
    `.trim();
}

/**
 * Convert HTML to PDF using external service (e.g., wkhtmltopdf or similar)
 */
async function htmlToPdf(html) {
    // For production, you'd use a PDF generation library
    // For now, we'll create a simple implementation that works with Pingen
    const tempFile = path.join('/tmp', `event-letter-${Date.now()}.html`);
    fs.writeFileSync(tempFile, html);
    console.log(`📄 HTML gespeichert: ${tempFile}`);
    return tempFile;
}

/**
 * Send letter via Pingen API
 */
async function sendLetterViaPingen(pdfPath, recipient) {
    return new Promise((resolve, reject) => {
        const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
        const apiUrl = PINGEN_STAGING ? 'api-staging.pingen.com' : 'api.pingen.com';

        // Read file
        const fileContent = fs.readFileSync(pdfPath);

        // Build multipart form data
        let body = '';

        // Add file
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="file"; filename="event-invitation.html"\r\n`;
        body += `Content-Type: text/html\r\n\r\n`;
        body += fileContent.toString();
        body += `\r\n`;

        // Add recipient address
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="address_name"\r\n\r\n`;
        body += `${recipient.name}\r\n`;

        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="address_line_1"\r\n\r\n`;
        body += `${recipient.address.street}\r\n`;

        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="address_zip"\r\n\r\n`;
        body += `${recipient.address.zip}\r\n`;

        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="address_city"\r\n\r\n`;
        body += `${recipient.address.city}\r\n`;

        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="address_country"\r\n\r\n`;
        body += `CH\r\n`;

        // Add delivery speed (A-Post or B-Post)
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="speed"\r\n\r\n`;
        body += `priority\r\n`; // priority = A-Post, economy = B-Post

        body += `--${boundary}--\r\n`;

        const options = {
            hostname: apiUrl,
            port: 443,
            path: '/v2/documents/send',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PINGEN_API_KEY}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    const response = JSON.parse(data);
                    resolve(response);
                } else {
                    reject(new Error(`Pingen API Error: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(body);
        req.end();
    });
}

/**
 * Main function
 */
async function main() {
    try {
        console.log('🚀 Event-Brief Versand via Pingen gestartet...\n');

        // Check required environment variables
        if (!PINGEN_API_KEY) {
            throw new Error('PINGEN_API_KEY environment variable is required');
        }

        // Parse event file
        console.log(`📄 Lade Event-Datei: ${eventFile}`);
        const event = parseEventFile(eventFile);
        console.log(`✅ Event geladen: ${event.title}\n`);

        // Load recipients
        console.log('📋 Lade Brief-Empfänger...');
        const recipients = loadRecipients();
        console.log(`✅ ${recipients.length} aktive Empfänger gefunden\n`);

        // Send letters
        console.log('📮 Versende Briefe via Pingen...\n');
        const results = [];

        for (const recipient of recipients) {
            try {
                console.log(`📝 Erstelle Brief für: ${recipient.name}`);

                // Generate HTML
                const html = generateLetterHTML(event, recipient);

                // Save to temporary file
                const pdfPath = await htmlToPdf(html);

                // Send via Pingen
                console.log(`📤 Sende an Pingen...`);
                const response = await sendLetterViaPingen(pdfPath, recipient);

                console.log(`✅ Brief versendet an ${recipient.name} (${recipient.address.city})`);
                console.log(`   Pingen ID: ${response.id || response.data?.id || 'N/A'}\n`);

                results.push({
                    name: recipient.name,
                    success: true,
                    pingenId: response.id || response.data?.id
                });

                // Clean up temp file
                if (fs.existsSync(pdfPath)) {
                    fs.unlinkSync(pdfPath);
                }
            } catch (error) {
                console.error(`❌ Fehler beim Versenden an ${recipient.name}:`, error.message);
                results.push({ name: recipient.name, success: false, error: error.message });
            }
        }

        // Summary
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        console.log('\n📊 Zusammenfassung:');
        console.log(`✅ Erfolgreich: ${successful}`);
        console.log(`❌ Fehlgeschlagen: ${failed}`);

        if (failed > 0) {
            console.log('\n❌ Fehlgeschlagene Briefe:');
            results.filter(r => !r.success).forEach(r => {
                console.log(`  - ${r.name}: ${r.error}`);
            });
            process.exit(1);
        }

        console.log('\n✅ Alle Briefe erfolgreich an Pingen übergeben!');
        console.log('ℹ️  Die Briefe werden in 1-2 Werktagen zugestellt.');
    } catch (error) {
        console.error('\n❌ Fehler:', error.message);
        process.exit(1);
    }
}

// Run
main();
