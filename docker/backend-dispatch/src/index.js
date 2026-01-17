const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const puppeteer = require('puppeteer');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
const PINGEN_API = process.env.PINGEN_STAGING === 'true'
    ? 'https://api-staging.pingen.com'
    : 'https://api.pingen.com';

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

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'api-dispatch' });
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

        // Send email
        const info = await transporter.sendMail({
            from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`,
            to,
            subject: emailSubject,
            text: emailBody
        });

        // Log
        await pool.query(`
            INSERT INTO dispatch_log (type, template_id, member_id, recipient_email, subject, body, status, external_id, event_id, sent_at)
            VALUES ('email', $1, $2, $3, $4, $5, 'sent', $6, $7, NOW())
        `, [template_id, member_id, to, emailSubject, emailBody, info.messageId, event_id]);

        res.json({ success: true, messageId: info.messageId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/email/bulk', async (req, res) => {
    try {
        const { member_ids, template_id, variables } = req.body;

        // Get members
        const members = await axios.get(`${process.env.MEMBERS_API_URL}/members`, {
            params: { ids: member_ids.join(',') }
        });

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

        res.json({ results, total: results.length, success: results.filter(r => r.success).length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// PINGEN (Post)
// ============================================

app.post('/pingen/send', async (req, res) => {
    try {
        const { html, recipient, member_id, event_id } = req.body;

        // Convert HTML to PDF
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();

        // Get Pingen token
        const tokenResponse = await axios.post(`${PINGEN_API}/oauth/token`, {
            grant_type: 'client_credentials',
            client_id: process.env.PINGEN_CLIENT_ID,
            client_secret: process.env.PINGEN_CLIENT_SECRET
        });

        const token = tokenResponse.data.access_token;

        // Upload to Pingen
        const uploadResponse = await axios.post(
            `${PINGEN_API}/organisations/${process.env.PINGEN_ORGANISATION_ID}/letters`,
            {
                data: {
                    type: 'letters',
                    attributes: {
                        file_original_name: 'brief.pdf',
                        address_position: 'left',
                        auto_send: true,
                        delivery_product: 'cheap',
                        print_mode: 'simplex',
                        print_spectrum: 'grayscale'
                    }
                },
                meta: {
                    file_content: pdfBuffer.toString('base64'),
                    recipient: {
                        name: recipient.name,
                        street: recipient.street,
                        zip: recipient.zip,
                        city: recipient.city,
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

        const letterId = uploadResponse.data.data?.id;

        // Log
        await pool.query(`
            INSERT INTO dispatch_log (type, member_id, recipient_address, status, external_id, event_id, sent_at)
            VALUES ('pingen', $1, $2, 'sent', $3, $4, NOW())
        `, [member_id, JSON.stringify(recipient), letterId, event_id]);

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
            // Mitgliedschaftsantrag
            emailSubject = `Neuer Mitgliedschaftsantrag von ${membership.firstname} ${membership.lastname}`;
            emailBody = `
NEUER MITGLIEDSCHAFTSANTRAG
===========================

Persönliche Daten:
- Name: ${membership.firstname} ${membership.lastname}
- Strasse: ${membership.street}
- Ort: ${membership.city}
- Telefon: ${membership.phone}
- Mobile: ${membership.mobile || '-'}
- E-Mail: ${membership.email}

Feuerwehr-Status: ${membership.firefighterStatus}
Korrespondenz: ${membership.correspondenceMethod}
Zustelladresse: ${membership.correspondenceAddress}

Absender-Kontakt: ${name} <${email}>
            `.trim();

            // Bestätigung an Antragsteller
            await transporter.sendMail({
                from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`,
                to: membership.email,
                subject: 'Bestätigung Ihres Mitgliedschaftsantrags - FWV Raura',
                text: `
Guten Tag ${membership.firstname} ${membership.lastname},

Vielen Dank für Ihren Mitgliedschaftsantrag beim Feuerwehrverein Raura!

Wir haben Ihren Antrag erhalten und werden ihn schnellstmöglich bearbeiten.

Aktive Feuerwehr-Mitglieder werden sofort aufgenommen.
Andere Interessierte werden an der nächsten ordentlichen GV bestätigt.

Mit freundlichen Grüssen
Feuerwehrverein Raura
                `.trim()
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
        }

        // E-Mail an Vorstand
        await transporter.sendMail({
            from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`,
            to: process.env.CONTACT_EMAIL || 'kontakt@fwv-raura.ch',
            replyTo: email,
            subject: emailSubject,
            text: emailBody
        });

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
// LETTER TEMPLATES (Brief-Generierung)
// ============================================

// Basis-Styles für alle Briefe (A4 Format)
const letterBaseStyles = `
    @page {
        size: A4;
        margin: 0;
    }
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }
    body {
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 11pt;
        line-height: 1.4;
        color: #333;
    }
    .page {
        width: 210mm;
        min-height: 297mm;
        padding: 20mm 25mm 20mm 25mm;
        position: relative;
    }
    .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 10mm;
    }
    .logo {
        height: 20mm;
    }
    .sender-info {
        font-size: 9pt;
        text-align: right;
        color: #666;
    }
    .sender-line {
        font-size: 8pt;
        color: #666;
        margin-bottom: 5mm;
    }
    .recipient {
        margin-bottom: 15mm;
        min-height: 40mm;
    }
    .date {
        text-align: right;
        margin-bottom: 10mm;
    }
    .title {
        font-size: 14pt;
        font-weight: bold;
        margin-bottom: 3mm;
    }
    .subtitle {
        font-size: 11pt;
        color: #666;
        margin-bottom: 5mm;
    }
    .divider {
        border-top: 1px solid #c00;
        margin: 5mm 0;
    }
    .content {
        margin-bottom: 10mm;
    }
    .content p {
        margin-bottom: 5mm;
    }
    .event-table {
        width: 100%;
        border-collapse: collapse;
        margin: 5mm 0;
    }
    .event-table td {
        padding: 2mm 3mm;
        vertical-align: top;
    }
    .event-table td:first-child {
        font-weight: bold;
        width: 30%;
        color: #555;
    }
    .qr-section {
        text-align: center;
        margin: 8mm 0;
    }
    .qr-section img {
        width: 30mm;
        height: 30mm;
    }
    .qr-caption {
        font-size: 9pt;
        color: #666;
        margin-top: 2mm;
    }
    .signature-block {
        display: flex;
        justify-content: space-between;
        margin-top: 15mm;
    }
    .signature {
        width: 45%;
    }
    .signature-name {
        font-weight: bold;
    }
    .signature-role {
        font-size: 9pt;
        color: #666;
    }
    .greetings {
        margin: 10mm 0 5mm 0;
    }
    .contact-info {
        font-size: 9pt;
        color: #666;
        margin-top: 3mm;
    }
    .contact-info td {
        padding: 1mm 5mm 1mm 0;
    }
    /* QR-Rechnung Styles */
    .qr-rechnung {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 210mm;
        height: 105mm;
        border-top: 1px dashed #000;
        display: flex;
    }
    .empfangsschein {
        width: 62mm;
        height: 105mm;
        padding: 5mm;
        border-right: 1px dashed #000;
    }
    .zahlteil {
        width: 148mm;
        height: 105mm;
        padding: 5mm;
    }
    .qr-title {
        font-size: 11pt;
        font-weight: bold;
        margin-bottom: 3mm;
    }
    .qr-section-title {
        font-size: 8pt;
        font-weight: bold;
        margin-top: 3mm;
        margin-bottom: 1mm;
    }
    .qr-text {
        font-size: 8pt;
        line-height: 1.3;
    }
    .qr-text-small {
        font-size: 7pt;
    }
    .qr-amount {
        font-size: 10pt;
        font-weight: bold;
    }
    .swiss-qr-code {
        width: 46mm;
        height: 46mm;
        margin: 5mm 0;
    }
    .swiss-cross {
        position: absolute;
        width: 7mm;
        height: 7mm;
        background: #fff;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    }
`;

// Event-Einladung Template
function generateEventInvitationHtml(data) {
    const {
        member,
        event,
        registrationUrl,
        qrCodeDataUrl,
        vorstand
    } = data;

    const eventDate = new Date(event.date);
    const formattedDate = eventDate.toLocaleDateString('de-CH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const formattedTime = event.time_start ?
        `${event.time_start}${event.time_end ? ' - ' + event.time_end : ''} Uhr` : '';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>${letterBaseStyles}</style>
</head>
<body>
    <div class="page">
        <div class="header">
            <img src="https://fwv-raura.ch/images/logo.png" class="logo" alt="FWV Raura">
            <div class="sender-info">
                <strong>FEUERWEHRVEREIN RAURA</strong><br>
                KAISERAUGST
            </div>
        </div>

        <div class="title">${event.title}</div>
        <div class="subtitle">${formattedDate}</div>
        <div class="divider"></div>

        <div class="content">
            <p>${member.anrede || 'Guten Tag'} ${member.vorname} ${member.nachname}</p>

            <p>${event.description || 'Wir laden Sie herzlich zu unserem Anlass ein.'}</p>

            <table class="event-table">
                <tr>
                    <td>Was:</td>
                    <td>${event.title}</td>
                </tr>
                <tr>
                    <td>Wo:</td>
                    <td>${event.location || 'Wird noch bekannt gegeben'}</td>
                </tr>
                <tr>
                    <td>Wann:</td>
                    <td>${formattedDate}${formattedTime ? ', ' + formattedTime : ''}</td>
                </tr>
                ${event.registration_deadline ? `
                <tr>
                    <td>Anmeldung:</td>
                    <td>Bis ${new Date(event.registration_deadline).toLocaleDateString('de-CH')}</td>
                </tr>
                ` : ''}
                ${event.bring_items ? `
                <tr>
                    <td>Mitzubringen:</td>
                    <td>${event.bring_items}</td>
                </tr>
                ` : ''}
                ${event.important_info ? `
                <tr>
                    <td>Wichtig:</td>
                    <td>${event.important_info}</td>
                </tr>
                ` : ''}
                ${registrationUrl ? `
                <tr>
                    <td>Link:</td>
                    <td>${registrationUrl}</td>
                </tr>
                ` : ''}
            </table>

            ${qrCodeDataUrl ? `
            <div class="qr-section">
                <img src="${qrCodeDataUrl}" alt="QR Code zur Anmeldung">
                <div class="qr-caption">QR-Code scannen zur Anmeldung</div>
            </div>
            ` : ''}

            <p class="greetings">Wir freuen uns auf Ihre Teilnahme!</p>
            <p>Freundliche Grüsse</p>
        </div>

        <div class="signature-block">
            <div class="signature">
                <div class="signature-name">${vorstand?.praesident?.name || 'Der Präsident'}</div>
                <div class="signature-role">Präsident</div>
            </div>
            <div class="signature">
                <div class="signature-name">${vorstand?.aktuar?.name || 'Der Aktuar'}</div>
                <div class="signature-role">Aktuar</div>
            </div>
        </div>
    </div>
</body>
</html>`;
}

// Mitgliederbeitrag mit QR-Rechnung Template
function generateMitgliederbeitragHtml(data) {
    const {
        member,
        year,
        amount,
        reference,
        dueDate,
        iban,
        vorstand
    } = data;

    const today = new Date().toLocaleDateString('de-CH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const dueDateFormatted = dueDate ?
        new Date(dueDate).toLocaleDateString('de-CH') :
        new Date(Date.now() + 30*24*60*60*1000).toLocaleDateString('de-CH');

    // Swiss QR-Rechnung Daten
    const qrData = {
        iban: iban || 'CH93 0076 2011 6238 5295 7',
        creditor: {
            name: 'Feuerwehrverein Raura',
            street: 'Postfach',
            zip: '4303',
            city: 'Kaiseraugst',
            country: 'CH'
        },
        amount: amount,
        currency: 'CHF',
        reference: reference,
        debtor: {
            name: `${member.vorname} ${member.nachname}`,
            street: member.strasse || '',
            zip: member.plz || '',
            city: member.ort || '',
            country: 'CH'
        }
    };

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        ${letterBaseStyles}
        .page {
            padding-bottom: 115mm; /* Platz für QR-Rechnung */
        }
    </style>
</head>
<body>
    <div class="page">
        <div class="header">
            <div>
                <div class="sender-line">Feuerwehrverein Raura · Postfach · 4303 Kaiseraugst</div>
            </div>
            <img src="https://fwv-raura.ch/images/logo.png" class="logo" alt="FWV Raura">
        </div>

        <table class="contact-info">
            <tr>
                <td>Tel:</td>
                <td>079 XXX XX XX</td>
            </tr>
            <tr>
                <td>Email:</td>
                <td>kassier@fwv-raura.ch</td>
            </tr>
            <tr>
                <td>Konto:</td>
                <td>${qrData.iban}</td>
            </tr>
            <tr>
                <td>Betrag:</td>
                <td>CHF ${amount.toFixed(2)}</td>
            </tr>
        </table>

        <div class="date">${today}</div>

        <div class="recipient">
            ${member.vorname} ${member.nachname}<br>
            ${member.strasse || ''}<br>
            ${member.plz || ''} ${member.ort || ''}
        </div>

        <div class="title">Mitgliederbeitrag ${year}</div>
        <div class="divider"></div>

        <div class="content">
            <p>${member.anrede || 'Guten Tag'} ${member.vorname} ${member.nachname}</p>

            <p>Wir erlauben uns, Ihnen den Mitgliederbeitrag ${year} in Rechnung zu stellen.</p>

            <p><strong>Referenz:</strong> ${reference}<br>
            <strong>Betrag:</strong> CHF ${amount.toFixed(2)}<br>
            <strong>Zahlbar bis:</strong> ${dueDateFormatted}</p>

            <p>Für die Begleichung verwenden Sie bitte den unten stehenden Einzahlungsschein
            oder scannen Sie den QR-Code mit Ihrer Banking-App.</p>

            <p class="greetings">Vielen Dank für Ihre Unterstützung!</p>
            <p>Freundliche Grüsse</p>
            <p><strong>${vorstand?.kassier?.name || 'Der Kassier'}</strong><br>
            <span style="font-size: 9pt; color: #666;">Kassier</span></p>
        </div>

        <!-- Swiss QR-Rechnung -->
        <div class="qr-rechnung">
            <div class="empfangsschein">
                <div class="qr-title">Empfangsschein</div>

                <div class="qr-section-title">Konto / Zahlbar an</div>
                <div class="qr-text">
                    ${qrData.iban}<br>
                    ${qrData.creditor.name}<br>
                    ${qrData.creditor.zip} ${qrData.creditor.city}
                </div>

                <div class="qr-section-title">Referenz</div>
                <div class="qr-text">${reference}</div>

                <div class="qr-section-title">Zahlbar durch</div>
                <div class="qr-text">
                    ${qrData.debtor.name}<br>
                    ${qrData.debtor.street}<br>
                    ${qrData.debtor.zip} ${qrData.debtor.city}
                </div>

                <div class="qr-section-title">Währung</div>
                <div class="qr-text">CHF</div>

                <div class="qr-section-title">Betrag</div>
                <div class="qr-amount">${amount.toFixed(2)}</div>

                <div style="margin-top: 5mm;">
                    <div class="qr-section-title">Annahmestelle</div>
                </div>
            </div>

            <div class="zahlteil">
                <div class="qr-title">Zahlteil</div>

                <div style="display: flex; gap: 10mm;">
                    <div style="width: 56mm;">
                        <!-- Hier würde der echte Swiss QR Code sein -->
                        <div class="swiss-qr-code" style="border: 1px solid #000; display: flex; align-items: center; justify-content: center; position: relative;">
                            <div style="font-size: 6pt; text-align: center;">
                                [Swiss QR Code]<br>
                                <small>Wird bei Generierung erstellt</small>
                            </div>
                        </div>
                    </div>
                    <div style="flex: 1;">
                        <div class="qr-section-title">Währung</div>
                        <div class="qr-text" style="display: flex; gap: 10mm;">
                            <span>CHF</span>
                        </div>

                        <div class="qr-section-title">Betrag</div>
                        <div class="qr-amount">${amount.toFixed(2)}</div>
                    </div>
                </div>

                <div style="margin-top: 5mm;">
                    <div class="qr-section-title">Konto / Zahlbar an</div>
                    <div class="qr-text">
                        ${qrData.iban}<br>
                        ${qrData.creditor.name}<br>
                        ${qrData.creditor.zip} ${qrData.creditor.city}
                    </div>

                    <div class="qr-section-title">Referenz</div>
                    <div class="qr-text">${reference}</div>

                    <div class="qr-section-title">Zahlbar durch</div>
                    <div class="qr-text">
                        ${qrData.debtor.name}<br>
                        ${qrData.debtor.street}<br>
                        ${qrData.debtor.zip} ${qrData.debtor.city}
                    </div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;
}

// Deckblatt Postversand (für Pingen) Template
function generateDeckblattHtml(data) {
    const {
        member,
        subject,
        note
    } = data;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>${letterBaseStyles}</style>
</head>
<body>
    <div class="page">
        <div class="header">
            <img src="https://fwv-raura.ch/images/logo.png" class="logo" alt="FWV Raura">
            <div class="sender-info">
                <strong>FEUERWEHRVEREIN RAURA</strong><br>
                KAISERAUGST
            </div>
        </div>

        <div style="text-align: right; margin: 20mm 0;">
            <strong>${member.vorname} ${member.nachname}</strong><br>
            ${member.strasse || ''}<br>
            ${member.plz || ''} ${member.ort || ''}
        </div>

        <div class="title">Deckblatt Postversand</div>
        <div class="divider"></div>

        <div class="content" style="margin-top: 20mm;">
            <p style="font-size: 14pt; font-weight: bold;">
                ${subject || 'Siehe bitte angehängte Seiten'}
            </p>

            ${note ? `
            <p style="margin-top: 15mm; font-style: italic; color: #666;">
                ${note}
            </p>
            ` : `
            <p style="margin-top: 15mm; font-style: italic; color: #666;">
                Um in Zukunft Briefe per E-Mail zu erhalten, melden Sie sich bitte
                im Mitgliederportal an und aktualisieren Sie Ihre Zustellpräferenzen.
            </p>
            `}
        </div>
    </div>
</body>
</html>`;
}

// API: Event-Einladungen generieren und versenden
app.post('/letters/event-invitation', async (req, res) => {
    try {
        const { event_id, member_ids, send_method } = req.body;
        // send_method: 'preference' (nach Zustellpräferenz), 'email', 'post', 'both'

        // Event laden
        const eventResult = await axios.get(`${process.env.EVENTS_API_URL || 'http://api-events:3000'}/events/${event_id}`);
        const event = eventResult.data;

        // Mitglieder laden
        const membersResult = await axios.get(`${process.env.MEMBERS_API_URL}/members`, {
            params: { ids: member_ids?.join(',') || undefined }
        });
        const members = membersResult.data;

        // Vorstand laden für Unterschriften
        let vorstand = {};
        try {
            const vorstandResult = await axios.get(`${process.env.MEMBERS_API_URL}/vorstand`);
            vorstand = vorstandResult.data.reduce((acc, v) => {
                acc[v.role.toLowerCase()] = v;
                return acc;
            }, {});
        } catch (e) {
            console.log('Vorstand nicht geladen:', e.message);
        }

        const registrationUrl = `https://fwv-raura.ch/anmeldung/${event.slug || event.id}`;

        // QR-Code generieren (wenn qrcode package vorhanden)
        let qrCodeDataUrl = null;
        try {
            const QRCode = require('qrcode');
            qrCodeDataUrl = await QRCode.toDataURL(registrationUrl);
        } catch (e) {
            console.log('QR-Code konnte nicht generiert werden:', e.message);
        }

        const results = [];

        for (const member of members) {
            const letterData = {
                member,
                event,
                registrationUrl,
                qrCodeDataUrl,
                vorstand
            };

            // Bestimme Versandart
            let sendViaEmail = false;
            let sendViaPost = false;

            if (send_method === 'preference') {
                sendViaEmail = member.zustellung_email;
                sendViaPost = member.zustellung_post;
            } else if (send_method === 'email') {
                sendViaEmail = true;
            } else if (send_method === 'post') {
                sendViaPost = true;
            } else if (send_method === 'both') {
                sendViaEmail = true;
                sendViaPost = true;
            }

            const memberResult = { member_id: member.id, email: false, post: false };

            // Per E-Mail senden
            if (sendViaEmail && member.email) {
                try {
                    const html = generateEventInvitationHtml(letterData);

                    // PDF generieren für Anhang
                    const browser = await puppeteer.launch({
                        headless: 'new',
                        args: ['--no-sandbox', '--disable-setuid-sandbox']
                    });
                    const page = await browser.newPage();
                    await page.setContent(html, { waitUntil: 'networkidle0' });
                    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
                    await browser.close();

                    // E-Mail mit PDF-Anhang
                    await transporter.sendMail({
                        from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`,
                        to: member.versand_email || member.email,
                        subject: `Einladung: ${event.title}`,
                        text: `${member.anrede || 'Guten Tag'} ${member.vorname} ${member.nachname},\n\nSie sind herzlich eingeladen zu: ${event.title}\n\nDatum: ${new Date(event.date).toLocaleDateString('de-CH')}\nOrt: ${event.location || 'Wird noch bekannt gegeben'}\n\nAnmeldung: ${registrationUrl}\n\nIm Anhang finden Sie die Einladung als PDF.\n\nFreundliche Grüsse\nFeuerwehrverein Raura`,
                        attachments: [{
                            filename: `Einladung_${event.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
                            content: pdfBuffer
                        }]
                    });

                    // In Nextcloud speichern
                    const filename = `Einladung_${event.title}_${member.nachname}_${member.vorname}.pdf`;
                    await uploadToNextcloud(filename, pdfBuffer, `/Briefe/${new Date().getFullYear()}`);

                    await pool.query(`
                        INSERT INTO dispatch_log (type, member_id, recipient_email, subject, status, event_id, sent_at)
                        VALUES ('email', $1, $2, $3, 'sent', $4, NOW())
                    `, [member.id, member.email, `Einladung: ${event.title}`, event.id]);

                    memberResult.email = true;
                } catch (err) {
                    console.error('E-Mail Fehler:', err.message);
                    memberResult.emailError = err.message;
                }
            }

            // Per Post senden (Pingen)
            if (sendViaPost && member.strasse && member.plz && member.ort) {
                try {
                    const html = generateEventInvitationHtml(letterData);

                    // PDF generieren
                    const browser = await puppeteer.launch({
                        headless: 'new',
                        args: ['--no-sandbox', '--disable-setuid-sandbox']
                    });
                    const page = await browser.newPage();
                    await page.setContent(html, { waitUntil: 'networkidle0' });
                    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
                    await browser.close();

                    // Pingen Token holen
                    const tokenResponse = await axios.post(`${PINGEN_API}/oauth/token`, {
                        grant_type: 'client_credentials',
                        client_id: process.env.PINGEN_CLIENT_ID,
                        client_secret: process.env.PINGEN_CLIENT_SECRET
                    });
                    const token = tokenResponse.data.access_token;

                    // An Pingen senden
                    const uploadResponse = await axios.post(
                        `${PINGEN_API}/organisations/${process.env.PINGEN_ORGANISATION_ID}/letters`,
                        {
                            data: {
                                type: 'letters',
                                attributes: {
                                    file_original_name: `Einladung_${event.title}.pdf`,
                                    address_position: 'left',
                                    auto_send: true,
                                    delivery_product: 'cheap',
                                    print_mode: 'simplex',
                                    print_spectrum: 'color'
                                }
                            },
                            meta: {
                                file_content: pdfBuffer.toString('base64'),
                                recipient: {
                                    name: `${member.vorname} ${member.nachname}`,
                                    street: member.strasse,
                                    zip: member.plz,
                                    city: member.ort,
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

                    const letterId = uploadResponse.data.data?.id;

                    // In Nextcloud speichern
                    const filename = `Einladung_${event.title}_${member.nachname}_${member.vorname}_POST.pdf`;
                    await uploadToNextcloud(filename, pdfBuffer, `/Briefe/${new Date().getFullYear()}`);

                    await pool.query(`
                        INSERT INTO dispatch_log (type, member_id, recipient_address, status, external_id, event_id, sent_at)
                        VALUES ('pingen', $1, $2, 'sent', $3, $4, NOW())
                    `, [member.id, JSON.stringify({ name: `${member.vorname} ${member.nachname}`, street: member.strasse, zip: member.plz, city: member.ort }), letterId, event.id]);

                    memberResult.post = true;
                    memberResult.letterId = letterId;
                } catch (err) {
                    console.error('Pingen Fehler:', err.message);
                    memberResult.postError = err.message;
                }
            }

            results.push(memberResult);
        }

        res.json({
            success: true,
            results,
            summary: {
                total: results.length,
                emailSent: results.filter(r => r.email).length,
                postSent: results.filter(r => r.post).length
            }
        });
    } catch (error) {
        console.error('Event invitation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Mitgliederbeitrag generieren und versenden
app.post('/letters/mitgliederbeitrag', async (req, res) => {
    try {
        const { member_ids, year, amount, due_date, send_method } = req.body;
        const targetYear = year || new Date().getFullYear();
        const beitragAmount = amount || 30.00;

        // Mitglieder laden
        const membersResult = await axios.get(`${process.env.MEMBERS_API_URL}/members`, {
            params: { ids: member_ids?.join(',') || undefined }
        });
        const members = membersResult.data;

        // Vorstand laden
        let vorstand = {};
        try {
            const vorstandResult = await axios.get(`${process.env.MEMBERS_API_URL}/vorstand`);
            vorstand = vorstandResult.data.reduce((acc, v) => {
                acc[v.role.toLowerCase()] = v;
                return acc;
            }, {});
        } catch (e) {
            console.log('Vorstand nicht geladen:', e.message);
        }

        const results = [];

        for (const member of members) {
            // Referenznummer generieren (vereinfacht)
            const reference = `${targetYear}${String(member.mitgliedernummer || member.id).padStart(6, '0')}`;

            const letterData = {
                member,
                year: targetYear,
                amount: beitragAmount,
                reference,
                dueDate: due_date,
                vorstand
            };

            let sendViaEmail = false;
            let sendViaPost = false;

            if (send_method === 'preference') {
                sendViaEmail = member.zustellung_email;
                sendViaPost = member.zustellung_post;
            } else if (send_method === 'email') {
                sendViaEmail = true;
            } else if (send_method === 'post') {
                sendViaPost = true;
            } else if (send_method === 'both') {
                sendViaEmail = true;
                sendViaPost = true;
            }

            const memberResult = { member_id: member.id, email: false, post: false };

            if (sendViaEmail && member.email) {
                try {
                    const html = generateMitgliederbeitragHtml(letterData);

                    const browser = await puppeteer.launch({
                        headless: 'new',
                        args: ['--no-sandbox', '--disable-setuid-sandbox']
                    });
                    const page = await browser.newPage();
                    await page.setContent(html, { waitUntil: 'networkidle0' });
                    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
                    await browser.close();

                    await transporter.sendMail({
                        from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`,
                        to: member.versand_email || member.email,
                        subject: `Mitgliederbeitrag ${targetYear} - Feuerwehrverein Raura`,
                        text: `${member.anrede || 'Guten Tag'} ${member.vorname} ${member.nachname},\n\nIm Anhang finden Sie die Rechnung für den Mitgliederbeitrag ${targetYear}.\n\nBetrag: CHF ${beitragAmount.toFixed(2)}\nReferenz: ${reference}\n\nVielen Dank für Ihre Unterstützung!\n\nFreundliche Grüsse\nFeuerwehrverein Raura`,
                        attachments: [{
                            filename: `Mitgliederbeitrag_${targetYear}_${member.nachname}_${member.vorname}.pdf`,
                            content: pdfBuffer
                        }]
                    });

                    const filename = `Mitgliederbeitrag_${targetYear}_${member.nachname}_${member.vorname}.pdf`;
                    await uploadToNextcloud(filename, pdfBuffer, `/Rechnungen/${targetYear}`);

                    await pool.query(`
                        INSERT INTO dispatch_log (type, member_id, recipient_email, subject, status, sent_at)
                        VALUES ('email', $1, $2, $3, 'sent', NOW())
                    `, [member.id, member.email, `Mitgliederbeitrag ${targetYear}`]);

                    memberResult.email = true;
                } catch (err) {
                    memberResult.emailError = err.message;
                }
            }

            if (sendViaPost && member.strasse && member.plz && member.ort) {
                try {
                    const html = generateMitgliederbeitragHtml(letterData);

                    const browser = await puppeteer.launch({
                        headless: 'new',
                        args: ['--no-sandbox', '--disable-setuid-sandbox']
                    });
                    const page = await browser.newPage();
                    await page.setContent(html, { waitUntil: 'networkidle0' });
                    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
                    await browser.close();

                    const tokenResponse = await axios.post(`${PINGEN_API}/oauth/token`, {
                        grant_type: 'client_credentials',
                        client_id: process.env.PINGEN_CLIENT_ID,
                        client_secret: process.env.PINGEN_CLIENT_SECRET
                    });
                    const token = tokenResponse.data.access_token;

                    const uploadResponse = await axios.post(
                        `${PINGEN_API}/organisations/${process.env.PINGEN_ORGANISATION_ID}/letters`,
                        {
                            data: {
                                type: 'letters',
                                attributes: {
                                    file_original_name: `Mitgliederbeitrag_${targetYear}.pdf`,
                                    address_position: 'left',
                                    auto_send: true,
                                    delivery_product: 'cheap',
                                    print_mode: 'simplex',
                                    print_spectrum: 'grayscale'
                                }
                            },
                            meta: {
                                file_content: pdfBuffer.toString('base64'),
                                recipient: {
                                    name: `${member.vorname} ${member.nachname}`,
                                    street: member.strasse,
                                    zip: member.plz,
                                    city: member.ort,
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

                    const letterId = uploadResponse.data.data?.id;

                    const filename = `Mitgliederbeitrag_${targetYear}_${member.nachname}_${member.vorname}_POST.pdf`;
                    await uploadToNextcloud(filename, pdfBuffer, `/Rechnungen/${targetYear}`);

                    await pool.query(`
                        INSERT INTO dispatch_log (type, member_id, recipient_address, status, external_id, sent_at)
                        VALUES ('pingen', $1, $2, 'sent', $3, NOW())
                    `, [member.id, JSON.stringify({ name: `${member.vorname} ${member.nachname}`, street: member.strasse, zip: member.plz, city: member.ort }), letterId]);

                    memberResult.post = true;
                    memberResult.letterId = letterId;
                } catch (err) {
                    memberResult.postError = err.message;
                }
            }

            results.push(memberResult);
        }

        res.json({
            success: true,
            results,
            summary: {
                total: results.length,
                emailSent: results.filter(r => r.email).length,
                postSent: results.filter(r => r.post).length
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Allgemeiner Brief / Weiterleitung / Deckblatt
app.post('/letters/generic', async (req, res) => {
    try {
        const { member_ids, subject, content, note, send_method, attachments } = req.body;
        // Für allgemeine Sendungen, Weiterleitungen, oder wenn ein Deckblatt benötigt wird

        // Mitglieder laden
        const membersResult = await axios.get(`${process.env.MEMBERS_API_URL}/members`, {
            params: { ids: member_ids?.join(',') || undefined }
        });
        const members = membersResult.data;

        const results = [];

        for (const member of members) {
            // Bestimme Versandart
            let sendViaEmail = false;
            let sendViaPost = false;

            if (send_method === 'preference') {
                sendViaEmail = member.zustellung_email;
                sendViaPost = member.zustellung_post;
            } else if (send_method === 'email') {
                sendViaEmail = true;
            } else if (send_method === 'post') {
                sendViaPost = true;
            } else if (send_method === 'both') {
                sendViaEmail = true;
                sendViaPost = true;
            }

            const memberResult = { member_id: member.id, email: false, post: false };

            // Per E-Mail senden
            if (sendViaEmail && member.email) {
                try {
                    const emailAttachments = [];

                    // Falls Anhänge vorhanden (Base64-kodiert)
                    if (attachments && attachments.length > 0) {
                        for (const att of attachments) {
                            emailAttachments.push({
                                filename: att.filename,
                                content: Buffer.from(att.content, 'base64')
                            });
                        }
                    }

                    await transporter.sendMail({
                        from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`,
                        to: member.versand_email || member.email,
                        subject: subject || 'Mitteilung vom Feuerwehrverein Raura',
                        text: `${member.anrede || 'Guten Tag'} ${member.vorname} ${member.nachname},\n\n${content || 'Bitte beachten Sie die beigefügten Dokumente.'}\n\nFreundliche Grüsse\nFeuerwehrverein Raura`,
                        attachments: emailAttachments
                    });

                    await pool.query(`
                        INSERT INTO dispatch_log (type, member_id, recipient_email, subject, body, status, sent_at)
                        VALUES ('email', $1, $2, $3, $4, 'sent', NOW())
                    `, [member.id, member.email, subject, content]);

                    memberResult.email = true;
                } catch (err) {
                    console.error('E-Mail Fehler:', err.message);
                    memberResult.emailError = err.message;
                }
            }

            // Per Post senden (Pingen) - mit Deckblatt
            if (sendViaPost && member.strasse && member.plz && member.ort) {
                try {
                    // Deckblatt generieren
                    const deckblattHtml = generateDeckblattHtml({
                        member,
                        subject: subject || 'Siehe bitte angehängte Seiten',
                        note: note || 'Um in Zukunft Briefe per E-Mail zu erhalten, melden Sie sich bitte im Mitgliederportal an und aktualisieren Sie Ihre Zustellpräferenzen.'
                    });

                    const browser = await puppeteer.launch({
                        headless: 'new',
                        args: ['--no-sandbox', '--disable-setuid-sandbox']
                    });
                    const page = await browser.newPage();
                    await page.setContent(deckblattHtml, { waitUntil: 'networkidle0' });
                    const deckblattPdf = await page.pdf({ format: 'A4', printBackground: true });
                    await browser.close();

                    // TODO: Wenn Anhänge vorhanden, PDFs zusammenführen
                    // Für jetzt nur Deckblatt senden
                    const pdfBuffer = deckblattPdf;

                    // Pingen Token holen
                    const tokenResponse = await axios.post(`${PINGEN_API}/oauth/token`, {
                        grant_type: 'client_credentials',
                        client_id: process.env.PINGEN_CLIENT_ID,
                        client_secret: process.env.PINGEN_CLIENT_SECRET
                    });
                    const token = tokenResponse.data.access_token;

                    // An Pingen senden
                    const uploadResponse = await axios.post(
                        `${PINGEN_API}/organisations/${process.env.PINGEN_ORGANISATION_ID}/letters`,
                        {
                            data: {
                                type: 'letters',
                                attributes: {
                                    file_original_name: 'Brief.pdf',
                                    address_position: 'left',
                                    auto_send: true,
                                    delivery_product: 'cheap',
                                    print_mode: 'simplex',
                                    print_spectrum: 'grayscale'
                                }
                            },
                            meta: {
                                file_content: pdfBuffer.toString('base64'),
                                recipient: {
                                    name: `${member.vorname} ${member.nachname}`,
                                    street: member.strasse,
                                    zip: member.plz,
                                    city: member.ort,
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

                    const letterId = uploadResponse.data.data?.id;

                    // In Nextcloud speichern
                    const filename = `Brief_${subject?.replace(/[^a-zA-Z0-9]/g, '_') || 'Allgemein'}_${member.nachname}_${member.vorname}.pdf`;
                    await uploadToNextcloud(filename, pdfBuffer, `/Briefe/${new Date().getFullYear()}`);

                    await pool.query(`
                        INSERT INTO dispatch_log (type, member_id, recipient_address, subject, status, external_id, sent_at)
                        VALUES ('pingen', $1, $2, $3, 'sent', $4, NOW())
                    `, [member.id, JSON.stringify({ name: `${member.vorname} ${member.nachname}`, street: member.strasse, zip: member.plz, city: member.ort }), subject, letterId]);

                    memberResult.post = true;
                    memberResult.letterId = letterId;
                } catch (err) {
                    console.error('Pingen Fehler:', err.message);
                    memberResult.postError = err.message;
                }
            }

            results.push(memberResult);
        }

        res.json({
            success: true,
            results,
            summary: {
                total: results.length,
                emailSent: results.filter(r => r.email).length,
                postSent: results.filter(r => r.post).length
            }
        });
    } catch (error) {
        console.error('Generic letter error:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Benutzerdefinierter Brief mit HTML-Inhalt
app.post('/letters/custom', async (req, res) => {
    try {
        const { member_ids, html_content, subject, send_method } = req.body;
        // Für komplett benutzerdefinierte Briefe mit eigenem HTML

        // Mitglieder laden
        const membersResult = await axios.get(`${process.env.MEMBERS_API_URL}/members`, {
            params: { ids: member_ids?.join(',') || undefined }
        });
        const members = membersResult.data;

        const results = [];

        for (const member of members) {
            // Ersetze Platzhalter im HTML
            let personalizedHtml = html_content
                .replace(/{{anrede}}/g, member.anrede || 'Guten Tag')
                .replace(/{{vorname}}/g, member.vorname || '')
                .replace(/{{nachname}}/g, member.nachname || '')
                .replace(/{{strasse}}/g, member.strasse || '')
                .replace(/{{plz}}/g, member.plz || '')
                .replace(/{{ort}}/g, member.ort || '')
                .replace(/{{email}}/g, member.email || '')
                .replace(/{{mitgliedernummer}}/g, member.mitgliedernummer || '');

            let sendViaEmail = false;
            let sendViaPost = false;

            if (send_method === 'preference') {
                sendViaEmail = member.zustellung_email;
                sendViaPost = member.zustellung_post;
            } else if (send_method === 'email') {
                sendViaEmail = true;
            } else if (send_method === 'post') {
                sendViaPost = true;
            } else if (send_method === 'both') {
                sendViaEmail = true;
                sendViaPost = true;
            }

            const memberResult = { member_id: member.id, email: false, post: false };

            // PDF generieren
            const browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();
            await page.setContent(personalizedHtml, { waitUntil: 'networkidle0' });
            const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
            await browser.close();

            if (sendViaEmail && member.email) {
                try {
                    await transporter.sendMail({
                        from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`,
                        to: member.versand_email || member.email,
                        subject: subject || 'Mitteilung vom Feuerwehrverein Raura',
                        text: `${member.anrede || 'Guten Tag'} ${member.vorname} ${member.nachname},\n\nIm Anhang finden Sie ein Dokument vom Feuerwehrverein Raura.\n\nFreundliche Grüsse\nFeuerwehrverein Raura`,
                        attachments: [{
                            filename: `${subject?.replace(/[^a-zA-Z0-9]/g, '_') || 'Dokument'}.pdf`,
                            content: pdfBuffer
                        }]
                    });

                    await pool.query(`
                        INSERT INTO dispatch_log (type, member_id, recipient_email, subject, status, sent_at)
                        VALUES ('email', $1, $2, $3, 'sent', NOW())
                    `, [member.id, member.email, subject]);

                    memberResult.email = true;
                } catch (err) {
                    memberResult.emailError = err.message;
                }
            }

            if (sendViaPost && member.strasse && member.plz && member.ort) {
                try {
                    const tokenResponse = await axios.post(`${PINGEN_API}/oauth/token`, {
                        grant_type: 'client_credentials',
                        client_id: process.env.PINGEN_CLIENT_ID,
                        client_secret: process.env.PINGEN_CLIENT_SECRET
                    });
                    const token = tokenResponse.data.access_token;

                    const uploadResponse = await axios.post(
                        `${PINGEN_API}/organisations/${process.env.PINGEN_ORGANISATION_ID}/letters`,
                        {
                            data: {
                                type: 'letters',
                                attributes: {
                                    file_original_name: `${subject || 'Brief'}.pdf`,
                                    address_position: 'left',
                                    auto_send: true,
                                    delivery_product: 'cheap',
                                    print_mode: 'simplex',
                                    print_spectrum: 'color'
                                }
                            },
                            meta: {
                                file_content: pdfBuffer.toString('base64'),
                                recipient: {
                                    name: `${member.vorname} ${member.nachname}`,
                                    street: member.strasse,
                                    zip: member.plz,
                                    city: member.ort,
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

                    const letterId = uploadResponse.data.data?.id;

                    const filename = `${subject?.replace(/[^a-zA-Z0-9]/g, '_') || 'Brief'}_${member.nachname}_${member.vorname}.pdf`;
                    await uploadToNextcloud(filename, pdfBuffer, `/Briefe/${new Date().getFullYear()}`);

                    await pool.query(`
                        INSERT INTO dispatch_log (type, member_id, recipient_address, subject, status, external_id, sent_at)
                        VALUES ('pingen', $1, $2, $3, 'sent', $4, NOW())
                    `, [member.id, JSON.stringify({ name: `${member.vorname} ${member.nachname}`, street: member.strasse, zip: member.plz, city: member.ort }), subject, letterId]);

                    memberResult.post = true;
                    memberResult.letterId = letterId;
                } catch (err) {
                    memberResult.postError = err.message;
                }
            }

            results.push(memberResult);
        }

        res.json({
            success: true,
            results,
            summary: {
                total: results.length,
                emailSent: results.filter(r => r.email).length,
                postSent: results.filter(r => r.post).length
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Brief-Vorschau generieren (ohne zu senden)
app.post('/letters/preview', async (req, res) => {
    try {
        const { type, data } = req.body;

        let html;
        switch (type) {
            case 'event-invitation':
                html = generateEventInvitationHtml(data);
                break;
            case 'mitgliederbeitrag':
                html = generateMitgliederbeitragHtml(data);
                break;
            case 'deckblatt':
                html = generateDeckblattHtml(data);
                break;
            default:
                return res.status(400).json({ error: 'Unbekannter Brief-Typ' });
        }

        // PDF generieren
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="preview_${type}.pdf"`);
        res.send(pdfBuffer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// MAILCOW SYNC (Verteilerliste)
// ============================================

const MAILCOW_API_URL = process.env.MAILCOW_API_URL || 'https://mail.fwv-raura.ch';
const MAILCOW_API_KEY = process.env.MAILCOW_API_KEY;

// Helper: Mailcow API Request
async function mailcowRequest(method, endpoint, data = null) {
    const url = `${MAILCOW_API_URL}${endpoint}`;

    const config = {
        method,
        url,
        headers: {
            'X-API-Key': MAILCOW_API_KEY,
            'Content-Type': 'application/json'
        }
    };

    if (data) {
        config.data = data;
    }

    const response = await axios(config);
    return response.data;
}

// GET: Aktuelle Verteilerlisten/Aliase
app.get('/mailcow/aliases', async (req, res) => {
    try {
        if (!MAILCOW_API_KEY) {
            return res.status(500).json({ error: 'MAILCOW_API_KEY nicht konfiguriert' });
        }

        const aliases = await mailcowRequest('GET', '/api/v1/get/alias/all');
        res.json(aliases);
    } catch (error) {
        console.error('Mailcow aliases error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET: Bestimmten Alias abfragen
app.get('/mailcow/aliases/:address', async (req, res) => {
    try {
        if (!MAILCOW_API_KEY) {
            return res.status(500).json({ error: 'MAILCOW_API_KEY nicht konfiguriert' });
        }

        const aliases = await mailcowRequest('GET', '/api/v1/get/alias/all');
        const alias = aliases.find(a => a.address === req.params.address);

        if (!alias) {
            return res.status(404).json({ error: 'Alias nicht gefunden' });
        }

        // Goto-Adressen als Array zurückgeben
        const gotoAddresses = alias.goto.split(',').map(e => e.trim()).filter(e => e);

        res.json({
            id: alias.id,
            address: alias.address,
            active: alias.active,
            goto: gotoAddresses,
            count: gotoAddresses.length
        });
    } catch (error) {
        console.error('Mailcow alias error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST: Verteilerliste synchronisieren
app.post('/mailcow/sync', async (req, res) => {
    try {
        if (!MAILCOW_API_KEY) {
            return res.status(500).json({ error: 'MAILCOW_API_KEY nicht konfiguriert' });
        }

        const { alias_address, filter } = req.body;
        const targetAlias = alias_address || 'alle@fwv-raura.ch';

        console.log(`Mailcow Sync: Synchronisiere ${targetAlias}...`);

        // Mitglieder laden
        const membersResult = await axios.get(`${process.env.MEMBERS_API_URL}/members`);
        const members = membersResult.data;

        // Filter für E-Mail-Empfänger
        let emailRecipients = members.filter(m => {
            // Nur Mitglieder mit E-Mail und E-Mail-Zustellung
            if (!m.email || !m.zustellung_email) return false;

            // Optionaler Status-Filter
            if (filter?.status) {
                if (Array.isArray(filter.status)) {
                    if (!filter.status.includes(m.status)) return false;
                } else {
                    if (m.status !== filter.status) return false;
                }
            } else {
                // Standard: Nur Aktivmitglieder und Ehrenmitglieder
                if (m.status !== 'Aktivmitglied' && m.status !== 'Ehrenmitglied') return false;
            }

            return true;
        });

        const emailAddresses = emailRecipients.map(m => (m.versand_email || m.email).trim());

        if (emailAddresses.length === 0) {
            return res.json({
                success: true,
                message: 'Keine E-Mail-Empfänger gefunden',
                alias: targetAlias,
                count: 0
            });
        }

        // Aktuellen Alias laden
        const aliases = await mailcowRequest('GET', '/api/v1/get/alias/all');
        const currentAlias = aliases.find(a => a.address === targetAlias);

        if (!currentAlias) {
            return res.status(404).json({ error: `Alias ${targetAlias} nicht in Mailcow gefunden` });
        }

        // Vergleichen
        const currentGoto = currentAlias.goto.split(',').map(e => e.trim()).filter(e => e);
        const added = emailAddresses.filter(e => !currentGoto.includes(e));
        const removed = currentGoto.filter(e => !emailAddresses.includes(e));

        if (added.length === 0 && removed.length === 0) {
            return res.json({
                success: true,
                message: 'Keine Änderungen notwendig - Verteilerliste ist aktuell',
                alias: targetAlias,
                count: emailAddresses.length,
                changes: { added: [], removed: [] }
            });
        }

        // Alias aktualisieren
        await mailcowRequest('POST', '/api/v1/edit/alias', {
            attr: {
                goto: emailAddresses.join(','),
                active: '1'
            },
            items: [currentAlias.id.toString()]
        });

        // Log
        await pool.query(`
            INSERT INTO dispatch_log (type, subject, body, status, sent_at)
            VALUES ('mailcow_sync', $1, $2, 'sent', NOW())
        `, [
            `Verteilerliste ${targetAlias} synchronisiert`,
            JSON.stringify({ added, removed, total: emailAddresses.length })
        ]);

        console.log(`Mailcow Sync: ${targetAlias} aktualisiert - ${emailAddresses.length} Empfänger`);

        res.json({
            success: true,
            message: `Verteilerliste ${targetAlias} aktualisiert`,
            alias: targetAlias,
            count: emailAddresses.length,
            changes: { added, removed }
        });
    } catch (error) {
        console.error('Mailcow sync error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST: Manuell Adressen zu Alias hinzufügen/entfernen
app.post('/mailcow/aliases/:address/update', async (req, res) => {
    try {
        if (!MAILCOW_API_KEY) {
            return res.status(500).json({ error: 'MAILCOW_API_KEY nicht konfiguriert' });
        }

        const { add, remove } = req.body;
        const targetAlias = req.params.address;

        // Aktuellen Alias laden
        const aliases = await mailcowRequest('GET', '/api/v1/get/alias/all');
        const currentAlias = aliases.find(a => a.address === targetAlias);

        if (!currentAlias) {
            return res.status(404).json({ error: `Alias ${targetAlias} nicht gefunden` });
        }

        let currentGoto = currentAlias.goto.split(',').map(e => e.trim()).filter(e => e);

        // Hinzufügen
        if (add && Array.isArray(add)) {
            for (const email of add) {
                if (!currentGoto.includes(email.trim())) {
                    currentGoto.push(email.trim());
                }
            }
        }

        // Entfernen
        if (remove && Array.isArray(remove)) {
            currentGoto = currentGoto.filter(e => !remove.includes(e));
        }

        // Aktualisieren
        await mailcowRequest('POST', '/api/v1/edit/alias', {
            attr: {
                goto: currentGoto.join(','),
                active: '1'
            },
            items: [currentAlias.id.toString()]
        });

        res.json({
            success: true,
            message: `Alias ${targetAlias} aktualisiert`,
            count: currentGoto.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// DISPATCH LOG
// ============================================

app.get('/dispatch-log', async (req, res) => {
    try {
        const { type, status, member_id } = req.query;
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

        query += ' ORDER BY created_at DESC LIMIT 100';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`API-Dispatch running on port ${PORT}`);
});
