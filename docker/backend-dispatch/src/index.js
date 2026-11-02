// DEUTSCH: Backend-Service fuer den Versand von E-Mails, Briefen (Pingen), PDF-Generierung und Kontaktformulare
// DEUTSCH: Imports: Express-Server, Sicherheit, Datenbank, E-Mail, PDF, Pingen-Briefversand, Schweizer QR-Rechnung
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const { authenticateAny, requireRole } = require('./auth-middleware');
const puppeteer = require('puppeteer');
const axios = require('axios');
const crypto = require('crypto');
const nachrichtLayout = require('./nachricht-layout');
const { anlassPdf, mitAnlassPdf, seitenAnhaengen } = require('./anlass-pdf');
const einladungLayout = require('./einladung-layout');
const briefKern = require('./brief-versand');
const { briefErstellen, briefProtokollieren, absenderLaden, variablenEinsetzen, einladungInhalt, emailVorschau } = require('./nachricht-routen');

// ============================================
// CONTACT FORM RATE LIMITING (in-memory)
// DEUTSCH: Schutz gegen Spam im Kontaktformular - max. 3 Anfragen pro Stunde pro IP
// ============================================
const contactRateLimit = new Map(); // IP -> { count, resetAt }
const CONTACT_RATE_LIMIT = 3; // max requests per window
const CONTACT_RATE_WINDOW = 60 * 60 * 1000; // 1 hour

// DEUTSCH: Prueft ob eine IP-Adresse das Rate-Limit ueberschritten hat (true = erlaubt, false = blockiert)
function checkContactRateLimit(ip) {
    const now = Date.now();
    const entry = contactRateLimit.get(ip);
    if (!entry || now > entry.resetAt) {
        contactRateLimit.set(ip, { count: 1, resetAt: now + CONTACT_RATE_WINDOW });
        return true;
    }
    if (entry.count >= CONTACT_RATE_LIMIT) {
        return false;
    }
    entry.count++;
    return true;
}

// DEUTSCH: Aufraeumen abgelaufener Rate-Limit-Eintraege alle 30 Minuten
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of contactRateLimit) {
        if (now > entry.resetAt) contactRateLimit.delete(ip);
    }
}, 30 * 60 * 1000);

// DEUTSCH: Express-App, Port, Service-Name und PostgreSQL-Verbindungspool initialisieren
const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_NAME = 'api-dispatch';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ===========================================
// LOGGING UTILITIES
// DEUTSCH: Strukturiertes JSON-Logging mit Zeitstempel und Service-Name
// ===========================================
// DEUTSCH: Erstellt einen strukturierten Log-Eintrag als JSON (fuer Docker/Monitoring)
function log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, service: SERVICE_NAME, level, message, ...data };
    console.log(JSON.stringify(logEntry));
}
function logInfo(message, data = {}) { log('INFO', message, data); }
function logWarn(message, data = {}) { log('WARN', message, data); }
function logError(message, data = {}) { log('ERROR', message, data); }

// DEUTSCH: Ermittelt die echte Client-IP aus Proxy-Headern (Cloudflare, Traefik, etc.)
function getClientIp(req) {
    if (req.headers['cf-connecting-ip']) return req.headers['cf-connecting-ip'];
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) return forwardedFor.split(',')[0].trim();
    if (req.headers['x-real-ip']) return req.headers['x-real-ip'];
    return req.ip;
}

// DEUTSCH: SMTP-Transporter fuer E-Mail-Versand (Mailcow/SMTP-Server)
// Akzeptiert sowohl SMTP_HOST (fwv-website .env) als auch SMTP_SERVER (shared /opt/docker/.env)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || process.env.SMTP_SERVER,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT === '465',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
    }
});

// DEUTSCH: Pingen-Konfiguration - API fuer physischen Briefversand (Druck+Porto)
const PINGEN_IDENTITY = 'https://identity.pingen.com';
const PINGEN_API_PRODUCTION = 'https://api.pingen.com';
const PINGEN_API_STAGING = 'https://api-staging.pingen.com';

// DEUTSCH: Gibt die Pingen-API-URL zurueck (Staging zum Testen oder Produktion)
function getPingenApi(staging = false) {
    return staging ? PINGEN_API_STAGING : PINGEN_API_PRODUCTION;
}

// DEUTSCH: Gibt die Pingen-Organisations-ID zurueck (Staging oder Produktion)
function getPingenOrgId(staging = false) {
    if (staging && process.env.PINGEN_STAGING_ORGANISATION_ID) {
        return process.env.PINGEN_STAGING_ORGANISATION_ID;
    }
    return process.env.PINGEN_ORGANISATION_ID;
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



// DEUTSCH: Kostenmeldung an den Kassier fuer jeden Pingen-Brief - ueber die
// Sammelmail (sammelmail.js, taeglich 18:00), damit er bei vielen Briefen eine
// Mail bekommt statt einer pro Brief. Vorher nur bei /pingen/send und sofort;
// send-post (Hauptweg), send-manual und Arbeitsplan meldeten gar nichts.
async function sendPingenCostNotification(recipientName, letterId, isStaging = false, betreff = '') {
    try {
        const kassierResult = await pool.query(
            "SELECT vorname, email FROM members WHERE funktion ILIKE '%Kassier%' AND email IS NOT NULL LIMIT 1"
        );
        if (kassierResult.rows.length === 0) {
            logWarn('Kassier not found for Pingen cost notification');
            return;
        }
        const kassier = kassierResult.rows[0];
        const environment = isStaging ? ' (STAGING/TEST)' : '';
        const worum = betreff ? `\nBetreff: ${betreff}` : '';
        await vormerken(pool, {
            to: kassier.email,
            subject: `Pingen-Brief${environment}: ${recipientName}`,
            text: `Hallo ${kassier.vorname},\n\nEin Brief wurde über Pingen versendet:\n\nEmpfänger: ${recipientName}${worum}\nBrief-ID: ${letterId}\n\nDie genauen Kosten findest du im Pingen Dashboard (https://app.pingen.com).`
        });
        logInfo('Pingen cost notification queued for Kassier', { recipient: recipientName, letterId });
    } catch (error) {
        logError('Failed to queue Pingen cost notification', { error: error.message });
    }
}











// DEUTSCH: CORS-Konfiguration - erlaubt alle fwv-raura.ch Subdomains und localhost fuer Entwicklung
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        // Allow all fwv-raura.ch subdomains and localhost for dev
        const allowed = /^https:\/\/([a-z0-9-]+\.)?fwv-raura\.ch$/.test(origin) ||
                        origin === 'http://localhost:3000' ||
                        origin === 'http://localhost:5173';
        callback(null, allowed);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true
}));
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
// DEUTSCH: JSON-Body-Parser mit erhoehtem Limit (50 MB) fuer PDF-Uploads
app.use(express.json({ limit: '50mb' }));

// Trust proxy for correct client IP
app.set('trust proxy', true);

// ===========================================
// REQUEST LOGGING MIDDLEWARE
// DEUTSCH: Protokolliert jede Anfrage mit Request-ID, Methode, Pfad, IP und Antwortzeit
// ===========================================
app.use((req, res, next) => {
    if (req.path === '/health') return next(); // DEUTSCH: Health-Check nicht loggen

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

// DEUTSCH: Health-Check-Endpunkt fuer Docker/Traefik - gibt Service-Status und Version zurueck
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'api-dispatch', version: process.env.APP_VERSION || '0.0.0' });
});

// ============================================
// TEMPLATES
// DEUTSCH: CRUD-Endpunkte fuer Versand-Vorlagen (E-Mail/Brief-Templates mit Variablen)
// ============================================

// DEUTSCH: Alle Templates abrufen, optional nach Typ filtern (email, brief_ch, brief_de)
app.get('/templates', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
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

// DEUTSCH: Neues Template erstellen (Name, Typ, Betreff, Inhalt, Variablen)
app.post('/templates', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
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

// DEUTSCH: Bestehendes Template aktualisieren (nach ID)
app.put('/templates/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, type, subject, body, variables } = req.body;
        const result = await pool.query(`
            UPDATE dispatch_templates
            SET name = $1, type = $2, subject = $3, body = $4, variables = $5, updated_at = NOW()
            WHERE id = $6 RETURNING *
        `, [name, type, subject, body, variables, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Template nicht gefunden' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Template loeschen (nach ID)
app.delete('/templates/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM dispatch_templates WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Template nicht gefunden' });
        }
        res.json({ success: true, deleted: id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// EMAIL
// DEUTSCH: E-Mail-Versand mit Template-Unterstuetzung und Variablen-Ersetzung
// ============================================

// DEUTSCH: Einzelne E-Mail senden - optional mit Template und Variablen (z.B. {{vorname}})
app.post('/email/send', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    console.log('[EMAIL] /email/send called with:', { to: req.body.to, cc: req.body.cc, template_id: req.body.template_id, member_id: req.body.member_id, hasHtml: !!req.body.html });
    try {
        const { to, cc, subject, body, html, template_id: rawTemplateId, variables, member_id, event_id } = req.body;

        // Nur DB-UUIDs als Template-ID akzeptieren - hardcoded Frontend-IDs wie
        // "tmpl_event_invitation" existieren nicht in der dispatch_templates Tabelle
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const template_id = (rawTemplateId && uuidRegex.test(rawTemplateId)) ? rawTemplateId : null;

        let emailSubject = subject;
        let emailBody = body;
        let emailHtmlOverride = html;

        // Use template if provided
        if (template_id) {
            const template = await pool.query('SELECT * FROM dispatch_templates WHERE id = $1', [template_id]);
            if (template.rows.length > 0) {
                emailSubject = template.rows[0].subject;
                emailBody = template.rows[0].body;
            }
        }

        // Platzhalter ({{vorname}} ...) einsetzen - auch ohne Vorlage. Bisher
        // nur mit template_id; frei getippte Texte gingen mit {{vorname}} raus.
        // Im mitgegebenen HTML werden die Werte escaped.
        if (variables) {
            emailSubject = variablenEinsetzen(emailSubject, variables);
            emailBody = variablenEinsetzen(emailBody, variables);
            emailHtmlOverride = variablenEinsetzen(emailHtmlOverride, variables, true);
        }

        // Wenn HTML explizit mitgegeben: direkt nutzen. Sonst aus Body generieren.
        let emailHtml;
        if (emailHtmlOverride) {
            emailHtml = emailHtmlOverride;
        } else {
            // Convert URLs to clickable links for HTML version
            // IMPORTANT: Match URLs BEFORE replacing newlines, otherwise <br> gets included in URLs
            const urlRegex = /(https?:\/\/[^\s<]+)/g;
            emailHtml = (emailBody || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(urlRegex, '<a href="$1">$1</a>')
                .replace(/\n/g, '<br>');
        }

        // Benachrichtigung (sammeln: true): nicht sofort, sondern in der
        // taeglichen Sammelmail um 18:00 (src/sammelmail.js).
        if (kannSammeln(req.body)) {
            await vormerken(pool, { to, subject: emailSubject, text: emailBody, html: emailHtml, member_id, event_id, template_id });
            console.log('[EMAIL] fuer die Sammelmail vorgemerkt:', to, '-', emailSubject);
            return res.json({ success: true, gesammelt: true });
        }

        // Send email with both text and HTML versions
        const mailOptions = {
            from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`,
            to,
            subject: emailSubject,
            text: emailBody || '',
            html: emailHtml
        };
        if (cc) {
            mailOptions.cc = cc;
        }
        // Attachments durchreichen (z.B. fuer den taeglichen Backup-Export).
        // Format: [{ filename, content (Buffer oder base64-String), contentType }, ...]
        if (Array.isArray(req.body.attachments) && req.body.attachments.length > 0) {
            mailOptions.attachments = req.body.attachments.map(a => {
                const content = typeof a.content === 'string'
                    ? Buffer.from(a.content, 'base64')
                    : a.content;
                return { filename: a.filename, content, contentType: a.contentType };
            });
        }
        const info = await transporter.sendMail(mailOptions);

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

// DEUTSCH: Massen-E-Mail an mehrere Mitglieder senden (nur an jene mit E-Mail-Zustellung)
// Wenn exclude_honored=true gesetzt ist, werden Ehrenmitglieder ausgeschlossen (Sicherheit fuer Beitragsbriefe)
app.post('/email/bulk', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    console.log('[EMAIL BULK] /email/bulk called with:', { member_ids: req.body.member_ids, template_id: req.body.template_id, exclude_honored: req.body.exclude_honored });
    try {
        const { member_ids, template_id, variables, exclude_honored } = req.body;
        // layout: 'standard' -> das Backend baut die HTML-Mail im offiziellen
        // Layout aus dem Text (nachricht-layout.js), statt html vom Client.
        // praeferenz_ignorieren: true -> auch an Mitglieder ohne
        // E-Mail-Zustellung (Versandart "E-Mail"); sonst wie bisher nur mit.
        // layout: 'einladung' + event_id -> Einladungs-Layout (einladung-layout.js),
        // body ist dann die Einleitung.
        const einladung = req.body.layout === 'einladung' && req.body.event_id;
        const standardLayout = req.body.layout === 'standard' || !!einladung;
        const praeferenzIgnorieren = req.body.praeferenz_ignorieren === true;
        const absender = standardLayout ? await absenderLaden(pool) : null;
        const einladungsDaten = einladung ? await einladungLayout.einladungDaten(pool, req.body.event_id) : null;
        if (einladung && !einladungsDaten) return res.status(404).json({ error: 'Anlass nicht gefunden' });
        // Interne Aufrufe (Mitglieder laden, /email/send) mit dem Ausweis des
        // Aufrufers UND dem API-Schluessel: kam der Aufruf selbst mit Schluessel
        // (api-accounting, Beitragsversand), fehlte sonst jede Anmeldung.
        const internKopf = { Authorization: req.headers.authorization || '', 'x-api-key': process.env.API_KEY || '' };
        const bodyHtml = typeof req.body.body_html === 'string' && req.body.body_html.trim() ? req.body.body_html : null;

        // Get members (Authorization-Header vom Request weiterreichen)
        console.log('[EMAIL BULK] Fetching members from:', `${process.env.MEMBERS_API_URL}/members`);
        const membersResp = await axios.get(`${process.env.MEMBERS_API_URL}/members`, {
            params: { ids: member_ids.join(',') },
            headers: internKopf
        });
        // SICHERHEIT: Zusaetzlich client-seitig nach den angefragten IDs filtern, falls das Members-API
        // den ids-Parameter (noch) nicht unterstuetzt. Sonst wuerde an ALLE Mitglieder gesendet!
        const requestedIds = new Set((member_ids || []).map(String));
        const filteredMembers = membersResp.data.filter(m => requestedIds.has(String(m.id)));
        if (filteredMembers.length !== membersResp.data.length) {
            console.warn('[EMAIL BULK] Members-API did not respect ids filter. Filtered', membersResp.data.length, '->', filteredMembers.length);
        }
        console.log('[EMAIL BULK] Processing', filteredMembers.length, 'members (requested:', requestedIds.size + ')');

        // Einladung zu einem Anlass (event_id): sein PDF kommt mit (anlass-pdf.js).
        const anhaenge = mitAnlassPdf(req.body.attachments, await anlassPdf(pool, req.body.event_id));

        const results = [];
        let skipped = 0;
        for (const member of filteredMembers) {
            if (!member.email || (!member.zustellung_email && !praeferenzIgnorieren)) {
                skipped++;
                continue;
            }
            // Sicherheit: Ehrenmitglieder werden bei Mitgliedsbeitrag-Versand ausgeschlossen
            if (exclude_honored && member.status === 'Ehrenmitglied') {
                console.log('[EMAIL BULK] Skipping Ehrenmitglied:', member.vorname, member.nachname);
                skipped++;
                continue;
            }

            try {
                // Merge member data with variables
                const mergedVars = {
                    anrede: member.anrede,
                    vorname: member.vorname,
                    nachname: member.nachname,
                    strasse: member.strasse,
                    plz: member.plz,
                    ort: member.ort,
                    email: member.email,
                    ...variables
                };

                await axios.post(`http://localhost:${PORT}/email/send`, {
                    to: member.versand_email || member.email,
                    template_id,
                    variables: mergedVars,
                    member_id: member.id,
                    subject: req.body.subject,
                    body: req.body.body,
                    html: standardLayout
                        ? nachrichtLayout.emailHtml({
                            betreff: req.body.subject,
                            text: req.body.body,
                            mitglied: member,
                            absender,
                            // body_html: Text aus dem Editor der Website
                            textHtml: bodyHtml,
                            inhaltHtml: einladung
                                ? await einladungInhalt(pool, req.body.event_id, req.body.body, member,
                                    async () => einladungsDaten, bodyHtml)
                                : null
                        })
                        : req.body.html,
                    attachments: anhaenge,
                    event_id: req.body.event_id || null
                }, {
                    headers: internKopf
                });

                results.push({ member_id: member.id, success: true });
            } catch (err) {
                results.push({ member_id: member.id, success: false, error: err.message });
            }
        }

        console.log('[EMAIL BULK] Completed:', { total: results.length, success: results.filter(r => r.success).length });
        const success = results.filter(r => r.success).length;
        res.json({ results, total: results.length, success, failed: results.length - success, skipped });
    } catch (error) {
        console.error('[EMAIL BULK] ERROR:', error.message, error.stack);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// SMART DISPATCH (Auto-select email/brief_ch/brief_de)
// DEUTSCH: Intelligenter Versand - waehlt automatisch E-Mail oder Brief (CH/DE) pro Mitglied
// ============================================


// ============================================
// PINGEN (Post)
// DEUTSCH: Physischer Briefversand ueber Pingen-API (PDF hochladen, drucken, versenden)
// ============================================


// ============================================
// KONTAKTFORMULAR (ersetzt n8n)
// DEUTSCH: Oeffentliches Kontaktformular und Mitgliedschaftsantraege mit Double-Opt-In
// ============================================

// DEUTSCH: Schritt 1 - Kontaktformular absenden: Spam-Schutz (Honeypot, Zeitpruefung, Rate-Limit),
// dann Bestaetigungs-E-Mail senden (Double Opt-In). Kein Auth noetig (oeffentlich).
app.post('/contact', async (req, res) => {
    try {
        const { name, email, subject, message, type, membership, _honeypot, _timestamp } = req.body;
        const clientIp = getClientIp(req);

        // --- SPAM PROTECTION ---

        // 1. Honeypot check: should be empty
        if (_honeypot) {
            logWarn('Contact spam blocked (honeypot)', { ip: clientIp, email });
            // Return success to not reveal detection
            return res.json({ success: true, message: 'Bitte bestätigen Sie Ihre E-Mail-Adresse' });
        }

        // 2. Timestamp check: form must be filled out for at least 3 seconds
        if (_timestamp) {
            const submittedAt = parseInt(_timestamp, 10);
            const elapsed = Date.now() - submittedAt;
            if (elapsed < 3000) {
                logWarn('Contact spam blocked (too fast)', { ip: clientIp, email, elapsed });
                return res.json({ success: true, message: 'Bitte bestätigen Sie Ihre E-Mail-Adresse' });
            }
        }

        // 3. Rate limiting: max 3 submissions per hour per IP
        if (!checkContactRateLimit(clientIp)) {
            logWarn('Contact rate limited', { ip: clientIp, email });
            return res.status(429).json({
                success: false,
                error: 'Zu viele Anfragen. Bitte versuchen Sie es in einer Stunde erneut.'
            });
        }

        // 4. Basic validation
        if (!email || !name) {
            return res.status(400).json({ success: false, error: 'Name und E-Mail sind erforderlich' });
        }

        // Simple email format check
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, error: 'Ungültige E-Mail-Adresse' });
        }

        // --- DOUBLE OPT-IN ---

        // Generate confirmation token
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        // Store pending contact request
        await pool.query(`
            INSERT INTO contact_pending (token, payload, ip_address, expires_at)
            VALUES ($1, $2, $3, $4)
        `, [token, JSON.stringify(req.body), clientIp, expiresAt]);

        // Clean up expired entries
        await pool.query('DELETE FROM contact_pending WHERE expires_at < NOW()');

        // Send confirmation email
        const confirmUrl = `https://api.fwv-raura.ch/contact/confirm/${token}`;
        const recipientName = type === 'membership' && membership
            ? `${membership.firstname} ${membership.lastname}`
            : name;

        await transporter.sendMail({
            from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`,
            to: email,
            subject: 'Bitte bestätigen Sie Ihre Anfrage - FWV Raura',
            text: `
Guten Tag ${recipientName},

Bitte bestätigen Sie Ihre Anfrage, indem Sie auf den folgenden Link klicken:

${confirmUrl}

Der Link ist 1 Stunde gültig.

Falls Sie diese Anfrage nicht gesendet haben, können Sie diese E-Mail ignorieren.

Mit freundlichen Grüssen
Feuerwehrverein Raura
            `.trim()
        });

        logInfo('Contact confirmation sent', { ip: clientIp, email, type: type || 'contact' });

        res.json({
            success: true,
            message: 'Bitte bestätigen Sie Ihre E-Mail-Adresse. Sie haben eine Bestätigungs-E-Mail erhalten.',
            requiresConfirmation: true
        });
    } catch (error) {
        logError('Contact form error', { error: error.message });
        res.status(500).json({ success: false, error: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.' });
    }
});

// DEUTSCH: Push an den Vorstand ueber api-members /internal/vorstand-meldung
// (dort Empfaenger, Abschalter und Sperrfrist). Fire-and-forget: der Antrag
// ist gespeichert, auch wenn der Push scheitert.
function vorstandMelden(art, angaben) {
    // INTERNAL_API_KEY, sonst der Dienst-Schluessel API_KEY (den hat
    // api-dispatch immer; api-members nimmt beide an).
    const kopf = process.env.INTERNAL_API_KEY
        ? { 'X-Internal-Key': process.env.INTERNAL_API_KEY }
        : (process.env.API_KEY ? { 'x-api-key': process.env.API_KEY } : null);
    if (!kopf) {
        logWarn('Kein interner Schluessel - kein Vorstand-Push', { art });
        return;
    }
    axios.post(`${process.env.MEMBERS_API_URL || 'http://api-members:3000'}/internal/vorstand-meldung`,
        { art, angaben }, { headers: kopf, timeout: 5000 })
        .catch(e => logError('Vorstand-Push fehlgeschlagen', { art, error: e.message }));
}

// DEUTSCH: Schritt 2 - Bestaetigung per Klick auf den Link in der E-Mail
// Verarbeitet Kontaktanfrage oder Mitgliedschaftsantrag, sendet Benachrichtigungen
// Bei aktiven Feuerwehr-Mitgliedern: automatische Aufnahme als Aktivmitglied
// Bei anderen: Antrag zur manuellen Pruefung durch den Vorstand
app.get('/contact/confirm/:token', async (req, res) => {
    try {
        const { token } = req.params;

        // Look up pending request
        const result = await pool.query(`
            SELECT * FROM contact_pending
            WHERE token = $1 AND confirmed = false AND expires_at > NOW()
        `, [token]);

        if (result.rows.length === 0) {
            return res.send(`
                <html><head><meta charset="utf-8"><title>Fehler</title>
                <style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f3f4f6}
                .card{background:white;padding:2rem;border-radius:1rem;box-shadow:0 4px 6px rgba(0,0,0,0.1);text-align:center;max-width:400px}
                h2{color:#dc2626}</style></head>
                <body><div class="card"><h2>Link ungültig oder abgelaufen</h2>
                <p>Dieser Bestätigungslink ist nicht mehr gültig. Bitte senden Sie Ihre Anfrage erneut.</p>
                <a href="https://fwv-raura.ch/#contact" style="color:#cc0000">Zurück zur Website</a>
                </div></body></html>
            `);
        }

        const pending = result.rows[0];
        const payload = pending.payload;

        // Mark as confirmed
        await pool.query('UPDATE contact_pending SET confirmed = true WHERE id = $1', [pending.id]);

        // --- PROCESS THE ACTUAL CONTACT REQUEST ---
        const { name, email, subject, message, type, membership } = payload;
        let emailBody = '';
        let emailSubject = '';

        if (type === 'membership' && membership) {
            // Mitgliedschaftsantrag
            // IMMER zur Prüfung durch den Vorstand — auch aktive Feuerwehr-Raurica-
            // Mitglieder gehen in die Warteschlange (Schutz vor Missbrauch/Spam).
            const registrationStatus = 'pending';

            // "PLZ und Ort" robust trennen: nur eine FÜHRENDE Ziffernfolge gilt als
            // PLZ (Spalte ist varchar(10)). Ohne führende PLZ bleibt sie leer und die
            // ganze Eingabe wandert in den Ort (z.B. nur "Kaiseraugst").
            const cityRaw = (membership.city || '').trim();
            const plzMatch = cityRaw.match(/^(\d{4,10})\s+(.*)$/);
            const plz = plzMatch ? plzMatch[1] : '';
            const ort = plzMatch ? plzMatch[2].trim() : cityRaw;

            const antrag = await pool.query(`
                INSERT INTO member_registrations
                (anrede, geschlecht, geburtstag, vorname, nachname, strasse, plz, ort,
                 telefon, mobile, email, feuerwehr_status,
                 korrespondenz_methode, korrespondenz_adresse, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                RETURNING id
            `, [
                membership.anrede || null, membership.geschlecht || null, membership.geburtstag || null,
                membership.firstname, membership.lastname, membership.street,
                plz, ort, membership.phone, membership.mobile || null,
                membership.email, membership.firefighterStatus,
                membership.correspondenceMethod, membership.correspondenceAddress,
                registrationStatus
            ]);

            // Push an den Vorstand (api-members, src/vorstand-melder.js) -
            // wartet nicht, Fehler nur ins Log.
            vorstandMelden('antrag', {
                id: antrag.rows[0]?.id,
                name: `${membership.firstname || ''} ${membership.lastname || ''}`.trim()
            });

            const fwStatusText =
                membership.firefighterStatus === 'Ja (aktiv)' ? 'Aktives Feuerwehr-Mitglied (Raurica)' :
                membership.firefighterStatus === 'former' ? 'Ehemaliges Feuerwehr-Mitglied' :
                'Kein Feuerwehr-Mitglied';

            // Bestätigungs-Mail an die antragstellende Person (für alle gleich)
            await transporter.sendMail({
                from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`,
                to: membership.email,
                subject: 'Bestätigung Ihres Mitgliedschaftsantrags - FWV Raura',
                text: `
Guten Tag ${membership.firstname} ${membership.lastname},

Vielen Dank für Ihren Mitgliedschaftsantrag beim Feuerwehrverein Raura!

Wir haben Ihren Antrag erhalten. Der Vorstand prüft ihn und Sie werden
über das Ergebnis informiert.

Mit freundlichen Grüssen
Feuerwehrverein Raura
                `.trim()
            });

            emailSubject = `Neuer Mitgliedschaftsantrag: ${membership.firstname} ${membership.lastname} (zu prüfen)`;
            emailBody = `
NEUER MITGLIEDSCHAFTSANTRAG (ZU PRÜFEN)
=======================================

${membership.firstname} ${membership.lastname} möchte Mitglied werden.

Persönliche Daten:
- Anrede / Geschlecht: ${membership.anrede || '-'} / ${membership.geschlecht || '-'}
- Geburtstag: ${membership.geburtstag || '-'}
- Name: ${membership.firstname} ${membership.lastname}
- Strasse: ${membership.street}
- Ort: ${membership.city}
- Telefon: ${membership.phone}
- Mobile: ${membership.mobile || '-'}
- E-Mail: ${membership.email}

Feuerwehr-Status: ${fwStatusText}
Korrespondenz: ${membership.correspondenceMethod}

Der Antrag muss im Vorstand-Bereich geprüft und genehmigt werden:
https://fwv-raura.ch/vorstand.html
            `.trim();

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

            await transporter.sendMail({
                from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`,
                to: email,
                subject: 'Ihre Anfrage wurde bestätigt - FWV Raura',
                text: `
Guten Tag ${name},

Vielen Dank für die Bestätigung Ihrer Nachricht!

Wir haben Ihre Anfrage erhalten und werden uns baldmöglichst bei Ihnen melden.

Mit freundlichen Grüssen
Feuerwehrverein Raura
                `.trim()
            });

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

        logInfo('Contact confirmed and processed', { email, type: type || 'contact' });

        // Show success page
        res.send(`
            <html><head><meta charset="utf-8"><title>Bestätigt</title>
            <style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f3f4f6}
            .card{background:white;padding:2rem;border-radius:1rem;box-shadow:0 4px 6px rgba(0,0,0,0.1);text-align:center;max-width:400px}
            h2{color:#16a34a}</style></head>
            <body><div class="card"><h2>Anfrage bestätigt!</h2>
            <p>Ihre Nachricht wurde erfolgreich übermittelt. Wir werden uns baldmöglichst bei Ihnen melden.</p>
            <a href="https://fwv-raura.ch" style="color:#cc0000">Zurück zur Website</a>
            </div></body></html>
        `);
    } catch (error) {
        logError('Contact confirmation error', { error: error.message, token: req.params.token });
        res.status(500).send(`
            <html><head><meta charset="utf-8"><title>Fehler</title>
            <style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f3f4f6}
            .card{background:white;padding:2rem;border-radius:1rem;box-shadow:0 4px 6px rgba(0,0,0,0.1);text-align:center;max-width:400px}
            h2{color:#dc2626}</style></head>
            <body><div class="card"><h2>Fehler</h2>
            <p>Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.</p>
            <a href="https://fwv-raura.ch/#contact" style="color:#cc0000">Zurück zur Website</a>
            </div></body></html>
        `);
    }
});

// ============================================
// MEMBER REGISTRATIONS (Mitglieder-Anträge)
// DEUTSCH: Verwaltung von Mitgliedschaftsantraegen (Genehmigen/Ablehnen durch Vorstand)
// ============================================

// DEUTSCH: Anzahl offener Mitgliedschaftsantraege abrufen (fuer Badge im UI)
app.get('/member-registrations/count/pending', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
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

// DEUTSCH: Alle Registrierungen abrufen, optional nach Status filtern (pending/approved/rejected)
app.get('/member-registrations', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
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

// DEUTSCH: Einzelne Registrierung nach ID abrufen (Detail-Ansicht)
app.get('/member-registrations/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
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



// ============================================
// NEWSLETTER (ersetzt n8n)
// DEUTSCH: Newsletter-An-/Abmeldung mit Double-Opt-In (oeffentliche Endpunkte)
// ============================================

// DEUTSCH: Newsletter-Anmeldung - speichert E-Mail und sendet Bestaetigungslink
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

        let subscriberToken;
        if (existing.rows.length > 0) {
            if (existing.rows[0].confirmed) {
                return res.json({ success: true, message: 'Sie sind bereits angemeldet' });
            }
            subscriberToken = existing.rows[0].token;
        } else {
            // Neuer Subscriber
            subscriberToken = require('crypto').randomBytes(32).toString('hex');
            await pool.query(`
                INSERT INTO newsletter_subscribers (email, token, confirmed, created_at)
                VALUES ($1, $2, false, NOW())
            `, [email, subscriberToken]);
        }

        // Bestätigungs-E-Mail senden
        const confirmUrl = `${process.env.WEBSITE_URL || 'https://fwv-raura.ch'}/newsletter-confirm?token=${subscriberToken}`;

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

// DEUTSCH: Newsletter-Anmeldung bestaetigen (per Token aus der Bestaetigungs-E-Mail)
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

// DEUTSCH: Newsletter abmelden (per E-Mail oder Token)
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
// DEUTSCH: Verwaltung von E-Mail-Postfaechern und Aliases ueber die Mailcow-API
// ============================================

// DEUTSCH: Mailcow-Konfiguration (Self-Hosted E-Mail-Server)
const MAILCOW_API_URL = process.env.MAILCOW_API_URL || 'https://mail.test.juroct.net';
const MAILCOW_API_KEY = process.env.MAILCOW_API_KEY;
const MAILCOW_DOMAIN = 'fwv-raura.ch';

// DEUTSCH: Wrapper fuer Mailcow-API-Aufrufe mit API-Key-Authentifizierung
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
    const response = await axios(config);
    // Mailcow gibt HTTP 200 auch bei Fehlern zurueck, Fehler stehen im Body
    const result = Array.isArray(response.data) ? response.data[0] : response.data;
    if (result && result.type === 'danger') {
        const msg = Array.isArray(result.msg) ? result.msg[0] : result.msg;
        const err = new Error(msg || 'Mailcow operation failed');
        err.mailcowError = true;
        err.response = { data: response.data };
        throw err;
    }
    return response;
}

// DEUTSCH: Alle Mailboxen der Domain fwv-raura.ch abrufen
app.get('/mailcow/mailboxes', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
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

// DEUTSCH: Einzelne Mailbox nach E-Mail-Adresse abrufen
app.get('/mailcow/mailboxes/:email', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const response = await mailcowApi('GET', `/get/mailbox/${req.params.email}`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// DEUTSCH: Neue Mailbox erstellen (Benutzername, Name, Passwort, Quota)
app.post('/mailcow/mailboxes', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
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

// DEUTSCH: Mailbox aktualisieren (Name, Quota, Passwort, Aktiv-Status)
app.put('/mailcow/mailboxes/:email', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
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

// DEUTSCH: Mailbox loeschen (nach E-Mail-Adresse)
app.delete('/mailcow/mailboxes/:email', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const response = await mailcowApi('POST', '/delete/mailbox', [req.params.email]);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// DEUTSCH: Alle E-Mail-Aliase der Domain abrufen (z.B. info@ -> vorstand@)
app.get('/mailcow/aliases', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
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

// DEUTSCH: Neuen E-Mail-Alias erstellen (Weiterleitungsadresse)
app.post('/mailcow/aliases', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
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

// DEUTSCH: Alias aktualisieren (Zieladresse oder Aktiv-Status aendern)
app.put('/mailcow/aliases/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
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

// DEUTSCH: Alias loeschen (nach ID)
app.delete('/mailcow/aliases/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const response = await mailcowApi('POST', '/delete/alias', [req.params.id]);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// DEUTSCH: Domain-Informationen abrufen (Speicherplatz, Anzahl Mailboxen, etc.)
app.get('/mailcow/domain', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const response = await mailcowApi('GET', `/get/domain/${MAILCOW_DOMAIN}`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// DEUTSCH: Speicherplatz-Nutzung aller Mailboxen abrufen (Quota in Prozent)
app.get('/mailcow/quota', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
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
// DEUTSCH: Generiert PDF-Arbeitsplaene fuer Anlaesse (Schichten, Bereiche, Helfer)
// ============================================

// ============================================
// DISPATCH LOG
// DEUTSCH: Protokoll aller versendeten E-Mails und Briefe (filterbar nach Typ, Status, Mitglied)
// ============================================

// DEUTSCH: Versand-Protokoll abrufen - filterbar nach Typ (email/pingen), Status, Mitglied, Event
app.get('/dispatch-log', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
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
// DEUTSCH: Verwaltung und Ueberwachung von Pingen-Briefen (Status, Kosten, Statistiken)
// ============================================

// DEUTSCH: Alle versendeten Pingen-Briefe mit Mitglied- und Event-Infos abrufen
app.get('/pingen/letters', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
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

// DEUTSCH: Aktuellen Brief-Status direkt von der Pingen-API abrufen und in DB aktualisieren
app.get('/pingen/letters/:letterId/status', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
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
            `${PINGEN_API}/organisations/${getPingenOrgId(staging)}/letters/${letterId}`,
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

// DEUTSCH: Pingen-Konto-Informationen abrufen (Guthaben, Waehrung, Organisation)
app.get('/pingen/account', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
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

// DEUTSCH: Pingen-Versandstatistiken abrufen (Anzahl gesendet, ausstehend, fehlgeschlagen, letzte 7/30 Tage)
app.get('/pingen/stats', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
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

// DEUTSCH: Liste aller Mitglieder mit Post-Zustellung und gueltiger Adresse abrufen
app.get('/pingen/post-members', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
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

// DEUTSCH: Massen-PDF-Versand per Post an alle oder ausgewaehlte Mitglieder (in 5er-Batches)
// Jedes PDF bekommt die individuelle Empfaengeradresse eingebettet
app.post('/pingen/send-bulk-pdf', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        // Ein PDF an mehrere Mitglieder, je mit Deckblatt (Adresse im richtigen
        // Fenster) ueber den Versandkern - vorher wurde die Adresse mit pdf-lib
        // auf die erste Seite gedruckt und nichts geprueft.
        const { pdf_base64, subject, member_ids, staging = false } = req.body || {};
        if (!pdf_base64) return res.status(400).json({ error: 'PDF-Datei erforderlich' });
        const adresse = `strasse IS NOT NULL AND strasse != '' AND plz IS NOT NULL AND plz != '' AND ort IS NOT NULL AND ort != ''`;
        const members = (member_ids && member_ids.length > 0
            ? await pool.query(`SELECT id, vorname, nachname FROM members WHERE id = ANY($1) AND ${adresse}`, [member_ids])
            : await pool.query(`SELECT id, vorname, nachname FROM members WHERE zustellung_post = true AND ${adresse}`)).rows;
        if (members.length === 0) {
            return res.status(400).json({ error: 'Keine Empfänger mit gültiger Adresse gefunden' });
        }
        // Je 5 parallel: die App schickt Pakete zu 5 und bricht nach 30 s ab,
        // die Pruefung bei Pingen dauert pro Brief einige Sekunden.
        const results = { success: [], failed: [] };
        for (let i = 0; i < members.length; i += 5) {
            await Promise.all(members.slice(i, i + 5).map(async (m) => {
                const name = `${m.vorname || ''} ${m.nachname || ''}`.trim();
                try {
                    const r = await pdfBriefAnMitglied({ memberId: m.id, subject, pdfBase64: pdf_base64, staging });
                    results.success.push({ name, letterId: r.letterId });
                } catch (error) {
                    results.failed.push({ name, error: error.message });
                }
            }));
        }
        logInfo('Bulk PDF via Pingen', { total: members.length, ok: results.success.length, failed: results.failed.length });
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

// DEUTSCH: Einzelnen Brief manuell erstellen und via Pingen versenden (mit Betreff und Inhalt)
app.post('/pingen/send-manual', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
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

        // Brief im Vereinslayout (Fenster CH rechts / DE links, Text escaped)
        // ueber den Versandkern; das PDF des Anlasses kommt hier nicht mit.
        const html = nachrichtLayout.briefHtml({
            betreff: subject,
            text: `Guten Tag ${member.vorname || ''} ${member.nachname || ''}\n\n${body || ''}`,
            mitglied: member,
            absender: await absenderLaden(pool)
        });
        const brief = await briefVersenden({
            html, rand: nachrichtLayout.BRIEF_RAND, recipient: nachrichtLayout.empfaenger(member),
            memberId: member_id, subject, staging, eventId: event_id, anlassPdfMit: false
        });
        const pingenResult = { letterId: brief.letterId };

        res.json({
            success: true,
            letterId: pingenResult.letterId,
            recipient: `${member.vorname} ${member.nachname}`,
            staging
        });
    } catch (error) {
        console.error('Manual Pingen send error:', error.message);
        res.status(error.status || 500).json({ error: error.message });
    }
});

// DEUTSCH: Arbeitsplan-PDF per Post an ein einzelnes Mitglied via Pingen versenden
app.post('/pingen/send-arbeitsplan', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        // Arbeitsplan per Post (api-events checkAndSendArbeitsplan und
        // Erinnerung): Deckblatt im Vereinslayout mit Adresse im richtigen
        // Fenster, dahinter der Arbeitsplan - ueber den Versandkern. Vorher
        // wurde die Adresse mit pdf-lib auf die erste Seite gedruckt.
        const { event_id, member_id, pdf_base64, staging = false } = req.body || {};
        if (!member_id || !pdf_base64) return res.status(400).json({ error: 'member_id und pdf_base64 erforderlich' });
        let titel = 'Arbeitsplan';
        if (event_id) {
            const ev = await pool.query('SELECT title FROM events WHERE id = $1', [event_id]);
            if (ev.rows.length > 0) titel = `Arbeitsplan ${ev.rows[0].title}`;
        }
        const r = await pdfBriefAnMitglied({
            memberId: member_id, subject: titel, pdfBase64: pdf_base64, staging, eventId: event_id,
            // Der Arbeitsplan ist fuer alle gleich (alle Schichten und Helfer),
            // wie in der Mail von api-events.
            hinweis: `Der Arbeitsplan ist fertig. Beiliegend erhalten Sie den ${titel} mit allen Schichten und Helfern. Vielen Dank fürs Mithelfen!`
        });
        res.json({ success: true, letterId: r.letterId, recipient: r.name });
    } catch (error) {
        console.error('Arbeitsplan Pingen error:', error.response?.data || error.message);
        res.status(error.status || 500).json({ error: error.message });
    }
});

// ============================================
// PINGEN WEBHOOKS
// DEUTSCH: Empfaengt Status-Updates von Pingen wenn sich der Brief-Status aendert
// ============================================

// DEUTSCH: Webhook-Empfaenger fuer Pingen - aktualisiert Brief-Status in DB
// Bei "action_required" wird der Brief automatisch geloescht. Kein Auth (oeffentlich).
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

// DEUTSCH: Pingen-Webhook bei Pingen registrieren (damit Pingen Status-Updates hierher sendet)
app.post('/pingen/webhooks/register', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
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

// DEUTSCH: Alle bei Pingen registrierten Webhooks abrufen
app.get('/pingen/webhooks', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
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

// DEUTSCH: Einen registrierten Pingen-Webhook loeschen (nach ID)
app.delete('/pingen/webhooks/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
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


// ============================================
// PDF TEMPLATES API (pdfme)
// DEUTSCH: CRUD fuer PDF-Vorlagen (Layout, Arbeitsplan, Mitgliederbeitrag) mit pdfme-Schema
// ============================================

// DEUTSCH: Alle aktiven PDF-Templates abrufen (ohne Schema-Details fuer Uebersicht)
app.get('/pdf-templates', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, slug, description, category, variables, is_default, is_active, created_at, updated_at
            FROM pdf_templates
            WHERE is_active = true
            ORDER BY category, name
        `);
        res.json(result.rows);
    } catch (error) {
        logError('Failed to fetch PDF templates', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Einzelnes PDF-Template nach ID abrufen (inkl. vollstaendigem Schema)
app.get('/pdf-templates/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM pdf_templates WHERE id = $1',
            [req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Template nicht gefunden' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        logError('Failed to fetch PDF template', { error: error.message, id: req.params.id });
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Neues PDF-Template erstellen (Name, Slug, Kategorie, Schema, Basis-PDF)
app.post('/pdf-templates', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { name, slug, description, category, template_schema, base_pdf, variables } = req.body;

        if (!name || !slug || !template_schema) {
            return res.status(400).json({ error: 'Name, Slug und Template-Schema sind erforderlich' });
        }

        const result = await pool.query(`
            INSERT INTO pdf_templates (name, slug, description, category, template_schema, base_pdf, variables)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [name, slug, description, category, JSON.stringify(template_schema), base_pdf, variables]);

        logInfo('PDF template created', { name, slug, category });
        res.status(201).json(result.rows[0]);
    } catch (error) {
        logError('Failed to create PDF template', { error: error.message });
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ein Template mit diesem Slug existiert bereits' });
        }
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: PDF-Template aktualisieren (alle Felder optional, COALESCE behaelt bestehende Werte)
app.put('/pdf-templates/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { name, slug, description, category, template_schema, base_pdf, variables, is_default } = req.body;

        const result = await pool.query(`
            UPDATE pdf_templates
            SET name = COALESCE($1, name),
                slug = COALESCE($2, slug),
                description = COALESCE($3, description),
                category = COALESCE($4, category),
                template_schema = COALESCE($5, template_schema),
                base_pdf = COALESCE($6, base_pdf),
                variables = COALESCE($7, variables),
                is_default = COALESCE($8, is_default),
                updated_at = NOW()
            WHERE id = $9
            RETURNING *
        `, [name, slug, description, category, template_schema ? JSON.stringify(template_schema) : null, base_pdf, variables, is_default, req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Template nicht gefunden' });
        }

        logInfo('PDF template updated', { id: req.params.id, name });
        res.json(result.rows[0]);
    } catch (error) {
        logError('Failed to update PDF template', { error: error.message, id: req.params.id });
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: PDF-Template loeschen (nach ID)
app.delete('/pdf-templates/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const result = await pool.query(
            'DELETE FROM pdf_templates WHERE id = $1 RETURNING name',
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Template nicht gefunden' });
        }

        logInfo('PDF template deleted', { id: req.params.id, name: result.rows[0].name });
        res.json({ success: true });
    } catch (error) {
        logError('Failed to delete PDF template', { error: error.message, id: req.params.id });
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Aktives Layout-Template abrufen (fuer dynamische PDFs wie Arbeitsplan, Rechnungen)
// Gibt Standard-Layout zurueck falls kein Template konfiguriert ist
app.get('/pdf-templates/layout/active', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM pdf_templates WHERE category = 'layout' AND is_active = true ORDER BY is_default DESC, updated_at DESC LIMIT 1"
        );

        if (result.rows.length === 0) {
            // Return default layout settings if no template exists
            return res.json({
                id: null,
                name: 'Standard Layout',
                layoutSettings: {
                    headerHeight: 60,
                    footerHeight: 22,
                    contentMarginLeft: 20,
                    contentMarginRight: 20,
                    primaryColor: '#cc0000',
                    fontFamily: 'Helvetica',
                    tableFontSize: 9,
                    tableHeaderBold: true,
                    logo: null,
                    organisation: 'Feuerwehrverein Raura\n6017 Ruswil',
                    fusszeile: 'Feuerwehrverein Raura | www.fwv-raura.ch | info@fwv-raura.ch'
                }
            });
        }

        const template = result.rows[0];

        // Extract layout settings from template schema
        const layoutSettings = template.template_schema?.layoutSettings || {};

        // Extract field values from schema for default content
        const schema = template.template_schema?.schemas?.[0] || {};

        res.json({
            id: template.id,
            name: template.name,
            layoutSettings: {
                headerHeight: layoutSettings.headerHeight || 60,
                footerHeight: layoutSettings.footerHeight || 22,
                contentMarginLeft: layoutSettings.contentMarginLeft || 20,
                contentMarginRight: layoutSettings.contentMarginRight || 20,
                primaryColor: layoutSettings.primaryColor || '#cc0000',
                fontFamily: layoutSettings.fontFamily || 'Helvetica',
                tableFontSize: layoutSettings.tableFontSize || 9,
                tableHeaderBold: layoutSettings.tableHeaderBold !== false,
                // Field positions from template
                logo: schema.logo,
                organisation: schema.organisation,
                titel: schema.titel,
                untertitel: schema.untertitel,
                fusszeile: schema.fusszeile,
                seitenzahl: schema.seitenzahl,
                contentStartY: schema.content_start_y?.position?.y || 65,
                contentEndY: schema.content_end_y?.position?.y || 270
            },
            template_schema: template.template_schema
        });
    } catch (error) {
        logError('Failed to fetch active layout template', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ORGANISATION SETTINGS API
// DEUTSCH: Vereins-Einstellungen (Name, Adresse, IBAN, etc.) als Key-Value-Store
// ============================================

// DEUTSCH: Alle Vereins-Einstellungen als Key-Value-Objekt abrufen
app.get('/organisation-settings', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const result = await pool.query('SELECT key, value, value_json, description FROM organisation_settings');
        const settings = {};
        result.rows.forEach(row => {
            settings[row.key] = row.value_json || row.value;
        });
        res.json(settings);
    } catch (error) {
        logError('Failed to fetch organisation settings', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Vereins-Einstellung erstellen oder aktualisieren (Upsert per Key)
app.put('/organisation-settings/:key', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { value, value_json } = req.body;

        const result = await pool.query(`
            INSERT INTO organisation_settings (key, value, value_json, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (key) DO UPDATE SET
                value = COALESCE($2, organisation_settings.value),
                value_json = COALESCE($3, organisation_settings.value_json),
                updated_at = NOW()
            RETURNING *
        `, [req.params.key, value, value_json ? JSON.stringify(value_json) : null]);

        logInfo('Organisation setting updated', { key: req.params.key });
        res.json(result.rows[0]);
    } catch (error) {
        logError('Failed to update organisation setting', { error: error.message, key: req.params.key });
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// INVOICE GENERATION WITH SWISS QR-BILL
// DEUTSCH: Rechnungsgenerierung mit Schweizer QR-Einzahlungsschein (QR-Bill)
// ============================================

// DEUTSCH: Standard-Layout fuer Mitgliederbeitrags-Rechnungen (Positionen in PDF-Points)

// Helper to convert mm to points (for template positions)
const mmToPoints = (mm) => mm * 2.83465;


// DEUTSCH: Massen-Rechnungsgenerierung fuer alle Mitglieder (optional nach Status filtern)
// DEUTSCH: Sendet Mitgliedsbeitrags-Brief als fertig-formatiertes HTML via Pingen
// Das HTML enthaelt bereits den Empfaenger im Adressfenster (Schweizer Standard X=118mm/Y=60mm)
// daher kein Adress-Embedding oder Deckblatt noetig - auto_send mit address_position=right
// --- Versandkern Brief (brief-versand.js) -----------------------------------

// HTML -> PDF wie bisher send-post: A4, Seitenzahl unten rechts.
async function briefPdfRendern(html, rand) {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        return await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: rand,
            displayHeaderFooter: true,
            headerTemplate: '<div></div>',
            footerTemplate: '<div style="width: 100%; font-family: Arial, sans-serif; font-size: 9pt; color: #666; padding: 0 25mm 0 0; text-align: right;">Seite <span class="pageNumber"></span> von <span class="totalPages"></span></div>'
        });
    } finally {
        await browser.close();
    }
}

// Brief bei Pingen anlegen und - mit pruefen - deren Pruefung abwarten
// (bis ~15 s). Gibt { letterId, status, grund } zurueck; status
// 'action_required' heisst abgelehnt (grund aus den Pingen-Ereignissen).
async function pingenBriefAnlegen({ pdf, dateiname, links, staging = false, pruefen = true }) {
    const API = getPingenApi(staging);
    const token = (await axios.post(`${PINGEN_IDENTITY}/auth/access-tokens`, {
        grant_type: 'client_credentials',
        client_id: process.env.PINGEN_CLIENT_ID,
        client_secret: process.env.PINGEN_CLIENT_SECRET
    })).data.access_token;
    const H = { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/vnd.api+json' } };
    const upload = (await axios.get(`${API}/file-upload`, H)).data.data.attributes;
    await axios.put(upload.url, pdf, { headers: { 'Content-Type': 'application/pdf' } });
    const org = getPingenOrgId(staging);
    const brief = await axios.post(`${API}/organisations/${org}/letters`, {
        data: {
            type: 'letters',
            attributes: {
                file_original_name: dateiname,
                file_url: upload.url,
                file_url_signature: upload.url_signature,
                auto_send: true,
                delivery_product: 'cheap',
                print_mode: 'simplex',
                print_spectrum: 'grayscale',
                // DE: Fenster links (DIN 5008); CH: rechts. KEIN country-Attribut -
                // die Pingen-API lehnt es beim Anlegen ab (400); das Land liest
                // Pingen aus der Adresse im PDF.
                address_position: links ? 'left' : 'right'
            }
        }
    }, H);
    const letterId = brief.data.data?.id;
    let status = brief.data.data?.attributes?.status;
    for (let i = 0; pruefen && i < 6 && briefKern.PRUEFUNG_LAEUFT.includes(status); i++) {
        await new Promise(r => setTimeout(r, 2500));
        status = (await axios.get(`${API}/organisations/${org}/letters/${letterId}`, H)).data.data?.attributes?.status;
    }
    let grund = null;
    if (status === 'action_required') {
        const ereignisse = (await axios.get(`${API}/organisations/${org}/letters/${letterId}/events?language=de-CH`, H)
            .catch(() => ({ data: { data: [] } }))).data.data || [];
        grund = ereignisse.map(e => [e.attributes?.name, ...(e.attributes?.data || [])].filter(Boolean).join(' '))
            .filter(Boolean).slice(-1)[0] || 'Pruefung fehlgeschlagen';
    }
    return { letterId, status, grund };
}

const briefVersenden = briefKern.briefVersand({
    rendern: briefPdfRendern,
    pingen: pingenBriefAnlegen,
    protokollieren: (eintrag) => briefProtokollieren(pool, eintrag),
    kostenMelden: (name, letterId, betreff) => sendPingenCostNotification(name, letterId, false, betreff),
    anlassPdfLaden: (eventId) => anlassPdf(pool, eventId),
    log: logInfo
});

// DEUTSCH: Fertiges Brief-HTML (Adresse im Fenster) an Pingen - Versandkern.
// Optional pdf_margin, event_id (PDF des Anlasses) und anhaenge (PDFs) als
// weitere Seiten. 422 mit Grund, wenn Pingen den Brief ablehnt.
app.post('/dispatch/send-post', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { html, recipient, member_id, subject, staging = false, pdf_margin, event_id, anhaenge } = req.body;
        const r = await briefVersenden({
            html, rand: pdf_margin, recipient, memberId: member_id, subject, staging, eventId: event_id, anhaenge
        });
        logInfo('Letter sent via Pingen (HTML)', { member_id, name: recipient?.name, subject, status: r.status });
        res.json({ success: true, letter_id: r.letterId, status: r.status });
    } catch (error) {
        logError('Failed to send post letter', { error: error.message, details: error.response?.data });
        res.status(error.status || 500).json({ error: error.message, letter_id: error.letterId });
    }
});

// DEUTSCH: PDF per Post mit Deckblatt (Website "PDF-Brief", App "PDF per
// Post"): Deckblatt im Vereinslayout mit Adresse im richtigen Fenster
// (brief-versand.js deckblattHtml), dahinter das PDF - ueber den Versandkern.
// { member_id, subject, pdf_base64, hinweis?, staging? }
async function pdfBriefAnMitglied({ memberId, subject, pdfBase64, hinweis, staging = false, eventId = null }) {
    const m = (await pool.query('SELECT * FROM members WHERE id::text = $1', [String(memberId)])).rows[0];
    if (!m) throw Object.assign(new Error('Mitglied nicht gefunden'), { status: 404 });
    if (!nachrichtLayout.hatPostadresse(m)) {
        throw Object.assign(new Error(`${m.vorname} ${m.nachname}: keine vollständige Adresse`), { status: 400 });
    }
    const html = briefKern.deckblattHtml({ betreff: subject, hinweis, mitglied: m, absender: await absenderLaden(pool) });
    const recipient = nachrichtLayout.empfaenger(m);
    const r = await briefVersenden({
        html, rand: nachrichtLayout.BRIEF_RAND, recipient, memberId: m.id, subject, staging,
        eventId, anlassPdfMit: false,
        anhaenge: [{ filename: 'beilage.pdf', content: pdfBase64, contentType: 'application/pdf' }]
    });
    return { ...r, name: recipient.name };
}

app.post('/dispatch/send-pdf-post', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { pdf_base64, member_id, subject, hinweis, staging = false } = req.body || {};
        if (!pdf_base64 || !member_id) return res.status(400).json({ error: 'pdf_base64 und member_id erforderlich' });
        const r = await pdfBriefAnMitglied({ memberId: member_id, subject, pdfBase64: pdf_base64, hinweis, staging });
        logInfo('PDF-Brief sent via Pingen', { member_id, name: r.name, subject, status: r.status });
        res.json({ success: true, letter_id: r.letterId, status: r.status });
    } catch (error) {
        logError('PDF-Brief failed', { error: error.message });
        res.status(error.status || 500).json({ error: error.message });
    }
});

// Rendert Brief-HTML zu einem PDF wie /dispatch/send-post (gleicher Rand,
// Seitenzahlen); zonen=true legt die Pingen-Zonen ueber Seite 1.
// links: Fenster links (deutsche Empfaenger) - Zonen gespiegelt wie in
// nachricht-layout.js (Adresse 22/60mm, Frankierbereich 20/40mm).
async function vorschauPdfRendern(html, pdf_margin, showZones, links = false) {
    // Gleiche Rand-Logik wie /dispatch/send-post, damit die Vorschau 1:1 dem
    // echten Brief entspricht (z.B. Event-Einladung: 15mm Oberrand).
    const previewMargin = (pdf_margin && typeof pdf_margin === 'object')
        ? pdf_margin
        : { top: '0', right: '0', bottom: '20mm', left: '0' };
    const mmOf = (v) => parseFloat(String(v || '0').replace('mm', '')) || 0;
    const mTop = mmOf(previewMargin.top);
    const mBottom = mmOf(previewMargin.bottom);
    // Zonen-Overlay vor </body> injizieren (nur Seite 1). Die Zonen sind BLATT-
    // Koordinaten: Container um den Oberrand nach oben verschieben (top: -mTop)
    // und exakt an der Unterkante des Seiteninhalts kappen (height: 297-mBottom,
    // overflow:hidden) — sonst fragmentiert das Overlay auf Seite 2 (rosa Streifen).
    let finalHtml = html;
    if (showZones) {
        const zoneOverlay = `
<div style="position: absolute; top: -${mTop}mm; left: 0; width: 210mm; height: ${297 - mBottom - 1}mm; overflow: hidden; pointer-events: none; z-index: 9999;">
<!-- Randsperrbereich 5mm rundum (Blatt-Koordinaten) -->
<div style="position: absolute; top: 0; left: 0; width: 210mm; height: 5mm; background: rgba(239,68,68,0.15); border-bottom: 1px dashed rgba(239,68,68,0.6);"></div>
<div style="position: absolute; top: 292mm; left: 0; width: 210mm; height: 5mm; background: rgba(239,68,68,0.15); border-top: 1px dashed rgba(239,68,68,0.6);"></div>
<div style="position: absolute; top: 0; left: 0; width: 5mm; height: 297mm; background: rgba(239,68,68,0.15);"></div>
<div style="position: absolute; top: 0; right: 0; width: 5mm; height: 297mm; background: rgba(239,68,68,0.15);"></div>
<!-- Frankierbereich (rechts X=116 / links X=20), Y=40, W=89.5, H=47.5 -->
<div style="position: absolute; top: 40mm; left: ${links ? 20 : 116}mm; width: 89.5mm; height: 47.5mm; background: rgba(251,146,60,0.15); border: 1px dashed rgba(251,146,60,0.6); font-size: 7pt; color: #9a3412; padding: 1mm;">Frankierbereich (${links ? 20 : 116}/40/89.5/47.5mm)</div>
<!-- Adressbereich (rechts X=118 / links X=22), Y=60, W=85.5, H=25.5 -->
<div style="position: absolute; top: 60mm; left: ${links ? 22 : 118}mm; width: 85.5mm; height: 25.5mm; background: rgba(220,38,38,0.15); border: 1.5px solid rgba(220,38,38,0.8); font-size: 7pt; color: #7f1d1d; padding: 1mm;">Adressbereich (${links ? 22 : 118}/60/85.5/25.5mm)</div>
</div>`;
        finalHtml = html.replace('</body>', zoneOverlay + '</body>');
    }

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(finalHtml, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: previewMargin,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: '<div style="width: 100%; font-family: Arial, sans-serif; font-size: 9pt; color: #666; padding: 0 25mm 0 0; text-align: right;">Seite <span class="pageNumber"></span> von <span class="totalPages"></span></div>'
    });
    await browser.close();
    return pdfBuffer;
}

const { sammelPdfRendern } = require('./sammel-pdf');

// Sammel-PDF aus mehreren Brief-HTMLs (nur Vorstand bzw. interne Dienste).
app.post('/dispatch/preview-pdf-sammel', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { htmls, pdf_margin } = req.body || {};
        if (!Array.isArray(htmls) || htmls.length === 0 || htmls.some(h => typeof h !== 'string' || !h)) {
            return res.status(400).json({ error: 'htmls (Liste von Brief-HTMLs) erforderlich' });
        }
        if (htmls.length > 500) return res.status(400).json({ error: 'Hoechstens 500 Briefe auf einmal' });
        const pdfBuffer = await sammelPdfRendern(htmls, pdf_margin);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="briefe.pdf"');
        res.send(pdfBuffer);
    } catch (error) {
        logError('Sammel-PDF failed', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Brief-Vorschau als PDF rendern (ohne Pingen-Versand)
// Nimmt HTML entgegen und liefert ein PDF zurueck - fuer Vorschau-Anzeige im Frontend
// Query-Param ?zones=1 fuegt Pingen-Zonen-Overlay (Frankier/Adressbereich) hinzu
app.post('/dispatch/preview-pdf', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { html, pdf_margin } = req.body;
        if (!html) return res.status(400).json({ error: 'html erforderlich' });
        const pdfBuffer = await vorschauPdfRendern(html, pdf_margin, req.query.zones === '1');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="vorschau.pdf"');
        res.send(pdfBuffer);
    } catch (error) {
        logError('Preview PDF failed', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Brief fuer ein Mitglied im offiziellen Layout bauen (Flutter-App): HTML +
// Empfaenger fuer /dispatch/send-post, mit vorschau=true auch als PDF (base64).
app.post('/dispatch/brief', authenticateAny, requireRole('vorstand', 'admin'),
    briefErstellen({ pool, vorschauPdf: vorschauPdfRendern }));

// E-Mail fuer ein Mitglied genau wie /email/bulk sie baut (Vorschau Website).
app.post('/dispatch/email-vorschau', authenticateAny, requireRole('vorstand', 'admin'), emailVorschau({ pool }));

// ============================================
// SCHEDULED JOBS — zeitgesteuerter Hintergrund-Worker
// ============================================
const scheduledJobs = require('./scheduled-jobs');

// Auth-Wrapper: erlaubt vorstand-/admin-Zugriff.
const requireVorstand = [authenticateAny, requireRole('vorstand', 'admin')];

// Action-Handler registrieren — jeweils axios-Aufruf an den entsprechenden Backend-Endpoint
// mit X-API-Key, damit der Worker authentifiziert ist (kein User-Token vorhanden).
const ACCOUNTING_API = process.env.ACCOUNTING_API_URL || 'http://api-accounting:3000';
const internalHeaders = () => ({ 'x-api-key': process.env.API_KEY });

scheduledJobs.registerHandler('membership_fees_email_bulk', async (payload) => {
    const year = parseInt(payload.year);
    if (!year) throw new Error('payload.year erforderlich');
    const resp = await axios.post(
        `${ACCOUNTING_API}/membership-fees/send-email-bulk`,
        { year },
        { headers: internalHeaders(), timeout: 600000 }
    );
    return resp.data;
});

scheduledJobs.registerHandler('membership_fees_post_bulk', async (payload) => {
    const year = parseInt(payload.year);
    if (!year) throw new Error('payload.year erforderlich');
    const resp = await axios.post(
        `${ACCOUNTING_API}/membership-fees/send-post-bulk`,
        { year },
        { headers: internalHeaders(), timeout: 600000 }
    );
    return resp.data;
});

// Tabelle anlegen + Worker starten + Endpoints mounten.
(async () => {
    try {
        await scheduledJobs.createTableIfNeeded(pool);
        scheduledJobs.startWorker(pool, { intervalMs: 60_000 });
        console.log('[scheduled-jobs] worker started (60s tick)');
    } catch (e) {
        console.error('[scheduled-jobs] init failed:', e.message);
    }
})();

scheduledJobs.mountEndpoints(app, pool, requireVorstand);

// Sammelmail: Benachrichtigungen mit sammeln: true gehen einmal taeglich um
// 18:00 Europe/Zurich raus, eine Mail je Empfaenger (src/sammelmail.js).
const { sammelSchema, kannSammeln, vormerken, sammelmailStarten } = require('./sammelmail');
sammelSchema(pool)
    .then(() => sammelmailStarten(pool, (m) => transporter.sendMail({
        from: `"Feuerwehrverein Raura" <${process.env.SMTP_USER}>`, ...m
    })))
    .catch(e => console.error('[SAMMELMAIL] init failed:', e.message));

// DEUTSCH: Server starten und auf dem konfigurierten Port lauschen
// IMAP-Webmail-Endpoints fuer Vorstand (lesen, markieren, loeschen, Anhaenge, senden)
// + Geteiltes Adressbuch (shared_contacts) + Read-only Members.
const { mountImap, mountContacts, rollenErgaenzen } = require('./imap-mail');
const authVorstandMail = [authenticateAny, requireRole('vorstand', 'admin'), rollenErgaenzen(pool)];
mountImap(app, pool, authVorstandMail);
mountContacts(app, pool, authVorstandMail);

// Taeglicher Backup-Export: Mitglieder, Beitraege, Rechnungen etc. als XLSX
// per E-Mail an BACKUP_EMAIL (default vorstand@fwv-raura.ch). Laeuft taeglich
// um 03:00 Europe/Zurich. ENABLE_DAILY_BACKUP=false deaktiviert.
const { scheduleNext: scheduleDailyBackup, runDailyBackup } = require('./backup-export');
if (process.env.ENABLE_DAILY_BACKUP !== 'false') {
    scheduleDailyBackup(pool);
}

// Manueller Trigger fuer Backup-Test (nur Vorstand/Admin).
app.post('/internal/run-backup-now', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    if (!req.user?.groups?.some(g => ['vorstand', 'admin'].includes(g))) {
        return res.status(403).json({ error: 'Vorstand/Admin only' });
    }
    res.json({ success: true, message: 'Backup gestartet — landet in der Inbox in 1-2 Minuten.' });
    runDailyBackup(pool).catch(err => console.error('Manual backup trigger failed:', err.message));
});

app.listen(PORT, () => {
    console.log(`API-Dispatch running on port ${PORT}`);
});
