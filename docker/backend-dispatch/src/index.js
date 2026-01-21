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
const PINGEN_IDENTITY = 'https://identity.pingen.com';
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
        const tokenResponse = await axios.post(`${PINGEN_IDENTITY}/auth/access-tokens`, {
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
            timeSlots[timeKey].bereiche[bereich] = {
                needed: shift.needed || 1,
                assignments: shift.assignments || []
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

            const names = (shift.assignments || []).map(a => a.member_name || 'Unbekannt');
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
                const endDisplay = endTime === '00:00' ? 'Open End' : endTime;

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
                                html += `<div class="name-entry">-${a.member_name || 'Unbekannt'}</div>`;
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
            balance: org.attributes?.balance,
            currency: org.attributes?.currency || 'CHF',
            isStaging: process.env.PINGEN_STAGING === 'true'
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

// Brief manuell senden
app.post('/pingen/send-manual', async (req, res) => {
    try {
        const { member_id, event_id, subject, body } = req.body;

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
        const pingenResult = await sendToPingen(html, member, member_id, event_id);

        res.json({
            success: true,
            letterId: pingenResult.letterId,
            recipient: `${member.vorname} ${member.nachname}`
        });
    } catch (error) {
        console.error('Manual Pingen send error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Arbeitsplan per Post senden
app.post('/pingen/send-arbeitsplan', async (req, res) => {
    try {
        const { event_id, member_id, pdf_base64 } = req.body;

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

        // PDF direkt an Pingen senden
        const uploadResponse = await axios.post(
            `${PINGEN_API}/organisations/${process.env.PINGEN_ORGANISATION_ID}/letters`,
            {
                data: {
                    type: 'letters',
                    attributes: {
                        file_original_name: `${eventTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
                        address_position: 'left',
                        auto_send: true,
                        delivery_product: 'cheap',
                        print_mode: 'simplex',
                        print_spectrum: 'grayscale'
                    }
                },
                meta: {
                    file_content: pdf_base64,
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
        const { webhook_url } = req.body;
        const callbackUrl = webhook_url || `${process.env.DISPATCH_PUBLIC_URL || 'https://dispatch.fwv-raura.ch'}/pingen/webhook`;

        // Token holen
        const tokenResponse = await axios.post(`${PINGEN_IDENTITY}/auth/access-tokens`, {
            grant_type: 'client_credentials',
            client_id: process.env.PINGEN_CLIENT_ID,
            client_secret: process.env.PINGEN_CLIENT_SECRET
        });

        const token = tokenResponse.data.access_token;

        // Webhook registrieren
        const webhookResponse = await axios.post(
            `${PINGEN_API}/organisations/${process.env.PINGEN_ORGANISATION_ID}/webhooks`,
            {
                data: {
                    type: 'webhooks',
                    attributes: {
                        url: callbackUrl,
                        event_category: 'letters',
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
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// Registrierte Webhooks abrufen
app.get('/pingen/webhooks', async (req, res) => {
    try {
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
async function sendToPingen(html, member, memberId, eventId) {
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
    const tokenResponse = await axios.post(`${PINGEN_IDENTITY}/auth/access-tokens`, {
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
