const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_NAME = 'api-dispatch';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ===========================================
// LOGGING UTILITIES
// ===========================================
function log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, service: SERVICE_NAME, level, message, ...data };
    console.log(JSON.stringify(logEntry));
}
function logInfo(message, data = {}) { log('INFO', message, data); }
function logWarn(message, data = {}) { log('WARN', message, data); }
function logError(message, data = {}) { log('ERROR', message, data); }

// Helper to get real client IP from proxy headers
function getClientIp(req) {
    if (req.headers['cf-connecting-ip']) return req.headers['cf-connecting-ip'];
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) return forwardedFor.split(',')[0].trim();
    if (req.headers['x-real-ip']) return req.headers['x-real-ip'];
    return req.ip;
}

// SMTP Transport
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT === '465',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
    }
});

// Pingen Config
const PINGEN_IDENTITY = 'https://identity.pingen.com';
const PINGEN_API_PRODUCTION = 'https://api.pingen.com';
const PINGEN_API_STAGING = 'https://api-staging.pingen.com';

// Helper: Pingen API URL basierend auf staging Parameter
function getPingenApi(staging = false) {
    return staging ? PINGEN_API_STAGING : PINGEN_API_PRODUCTION;
}

// Helper: Pingen Organisation-ID basierend auf staging Parameter
function getPingenOrgId(staging = false) {
    if (staging && process.env.PINGEN_STAGING_ORGANISATION_ID) {
        return process.env.PINGEN_STAGING_ORGANISATION_ID;
    }
    return process.env.PINGEN_ORGANISATION_ID;
}

// Helper: Strasse und Hausnummer trennen
// z.B. "Musterstrasse 12" -> { street: "Musterstrasse", number: "12" }
// z.B. "Hauptstr. 5a" -> { street: "Hauptstr.", number: "5a" }
function parseStreetAndNumber(fullStreet) {
    if (!fullStreet) return { street: '', number: '' };

    // Regex to match street name followed by house number at the end
    // Supports: "Musterstrasse 12", "Hauptstr. 5a", "Am Waldrand 123b"
    const match = fullStreet.match(/^(.+?)\s+(\d+\s*[a-zA-Z]?)$/);
    if (match) {
        return {
            street: match[1].trim(),
            number: match[2].trim()
        };
    }
    // If no number found, return full street as street name
    return { street: fullStreet.trim(), number: '' };
}

// Absender-Adresse für Pingen
// Hinweis: pobox und number müssen mindestens 1 Zeichen haben (minLength: 1 laut API)
// Leere Felder werden beim Senden weggelassen
const SENDER_ADDRESS = {
    name: 'Feuerwehrverein Raura',
    street: 'Rosenweg',
    number: '9',
    zip: '4303',
    city: 'Kaiseraugst',
    country: 'CH'
};

// Helper: Pingen meta_data Adresse erstellen (entfernt leere Felder)
function buildPingenAddress(address) {
    const result = {};
    // Nur nicht-leere Felder hinzufügen (API erwartet minLength: 1 für alle Felder)
    if (address.name) result.name = address.name;
    if (address.street) result.street = address.street;
    if (address.number) result.number = address.number;
    if (address.pobox) result.pobox = address.pobox;
    if (address.zip) result.zip = address.zip;
    if (address.city) result.city = address.city;
    if (address.country) result.country = address.country;
    return result;
}

// Helper: Adresse als formatierten String für Deckblatt erstellen
// Format: "Name\nStrasse Nummer\nPLZ Ort"
function formatAddressForCoverPage(name, street, number, zip, city) {
    const streetLine = number ? `${street} ${number}` : street;
    return `${name}\n${streetLine}\n${zip} ${city}`;
}

// Helper: Send Pingen cost notification to Kassier
// Pingen Preise (Stand 2024): Economy ~CHF 1.00, Priority ~CHF 1.50 (inkl. Porto)
async function sendPingenCostNotification(recipientName, letterId, isStaging = false) {
    try {
        // Get Kassier email from database
        const kassierResult = await pool.query(
            "SELECT vorname, email FROM members WHERE funktion ILIKE '%Kassier%' LIMIT 1"
        );

        if (kassierResult.rows.length === 0) {
            logWarn('Kassier not found for Pingen cost notification');
            return;
        }

        const kassier = kassierResult.rows[0];
        const estimatedCost = 'ca. CHF 1.00'; // Economy Versand
        const environment = isStaging ? ' (STAGING/TEST)' : '';

        await transporter.sendMail({
            from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`,
            to: kassier.email,
            subject: `Pingen Briefversand${environment}: ${recipientName}`,
            text: `Hallo ${kassier.vorname},\n\nEin Brief wurde über Pingen versendet:\n\nEmpfänger: ${recipientName}\nBrief-ID: ${letterId}\nGeschätzte Kosten: ${estimatedCost}\n\nDie genauen Kosten findest du im Pingen Dashboard.\n\nFeuerwehrverein Raura`,
            html: `<p>Hallo ${kassier.vorname},</p><p>Ein Brief wurde über Pingen versendet:</p><ul><li><strong>Empfänger:</strong> ${recipientName}</li><li><strong>Brief-ID:</strong> ${letterId}</li><li><strong>Geschätzte Kosten:</strong> ${estimatedCost}</li></ul><p>Die genauen Kosten findest du im <a href="https://app.pingen.com">Pingen Dashboard</a>.</p><p>Feuerwehrverein Raura</p>`
        });

        logInfo('Pingen cost notification sent to Kassier', { recipient: recipientName, letterId });
    } catch (error) {
        logError('Failed to send Pingen cost notification', { error: error.message });
    }
}

// Helper: Send bulk Pingen cost notification to Kassier
async function sendPingenBulkCostNotification(count, successList, isStaging = false) {
    try {
        const kassierResult = await pool.query(
            "SELECT vorname, email FROM members WHERE funktion ILIKE '%Kassier%' LIMIT 1"
        );

        if (kassierResult.rows.length === 0) {
            logWarn('Kassier not found for Pingen bulk cost notification');
            return;
        }

        const kassier = kassierResult.rows[0];
        const estimatedCostPerLetter = 1.00; // CHF
        const totalEstimatedCost = (count * estimatedCostPerLetter).toFixed(2);
        const environment = isStaging ? ' (STAGING/TEST)' : '';

        const recipientList = successList.map(s => `- ${s.name}`).join('\n');
        const recipientListHtml = successList.map(s => `<li>${s.name}</li>`).join('');

        await transporter.sendMail({
            from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`,
            to: kassier.email,
            subject: `Pingen Massenversand${environment}: ${count} Briefe`,
            text: `Hallo ${kassier.vorname},\n\nEin Massenversand wurde über Pingen durchgeführt:\n\nAnzahl Briefe: ${count}\nGeschätzte Kosten: ca. CHF ${totalEstimatedCost}\n\nEmpfänger:\n${recipientList}\n\nDie genauen Kosten findest du im Pingen Dashboard.\n\nFeuerwehrverein Raura`,
            html: `<p>Hallo ${kassier.vorname},</p><p>Ein Massenversand wurde über Pingen durchgeführt:</p><ul><li><strong>Anzahl Briefe:</strong> ${count}</li><li><strong>Geschätzte Kosten:</strong> ca. CHF ${totalEstimatedCost}</li></ul><p><strong>Empfänger:</strong></p><ul>${recipientListHtml}</ul><p>Die genauen Kosten findest du im <a href="https://app.pingen.com">Pingen Dashboard</a>.</p><p>Feuerwehrverein Raura</p>`
        });

        logInfo('Pingen bulk cost notification sent to Kassier', { count, totalEstimatedCost });
    } catch (error) {
        logError('Failed to send Pingen bulk cost notification', { error: error.message });
    }
}

// Cache für heruntergeladene Schriftart
let cachedFontBytes = null;

// Helper: Schriftart laden (eingebettet, nicht nur referenziert)
// Verwendet Inter Font von Google Fonts (OFL Lizenz)
async function getEmbeddableFont() {
    if (cachedFontBytes) {
        return cachedFontBytes;
    }

    const fontPath = path.join('/tmp', 'Inter-Regular.ttf');

    // Prüfen ob Font bereits lokal gecached
    if (fs.existsSync(fontPath)) {
        cachedFontBytes = fs.readFileSync(fontPath);
        return cachedFontBytes;
    }

    // Font von Google Fonts herunterladen (Inter Regular)
    // Direct link to TTF file from Google Fonts
    const fontUrl = 'https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf';

    try {
        console.log('Downloading Inter font for PDF embedding...');
        const response = await axios.get(fontUrl, { responseType: 'arraybuffer' });
        cachedFontBytes = Buffer.from(response.data);

        // Lokal cachen für nächsten Neustart
        fs.writeFileSync(fontPath, cachedFontBytes);
        console.log('Inter font downloaded and cached');

        return cachedFontBytes;
    } catch (error) {
        console.error('Could not download Inter font, falling back to Helvetica:', error.message);
        return null;
    }
}

// Helper: Adresse direkt ins PDF schreiben (Schweizer Briefformat, Adresse rechts)
// Position: Fensterbereich rechts oben auf der ersten Seite
// Verwendet eingebettete Schriftart für Pingen-Kompatibilität
// Erkennt das Land anhand der Adresse (CH oder DE)
function detectCountryFromAddress(address) {
    // Suche nach PLZ-Muster
    // Schweiz: 4-stellige PLZ (z.B. "8000 Zürich" oder "CH-8000 Zürich")
    // Deutschland: 5-stellige PLZ (z.B. "80331 München" oder "DE-80331 München")

    // Explizite Länderkennung
    if (/\bCH[-\s]?\d{4}\b/i.test(address)) return 'CH';
    if (/\bDE[-\s]?\d{5}\b/i.test(address)) return 'DE';
    if (/\bD[-\s]?\d{5}\b/i.test(address)) return 'DE';

    // PLZ-Länge als Fallback
    const plzMatch = address.match(/\b(\d{4,5})\s+\w/);
    if (plzMatch) {
        const plz = plzMatch[1];
        if (plz.length === 4) return 'CH';
        if (plz.length === 5) return 'DE';
    }

    // Default: Schweiz
    return 'CH';
}

async function addAddressToPdf(pdfBuffer, recipientAddress, senderAddress = null) {
    console.log('[addAddressToPdf] Starting PDF address embedding...');
    console.log(`[addAddressToPdf] Input PDF size: ${pdfBuffer.length} bytes`);
    console.log(`[addAddressToPdf] Recipient address: ${recipientAddress}`);

    const pdfDoc = await PDFDocument.load(pdfBuffer);

    // fontkit registrieren für Custom Fonts
    pdfDoc.registerFontkit(fontkit);

    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();

    // Versuche eingebettete Schriftart zu laden, sonst Fallback auf Helvetica
    let font;
    const fontBytes = await getEmbeddableFont();
    if (fontBytes) {
        try {
            font = await pdfDoc.embedFont(fontBytes);
            console.log('Using embedded Inter font');
        } catch (fontErr) {
            console.error('Could not embed Inter font:', fontErr.message);
            font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        }
    } else {
        font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    }

    const fontSize = 10;
    const lineHeight = 14;

    // Land erkennen und Position bestimmen
    // A4: 595 x 842 points, 1mm = 2.835 points
    const country = detectCountryFromAddress(recipientAddress);
    let addressX, addressY;

    if (country === 'DE') {
        // Deutsches Briefformat: Adressfenster LINKS (DIN Standard)
        // DIN 5008: Adressfenster bei ~45mm von oben, aber Textbaseline tiefer
        // damit der weiße Hintergrund nicht den Header überdeckt
        addressX = 57; // ~20mm von links
        addressY = height - 213; // ~75mm von oben (75 * 2.835 = 213)
        console.log('Detected German address - using LEFT window position');
    } else {
        // Schweizer Briefformat: Adressfenster RECHTS
        // Pingen Spezifikation:
        //   Adressbereich: X=118mm, Y=60mm, W=85.5mm, H=25.5mm (60-85.5mm von oben)
        //   Frankierbereich: X=116mm, Y=40mm, W=89.5mm, H=47.5mm (40-87.5mm von oben)
        // Position bei ~70mm von oben = Mitte des Adressfelds
        addressX = 335; // 118mm von links
        addressY = height - 198; // ~70mm von oben (70 * 2.835 = 198)
        console.log('Detected Swiss address - using RIGHT window position');
    }

    // Weißen Hintergrund für Adressbereich zeichnen (damit bestehender Inhalt nicht durchscheint)
    const bgPadding = 10;
    const bgWidth = 200;
    const bgHeight = 90;
    firstPage.drawRectangle({
        x: addressX - bgPadding,
        y: addressY - bgHeight + 20,
        width: bgWidth,
        height: bgHeight,
        color: rgb(1, 1, 1), // Weiß
    });
    console.log(`[addAddressToPdf] Drew white background at X=${addressX - bgPadding}, Y=${addressY - bgHeight + 20}, W=${bgWidth}, H=${bgHeight}`);

    // Absender (klein, oberhalb der Empfängeradresse)
    if (senderAddress) {
        const senderFontSize = 7;
        firstPage.drawText(senderAddress, {
            x: addressX,
            y: addressY + 20,
            size: senderFontSize,
            font: font,
            color: rgb(0.3, 0.3, 0.3)
        });
        // Trennlinie
        firstPage.drawLine({
            start: { x: addressX, y: addressY + 15 },
            end: { x: addressX + 180, y: addressY + 15 },
            thickness: 0.5,
            color: rgb(0.7, 0.7, 0.7)
        });
    }

    // Empfängeradresse (mehrzeilig)
    const addressLines = recipientAddress.split('\n');
    console.log(`[addAddressToPdf] Drawing ${addressLines.length} address lines at X=${addressX}, Y=${addressY}`);
    addressLines.forEach((line, index) => {
        console.log(`[addAddressToPdf] Line ${index}: "${line}"`);
        firstPage.drawText(line, {
            x: addressX,
            y: addressY - (index * lineHeight),
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
    });

    const savedPdf = await pdfDoc.save();
    console.log(`[addAddressToPdf] PDF saved. Output size: ${savedPdf.length} bytes`);
    return { pdfBytes: savedPdf, country };
}

// Helper: Warten bis Brief die initiale Verarbeitung abgeschlossen hat
// (Status ist nicht mehr "validating" - kann "valid", "action_required", etc. sein)
async function waitForLetterProcessing(letterId, token, staging = false) {
    const PINGEN_API = getPingenApi(staging);
    const maxAttempts = 10;
    const delayMs = 2000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await axios.get(
                `${PINGEN_API}/organisations/${getPingenOrgId(staging)}/letters/${letterId}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/vnd.api+json'
                    }
                }
            );

            const status = response.data.data?.attributes?.status;
            console.log(`Letter ${letterId} processing check ${attempt}/${maxAttempts}: status=${status}`);

            // Sobald nicht mehr "validating", ist die initiale Verarbeitung fertig
            if (status && status !== 'validating') {
                return { ready: true, status };
            }

            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        } catch (error) {
            console.error(`Error checking letter ${letterId} processing:`, error.response?.data || error.message);
            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    return { ready: false, status: 'timeout' };
}

// Helper: Warten bis Brief validiert ist (max 30 Sekunden)
// Pingen braucht Zeit um das PDF zu verarbeiten bevor create-cover-page möglich ist
async function waitForLetterValidation(letterId, token, staging = false) {
    const PINGEN_API = getPingenApi(staging);
    const maxAttempts = 10;
    const delayMs = 3000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await axios.get(
                `${PINGEN_API}/organisations/${getPingenOrgId(staging)}/letters/${letterId}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/vnd.api+json'
                    }
                }
            );

            const letterData = response.data.data?.attributes;
            const status = letterData?.status;
            console.log(`Letter ${letterId} validation check ${attempt}/${maxAttempts}: status=${status}`);

            if (status === 'valid') {
                return { success: true, status };
            }

            if (status === 'action_required') {
                // Log full letter data to understand why it requires action
                console.log(`Letter ${letterId} requires action. Details:`, JSON.stringify({
                    status: letterData?.status,
                    paper_types: letterData?.paper_types,
                    fonts: letterData?.fonts,
                    file_pages: letterData?.file_pages,
                    address_position: letterData?.address_position,
                    print_mode: letterData?.print_mode
                }, null, 2));
                // Brief NICHT löschen - als Erfolg behandeln, braucht nur manuelle Aktion in Pingen
                return { success: true, status, needsManualAction: true };
            }

            if (status === 'invalid') {
                return { success: false, status, reason: 'Letter is invalid' };
            }

            // Status ist noch 'validating' oder ähnlich - weiter warten
            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        } catch (error) {
            console.error(`Error checking letter ${letterId} status:`, error.response?.data || error.message);
            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    return { success: false, status: 'timeout', reason: 'Validation timeout' };
}

// Helper: Brief-Status prüfen (NICHT mehr löschen bei action_required)
// Briefe bleiben in Pingen für manuelle Bearbeitung
async function checkAndDeleteIfActionRequired(letterId, token, staging = false) {
    const PINGEN_API = getPingenApi(staging);

    // Kurz warten bis Pingen das PDF verarbeitet hat
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
        // Brief-Status abrufen
        const statusResponse = await axios.get(
            `${PINGEN_API}/organisations/${getPingenOrgId(staging)}/letters/${letterId}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/vnd.api+json'
                }
            }
        );

        const letterStatus = statusResponse.data.data?.attributes?.status;
        console.log(`Letter ${letterId} final status: ${letterStatus}`);

        // Brief NICHT löschen - auch bei action_required bleibt er in Pingen
        // für manuelle Bearbeitung
        if (letterStatus === 'action_required') {
            console.log(`Letter ${letterId} requires manual action in Pingen - NOT deleting`);
            return { success: true, status: letterStatus, needsManualAction: true };
        }

        return { success: true, status: letterStatus };
    } catch (error) {
        console.error(`Error checking letter status for ${letterId}:`, error.response?.data || error.message);
        return { success: true, warning: 'Could not verify letter status' };
    }
}

// Nextcloud WebDAV für Datei-Speicherung
const NEXTCLOUD_URL = process.env.NEXTCLOUD_URL;
const NEXTCLOUD_USER = process.env.NEXTCLOUD_USER;
const NEXTCLOUD_PASSWORD = process.env.NEXTCLOUD_PASSWORD;
const NEXTCLOUD_FOLDER = process.env.NEXTCLOUD_FOLDER || '/FWV-Dokumente';

// Helper: Datei zu Nextcloud hochladen
async function uploadToNextcloud(filename, buffer, subfolder = '') {
    if (!NEXTCLOUD_URL || !NEXTCLOUD_USER) {
        console.log('Nextcloud nicht konfiguriert, Datei wird nicht hochgeladen');
        return null;
    }

    try {
        const path = `${NEXTCLOUD_FOLDER}${subfolder}/${filename}`;
        const url = `${NEXTCLOUD_URL}/remote.php/dav/files/${NEXTCLOUD_USER}${path}`;

        // Ordner erstellen falls nicht vorhanden
        const folderPath = `${NEXTCLOUD_FOLDER}${subfolder}`;
        await axios({
            method: 'MKCOL',
            url: `${NEXTCLOUD_URL}/remote.php/dav/files/${NEXTCLOUD_USER}${folderPath}`,
            auth: { username: NEXTCLOUD_USER, password: NEXTCLOUD_PASSWORD }
        }).catch(() => {}); // Ignorieren falls Ordner existiert

        // Datei hochladen
        await axios({
            method: 'PUT',
            url,
            data: buffer,
            auth: { username: NEXTCLOUD_USER, password: NEXTCLOUD_PASSWORD },
            headers: { 'Content-Type': 'application/octet-stream' }
        });

        console.log(`Datei hochgeladen: ${path}`);
        return `${NEXTCLOUD_URL}/apps/files/?dir=${encodeURIComponent(folderPath)}&openfile=${encodeURIComponent(filename)}`;
    } catch (error) {
        console.error('Nextcloud Upload Fehler:', error.message);
        return null;
    }
}

// CORS vor Helmet konfigurieren
app.use(cors({
    origin: ['https://fwv-raura.ch', 'https://www.fwv-raura.ch', 'http://localhost:3000', 'http://localhost:5173'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true
}));
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(express.json({ limit: '50mb' })); // Erhöht für PDF-Uploads

// Trust proxy for correct client IP
app.set('trust proxy', true);

// ===========================================
// REQUEST LOGGING MIDDLEWARE
// ===========================================
app.use((req, res, next) => {
    if (req.path === '/health') return next();

    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    req.requestId = requestId;

    logInfo('REQUEST', {
        requestId,
        method: req.method,
        path: req.path,
        ip: getClientIp(req)
    });

    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const logFn = res.statusCode >= 400 ? logWarn : logInfo;
        logFn('RESPONSE', {
            requestId,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration: `${duration}ms`
        });
    });

    next();
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'api-dispatch', version: process.env.APP_VERSION || '0.0.0' });
});

// ============================================
// TEMPLATES
// ============================================

app.get('/templates', async (req, res) => {
    try {
        const { type } = req.query;
        let query = 'SELECT * FROM dispatch_templates';
        if (type) {
            query += ' WHERE type = $1';
            const result = await pool.query(query, [type]);
            return res.json(result.rows);
        }
        const result = await pool.query(query + ' ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/templates', async (req, res) => {
    try {
        const { name, type, subject, body, variables } = req.body;
        const result = await pool.query(`
            INSERT INTO dispatch_templates (name, type, subject, body, variables)
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `, [name, type, subject, body, variables]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// EMAIL
// ============================================

app.post('/email/send', async (req, res) => {
    console.log('[EMAIL] /email/send called with:', { to: req.body.to, template_id: req.body.template_id, member_id: req.body.member_id });
    try {
        const { to, subject, body, template_id, variables, member_id, event_id } = req.body;

        let emailSubject = subject;
        let emailBody = body;

        // Use template if provided
        if (template_id) {
            const template = await pool.query('SELECT * FROM dispatch_templates WHERE id = $1', [template_id]);
            if (template.rows.length > 0) {
                emailSubject = template.rows[0].subject;
                emailBody = template.rows[0].body;

                // Replace variables
                if (variables) {
                    Object.keys(variables).forEach(key => {
                        const regex = new RegExp(`{{${key}}}`, 'g');
                        emailSubject = emailSubject.replace(regex, variables[key]);
                        emailBody = emailBody.replace(regex, variables[key]);
                    });
                }
            }
        }

        // Convert URLs to clickable links for HTML version
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const emailHtml = emailBody
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>')
            .replace(urlRegex, '<a href="$1">$1</a>');

        // Send email with both text and HTML versions
        const info = await transporter.sendMail({
            from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`,
            to,
            subject: emailSubject,
            text: emailBody,
            html: emailHtml
        });

        // Log
        await pool.query(`
            INSERT INTO dispatch_log (type, template_id, member_id, recipient_email, subject, body, status, external_id, event_id, sent_at)
            VALUES ('email', $1, $2, $3, $4, $5, 'sent', $6, $7, NOW())
        `, [template_id, member_id, to, emailSubject, emailBody, info.messageId, event_id]);

        console.log('[EMAIL] Email sent successfully to:', to, 'messageId:', info.messageId);
        res.json({ success: true, messageId: info.messageId });
    } catch (error) {
        console.error('[EMAIL] /email/send ERROR:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/email/bulk', async (req, res) => {
    console.log('[EMAIL BULK] /email/bulk called with:', { member_ids: req.body.member_ids, template_id: req.body.template_id });
    try {
        const { member_ids, template_id, variables } = req.body;

        // Get members
        console.log('[EMAIL BULK] Fetching members from:', `${process.env.MEMBERS_API_URL}/members`);
        const members = await axios.get(`${process.env.MEMBERS_API_URL}/members`, {
            params: { ids: member_ids.join(',') }
        });
        console.log('[EMAIL BULK] Fetched', members.data.length, 'members');

        const results = [];
        for (const member of members.data) {
            if (!member.email || !member.zustellung_email) continue;

            try {
                // Merge member data with variables
                const mergedVars = {
                    anrede: member.anrede,
                    vorname: member.vorname,
                    nachname: member.nachname,
                    ...variables
                };

                await axios.post(`http://localhost:${PORT}/email/send`, {
                    to: member.versand_email || member.email,
                    template_id,
                    variables: mergedVars,
                    member_id: member.id
                });

                results.push({ member_id: member.id, success: true });
            } catch (err) {
                results.push({ member_id: member.id, success: false, error: err.message });
            }
        }

        console.log('[EMAIL BULK] Completed:', { total: results.length, success: results.filter(r => r.success).length });
        res.json({ results, total: results.length, success: results.filter(r => r.success).length });
    } catch (error) {
        console.error('[EMAIL BULK] ERROR:', error.message, error.stack);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// PINGEN (Post)
// ============================================

app.post('/pingen/send', async (req, res) => {
    try {
        const { html, recipient, member_id, event_id, staging = false, use_cover_page = false } = req.body;
        const PINGEN_API = getPingenApi(staging);

        // Convert HTML to PDF
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const originalPdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();

        // Parse address
        const parsedAddress = parseStreetAndNumber(recipient.street);
        const recipientAddressStr = formatAddressForCoverPage(
            recipient.name,
            parsedAddress.street,
            parsedAddress.number || recipient.number,
            recipient.zip,
            recipient.city
        );

        // PDF buffer: embed address or use original depending on use_cover_page option
        let pdfBuffer;
        let detectedCountry = recipient.country || 'CH';
        console.log(`[PINGEN] use_cover_page=${use_cover_page}, recipient address:\n${recipientAddressStr}`);
        if (use_cover_page) {
            // Use original PDF, cover page will be created by Pingen
            console.log('[PINGEN] Using cover page approach - NOT embedding address');
            pdfBuffer = originalPdfBuffer;
        } else {
            // Embed address directly in PDF
            console.log('[PINGEN] Embedding address directly in PDF');
            const senderAddressLine = `${SENDER_ADDRESS.name}, ${SENDER_ADDRESS.zip} ${SENDER_ADDRESS.city}`;
            const result = await addAddressToPdf(originalPdfBuffer, recipientAddressStr, senderAddressLine);
            pdfBuffer = Buffer.from(result.pdfBytes);
            detectedCountry = result.country;
            console.log(`[PINGEN] Address embedded. Country=${detectedCountry}, PDF size: ${pdfBuffer.length} bytes`);
        }

        // Get Pingen token
        const tokenResponse = await axios.post(`${PINGEN_IDENTITY}/auth/access-tokens`, {
            grant_type: 'client_credentials',
            client_id: process.env.PINGEN_CLIENT_ID,
            client_secret: process.env.PINGEN_CLIENT_SECRET
        });

        const token = tokenResponse.data.access_token;

        // Step 1: Get file upload URL
        const uploadUrlResponse = await axios.get(
            `${PINGEN_API}/file-upload`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/vnd.api+json'
                }
            }
        );

        const fileUrl = uploadUrlResponse.data.data.attributes.url;
        const fileUrlSignature = uploadUrlResponse.data.data.attributes.url_signature;

        // Step 2: Upload PDF to the pre-signed URL
        await axios.put(fileUrl, pdfBuffer, {
            headers: {
                'Content-Type': 'application/pdf'
            }
        });

        // Step 3: Create letter with file reference
        // auto_send depends on whether we use cover page or embedded address
        // Build letter attributes - don't specify address_position when using cover page
        // This prevents Pingen from immediately marking as action_required due to missing address
        const letterAttributes = {
            file_original_name: 'brief.pdf',
            file_url: fileUrl,
            file_url_signature: fileUrlSignature,
            auto_send: !use_cover_page,  // auto_send wenn Adresse im PDF, sonst manuell
            delivery_product: 'cheap',
            print_mode: 'simplex',
            print_spectrum: 'grayscale',
            meta_data: {
                recipient: buildPingenAddress({
                    name: recipient.name,
                    street: parsedAddress.street,
                    number: parsedAddress.number || recipient.number,
                    zip: recipient.zip,
                    city: recipient.city,
                    country: recipient.country || 'CH'
                }),
                sender: buildPingenAddress(SENDER_ADDRESS)
            }
        };

        // Only specify address_position when NOT using cover page (address already in PDF)
        if (!use_cover_page) {
            // CH = rechts (Schweizer C5/6 Couvert), DE = links (DIN Standard)
            letterAttributes.address_position = detectedCountry === 'DE' ? 'left' : 'right';
        }

        const uploadResponse = await axios.post(
            `${PINGEN_API}/organisations/${getPingenOrgId(staging)}/letters`,
            {
                data: {
                    type: 'letters',
                    attributes: letterAttributes
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/vnd.api+json'
                }
            }
        );

        const letterId = uploadResponse.data.data?.id;

        // Step 4: Handle based on use_cover_page option
        if (use_cover_page) {
            // Small delay to let Pingen process the upload, then create cover page immediately
            // Don't wait for full processing - that would result in action_required status
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Create cover page with recipient address (retry up to 3 times)
            let coverPageCreated = false;
            for (let attempt = 1; attempt <= 3 && !coverPageCreated; attempt++) {
                try {
                    await axios.patch(
                        `${PINGEN_API}/organisations/${getPingenOrgId(staging)}/letters/${letterId}/create-cover-page`,
                        {
                            data: {
                                type: 'letters',
                                id: letterId,
                                attributes: {
                                    address: recipientAddressStr,
                                    country: recipient.country || 'CH'
                                }
                            }
                        },
                        {
                            headers: {
                                Authorization: `Bearer ${token}`,
                                'Content-Type': 'application/vnd.api+json'
                            }
                        }
                    );
                    coverPageCreated = true;
                    console.log(`Cover page created for letter ${letterId} on attempt ${attempt}`);
                } catch (coverErr) {
                    console.log(`Cover page attempt ${attempt}/3 failed for letter ${letterId}:`, coverErr.response?.data?.errors?.[0]?.title || coverErr.message);
                    if (attempt < 3) {
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    }
                }
            }

            if (!coverPageCreated) {
                // If cover page creation failed, delete the letter and return error
                try {
                    await axios.delete(
                        `${PINGEN_API}/organisations/${getPingenOrgId(staging)}/letters/${letterId}`,
                        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/vnd.api+json' } }
                    );
                } catch (delErr) { /* ignore */ }
                return res.status(400).json({
                    error: 'Deckblatt konnte nicht erstellt werden - Brief wurde gelöscht'
                });
            }

            // Wait for letter validation AFTER cover page is created
            const validationResult = await waitForLetterValidation(letterId, token, staging);
            if (!validationResult.success) {
                try {
                    await axios.delete(
                        `${PINGEN_API}/organisations/${getPingenOrgId(staging)}/letters/${letterId}`,
                        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/vnd.api+json' } }
                    );
                } catch (delErr) { /* ignore */ }
                return res.status(400).json({
                    error: `Brief-Validierung fehlgeschlagen: ${validationResult.reason}`
                });
            }

            // Send the letter
            await axios.patch(
                `${PINGEN_API}/organisations/${getPingenOrgId(staging)}/letters/${letterId}/send`,
                {
                    data: {
                        type: 'letters',
                        id: letterId,
                        attributes: {
                            delivery_product: 'cheap',
                            print_mode: 'simplex',
                            print_spectrum: 'grayscale'
                        }
                    }
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/vnd.api+json'
                    }
                }
            );
        } else {
            // Address is embedded in PDF, just wait for validation
            const validationResult = await waitForLetterValidation(letterId, token, staging);
            if (!validationResult.success) {
                try {
                    await axios.delete(
                        `${PINGEN_API}/organisations/${getPingenOrgId(staging)}/letters/${letterId}`,
                        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/vnd.api+json' } }
                    );
                } catch (delErr) { /* ignore */ }
                return res.status(400).json({
                    error: `Brief-Validierung fehlgeschlagen: ${validationResult.reason}`
                });
            }
        }

        // Step 5: Check status and delete if action required
        const statusCheck = await checkAndDeleteIfActionRequired(letterId, token, staging);

        if (statusCheck.deleted) {
            return res.status(400).json({
                success: false,
                error: 'Brief wurde von Pingen als "Aktion erforderlich" markiert und automatisch gelöscht'
            });
        }

        // Log
        await pool.query(`
            INSERT INTO dispatch_log (type, member_id, recipient_address, status, external_id, event_id, sent_at)
            VALUES ('pingen', $1, $2, 'sent', $3, $4, NOW())
        `, [member_id, JSON.stringify(recipient), letterId, event_id]);

        // Send cost notification to Kassier
        sendPingenCostNotification(recipient.name, letterId, staging).catch(err => {
            logError('Failed to send Pingen cost notification', { error: err.message });
        });

        res.json({ success: true, letterId });
    } catch (error) {
        console.error('Pingen error:', error.response?.data || error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// KONTAKTFORMULAR (ersetzt n8n)
// ============================================

app.post('/contact', async (req, res) => {
    try {
        const { name, email, subject, message, type, membership } = req.body;

        let emailBody = '';
        let emailSubject = '';

        if (type === 'membership' && membership) {
            // Mitgliedschaftsantrag - In Datenbank speichern
            // Frontend sendet "Ja (aktiv)", "Ehemalige/r", oder "Nein"
            const isFirefighterRaurica = membership.firefighterStatus === 'Ja (aktiv)';
            const registrationStatus = isFirefighterRaurica ? 'approved' : 'pending';

            // Registrierung in Datenbank speichern
            // PLZ/Ort aus "4303 Kaiseraugst" aufteilen
            const cityParts = (membership.city || '').trim().split(' ');
            const plz = cityParts[0] || '';
            const ort = cityParts.slice(1).join(' ') || membership.city || '';

            const registrationResult = await pool.query(`
                INSERT INTO member_registrations
                (vorname, nachname, strasse, plz, ort, telefon, mobile, email,
                 feuerwehr_status, korrespondenz_methode, korrespondenz_adresse, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING id
            `, [
                membership.firstname,
                membership.lastname,
                membership.street,
                plz,
                ort,
                membership.phone,
                membership.mobile || null,
                membership.email,
                membership.firefighterStatus,
                membership.correspondenceMethod,
                membership.correspondenceAddress,
                registrationStatus
            ]);

            const registrationId = registrationResult.rows[0].id;
            let memberId = null;

            // Wenn Feuerwehr Raurica Mitglied -> automatisch genehmigen und Mitglied erstellen
            if (isFirefighterRaurica) {
                const memberResult = await pool.query(`
                    INSERT INTO members
                    (vorname, nachname, strasse, plz, ort, telefon, mobile, email,
                     status, feuerwehr_zugehoerigkeit, zustellung_email, zustellung_post, eintrittsdatum)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Aktivmitglied', 'feuerwehr_raurica', $9, $10, NOW())
                    RETURNING id
                `, [
                    membership.firstname,
                    membership.lastname,
                    membership.street,
                    plz,
                    ort,
                    membership.phone,
                    membership.mobile || null,
                    membership.email,
                    membership.correspondenceMethod === 'email',
                    membership.correspondenceMethod === 'post'
                ]);
                memberId = memberResult.rows[0].id;

                // Registrierung mit Mitglied-ID aktualisieren
                await pool.query(`
                    UPDATE member_registrations
                    SET member_id = $1, processed_at = NOW(), processed_by = 'system'
                    WHERE id = $2
                `, [memberId, registrationId]);

                emailSubject = `Neues Mitglied: ${membership.firstname} ${membership.lastname} (automatisch aufgenommen)`;
                emailBody = `
NEUES MITGLIED (AUTOMATISCH AUFGENOMMEN)
========================================

${membership.firstname} ${membership.lastname} ist Mitglied der Feuerwehr Raurica
und wurde automatisch als Aktivmitglied aufgenommen.

Persönliche Daten:
- Name: ${membership.firstname} ${membership.lastname}
- Strasse: ${membership.street}
- Ort: ${membership.city}
- Telefon: ${membership.phone}
- Mobile: ${membership.mobile || '-'}
- E-Mail: ${membership.email}

Feuerwehr-Status: Aktives Feuerwehr-Mitglied
Korrespondenz: ${membership.correspondenceMethod}

Das Mitglied wurde der Datenbank hinzugefügt.
                `.trim();

                // Bestätigung an neues Mitglied
                await transporter.sendMail({
                    from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`,
                    to: membership.email,
                    subject: 'Willkommen beim Feuerwehrverein Raura!',
                    text: `
Liebe/r ${membership.firstname} ${membership.lastname},

Herzlich willkommen beim Feuerwehrverein Raura!

Als aktives Mitglied der Feuerwehr Raurica wurden Sie automatisch als Aktivmitglied aufgenommen.

Wir freuen uns auf Ihre Teilnahme an unseren Vereinsaktivitäten!

Mit freundlichen Grüssen
Feuerwehrverein Raura
                    `.trim()
                });
            } else {
                // Normale Registrierung - muss vom Aktuar bestätigt werden
                emailSubject = `Neuer Mitgliedschaftsantrag: ${membership.firstname} ${membership.lastname} (zu prüfen)`;
                emailBody = `
NEUER MITGLIEDSCHAFTSANTRAG (ZU PRÜFEN)
=======================================

${membership.firstname} ${membership.lastname} möchte Mitglied werden.

Persönliche Daten:
- Name: ${membership.firstname} ${membership.lastname}
- Strasse: ${membership.street}
- Ort: ${membership.city}
- Telefon: ${membership.phone}
- Mobile: ${membership.mobile || '-'}
- E-Mail: ${membership.email}

Feuerwehr-Status: ${membership.firefighterStatus === 'former' ? 'Ehemaliges Feuerwehr-Mitglied' : 'Kein Feuerwehr-Mitglied'}
Korrespondenz: ${membership.correspondenceMethod}

Der Antrag muss im Vorstand-Bereich geprüft und genehmigt werden:
https://fwv-raura.ch/vorstand.html
                `.trim();

                // Bestätigung an Antragsteller
                await transporter.sendMail({
                    from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`,
                    to: membership.email,
                    subject: 'Bestätigung Ihres Mitgliedschaftsantrags - FWV Raura',
                    text: `
Guten Tag ${membership.firstname} ${membership.lastname},

Vielen Dank für Ihren Mitgliedschaftsantrag beim Feuerwehrverein Raura!

Wir haben Ihren Antrag erhalten. Da Sie kein aktives Mitglied der Feuerwehr Raurica sind,
wird Ihr Antrag vom Vorstand geprüft und Sie werden über das Ergebnis informiert.

Mit freundlichen Grüssen
Feuerwehrverein Raura
                    `.trim()
                });
            }

            // E-Mail an Vorstand
            await transporter.sendMail({
                from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`,
                to: process.env.VORSTAND_EMAIL || 'vorstand@fwv-raura.ch',
                replyTo: membership.email,
                subject: emailSubject,
                text: emailBody
            });

        } else {
            // Allgemeines Kontaktformular
            emailSubject = `Kontaktanfrage: ${subject}`;
            emailBody = `
NEUE KONTAKTANFRAGE
===================

Von: ${name} <${email}>
Betreff: ${subject}

Nachricht:
${message}
            `.trim();

            // Bestätigung an Absender
            await transporter.sendMail({
                from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`,
                to: email,
                subject: 'Bestätigung Ihrer Anfrage - FWV Raura',
                text: `
Guten Tag ${name},

Vielen Dank für Ihre Nachricht!

Wir haben Ihre Anfrage erhalten und werden uns baldmöglichst bei Ihnen melden.

Mit freundlichen Grüssen
Feuerwehrverein Raura
                `.trim()
            });

            // E-Mail an Vorstand
            await transporter.sendMail({
                from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`,
                to: process.env.CONTACT_EMAIL || 'kontakt@fwv-raura.ch',
                replyTo: email,
                subject: emailSubject,
                text: emailBody
            });
        }

        // Log
        await pool.query(`
            INSERT INTO dispatch_log (type, recipient_email, subject, body, status, sent_at)
            VALUES ('contact', $1, $2, $3, 'sent', NOW())
        `, [email, emailSubject, emailBody]);

        res.json({ success: true, message: 'Nachricht gesendet' });
    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// MEMBER REGISTRATIONS (Mitglieder-Anträge)
// ============================================

// Anzahl der ausstehenden Registrierungen
app.get('/member-registrations/count/pending', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT COUNT(*) as count FROM member_registrations WHERE status = 'pending'`
        );
        res.json({ count: parseInt(result.rows[0].count) });
    } catch (error) {
        console.error('Error counting pending registrations:', error);
        res.status(500).json({ error: error.message });
    }
});

// Alle Registrierungen abrufen
app.get('/member-registrations', async (req, res) => {
    try {
        const { status } = req.query;
        let query = `
            SELECT id, vorname, nachname, strasse, plz, ort, telefon, mobile, email,
                   feuerwehr_status, korrespondenz_methode, korrespondenz_adresse,
                   status, member_id, processed_at, processed_by, created_at
            FROM member_registrations
        `;
        const params = [];

        if (status) {
            query += ` WHERE status = $1`;
            params.push(status);
        }

        query += ` ORDER BY created_at DESC`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching registrations:', error);
        res.status(500).json({ error: error.message });
    }
});

// Einzelne Registrierung abrufen
app.get('/member-registrations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT id, vorname, nachname, strasse, plz, ort, telefon, mobile, email,
                    feuerwehr_status, korrespondenz_methode, korrespondenz_adresse,
                    status, member_id, processed_at, processed_by, created_at
             FROM member_registrations WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Registrierung nicht gefunden' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching registration:', error);
        res.status(500).json({ error: error.message });
    }
});

// Registrierung genehmigen
app.post('/member-registrations/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const { processed_by = 'vorstand' } = req.body;

        // Registrierung abrufen
        const regResult = await pool.query(
            `SELECT * FROM member_registrations WHERE id = $1 AND status = 'pending'`,
            [id]
        );

        if (regResult.rows.length === 0) {
            return res.status(404).json({ error: 'Registrierung nicht gefunden oder bereits bearbeitet' });
        }

        const reg = regResult.rows[0];

        // Mitglied erstellen
        const memberResult = await pool.query(`
            INSERT INTO members
            (vorname, nachname, strasse, plz, ort, telefon, mobile, email,
             status, feuerwehr_zugehoerigkeit, zustellung_email, zustellung_post, eintrittsdatum)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Aktivmitglied',
                    CASE WHEN $9 = 'Ja (aktiv)' THEN 'feuerwehr_raurica' ELSE 'keine' END,
                    $10, $11, NOW())
            RETURNING id
        `, [
            reg.vorname,
            reg.nachname,
            reg.strasse,
            reg.plz,
            reg.ort,
            reg.telefon,
            reg.mobile,
            reg.email,
            reg.feuerwehr_status,
            reg.korrespondenz_methode === 'email',
            reg.korrespondenz_methode === 'post'
        ]);

        const memberId = memberResult.rows[0].id;

        // Registrierung aktualisieren
        await pool.query(`
            UPDATE member_registrations
            SET status = 'approved', member_id = $1, processed_at = NOW(), processed_by = $2
            WHERE id = $3
        `, [memberId, processed_by, id]);

        // Bestätigungs-E-Mail senden
        await transporter.sendMail({
            from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`,
            to: reg.email,
            subject: 'Willkommen beim Feuerwehrverein Raura!',
            text: `
Liebe/r ${reg.vorname} ${reg.nachname},

Herzlich willkommen beim Feuerwehrverein Raura!

Ihr Mitgliedschaftsantrag wurde genehmigt. Wir freuen uns, Sie als neues Mitglied begrüssen zu dürfen.

Für Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüssen
Feuerwehrverein Raura
            `.trim()
        });

        res.json({ success: true, memberId });
    } catch (error) {
        console.error('Error approving registration:', error);
        res.status(500).json({ error: error.message });
    }
});

// Registrierung ablehnen
app.post('/member-registrations/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        const { processed_by = 'vorstand', reason = '' } = req.body;

        // Registrierung abrufen
        const regResult = await pool.query(
            `SELECT * FROM member_registrations WHERE id = $1 AND status = 'pending'`,
            [id]
        );

        if (regResult.rows.length === 0) {
            return res.status(404).json({ error: 'Registrierung nicht gefunden oder bereits bearbeitet' });
        }

        const reg = regResult.rows[0];

        // Registrierung aktualisieren
        await pool.query(`
            UPDATE member_registrations
            SET status = 'rejected', processed_at = NOW(), processed_by = $1
            WHERE id = $2
        `, [processed_by, id]);

        // Ablehnungs-E-Mail senden (optional)
        if (reg.email) {
            await transporter.sendMail({
                from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`,
                to: reg.email,
                subject: 'Ihr Mitgliedschaftsantrag beim Feuerwehrverein Raura',
                text: `
Liebe/r ${reg.vorname} ${reg.nachname},

Vielen Dank für Ihr Interesse am Feuerwehrverein Raura.

Leider können wir Ihren Mitgliedschaftsantrag zum jetzigen Zeitpunkt nicht annehmen.
${reason ? `Grund: ${reason}` : ''}

Für Rückfragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüssen
Feuerwehrverein Raura
                `.trim()
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error rejecting registration:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// NEWSLETTER (ersetzt n8n)
// ============================================

app.post('/newsletter/subscribe', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email || !email.includes('@')) {
            return res.status(400).json({ success: false, message: 'Ungültige E-Mail-Adresse' });
        }

        // Prüfen ob bereits angemeldet
        const existing = await pool.query(
            'SELECT * FROM newsletter_subscribers WHERE email = $1',
            [email]
        );

        if (existing.rows.length > 0) {
            if (existing.rows[0].confirmed) {
                return res.json({ success: true, message: 'Sie sind bereits angemeldet' });
            }
        } else {
            // Neuer Subscriber
            const token = require('crypto').randomBytes(32).toString('hex');
            await pool.query(`
                INSERT INTO newsletter_subscribers (email, token, confirmed, created_at)
                VALUES ($1, $2, false, NOW())
            `, [email, token]);
        }

        // Bestätigungs-E-Mail senden
        const confirmUrl = `${process.env.WEBSITE_URL || 'https://fwv-raura.ch'}/newsletter-confirm?token=${existing.rows[0]?.token || token}`;

        await transporter.sendMail({
            from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`,
            to: email,
            subject: 'Newsletter-Anmeldung bestätigen - FWV Raura',
            text: `
Guten Tag,

Bitte bestätigen Sie Ihre Newsletter-Anmeldung durch Klick auf folgenden Link:

${confirmUrl}

Falls Sie sich nicht angemeldet haben, können Sie diese E-Mail ignorieren.

Mit freundlichen Grüssen
Feuerwehrverein Raura
            `.trim()
        });

        res.json({ success: true, message: 'Bestätigungs-E-Mail gesendet' });
    } catch (error) {
        console.error('Newsletter subscribe error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/newsletter/confirm', async (req, res) => {
    try {
        const { token } = req.query;

        const result = await pool.query(
            'UPDATE newsletter_subscribers SET confirmed = true, confirmed_at = NOW() WHERE token = $1 RETURNING email',
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Ungültiger Token' });
        }

        res.json({ success: true, message: 'Newsletter-Anmeldung bestätigt', email: result.rows[0].email });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/newsletter/unsubscribe', async (req, res) => {
    try {
        const { email, token } = req.body;

        let query = 'DELETE FROM newsletter_subscribers WHERE ';
        let params = [];

        if (token) {
            query += 'token = $1';
            params = [token];
        } else if (email) {
            query += 'email = $1';
            params = [email];
        } else {
            return res.status(400).json({ success: false, message: 'E-Mail oder Token erforderlich' });
        }

        await pool.query(query, params);
        res.json({ success: true, message: 'Erfolgreich abgemeldet' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// MAILCOW MANAGEMENT
// ============================================

const MAILCOW_API_URL = process.env.MAILCOW_API_URL || 'https://mail.test.juroct.net';
const MAILCOW_API_KEY = process.env.MAILCOW_API_KEY;
const MAILCOW_DOMAIN = 'fwv-raura.ch';

// Helper für Mailcow API Aufrufe
async function mailcowApi(method, endpoint, data = null) {
    const config = {
        method,
        url: `${MAILCOW_API_URL}/api/v1${endpoint}`,
        headers: {
            'X-API-Key': MAILCOW_API_KEY,
            'Content-Type': 'application/json'
        }
    };
    if (data) config.data = data;
    return axios(config);
}

// Alle Mailboxen abrufen
app.get('/mailcow/mailboxes', async (req, res) => {
    try {
        const response = await mailcowApi('GET', '/get/mailbox/all');
        // Filter by domain since domain-specific endpoint returns empty
        const mailboxes = Array.isArray(response.data)
            ? response.data.filter(mb => mb.domain === MAILCOW_DOMAIN)
            : [];
        res.json(mailboxes);
    } catch (error) {
        console.error('Mailcow error:', error.response?.data || error.message);
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// Einzelne Mailbox abrufen
app.get('/mailcow/mailboxes/:email', async (req, res) => {
    try {
        const response = await mailcowApi('GET', `/get/mailbox/${req.params.email}`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// Mailbox erstellen
app.post('/mailcow/mailboxes', async (req, res) => {
    try {
        const { local_part, name, password, quota = 1024, active = 1 } = req.body;

        const response = await mailcowApi('POST', '/add/mailbox', {
            local_part,
            domain: MAILCOW_DOMAIN,
            name,
            password,
            password2: password,
            quota,
            active,
            force_pw_update: 0,
            tls_enforce_in: 0,
            tls_enforce_out: 0
        });

        res.json(response.data);
    } catch (error) {
        console.error('Mailcow create error:', error.response?.data || error.message);
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// Mailbox aktualisieren
app.put('/mailcow/mailboxes/:email', async (req, res) => {
    try {
        const { name, quota, active, password } = req.body;
        const updateData = {
            attr: {}
        };

        if (name !== undefined) updateData.attr.name = name;
        if (quota !== undefined) updateData.attr.quota = quota;
        if (active !== undefined) updateData.attr.active = active;
        if (password) {
            updateData.attr.password = password;
            updateData.attr.password2 = password;
        }

        updateData.items = [req.params.email];

        const response = await mailcowApi('POST', '/edit/mailbox', updateData);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// Mailbox löschen
app.delete('/mailcow/mailboxes/:email', async (req, res) => {
    try {
        const response = await mailcowApi('POST', '/delete/mailbox', [req.params.email]);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// Alle Aliase abrufen
app.get('/mailcow/aliases', async (req, res) => {
    try {
        const response = await mailcowApi('GET', '/get/alias/all');
        // Filter by domain since domain-specific endpoint returns empty
        const aliases = Array.isArray(response.data)
            ? response.data.filter(a => a.domain === MAILCOW_DOMAIN || a.address?.endsWith(`@${MAILCOW_DOMAIN}`))
            : [];
        res.json(aliases);
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// Alias erstellen
app.post('/mailcow/aliases', async (req, res) => {
    try {
        const { address, goto, active = 1 } = req.body;

        // address kann mit oder ohne Domain sein
        const fullAddress = address.includes('@') ? address : `${address}@${MAILCOW_DOMAIN}`;

        const response = await mailcowApi('POST', '/add/alias', {
            address: fullAddress,
            goto: goto, // Kann mehrere E-Mails mit Komma getrennt sein
            active
        });

        res.json(response.data);
    } catch (error) {
        console.error('Mailcow alias error:', error.response?.data || error.message);
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// Alias aktualisieren
app.put('/mailcow/aliases/:id', async (req, res) => {
    try {
        const { goto, active } = req.body;
        const updateData = {
            attr: {},
            items: [req.params.id]
        };

        if (goto !== undefined) updateData.attr.goto = goto;
        if (active !== undefined) updateData.attr.active = active;

        const response = await mailcowApi('POST', '/edit/alias', updateData);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// Alias löschen
app.delete('/mailcow/aliases/:id', async (req, res) => {
    try {
        const response = await mailcowApi('POST', '/delete/alias', [req.params.id]);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// Domain-Informationen
app.get('/mailcow/domain', async (req, res) => {
    try {
        const response = await mailcowApi('GET', `/get/domain/${MAILCOW_DOMAIN}`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// Quota-Nutzung aller Mailboxen
app.get('/mailcow/quota', async (req, res) => {
    try {
        const response = await mailcowApi('GET', '/get/mailbox/all');
        const mailboxes = Array.isArray(response.data)
            ? response.data.filter(mb => mb.domain === MAILCOW_DOMAIN)
            : [];
        const quotaInfo = mailboxes.map(mb => ({
            email: mb.username,
            name: mb.name,
            quota: mb.quota,
            quota_used: mb.quota_used,
            percent_used: mb.quota > 0 ? Math.round((mb.quota_used / mb.quota) * 100) : 0
        }));
        res.json(quotaInfo);
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// ============================================
// ARBEITSPLAN PDF GENERATION
// ============================================

app.post('/arbeitsplan/pdf', async (req, res) => {
    try {
        const { event, logoBase64 } = req.body;

        if (!event || !event.shifts || event.shifts.length === 0) {
            return res.status(400).json({ error: 'Event mit Schichten erforderlich' });
        }

        // Generate HTML matching the PDF template exactly
        const html = generateArbeitsplanHTML(event, logoBase64);

        // Convert HTML to PDF using Puppeteer
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20mm', bottom: '15mm', left: '15mm', right: '15mm' }
        });
        await browser.close();

        // Optional: Upload to Nextcloud
        const filename = `Arbeitsplan ${event.title} ${new Date().getFullYear()}.pdf`;
        await uploadToNextcloud(filename, pdfBuffer, '/Arbeitspläne').catch(() => {});

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': pdfBuffer.length
        });
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Arbeitsplan PDF error:', error);
        res.status(500).json({ error: error.message });
    }
});

function generateArbeitsplanHTML(event, logoBase64) {
    const shifts = event.shifts || [];

    // Group shifts by date
    const shiftsByDate = {};
    shifts.forEach(shift => {
        const date = shift.date;
        if (!shiftsByDate[date]) {
            shiftsByDate[date] = [];
        }
        shiftsByDate[date].push(shift);
    });

    // Sort dates
    const sortedDates = Object.keys(shiftsByDate).sort();

    // Get unique Bereiche (columns)
    const allBereiche = [...new Set(shifts.map(s => s.bereich || 'Allgemein'))].sort();

    // Format date like "Samstag, 01.03.2025"
    function formatDate(dateStr) {
        const date = new Date(dateStr + 'T12:00:00');
        const weekdays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${weekdays[date.getDay()]}, ${day}.${month}.${year}`;
    }

    // Format time like "18:00"
    function formatTime(timeStr) {
        if (!timeStr) return '';
        return timeStr.substring(0, 5);
    }

    // Check if shift is a special type (Aufbau, Abbauen, etc.)
    function isSpecialShift(shift) {
        const name = (shift.bereich || shift.name || '').toLowerCase();
        return name.includes('aufbau') || name.includes('abbau') || name.includes('kochen') || name.includes('schenkeli');
    }

    let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
    @page { margin: 0; }
    body {
        font-family: Arial, sans-serif;
        font-size: 11pt;
        line-height: 1.4;
        color: #000;
    }
    .header {
        display: flex;
        align-items: flex-start;
        margin-bottom: 30px;
    }
    .logo {
        width: 80px;
        margin-right: 20px;
    }
    .logo img {
        width: 80px;
        height: auto;
    }
    .title-section {
        flex: 1;
    }
    .org-name {
        font-size: 14pt;
        font-weight: bold;
        margin-bottom: 5px;
    }
    .arbeitsplan-title {
        font-size: 16pt;
        font-weight: bold;
        text-decoration: underline;
    }
    .date-section {
        margin-top: 25px;
        margin-bottom: 10px;
    }
    .date-header {
        font-weight: bold;
        text-decoration: underline;
        font-size: 11pt;
        margin-bottom: 5px;
    }
    .date-header-with-task {
        font-weight: bold;
        text-decoration: underline;
        font-size: 11pt;
        margin-bottom: 5px;
    }
    .special-names {
        margin-left: 0;
        font-size: 11pt;
    }
    table {
        border-collapse: collapse;
        width: 100%;
        margin-top: 5px;
        font-size: 10pt;
    }
    th {
        border: 1px solid #000;
        padding: 5px 8px;
        text-align: left;
        font-weight: bold;
        background: #fff;
    }
    td {
        border: 1px solid #000;
        padding: 5px 8px;
        vertical-align: top;
    }
    .time-cell {
        white-space: nowrap;
        width: 90px;
    }
    .name-entry {
        margin: 0;
    }
    .springer {
        font-weight: bold;
        margin-top: 15px;
    }
    .note {
        margin-top: 10px;
        font-style: normal;
        font-size: 10pt;
    }
</style>
</head>
<body>

<div class="header">`;

    // Add logo if provided
    if (logoBase64) {
        html += `<div class="logo"><img src="data:image/png;base64,${logoBase64}" alt="Logo"></div>`;
    }

    html += `
    <div class="title-section">
        <div class="org-name">Feuerwehrverein Raura, Kaiseraugst</div>
        <div class="arbeitsplan-title">Arbeitsplan ${event.title}</div>
    </div>
</div>`;

    // Process each date
    sortedDates.forEach(date => {
        const dayShifts = shiftsByDate[date];
        const formattedDate = formatDate(date);

        // Separate special shifts from regular shifts
        const specialShifts = dayShifts.filter(s => isSpecialShift(s));
        const regularShifts = dayShifts.filter(s => !isSpecialShift(s));

        // Group regular shifts by time slot
        const timeSlots = {};
        regularShifts.forEach(shift => {
            const timeKey = `${shift.start_time}-${shift.end_time}`;
            if (!timeSlots[timeKey]) {
                timeSlots[timeKey] = {
                    start_time: shift.start_time,
                    end_time: shift.end_time,
                    bereiche: {}
                };
            }
            const bereich = shift.bereich || 'Allgemein';
            // Support both old format (assignments) and new format (registrations.approved)
            let assignments = shift.assignments || [];
            if (assignments.length === 0 && shift.registrations?.approved) {
                assignments = shift.registrations.approved.map(r => ({
                    member_name: r.name || r.member_name || 'Unbekannt'
                }));
            }
            timeSlots[timeKey].bereiche[bereich] = {
                needed: shift.needed || shift.max_helpers || 1,
                assignments: assignments
            };
        });

        // Render special shifts (Aufbau, Abbauen, Kochen) without table
        specialShifts.forEach(shift => {
            const taskName = shift.bereich || shift.name || '';
            const startTime = formatTime(shift.start_time);
            const timeInfo = startTime ? ` ab ${startTime} Uhr` : '';

            html += `
<div class="date-section">
    <div class="date-header-with-task">${formattedDate} ${taskName}${timeInfo}</div>
    <div class="special-names">`;

            // Support both old format (assignments) and new format (registrations.approved)
            let shiftAssignments = shift.assignments || [];
            if (shiftAssignments.length === 0 && shift.registrations?.approved) {
                shiftAssignments = shift.registrations.approved;
            }
            const names = shiftAssignments.map(a => a.member_name || a.name || 'Unbekannt');
            if (names.length > 0) {
                html += `- ${names.join(', ')}`;
            }

            html += `</div>
</div>`;
        });

        // Render regular shifts in table format
        if (Object.keys(timeSlots).length > 0) {
            // Get Bereiche for this day
            const dayBereiche = [...new Set(regularShifts.map(s => s.bereich || 'Allgemein'))].sort();

            // Check if it's a simple 2-column layout (Bar/Küche combined) or full table
            const sortedTimeSlots = Object.entries(timeSlots).sort(([a], [b]) => a.localeCompare(b));

            html += `
<div class="date-section">
    <table>
        <thead>
            <tr>
                <th class="time-cell">${formattedDate.split(',')[0]},${formattedDate.split(',')[1]}</th>`;

            dayBereiche.forEach(bereich => {
                html += `<th>${bereich}</th>`;
            });

            html += `
            </tr>
        </thead>
        <tbody>`;

            sortedTimeSlots.forEach(([timeKey, slot]) => {
                const startTime = formatTime(slot.start_time);
                const endTime = formatTime(slot.end_time);
                const endDisplay = endTime || '';

                html += `
            <tr>
                <td class="time-cell">${startTime}-${endDisplay}</td>`;

                dayBereiche.forEach(bereich => {
                    const data = slot.bereiche[bereich];
                    html += '<td>';

                    if (data) {
                        const assignments = data.assignments || [];
                        const needed = data.needed || 1;

                        if (assignments.length > 0) {
                            assignments.forEach(a => {
                                html += `<div class="name-entry">-${a.member_name || a.name || 'Unbekannt'}</div>`;
                            });
                            // Fill remaining slots with dashes
                            for (let i = assignments.length; i < needed; i++) {
                                html += '<div class="name-entry">-</div>';
                            }
                        } else {
                            for (let i = 0; i < needed; i++) {
                                html += '<div class="name-entry">-</div>';
                            }
                        }
                    } else {
                        html += '-';
                    }

                    html += '</td>';
                });

                html += '</tr>';
            });

            html += `
        </tbody>
    </table>
</div>`;
        }
    });

    // Add Springer if available in event data
    if (event.springer) {
        html += `
<div class="springer">Springer: ${event.springer}</div>`;
    }

    // Add notes if available
    if (event.notes) {
        html += `
<div class="note">${event.notes}</div>`;
    }

    html += `
</body>
</html>`;

    return html;
}

// ============================================
// DISPATCH LOG
// ============================================

app.get('/dispatch-log', async (req, res) => {
    try {
        const { type, status, member_id, event_id, limit = 100 } = req.query;
        let query = 'SELECT * FROM dispatch_log WHERE 1=1';
        const params = [];

        if (type) {
            params.push(type);
            query += ` AND type = $${params.length}`;
        }
        if (status) {
            params.push(status);
            query += ` AND status = $${params.length}`;
        }
        if (member_id) {
            params.push(member_id);
            query += ` AND member_id = $${params.length}`;
        }
        if (event_id) {
            params.push(event_id);
            query += ` AND event_id = $${params.length}`;
        }

        params.push(parseInt(limit));
        query += ` ORDER BY created_at DESC LIMIT $${params.length}`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// PINGEN MANAGEMENT
// ============================================

// Alle Pingen-Briefe abrufen
app.get('/pingen/letters', async (req, res) => {
    try {
        const { event_id, member_id, limit = 50 } = req.query;
        let query = `
            SELECT dl.*, m.vorname, m.nachname, e.title as event_title
            FROM dispatch_log dl
            LEFT JOIN members m ON dl.member_id = m.id
            LEFT JOIN events e ON dl.event_id = e.id
            WHERE dl.type = 'pingen'
        `;
        const params = [];

        if (event_id) {
            params.push(event_id);
            query += ` AND dl.event_id = $${params.length}`;
        }
        if (member_id) {
            params.push(member_id);
            query += ` AND dl.member_id = $${params.length}`;
        }

        params.push(parseInt(limit));
        query += ` ORDER BY dl.created_at DESC LIMIT $${params.length}`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Pingen Brief-Status von API abrufen
app.get('/pingen/letters/:letterId/status', async (req, res) => {
    try {
        const { letterId } = req.params;
        const staging = req.query.staging === 'true';
        const PINGEN_API = getPingenApi(staging);

        // Token holen
        const tokenResponse = await axios.post(`${PINGEN_IDENTITY}/auth/access-tokens`, {
            grant_type: 'client_credentials',
            client_id: process.env.PINGEN_CLIENT_ID,
            client_secret: process.env.PINGEN_CLIENT_SECRET
        });

        const token = tokenResponse.data.access_token;

        // Brief-Status abrufen
        const letterResponse = await axios.get(
            `${PINGEN_API}/organisations/${process.env.PINGEN_ORGANISATION_ID}/letters/${letterId}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/vnd.api+json'
                }
            }
        );

        const letter = letterResponse.data.data;

        // Status in DB aktualisieren
        const statusMap = {
            'validating': 'processing',
            'valid': 'ready',
            'action_required': 'action_required',
            'in_progress': 'sending',
            'sent': 'sent',
            'cancelled': 'cancelled'
        };

        const newStatus = statusMap[letter.attributes?.status] || letter.attributes?.status;

        await pool.query(`
            UPDATE dispatch_log
            SET status = $1, updated_at = NOW()
            WHERE external_id = $2 AND type = 'pingen'
        `, [newStatus, letterId]);

        res.json({
            letterId,
            status: letter.attributes?.status,
            price: letter.attributes?.price,
            pages: letter.attributes?.page_count,
            sentAt: letter.attributes?.submitted_at,
            raw: letter
        });
    } catch (error) {
        console.error('Pingen status error:', error.response?.data || error.message);
        res.status(500).json({ error: error.message });
    }
});

// Pingen Guthaben/Info abrufen
app.get('/pingen/account', async (req, res) => {
    try {
        const staging = req.query.staging === 'true';
        const PINGEN_API = getPingenApi(staging);

        // Token holen
        const tokenResponse = await axios.post(`${PINGEN_IDENTITY}/auth/access-tokens`, {
            grant_type: 'client_credentials',
            client_id: process.env.PINGEN_CLIENT_ID,
            client_secret: process.env.PINGEN_CLIENT_SECRET
        });

        const token = tokenResponse.data.access_token;

        // Organisation Info abrufen
        const orgResponse = await axios.get(
            `${PINGEN_API}/organisations/${process.env.PINGEN_ORGANISATION_ID}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/vnd.api+json'
                }
            }
        );

        const org = orgResponse.data.data;

        res.json({
            name: org.attributes?.name,
            balance: org.attributes?.billing_balance,
            currency: org.attributes?.billing_currency || 'CHF',
            isStaging: staging
        });
    } catch (error) {
        console.error('Pingen account error:', error.response?.data || error.message);
        res.status(500).json({ error: error.message });
    }
});

// Pingen Statistiken
app.get('/pingen/stats', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'sent') as sent,
                COUNT(*) FILTER (WHERE status IN ('processing', 'ready', 'sending')) as pending,
                COUNT(*) FILTER (WHERE status = 'failed') as failed,
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as last_30_days,
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7_days
            FROM dispatch_log
            WHERE type = 'pingen'
        `);

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mitglieder mit Post-Zustellung abrufen
app.get('/pingen/post-members', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, vorname, nachname, strasse, adresszusatz, plz, ort, email
            FROM members
            WHERE zustellung_post = true
              AND strasse IS NOT NULL AND strasse != ''
              AND plz IS NOT NULL AND plz != ''
              AND ort IS NOT NULL AND ort != ''
            ORDER BY nachname, vorname
        `);

        res.json({
            count: result.rows.length,
            members: result.rows.map(m => ({
                id: m.id,
                name: `${m.vorname} ${m.nachname}`,
                address: `${m.strasse}${m.adresszusatz ? ', ' + m.adresszusatz : ''}, ${m.plz} ${m.ort}`,
                email: m.email,
                strasse: m.strasse,
                plz: m.plz,
                ort: m.ort
            }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Massen-PDF an alle Post-Empfänger senden
app.post('/pingen/send-bulk-pdf', async (req, res) => {
    try {
        const { pdf_base64, subject, member_ids, staging = false, use_cover_page = false } = req.body;
        const PINGEN_API = getPingenApi(staging);

        if (!pdf_base64) {
            return res.status(400).json({ error: 'PDF-Datei erforderlich' });
        }

        // Mitglieder laden
        let members;
        if (member_ids && member_ids.length > 0) {
            // Spezifische Mitglieder
            const result = await pool.query(`
                SELECT id, vorname, nachname, strasse, adresszusatz, plz, ort
                FROM members
                WHERE id = ANY($1)
                  AND strasse IS NOT NULL AND strasse != ''
                  AND plz IS NOT NULL AND plz != ''
                  AND ort IS NOT NULL AND ort != ''
            `, [member_ids]);
            members = result.rows;
        } else {
            // Alle mit Post-Zustellung
            const result = await pool.query(`
                SELECT id, vorname, nachname, strasse, adresszusatz, plz, ort
                FROM members
                WHERE zustellung_post = true
                  AND strasse IS NOT NULL AND strasse != ''
                  AND plz IS NOT NULL AND plz != ''
                  AND ort IS NOT NULL AND ort != ''
            `);
            members = result.rows;
        }

        if (members.length === 0) {
            return res.status(400).json({ error: 'Keine Empfänger mit gültiger Adresse gefunden' });
        }

        // Token holen
        const tokenResponse = await axios.post(`${PINGEN_IDENTITY}/auth/access-tokens`, {
            grant_type: 'client_credentials',
            client_id: process.env.PINGEN_CLIENT_ID,
            client_secret: process.env.PINGEN_CLIENT_SECRET
        });
        const token = tokenResponse.data.access_token;

        // An jeden Empfänger senden (parallel in Batches von 5)
        const results = { success: [], failed: [] };
        const filename = subject ? `${subject.replace(/[^a-zA-Z0-9äöüÄÖÜ]/g, '_')}.pdf` : 'Rundschreiben.pdf';
        const originalPdfBuffer = Buffer.from(pdf_base64, 'base64');

        // Helper function to process a single member
        const processMember = async (member) => {
            try {
                // Step 1: Get file upload URL
                const uploadUrlResponse = await axios.get(
                    `${PINGEN_API}/file-upload`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/vnd.api+json'
                        }
                    }
                );

                const fileUrl = uploadUrlResponse.data.data.attributes.url;
                const fileUrlSignature = uploadUrlResponse.data.data.attributes.url_signature;

                // Step 2: Prepare PDF (embed address or use original depending on use_cover_page)
                const parsedAddress = parseStreetAndNumber(member.strasse);
                const recipientAddress = formatAddressForCoverPage(
                    `${member.vorname} ${member.nachname}`,
                    parsedAddress.street,
                    parsedAddress.number,
                    member.plz,
                    member.ort
                );

                let pdfToUpload;
                let detectedCountry = 'CH'; // Default
                if (use_cover_page) {
                    pdfToUpload = originalPdfBuffer;
                    detectedCountry = detectCountryFromAddress(recipientAddress);
                } else {
                    const senderAddressLine = `${SENDER_ADDRESS.name}, ${SENDER_ADDRESS.zip} ${SENDER_ADDRESS.city}`;
                    const result = await addAddressToPdf(originalPdfBuffer, recipientAddress, senderAddressLine);
                    pdfToUpload = Buffer.from(result.pdfBytes);
                    detectedCountry = result.country;
                }

                // Step 3: Upload PDF to the pre-signed URL
                await axios.put(fileUrl, pdfToUpload, {
                    headers: { 'Content-Type': 'application/pdf' }
                });

                // Step 4: Create letter with file reference
                const uploadResponse = await axios.post(
                    `${PINGEN_API}/organisations/${getPingenOrgId(staging)}/letters`,
                    {
                        data: {
                            type: 'letters',
                            attributes: {
                                file_original_name: filename,
                                file_url: fileUrl,
                                file_url_signature: fileUrlSignature,
                                address_position: detectedCountry === 'DE' ? 'left' : 'right',
                                auto_send: !use_cover_page,
                                delivery_product: 'cheap',
                                print_mode: 'simplex',
                                print_spectrum: 'grayscale',
                                meta_data: {
                                    recipient: buildPingenAddress({
                                        name: `${member.vorname} ${member.nachname}`,
                                        street: parsedAddress.street,
                                        number: parsedAddress.number,
                                        zip: member.plz,
                                        city: member.ort,
                                        country: detectedCountry
                                    }),
                                    sender: buildPingenAddress(SENDER_ADDRESS)
                                }
                            }
                        }
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/vnd.api+json'
                        }
                    }
                );

                const letterId = uploadResponse.data.data?.id;
                console.log(`Letter ${letterId} uploaded for ${member.vorname} ${member.nachname}`);

                // Log speichern (don't wait for validation - too slow for bulk)
                await pool.query(`
                    INSERT INTO dispatch_log (type, member_id, recipient_address, subject, status, external_id, sent_at)
                    VALUES ('pingen', $1, $2, $3, 'sent', $4, NOW())
                `, [
                    member.id,
                    JSON.stringify({
                        name: `${member.vorname} ${member.nachname}`,
                        street: member.strasse,
                        zip: member.plz,
                        city: member.ort
                    }),
                    subject || 'Rundschreiben',
                    letterId
                ]);

                return { success: true, name: `${member.vorname} ${member.nachname}`, letterId };
            } catch (err) {
                console.error(`Pingen send error for ${member.vorname} ${member.nachname}:`, err.response?.data || err.message);
                return { success: false, name: `${member.vorname} ${member.nachname}`, error: err.response?.data?.errors?.[0]?.detail || err.message };
            }
        };

        // Process members in parallel batches of 5
        const BATCH_SIZE = 5;
        for (let i = 0; i < members.length; i += BATCH_SIZE) {
            const batch = members.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.all(batch.map(processMember));

            for (const result of batchResults) {
                if (result.success) {
                    results.success.push({ name: result.name, letterId: result.letterId });
                } else {
                    results.failed.push({ name: result.name, error: result.error });
                }
            }
            console.log(`Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(members.length / BATCH_SIZE)}`);
        }

        // Send summary notification to Kassier for bulk send
        if (results.success.length > 0) {
            sendPingenBulkCostNotification(results.success.length, results.success, staging).catch(err => {
                logError('Failed to send Pingen bulk cost notification', { error: err.message });
            });
        }

        res.json({
            totalRecipients: members.length,
            successCount: results.success.length,
            failedCount: results.failed.length,
            success: results.success,
            failed: results.failed,
            staging
        });
    } catch (error) {
        console.error('Bulk PDF send error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Brief manuell senden
app.post('/pingen/send-manual', async (req, res) => {
    try {
        const { member_id, event_id, subject, body, staging = false, use_cover_page = false } = req.body;

        // Mitglied-Adresse laden
        const memberResult = await pool.query(
            'SELECT * FROM members WHERE id = $1',
            [member_id]
        );

        if (memberResult.rows.length === 0) {
            return res.status(404).json({ error: 'Mitglied nicht gefunden' });
        }

        const member = memberResult.rows[0];

        if (!member.strasse || !member.plz || !member.ort) {
            return res.status(400).json({ error: 'Mitglied hat keine vollständige Adresse' });
        }

        // HTML für Brief generieren
        const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.6; }
        .header { margin-bottom: 40px; }
        .address { margin-bottom: 40px; }
        .content { margin-top: 20px; }
        .signature { margin-top: 40px; }
    </style>
</head>
<body>
    <div class="header">
        <strong>Feuerwehrverein Raura</strong><br>
        4303 Kaiseraugst
    </div>

    <div class="address">
        ${member.vorname} ${member.nachname}<br>
        ${member.strasse}<br>
        ${member.adresszusatz ? member.adresszusatz + '<br>' : ''}
        ${member.plz} ${member.ort}
    </div>

    <div class="date">
        Kaiseraugst, ${new Date().toLocaleDateString('de-CH')}
    </div>

    <div class="subject" style="margin-top: 30px; font-weight: bold;">
        ${subject}
    </div>

    <div class="content">
        <p>Guten Tag ${member.vorname} ${member.nachname}</p>
        ${body.split('\n').map(p => `<p>${p}</p>`).join('')}
    </div>

    <div class="signature">
        Mit freundlichen Grüssen<br><br>
        Feuerwehrverein Raura
    </div>
</body>
</html>`;

        // An Pingen senden
        const pingenResult = await sendToPingen(html, member, member_id, event_id, staging, use_cover_page);

        res.json({
            success: true,
            letterId: pingenResult.letterId,
            recipient: `${member.vorname} ${member.nachname}`,
            staging
        });
    } catch (error) {
        console.error('Manual Pingen send error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Arbeitsplan per Post senden
app.post('/pingen/send-arbeitsplan', async (req, res) => {
    try {
        const { event_id, member_id, pdf_base64, staging = false, use_cover_page = false } = req.body;
        const PINGEN_API = getPingenApi(staging);

        // Mitglied-Adresse laden
        const memberResult = await pool.query(
            'SELECT * FROM members WHERE id = $1',
            [member_id]
        );

        if (memberResult.rows.length === 0) {
            return res.status(404).json({ error: 'Mitglied nicht gefunden' });
        }

        const member = memberResult.rows[0];

        if (!member.strasse || !member.plz || !member.ort) {
            return res.status(400).json({ error: 'Mitglied hat keine vollständige Adresse' });
        }

        // Event-Titel laden
        let eventTitle = 'Arbeitsplan';
        if (event_id) {
            const eventResult = await pool.query('SELECT title FROM events WHERE id = $1', [event_id]);
            if (eventResult.rows.length > 0) {
                eventTitle = `Arbeitsplan ${eventResult.rows[0].title}`;
            }
        }

        // Token holen
        const tokenResponse = await axios.post(`${PINGEN_IDENTITY}/auth/access-tokens`, {
            grant_type: 'client_credentials',
            client_id: process.env.PINGEN_CLIENT_ID,
            client_secret: process.env.PINGEN_CLIENT_SECRET
        });

        const token = tokenResponse.data.access_token;

        // Step 1: Get file upload URL
        const uploadUrlResponse = await axios.get(
            `${PINGEN_API}/file-upload`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/vnd.api+json'
                }
            }
        );

        const fileUrl = uploadUrlResponse.data.data.attributes.url;
        const fileUrlSignature = uploadUrlResponse.data.data.attributes.url_signature;

        // Step 2: Prepare PDF (embed address or use original depending on use_cover_page)
        const parsedAddress = parseStreetAndNumber(member.strasse);
        const recipientAddressStr = formatAddressForCoverPage(
            `${member.vorname} ${member.nachname}`,
            parsedAddress.street,
            parsedAddress.number,
            member.plz,
            member.ort
        );

        const originalPdfBuffer = Buffer.from(pdf_base64, 'base64');
        let pdfBuffer;
        let detectedCountry = 'CH'; // Default
        if (use_cover_page) {
            pdfBuffer = originalPdfBuffer;
            detectedCountry = detectCountryFromAddress(recipientAddressStr);
        } else {
            const senderAddressLine = `${SENDER_ADDRESS.name}, ${SENDER_ADDRESS.zip} ${SENDER_ADDRESS.city}`;
            const result = await addAddressToPdf(originalPdfBuffer, recipientAddressStr, senderAddressLine);
            pdfBuffer = Buffer.from(result.pdfBytes);
            detectedCountry = result.country;
        }

        // Step 3: Upload PDF to the pre-signed URL
        await axios.put(fileUrl, pdfBuffer, {
            headers: {
                'Content-Type': 'application/pdf'
            }
        });

        // Step 4: Create letter with file reference
        // CH = rechts (Schweizer C5/6 Couvert), DE = links (DIN Standard)
        const uploadResponse = await axios.post(
            `${PINGEN_API}/organisations/${getPingenOrgId(staging)}/letters`,
            {
                data: {
                    type: 'letters',
                    attributes: {
                        file_original_name: `${eventTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
                        file_url: fileUrl,
                        file_url_signature: fileUrlSignature,
                        address_position: detectedCountry === 'DE' ? 'left' : 'right',
                        auto_send: !use_cover_page,  // auto_send wenn Adresse im PDF
                        delivery_product: 'cheap',
                        print_mode: 'simplex',
                        print_spectrum: 'grayscale',
                        meta_data: {
                            recipient: buildPingenAddress({
                                name: `${member.vorname} ${member.nachname}`,
                                street: parsedAddress.street,
                                number: parsedAddress.number,
                                zip: member.plz,
                                city: member.ort,
                                country: detectedCountry
                            }),
                            sender: buildPingenAddress(SENDER_ADDRESS)
                        }
                    }
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/vnd.api+json'
                }
            }
        );

        const letterId = uploadResponse.data.data?.id;

        // Step 5: Handle based on use_cover_page option
        if (use_cover_page) {
            // Wait for initial processing before creating cover page
            const processingResult = await waitForLetterProcessing(letterId, token, staging);
            if (!processingResult.ready) {
                return res.status(400).json({ error: 'Brief-Verarbeitung Timeout' });
            }

            // Create cover page with recipient address
            await axios.patch(
                `${PINGEN_API}/organisations/${getPingenOrgId(staging)}/letters/${letterId}/create-cover-page`,
                {
                    data: {
                        type: 'letters',
                        id: letterId,
                        attributes: {
                            address: recipientAddressStr,
                            country: 'CH'
                        }
                    }
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/vnd.api+json'
                    }
                }
            );

            // Wait for letter validation AFTER cover page is created
            const validationResult = await waitForLetterValidation(letterId, token, staging);
            if (!validationResult.success) {
                try {
                    await axios.delete(
                        `${PINGEN_API}/organisations/${getPingenOrgId(staging)}/letters/${letterId}`,
                        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/vnd.api+json' } }
                    );
                } catch (delErr) { /* ignore */ }
                return res.status(400).json({
                    error: `Brief-Validierung fehlgeschlagen: ${validationResult.reason}`
                });
            }

            // Send the letter
            await axios.patch(
                `${PINGEN_API}/organisations/${getPingenOrgId(staging)}/letters/${letterId}/send`,
                {
                    data: {
                        type: 'letters',
                        id: letterId,
                        attributes: {
                            delivery_product: 'cheap',
                            print_mode: 'simplex',
                            print_spectrum: 'grayscale'
                        }
                    }
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/vnd.api+json'
                    }
                }
            );
        } else {
            // Address is embedded in PDF, just wait for validation
            const validationResult = await waitForLetterValidation(letterId, token, staging);
            if (!validationResult.success) {
                try {
                    await axios.delete(
                        `${PINGEN_API}/organisations/${getPingenOrgId(staging)}/letters/${letterId}`,
                        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/vnd.api+json' } }
                    );
                } catch (delErr) { /* ignore */ }
                return res.status(400).json({
                    error: `Brief-Validierung fehlgeschlagen: ${validationResult.reason}`
                });
            }
        }

        // Step 6: Check status and delete if action required
        const statusCheck = await checkAndDeleteIfActionRequired(letterId, token, staging);

        if (statusCheck.deleted) {
            return res.status(400).json({
                success: false,
                error: 'Brief wurde von Pingen als "Aktion erforderlich" markiert und automatisch gelöscht'
            });
        }

        // Log
        await pool.query(`
            INSERT INTO dispatch_log (type, member_id, recipient_address, subject, status, external_id, event_id, sent_at)
            VALUES ('pingen', $1, $2, $3, 'sent', $4, $5, NOW())
        `, [
            member_id,
            JSON.stringify({
                name: `${member.vorname} ${member.nachname}`,
                street: member.strasse,
                zip: member.plz,
                city: member.ort
            }),
            eventTitle,
            letterId,
            event_id
        ]);

        res.json({
            success: true,
            letterId,
            recipient: `${member.vorname} ${member.nachname}`
        });
    } catch (error) {
        console.error('Arbeitsplan Pingen error:', error.response?.data || error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// PINGEN WEBHOOKS
// ============================================

// Webhook-Endpoint für Pingen Status-Updates
// Pingen sendet POST-Requests an diesen Endpoint wenn sich der Brief-Status ändert
app.post('/pingen/webhook', async (req, res) => {
    try {
        const { data, meta } = req.body;

        console.log('Pingen Webhook empfangen:', JSON.stringify(req.body));

        // Webhook-Typ prüfen
        // Pingen sendet verschiedene Events: letter.status_changed, letter.sent, etc.
        const event = req.body.event || meta?.event;
        const letterId = data?.id || data?.attributes?.letter_id;
        const newStatus = data?.attributes?.status;

        if (!letterId) {
            console.log('Webhook ohne Letter-ID empfangen');
            return res.status(200).json({ received: true });
        }

        // Status-Mapping
        const statusMap = {
            'validating': 'processing',
            'valid': 'ready',
            'action_required': 'action_required',
            'in_progress': 'sending',
            'sent': 'sent',
            'cancelled': 'cancelled',
            'failed': 'failed'
        };

        const mappedStatus = statusMap[newStatus] || newStatus;

        if (mappedStatus) {
            // Status in Datenbank aktualisieren
            const result = await pool.query(`
                UPDATE dispatch_log
                SET status = $1, updated_at = NOW()
                WHERE external_id = $2 AND type = 'pingen'
                RETURNING id
            `, [mappedStatus, letterId]);

            if (result.rows.length > 0) {
                console.log(`Pingen Brief ${letterId} Status aktualisiert: ${mappedStatus}`);
            } else {
                console.log(`Pingen Brief ${letterId} nicht in DB gefunden`);
            }

            // Bei "action_required" Brief automatisch löschen
            if (newStatus === 'action_required') {
                console.log(`Pingen Brief ${letterId} hat "action_required" - wird gelöscht...`);
                try {
                    // Token holen
                    const tokenResponse = await axios.post(`${PINGEN_IDENTITY}/auth/access-tokens`, {
                        grant_type: 'client_credentials',
                        client_id: process.env.PINGEN_CLIENT_ID,
                        client_secret: process.env.PINGEN_CLIENT_SECRET
                    });
                    const token = tokenResponse.data.access_token;

                    // Brief löschen (beide APIs probieren - Staging und Production)
                    const apis = [getPingenApi(false), getPingenApi(true)];
                    const orgIds = [getPingenOrgId(false), getPingenOrgId(true)];

                    for (let i = 0; i < apis.length; i++) {
                        try {
                            await axios.delete(
                                `${apis[i]}/organisations/${orgIds[i]}/letters/${letterId}`,
                                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/vnd.api+json' } }
                            );
                            console.log(`Pingen Brief ${letterId} erfolgreich gelöscht`);

                            // Status in DB auf 'deleted' setzen
                            await pool.query(`
                                UPDATE dispatch_log
                                SET status = 'deleted', updated_at = NOW()
                                WHERE external_id = $1 AND type = 'pingen'
                            `, [letterId]);
                            break;
                        } catch (delErr) {
                            // Ignorieren wenn Brief in dieser API nicht gefunden
                        }
                    }
                } catch (tokenErr) {
                    console.error(`Fehler beim Löschen von Brief ${letterId}:`, tokenErr.message);
                }
            }
        }

        res.status(200).json({ received: true, processed: true });
    } catch (error) {
        console.error('Pingen Webhook Fehler:', error);
        // Trotzdem 200 zurückgeben damit Pingen nicht erneut sendet
        res.status(200).json({ received: true, error: error.message });
    }
});

// Webhook registrieren/verwalten
app.post('/pingen/webhooks/register', async (req, res) => {
    try {
        const { webhook_url, staging = false } = req.body;
        const PINGEN_API = getPingenApi(staging);
        const callbackUrl = webhook_url || `${process.env.DISPATCH_PUBLIC_URL || 'https://api.fwv-raura.ch'}/pingen/webhook`;

        // Token holen
        const tokenResponse = await axios.post(`${PINGEN_IDENTITY}/auth/access-tokens`, {
            grant_type: 'client_credentials',
            client_id: process.env.PINGEN_CLIENT_ID,
            client_secret: process.env.PINGEN_CLIENT_SECRET
        });

        const token = tokenResponse.data.access_token;

        // Webhook registrieren - event_category muss 'sent' sein für Brief-Status-Updates
        const webhookResponse = await axios.post(
            `${PINGEN_API}/organisations/${process.env.PINGEN_ORGANISATION_ID}/webhooks`,
            {
                data: {
                    type: 'webhooks',
                    attributes: {
                        url: callbackUrl,
                        event_category: 'sent',
                        signing_key: process.env.PINGEN_WEBHOOK_SECRET || 'fwv-raura-webhook-key'
                    }
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/vnd.api+json'
                }
            }
        );

        res.json({
            success: true,
            webhookId: webhookResponse.data.data?.id,
            url: callbackUrl
        });
    } catch (error) {
        console.error('Webhook Registrierung Fehler:', error.response?.data || error.message);
        const errorData = error.response?.data;
        const errorMsg = errorData?.errors?.[0]?.detail || errorData?.error || error.message;
        res.status(500).json({ error: errorMsg });
    }
});

// Registrierte Webhooks abrufen
app.get('/pingen/webhooks', async (req, res) => {
    try {
        const staging = req.query.staging === 'true';
        const PINGEN_API = getPingenApi(staging);

        // Token holen
        const tokenResponse = await axios.post(`${PINGEN_IDENTITY}/auth/access-tokens`, {
            grant_type: 'client_credentials',
            client_id: process.env.PINGEN_CLIENT_ID,
            client_secret: process.env.PINGEN_CLIENT_SECRET
        });

        const token = tokenResponse.data.access_token;

        // Webhooks abrufen
        const webhooksResponse = await axios.get(
            `${PINGEN_API}/organisations/${process.env.PINGEN_ORGANISATION_ID}/webhooks`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/vnd.api+json'
                }
            }
        );

        res.json(webhooksResponse.data.data || []);
    } catch (error) {
        console.error('Webhooks abrufen Fehler:', error.response?.data || error.message);
        res.status(500).json({ error: error.message });
    }
});

// Webhook löschen
app.delete('/pingen/webhooks/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const staging = req.query.staging === 'true';
        const PINGEN_API = getPingenApi(staging);

        // Token holen
        const tokenResponse = await axios.post(`${PINGEN_IDENTITY}/auth/access-tokens`, {
            grant_type: 'client_credentials',
            client_id: process.env.PINGEN_CLIENT_ID,
            client_secret: process.env.PINGEN_CLIENT_SECRET
        });

        const token = tokenResponse.data.access_token;

        // Webhook löschen
        await axios.delete(
            `${PINGEN_API}/organisations/${process.env.PINGEN_ORGANISATION_ID}/webhooks/${id}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/vnd.api+json'
                }
            }
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Webhook löschen Fehler:', error.response?.data || error.message);
        res.status(500).json({ error: error.message });
    }
});

// Helper: An Pingen senden
async function sendToPingen(html, member, memberId, eventId, staging = false, useCoverPage = false) {
    const PINGEN_API = getPingenApi(staging);

    // Convert HTML to PDF
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const originalPdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    // Parse address
    const parsedAddress = parseStreetAndNumber(member.strasse);
    const recipientAddressStr = formatAddressForCoverPage(
        `${member.vorname} ${member.nachname}`,
        parsedAddress.street,
        parsedAddress.number,
        member.plz,
        member.ort
    );

    // PDF buffer: embed address or use original depending on useCoverPage option
    let pdfBuffer;
    let detectedCountry = 'CH'; // Default
    if (useCoverPage) {
        pdfBuffer = originalPdfBuffer;
        detectedCountry = detectCountryFromAddress(recipientAddressStr);
    } else {
        const senderAddressLine = `${SENDER_ADDRESS.name}, ${SENDER_ADDRESS.zip} ${SENDER_ADDRESS.city}`;
        const result = await addAddressToPdf(originalPdfBuffer, recipientAddressStr, senderAddressLine);
        pdfBuffer = Buffer.from(result.pdfBytes);
        detectedCountry = result.country;
    }

    // Get Pingen token
    const tokenResponse = await axios.post(`${PINGEN_IDENTITY}/auth/access-tokens`, {
        grant_type: 'client_credentials',
        client_id: process.env.PINGEN_CLIENT_ID,
        client_secret: process.env.PINGEN_CLIENT_SECRET
    });

    const token = tokenResponse.data.access_token;

    // Step 1: Get file upload URL
    const uploadUrlResponse = await axios.get(
        `${PINGEN_API}/file-upload`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/vnd.api+json'
            }
        }
    );

    const fileUrl = uploadUrlResponse.data.data.attributes.url;
    const fileUrlSignature = uploadUrlResponse.data.data.attributes.url_signature;

    // Step 2: Upload PDF to the pre-signed URL
    await axios.put(fileUrl, pdfBuffer, {
        headers: {
            'Content-Type': 'application/pdf'
        }
    });

    // Step 3: Create letter with file reference
    // CH = rechts (Schweizer C5/6 Couvert), DE = links (DIN Standard)
    const uploadResponse = await axios.post(
        `${PINGEN_API}/organisations/${getPingenOrgId(staging)}/letters`,
        {
            data: {
                type: 'letters',
                attributes: {
                    file_original_name: 'brief.pdf',
                    file_url: fileUrl,
                    file_url_signature: fileUrlSignature,
                    address_position: detectedCountry === 'DE' ? 'left' : 'right',
                    auto_send: !useCoverPage,  // auto_send wenn Adresse im PDF
                    delivery_product: 'cheap',
                    print_mode: 'simplex',
                    print_spectrum: 'grayscale',
                    meta_data: {
                        recipient: buildPingenAddress({
                            name: `${member.vorname} ${member.nachname}`,
                            street: parsedAddress.street,
                            number: parsedAddress.number,
                            zip: member.plz,
                            city: member.ort,
                            country: detectedCountry
                        }),
                        sender: buildPingenAddress(SENDER_ADDRESS)
                    }
                }
            }
        },
        {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/vnd.api+json'
            }
        }
    );

    const letterId = uploadResponse.data.data?.id;

    // Step 4: Handle based on useCoverPage option
    if (useCoverPage) {
        // Wait for initial processing before creating cover page
        const processingResult = await waitForLetterProcessing(letterId, token, staging);
        if (!processingResult.ready) {
            throw new Error('Brief-Verarbeitung Timeout');
        }

        // Create cover page with recipient address
        await axios.patch(
            `${PINGEN_API}/organisations/${getPingenOrgId(staging)}/letters/${letterId}/create-cover-page`,
            {
                data: {
                    type: 'letters',
                    id: letterId,
                    attributes: {
                        address: recipientAddressStr,
                        country: 'CH'
                    }
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/vnd.api+json'
                }
            }
        );

        // Wait for letter validation AFTER cover page is created
        const validationResult = await waitForLetterValidation(letterId, token, staging);
        if (!validationResult.success) {
            try {
                await axios.delete(
                    `${PINGEN_API}/organisations/${getPingenOrgId(staging)}/letters/${letterId}`,
                    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/vnd.api+json' } }
                );
            } catch (delErr) { /* ignore */ }
            throw new Error(`Brief-Validierung fehlgeschlagen: ${validationResult.reason}`);
        }

        // Send the letter
        await axios.patch(
            `${PINGEN_API}/organisations/${getPingenOrgId(staging)}/letters/${letterId}/send`,
            {
                data: {
                    type: 'letters',
                    id: letterId,
                    attributes: {
                        delivery_product: 'cheap',
                        print_mode: 'simplex',
                        print_spectrum: 'grayscale'
                    }
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/vnd.api+json'
                }
            }
        );
    } else {
        // Address is embedded in PDF, just wait for validation
        const validationResult = await waitForLetterValidation(letterId, token, staging);
        if (!validationResult.success) {
            try {
                await axios.delete(
                    `${PINGEN_API}/organisations/${getPingenOrgId(staging)}/letters/${letterId}`,
                    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/vnd.api+json' } }
                );
            } catch (delErr) { /* ignore */ }
            throw new Error(`Brief-Validierung fehlgeschlagen: ${validationResult.reason}`);
        }
    }

    // Step 5: Check status and delete if action required
    const statusCheck = await checkAndDeleteIfActionRequired(letterId, token, staging);

    if (statusCheck.deleted) {
        throw new Error('Brief wurde von Pingen als "Aktion erforderlich" markiert und automatisch gelöscht');
    }

    // Log
    await pool.query(`
        INSERT INTO dispatch_log (type, member_id, recipient_address, status, external_id, event_id, sent_at)
        VALUES ('pingen', $1, $2, 'sent', $3, $4, NOW())
    `, [
        memberId,
        JSON.stringify({
            name: `${member.vorname} ${member.nachname}`,
            street: member.strasse,
            zip: member.plz,
            city: member.ort
        }),
        letterId,
        eventId
    ]);

    return { letterId };
}

app.listen(PORT, () => {
    console.log(`API-Dispatch running on port ${PORT}`);
});
