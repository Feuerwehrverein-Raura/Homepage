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
            // Mitgliedschaftsantrag - In Datenbank speichern
            const isFirefighterRaurica = membership.firefighterStatus === 'active';
            const registrationStatus = isFirefighterRaurica ? 'approved' : 'pending';

            // Registrierung in Datenbank speichern
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
                membership.city?.split(' ')[1] || '', // PLZ from "1234 Ort"
                membership.city?.split(' ').slice(1).join(' ') || membership.city, // Ort
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
                    membership.city?.split(' ')[0] || '',
                    membership.city?.split(' ').slice(1).join(' ') || membership.city,
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
