const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool, types } = require('pg');
const ical = require('ical-generator').default;
const axios = require('axios');
const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { authenticateToken, authenticateAny, requireRole } = require('./auth-middleware');

// Configure pg to return dates/timestamps as strings (not JS Date objects)
// This prevents timezone conversion issues
types.setTypeParser(1082, val => val); // DATE
types.setTypeParser(1083, val => val); // TIME
types.setTypeParser(1114, val => val); // TIMESTAMP
types.setTypeParser(1184, val => val); // TIMESTAMPTZ

const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_NAME = 'api-events';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Dispatch API für E-Mails
const DISPATCH_API = process.env.DISPATCH_API_URL || 'http://api-dispatch:3000';

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

function getClientIp(req) {
    if (req.headers['cf-connecting-ip']) return req.headers['cf-connecting-ip'];
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) return forwardedFor.split(',')[0].trim();
    if (req.headers['x-real-ip']) return req.headers['x-real-ip'];
    return req.ip;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// Helper: Datum in deutschem Format
function formatDateDE(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('de-CH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Helper: Alle Registrierungen für eine Schicht abrufen
async function getShiftRegistrations(shiftId) {
    const result = await pool.query(`
        SELECT
            r.id, r.guest_name, r.guest_email, r.member_id, r.status,
            m.vorname, m.nachname, m.email as member_email
        FROM registrations r
        LEFT JOIN members m ON r.member_id = m.id
        WHERE $1 = ANY(r.shift_ids)
        AND r.status IN ('approved', 'confirmed', 'pending')
    `, [shiftId]);
    return result.rows;
}

// Helper: Benachrichtigungen bei Schicht-Änderungen senden
async function notifyShiftRegistrations(shift, event, changeType, oldShiftData = null) {
    const registrations = await getShiftRegistrations(shift.id);

    if (registrations.length === 0) return { sent: 0, errors: [] };

    let sent = 0;
    const errors = [];

    for (const reg of registrations) {
        const email = reg.member_email || reg.guest_email;
        const name = reg.member_id
            ? `${reg.vorname} ${reg.nachname}`
            : reg.guest_name;

        if (!email) continue;

        let subject, body;

        if (changeType === 'deleted') {
            subject = `Schicht abgesagt - ${event.title}`;
            body = `
Guten Tag ${name},

Leider müssen wir Ihnen mitteilen, dass folgende Schicht abgesagt wurde:

Event: ${event.title}
Schicht: ${shift.name}
Datum: ${formatDateDE(shift.date)}
Zeit: ${shift.start_time || '-'} - ${shift.end_time || '-'}

Bitte kontaktieren Sie uns bei Fragen.

Mit freundlichen Grüssen
Feuerwehrverein Raura
            `.trim();
        } else if (changeType === 'updated') {
            const changes = [];
            if (oldShiftData) {
                if (oldShiftData.date !== shift.date) {
                    changes.push(`Datum: ${formatDateDE(oldShiftData.date)} → ${formatDateDE(shift.date)}`);
                }
                if (oldShiftData.start_time !== shift.start_time) {
                    changes.push(`Startzeit: ${oldShiftData.start_time || '-'} → ${shift.start_time || '-'}`);
                }
                if (oldShiftData.end_time !== shift.end_time) {
                    changes.push(`Endzeit: ${oldShiftData.end_time || '-'} → ${shift.end_time || '-'}`);
                }
                if (oldShiftData.name !== shift.name) {
                    changes.push(`Name: ${oldShiftData.name} → ${shift.name}`);
                }
            }

            // Keine relevanten Änderungen
            if (changes.length === 0) return { sent: 0, errors: [] };

            subject = `Schicht geändert - ${event.title}`;
            body = `
Guten Tag ${name},

Eine Schicht, für die Sie angemeldet sind, wurde geändert:

Event: ${event.title}
Schicht: ${shift.name}

Änderungen:
${changes.map(c => `- ${c}`).join('\n')}

Aktuelle Details:
- Datum: ${formatDateDE(shift.date)}
- Zeit: ${shift.start_time || '-'} - ${shift.end_time || '-'}
- Bereich: ${shift.bereich || 'Allgemein'}

Falls Sie aufgrund der Änderungen nicht mehr teilnehmen können,
melden Sie sich bitte bei uns.

Mit freundlichen Grüssen
Feuerwehrverein Raura
            `.trim();
        }

        try {
            await axios.post(`${DISPATCH_API}/email/send`, {
                to: email,
                subject: subject,
                body: body,
                event_id: event.id
            });
            sent++;
            console.log(`Schicht-Benachrichtigung gesendet an ${email}`);
        } catch (err) {
            console.error(`Benachrichtigung an ${email} fehlgeschlagen:`, err.message);
            errors.push({ email, error: err.message });
        }
    }

    return { sent, errors };
}

// Helper: Prüfen ob alle Schichten eines Events besetzt sind und Arbeitsplan versenden
// options.skipDeadlineCheck = true für manuellen Versand
// options.skipFilledCheck = true um auch bei nicht voll besetzten Schichten zu senden
async function checkAndSendArbeitsplan(eventId, options = {}) {
    try {
        // Event-Daten mit Deadline und Versandstatus abrufen
        const eventResult = await pool.query(`
            SELECT id, title, registration_deadline, arbeitsplan_sent_at, status
            FROM events WHERE id = $1
        `, [eventId]);

        if (eventResult.rows.length === 0) return { sent: false, reason: 'Event nicht gefunden' };
        const event = eventResult.rows[0];

        // Schon versendet? (nur bei automatischem Versand prüfen)
        if (!options.skipDeadlineCheck && event.arbeitsplan_sent_at) {
            return { sent: false, reason: 'Arbeitsplan bereits versendet' };
        }

        // Event abgesagt?
        if (event.status === 'cancelled') {
            return { sent: false, reason: 'Event abgesagt' };
        }

        // Deadline-Prüfung (nur bei automatischem Versand)
        if (!options.skipDeadlineCheck) {
            if (!event.registration_deadline) {
                return { sent: false, reason: 'Kein Anmeldeschluss definiert' };
            }

            const deadline = new Date(event.registration_deadline);
            const now = new Date();
            if (deadline > now) {
                return { sent: false, reason: 'Anmeldeschluss noch nicht erreicht' };
            }
        }

        // Alle Schichten mit benötigter und aktueller Besetzung abrufen
        const shiftsResult = await pool.query(`
            SELECT s.id, s.name, s.date, s.start_time, s.end_time, s.bereich, s.needed,
                   COUNT(r.id) FILTER (WHERE r.status IN ('approved', 'confirmed')) as filled
            FROM shifts s
            LEFT JOIN registrations r ON s.id = ANY(r.shift_ids)
            WHERE s.event_id = $1
            GROUP BY s.id
        `, [eventId]);

        const shifts = shiftsResult.rows;

        if (shifts.length === 0) {
            return { sent: false, reason: 'Keine Schichten vorhanden' };
        }

        // Prüfen ob alle Schichten besetzt sind (nur bei automatischem Versand)
        if (!options.skipFilledCheck) {
            const allFilled = shifts.every(s => parseInt(s.filled) >= parseInt(s.needed));
            if (!allFilled) {
                return { sent: false, reason: 'Nicht alle Schichten besetzt' };
            }
        }

        // Alle bestätigten Registrierungen mit Zustellpräferenzen abrufen
        const regsResult = await pool.query(`
            SELECT r.id, r.guest_name, r.guest_email, r.member_id, r.shift_ids,
                   m.vorname, m.nachname, m.email as member_email, m.zustellung_email
            FROM registrations r
            LEFT JOIN members m ON r.member_id = m.id
            WHERE r.event_id = $1
            AND r.status IN ('approved', 'confirmed')
        `, [eventId]);

        const registrations = regsResult.rows;

        // Schichten mit Helfern für PDF vorbereiten
        const shiftsWithHelpers = await Promise.all(shifts.map(async shift => {
            const helperRegs = registrations.filter(r =>
                r.shift_ids && r.shift_ids.includes(shift.id)
            );
            return {
                ...shift,
                startTime: shift.start_time,
                endTime: shift.end_time,
                helpers: helperRegs.map(r =>
                    r.member_id ? `${r.vorname} ${r.nachname}` : r.guest_name
                )
            };
        }));

        // PDF generieren
        const PDFDocument = require('pdfkit');
        const pdfBuffers = [];
        const doc = new PDFDocument({
            size: 'A4',
            margin: 50,
            info: {
                Title: `Arbeitsplan ${event.title}`,
                Author: 'Feuerwehrverein Raura'
            }
        });

        doc.on('data', chunk => pdfBuffers.push(chunk));

        const pdfPromise = new Promise((resolve, reject) => {
            doc.on('end', () => resolve(Buffer.concat(pdfBuffers)));
            doc.on('error', reject);
        });

        // PDF-Inhalt generieren
        doc.fontSize(20).font('Helvetica-Bold').text('Feuerwehrverein Raura', { align: 'center' });
        doc.fontSize(16).font('Helvetica').text('Arbeitsplan', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(14).font('Helvetica-Bold').text(event.title, { align: 'center' });
        doc.moveDown(1);

        // Nach Datum gruppieren
        const shiftsByDate = {};
        shiftsWithHelpers.forEach(shift => {
            const date = shift.date || 'Unbekannt';
            if (!shiftsByDate[date]) shiftsByDate[date] = [];
            shiftsByDate[date].push(shift);
        });

        Object.entries(shiftsByDate).forEach(([date, dateShifts]) => {
            doc.fontSize(12).font('Helvetica-Bold').text(formatDateDE(date));
            doc.moveDown(0.3);

            const byBereich = {};
            dateShifts.forEach(shift => {
                const bereich = shift.bereich || 'Allgemein';
                if (!byBereich[bereich]) byBereich[bereich] = [];
                byBereich[bereich].push(shift);
            });

            Object.entries(byBereich).forEach(([bereich, bereichShifts]) => {
                doc.fontSize(11).font('Helvetica-Bold').text(`  ${bereich}:`);
                bereichShifts.forEach(shift => {
                    const timeStr = shift.startTime && shift.endTime
                        ? `${shift.startTime} - ${shift.endTime}` : '';
                    const helpers = shift.helpers.length > 0
                        ? shift.helpers.join(', ') : 'Keine Anmeldungen';
                    doc.fontSize(10).font('Helvetica')
                        .text(`    ${shift.name} (${timeStr}): ${helpers}`);
                });
                doc.moveDown(0.3);
            });
            doc.moveDown(0.5);
        });

        doc.moveDown(2);
        doc.fontSize(8).font('Helvetica').fillColor('#666666')
            .text(`Erstellt am ${new Date().toLocaleDateString('de-CH')} um ${new Date().toLocaleTimeString('de-CH')}`, { align: 'center' });

        doc.end();
        const pdfBuffer = await pdfPromise;
        const pdfBase64 = pdfBuffer.toString('base64');

        // E-Mails versenden (mit Zustellpräferenzen)
        let sentCount = 0;
        const errors = [];
        const successEmails = [];
        const postOnlyMembers = [];
        const pingenResults = [];

        for (const reg of registrations) {
            const name = reg.member_id ? `${reg.vorname} ${reg.nachname}` : reg.guest_name;

            // Bei Mitgliedern: Zustellpräferenz prüfen
            if (reg.member_id && reg.zustellung_email === false) {
                console.log(`Arbeitsplan nicht per E-Mail an ${name} (zustellung_email = false)`);
                postOnlyMembers.push({
                    name,
                    email: reg.member_email,
                    member_id: reg.member_id
                });
                continue;
            }

            const email = reg.member_email || reg.guest_email;

            if (!email) {
                errors.push({ name, error: 'Keine E-Mail-Adresse vorhanden' });
                continue;
            }

            try {
                await axios.post(`${DISPATCH_API}/email/send`, {
                    to: email,
                    subject: `Arbeitsplan - ${event.title}`,
                    body: `Guten Tag ${name},

Der Arbeitsplan für "${event.title}" ist fertig.

Anbei finden Sie den Arbeitsplan als PDF mit allen Schichten und Helfern.

Bei Fragen kontaktieren Sie uns bitte.

Mit freundlichen Grüssen
Feuerwehrverein Raura`,
                    attachments: [{
                        filename: `Arbeitsplan_${event.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
                        content: pdfBase64,
                        contentType: 'application/pdf'
                    }]
                });
                sentCount++;
                successEmails.push({ name, email });
                console.log(`Arbeitsplan gesendet an ${email}`);
            } catch (err) {
                console.error(`Arbeitsplan an ${email} fehlgeschlagen:`, err.message);
                errors.push({ name, email, error: err.message });
            }
        }

        // Pingen-Versand für Mitglieder mit Post-Zustellung
        for (const postMember of postOnlyMembers) {
            if (!postMember.member_id) continue;

            try {
                const pingenResponse = await axios.post(`${DISPATCH_API}/pingen/send-arbeitsplan`, {
                    event_id: eventId,
                    member_id: postMember.member_id,
                    pdf_base64: pdfBase64
                });

                if (pingenResponse.data.success) {
                    pingenResults.push({
                        name: postMember.name,
                        letterId: pingenResponse.data.letterId,
                        status: 'sent'
                    });
                    console.log(`Arbeitsplan per Post gesendet an ${postMember.name} (Pingen: ${pingenResponse.data.letterId})`);
                }
            } catch (pingenErr) {
                console.error(`Pingen-Versand an ${postMember.name} fehlgeschlagen:`, pingenErr.message);
                pingenResults.push({
                    name: postMember.name,
                    status: 'failed',
                    error: pingenErr.response?.data?.error || pingenErr.message
                });
            }
        }

        // Versandstatus markieren
        await pool.query(`
            UPDATE events SET arbeitsplan_sent_at = NOW() WHERE id = $1
        `, [eventId]);

        console.log(`Arbeitsplan für Event "${event.title}" versendet: ${sentCount} E-Mails, ${pingenResults.filter(r => r.status === 'sent').length} Briefe`);
        return {
            sent: true,
            sentCount,
            successEmails,
            errors,
            postOnlyMembers,
            pingenResults
        };

    } catch (error) {
        console.error('Fehler beim Arbeitsplan-Versand:', error);
        return { sent: false, reason: error.message };
    }
}

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.set('trust proxy', true);

// ===========================================
// REQUEST LOGGING MIDDLEWARE
// ===========================================
app.use((req, res, next) => {
    if (req.path === '/health') return next();

    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    req.requestId = requestId;

    logInfo('REQUEST', { requestId, method: req.method, path: req.path, ip: getClientIp(req) });

    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const logFn = res.statusCode >= 400 ? logWarn : logInfo;
        logFn('RESPONSE', { requestId, method: req.method, path: req.path, statusCode: res.statusCode, duration: `${duration}ms` });
    });

    next();
});

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'api-events', version: process.env.APP_VERSION || '0.0.0' });
});

// ============================================
// EVENTS
// ============================================

app.get('/events', async (req, res) => {
    try {
        const { upcoming, category } = req.query;
        let query = `
            SELECT e.*,
                   m.vorname as organizer_vorname,
                   m.nachname as organizer_nachname,
                   m.email as organizer_member_email
            FROM events e
            LEFT JOIN members m ON e.organizer_id = m.id
            WHERE 1=1
        `;
        const params = [];

        if (upcoming === 'true') {
            query += ' AND e.start_date >= NOW()';
        }
        if (category) {
            params.push(category);
            query += ` AND e.category = $${params.length}`;
        }

        query += ' ORDER BY e.start_date';
        const eventsResult = await pool.query(query, params);

        // Fetch shifts for all events with registration info
        const events = await Promise.all(eventsResult.rows.map(async (event) => {
            const shifts = await pool.query(
                'SELECT * FROM shifts WHERE event_id = $1 ORDER BY date, start_time',
                [event.id]
            );

            // Get registrations for each shift
            const shiftsWithRegistrations = await Promise.all(shifts.rows.map(async (shift) => {
                const registrations = await pool.query(`
                    SELECT r.id, r.guest_name, r.status, r.member_id, m.vorname, m.nachname
                    FROM registrations r
                    LEFT JOIN members m ON r.member_id = m.id
                    WHERE $1 = ANY(r.shift_ids)
                `, [shift.id]);

                const approved = registrations.rows.filter(r => r.status === 'approved');
                const pending = registrations.rows.filter(r => r.status === 'pending');

                return {
                    ...shift,
                    registrations: {
                        approved: approved.map(r => ({
                            id: r.id,
                            name: r.member_id ? `${r.vorname} ${r.nachname}` : r.guest_name
                        })),
                        pending: pending.map(r => ({
                            id: r.id,
                            name: r.member_id ? `${r.vorname} ${r.nachname}` : r.guest_name
                        })),
                        approvedCount: approved.length,
                        pendingCount: pending.length,
                        spotsLeft: shift.needed - approved.length
                    }
                };
            }));

            // Auch direkte Event-Registrierungen holen (ohne Schichten, z.B. für Ausflüge)
            const directRegistrations = await pool.query(`
                SELECT r.id, r.guest_name, r.guest_email, r.status, r.member_id, r.notes,
                       m.vorname, m.nachname
                FROM registrations r
                LEFT JOIN members m ON r.member_id = m.id
                WHERE r.event_id = $1 AND (r.shift_ids IS NULL OR array_length(r.shift_ids, 1) IS NULL)
            `, [event.id]);

            const directApproved = directRegistrations.rows.filter(r => r.status === 'approved');
            const directPending = directRegistrations.rows.filter(r => r.status === 'pending');

            // Organisator-Name zusammensetzen
            const organizerName = event.organizer_vorname && event.organizer_nachname
                ? `${event.organizer_vorname} ${event.organizer_nachname}`
                : event.organizer_name || null;

            return {
                ...event,
                organizer_name: organizerName,
                shifts: shiftsWithRegistrations,
                directRegistrations: {
                    approved: directApproved.map(r => ({
                        id: r.id,
                        name: r.member_id ? `${r.vorname} ${r.nachname}` : r.guest_name,
                        email: r.guest_email,
                        notes: r.notes
                    })),
                    pending: directPending.map(r => ({
                        id: r.id,
                        name: r.member_id ? `${r.vorname} ${r.nachname}` : r.guest_name,
                        email: r.guest_email,
                        notes: r.notes
                    })),
                    approvedCount: directApproved.length,
                    pendingCount: directPending.length
                }
            };
        }));

        res.json(events);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/events/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Try UUID first, then slug
        let eventResult;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        if (uuidRegex.test(id)) {
            eventResult = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
        } else {
            eventResult = await pool.query('SELECT * FROM events WHERE slug = $1', [id]);
        }

        if (eventResult.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        const event = eventResult.rows[0];

        // Get shifts with registration info
        const shifts = await pool.query(
            'SELECT * FROM shifts WHERE event_id = $1 ORDER BY date, start_time',
            [event.id]
        );

        // Get registrations for each shift
        const shiftsWithRegistrations = await Promise.all(shifts.rows.map(async (shift) => {
            const registrations = await pool.query(`
                SELECT r.id, r.guest_name, r.status, r.member_id, m.vorname, m.nachname
                FROM registrations r
                LEFT JOIN members m ON r.member_id = m.id
                WHERE $1 = ANY(r.shift_ids)
            `, [shift.id]);

            const approved = registrations.rows.filter(r => r.status === 'approved');
            const pending = registrations.rows.filter(r => r.status === 'pending');

            return {
                ...shift,
                registrations: {
                    approved: approved.map(r => ({
                        id: r.id,
                        name: r.member_id ? `${r.vorname} ${r.nachname}` : r.guest_name
                    })),
                    pending: pending.map(r => ({
                        id: r.id,
                        name: r.member_id ? `${r.vorname} ${r.nachname}` : r.guest_name
                    })),
                    approvedCount: approved.length,
                    pendingCount: pending.length,
                    spotsLeft: shift.needed - approved.length
                }
            };
        }));

        // Auch direkte Event-Registrierungen holen (ohne Schichten)
        const directRegistrations = await pool.query(`
            SELECT r.id, r.guest_name, r.guest_email, r.status, r.member_id, r.notes,
                   m.vorname, m.nachname
            FROM registrations r
            LEFT JOIN members m ON r.member_id = m.id
            WHERE r.event_id = $1 AND (r.shift_ids IS NULL OR array_length(r.shift_ids, 1) IS NULL)
        `, [event.id]);

        const directApproved = directRegistrations.rows.filter(r => r.status === 'approved');
        const directPending = directRegistrations.rows.filter(r => r.status === 'pending');

        res.json({
            ...event,
            shifts: shiftsWithRegistrations,
            directRegistrations: {
                approved: directApproved.map(r => ({
                    id: r.id,
                    name: r.member_id ? `${r.vorname} ${r.nachname}` : r.guest_name,
                    email: r.guest_email,
                    notes: r.notes
                })),
                pending: directPending.map(r => ({
                    id: r.id,
                    name: r.member_id ? `${r.vorname} ${r.nachname}` : r.guest_name,
                    email: r.guest_email,
                    notes: r.notes
                })),
                approvedCount: directApproved.length,
                pendingCount: directPending.length
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/events', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const {
            slug, title, subtitle, description, start_date, end_date,
            location, category, registration_required,
            registration_deadline, max_participants, cost, status, image_url, tags,
            organizer_name, organizer_email, create_access
        } = req.body;

        // Event-Zugang generieren falls gewuenscht
        let eventEmail = null;
        let eventPassword = null;
        let eventPasswordHash = null;
        let eventAccessExpires = null;
        let isVorstandMember = false;

        // Vorstand-E-Mails pruefen (kein separater Zugang noetig)
        const vorstandEmails = [
            'praesident@fwv-raura.ch',
            'aktuar@fwv-raura.ch',
            'kassier@fwv-raura.ch',
            'materialwart@fwv-raura.ch',
            'beisitzer@fwv-raura.ch',
            'vorstand@fwv-raura.ch'
        ];

        if (organizer_email) {
            isVorstandMember = vorstandEmails.some(ve =>
                organizer_email.toLowerCase() === ve.toLowerCase()
            );
        }

        if (create_access && organizer_email && !isVorstandMember) {
            // Event-spezifische E-Mail generieren
            eventEmail = `${slug}@fwv-raura.ch`;
            // Zufaelliges Passwort generieren (12 Zeichen)
            eventPassword = crypto.randomBytes(6).toString('base64').replace(/[+/=]/g, '').substring(0, 12);
            // Passwort hashen (einfaches SHA256 - fuer Produktionsumgebung bcrypt empfohlen)
            eventPasswordHash = crypto.createHash('sha256').update(eventPassword).digest('hex');
            // Ablaufdatum: 3 Monate nach Event-Ende
            const endDateObj = end_date ? new Date(end_date) : new Date(start_date);
            eventAccessExpires = new Date(endDateObj);
            eventAccessExpires.setMonth(eventAccessExpires.getMonth() + 3);
        }

        const result = await pool.query(`
            INSERT INTO events (
                slug, title, subtitle, description, start_date, end_date,
                location, category, registration_required,
                registration_deadline, max_participants, cost, status, image_url, tags,
                organizer_name, organizer_email, event_email, event_password_hash, event_access_expires
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
            RETURNING *
        `, [
            slug, title, subtitle, description, start_date, end_date,
            location, category, registration_required,
            registration_deadline, max_participants, cost, status || 'planned', image_url, tags,
            organizer_name || null, organizer_email || null, eventEmail, eventPasswordHash, eventAccessExpires
        ]);

        const newEvent = result.rows[0];

        // E-Mail mit Zugangsdaten an Organisator senden
        if (create_access && organizer_email && eventPassword) {
            try {
                await axios.post(`${DISPATCH_API}/email/send`, {
                    to: organizer_email,
                    subject: `Ihre Zugangsdaten fuer ${title}`,
                    body: `
Guten Tag ${organizer_name || 'Organisator'},

Sie wurden als Organisator fuer das Event "${title}" eingetragen.

Hier sind Ihre Zugangsdaten fuer das Event-Dashboard:

URL: https://fwv-raura.ch/event-dashboard.html
E-Mail: ${eventEmail}
Passwort: ${eventPassword}

Dieser Zugang ist gueltig bis ${eventAccessExpires.toLocaleDateString('de-CH')}.

Bei Fragen wenden Sie sich bitte an den Vorstand.

Mit freundlichen Gruessen
Feuerwehrverein Raura
                    `.trim(),
                    event_id: newEvent.id
                });
                console.log(`Event-Zugangsdaten gesendet an ${organizer_email}`);
            } catch (emailErr) {
                console.error('Fehler beim Senden der Zugangsdaten:', emailErr.message);
            }
        }

        res.status(201).json(newEvent);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/events/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { create_access, ...updates } = req.body;

        // Filter out non-database fields
        const allowedFields = [
            'slug', 'title', 'subtitle', 'description', 'start_date', 'end_date',
            'location', 'category', 'registration_required', 'registration_deadline',
            'max_participants', 'cost', 'status', 'image_url', 'tags',
            'organizer_id', 'organizer_name', 'organizer_email',
            'event_email', 'event_password_hash', 'event_access_expires'
        ];

        const filteredUpdates = {};
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                filteredUpdates[key] = value;
            }
        }

        const fields = Object.keys(filteredUpdates);
        const values = Object.values(filteredUpdates);

        if (fields.length === 0) {
            return res.status(400).json({ error: 'Keine gueltigen Felder zum Aktualisieren' });
        }

        const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
        values.push(id);

        const result = await pool.query(`
            UPDATE events SET ${setClause}, updated_at = NOW()
            WHERE id = $${values.length}
            RETURNING *
        `, values);

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/events/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM events WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        res.json({ message: 'Event deleted', id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// EVENT ORGANIZER LOGIN
// ============================================

// Login fuer Event-Organisatoren
app.post('/events/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
        }

        // Event mit passender event_email suchen
        const result = await pool.query(
            'SELECT * FROM events WHERE event_email = $1',
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Ungueltige Zugangsdaten' });
        }

        const event = result.rows[0];

        // Pruefen ob Zugang abgelaufen
        if (event.event_access_expires && new Date(event.event_access_expires) < new Date()) {
            return res.status(401).json({ error: 'Der Zugang ist abgelaufen. Bitte kontaktieren Sie den Vorstand.' });
        }

        // Passwort pruefen
        const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
        if (passwordHash !== event.event_password_hash) {
            return res.status(401).json({ error: 'Ungueltige Zugangsdaten' });
        }

        // JWT Token erstellen
        const token = jwt.sign({
            type: 'event-organizer',
            event_id: event.id,
            event_title: event.title,
            event_email: email,
            organizer_name: event.organizer_name
        }, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.json({
            success: true,
            token,
            event: {
                id: event.id,
                title: event.title,
                slug: event.slug,
                organizer_name: event.organizer_name
            }
        });
    } catch (error) {
        console.error('Event login error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Event-Daten fuer Organisator abrufen (nur eigenes Event)
app.get('/events/my-event', authenticateEventOrganizer, async (req, res) => {
    try {
        const eventId = req.eventOrganizer.event_id;

        const eventResult = await pool.query('SELECT * FROM events WHERE id = $1', [eventId]);
        if (eventResult.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        const event = eventResult.rows[0];

        // Shifts laden
        const shifts = await pool.query(
            'SELECT * FROM shifts WHERE event_id = $1 ORDER BY date, start_time',
            [eventId]
        );

        // Registrierungen laden
        const registrations = await pool.query(`
            SELECT r.*, m.vorname, m.nachname
            FROM registrations r
            LEFT JOIN members m ON r.member_id = m.id
            WHERE r.event_id = $1
            ORDER BY r.created_at DESC
        `, [eventId]);

        res.json({
            ...event,
            shifts: shifts.rows,
            registrations: registrations.rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Registrierung genehmigen (Organisator)
app.post('/events/my-event/registrations/:id/approve', authenticateEventOrganizer, async (req, res) => {
    try {
        const { id } = req.params;
        const eventId = req.eventOrganizer.event_id;

        // Prüfen ob Registrierung zu diesem Event gehört
        const regCheck = await pool.query(
            'SELECT event_id FROM registrations WHERE id = $1',
            [id]
        );

        if (regCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Registrierung nicht gefunden' });
        }

        if (regCheck.rows[0].event_id !== eventId) {
            return res.status(403).json({ error: 'Zugriff verweigert' });
        }

        const result = await pool.query(`
            UPDATE registrations
            SET status = 'approved', approved_by = $2, approved_at = NOW(), confirmed_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [id, req.eventOrganizer.organizer_name || 'Organisator']);

        const reg = result.rows[0];

        // Bestätigungs-E-Mail senden
        if (reg.guest_email) {
            const event = await pool.query('SELECT title FROM events WHERE id = $1', [eventId]);
            try {
                await axios.post(`${DISPATCH_API}/email/send`, {
                    to: reg.guest_email,
                    subject: `Ihre Anmeldung wurde bestätigt - ${event.rows[0]?.title}`,
                    body: `Guten Tag ${reg.guest_name},\n\nIhre Anmeldung für "${event.rows[0]?.title}" wurde bestätigt.\n\nWir freuen uns auf Sie!\n\nMit freundlichen Grüssen\nFeuerwehrverein Raura`
                });
            } catch (emailErr) {
                console.error('Approval email failed:', emailErr.message);
            }
        }

        // Prüfen ob Arbeitsplan versendet werden kann
        checkAndSendArbeitsplan(eventId).then(result => {
            if (result.sent) {
                console.log(`Arbeitsplan automatisch versendet nach Genehmigung (${result.sentCount} Empfänger)`);
            }
        }).catch(err => console.error('Arbeitsplan-Check fehlgeschlagen:', err));

        res.json({ success: true, registration: reg });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Registrierung ablehnen (Organisator)
app.post('/events/my-event/registrations/:id/reject', authenticateEventOrganizer, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const eventId = req.eventOrganizer.event_id;

        // Prüfen ob Registrierung zu diesem Event gehört
        const regCheck = await pool.query(
            'SELECT event_id FROM registrations WHERE id = $1',
            [id]
        );

        if (regCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Registrierung nicht gefunden' });
        }

        if (regCheck.rows[0].event_id !== eventId) {
            return res.status(403).json({ error: 'Zugriff verweigert' });
        }

        const result = await pool.query(`
            UPDATE registrations
            SET status = 'rejected', approved_by = $2, approved_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [id, req.eventOrganizer.organizer_name || 'Organisator']);

        const reg = result.rows[0];

        // Ablehnungs-E-Mail senden
        if (reg.guest_email) {
            const event = await pool.query('SELECT title FROM events WHERE id = $1', [eventId]);
            try {
                await axios.post(`${DISPATCH_API}/email/send`, {
                    to: reg.guest_email,
                    subject: `Ihre Anmeldung - ${event.rows[0]?.title}`,
                    body: `Guten Tag ${reg.guest_name},\n\nLeider können wir Ihre Anmeldung für "${event.rows[0]?.title}" nicht berücksichtigen.\n\n${reason ? `Grund: ${reason}\n\n` : ''}Bei Fragen kontaktieren Sie uns bitte.\n\nMit freundlichen Grüssen\nFeuerwehrverein Raura`
                });
            } catch (emailErr) {
                console.error('Rejection email failed:', emailErr.message);
            }
        }

        res.json({ success: true, registration: reg });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Arbeitsplan manuell versenden (Organisator)
app.post('/events/my-event/send-arbeitsplan', authenticateEventOrganizer, async (req, res) => {
    try {
        const eventId = req.eventOrganizer.event_id;

        // Manueller Versand: Deadline- und Filled-Check überspringen
        const result = await checkAndSendArbeitsplan(eventId, {
            skipDeadlineCheck: true,
            skipFilledCheck: true
        });

        if (result.sent) {
            res.json({
                success: true,
                message: `Arbeitsplan an ${result.sentCount} Empfänger versendet`,
                sentCount: result.sentCount,
                successEmails: result.successEmails,
                errors: result.errors,
                postOnlyMembers: result.postOnlyMembers
            });
        } else {
            res.status(400).json({
                success: false,
                reason: result.reason
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Middleware fuer Event-Organisator Authentifizierung
function authenticateEventOrganizer(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token erforderlich' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.type !== 'event-organizer') {
            return res.status(403).json({ error: 'Nur fuer Event-Organisatoren' });
        }
        req.eventOrganizer = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Ungueltiger Token' });
    }
}

// ============================================
// SHIFTS
// ============================================

app.get('/shifts', async (req, res) => {
    try {
        const { event_id } = req.query;
        let query = 'SELECT s.*, e.title as event_title FROM shifts s JOIN events e ON s.event_id = e.id';

        if (event_id) {
            query += ' WHERE s.event_id = $1';
            const result = await pool.query(query, [event_id]);
            return res.json(result.rows);
        }

        const result = await pool.query(query + ' ORDER BY s.date, s.start_time');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/shifts', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { event_id, name, description, date, start_time, end_time, needed, bereich } = req.body;

        const result = await pool.query(`
            INSERT INTO shifts (event_id, name, description, date, start_time, end_time, needed, bereich)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [event_id, name, description, date, start_time, end_time, needed, bereich || 'Allgemein']);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/shifts/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, date, start_time, end_time, needed, bereich } = req.body;

        // Alte Schicht-Daten für Vergleich speichern
        const oldShiftResult = await pool.query('SELECT * FROM shifts WHERE id = $1', [id]);
        if (oldShiftResult.rows.length === 0) {
            return res.status(404).json({ error: 'Shift not found' });
        }
        const oldShift = oldShiftResult.rows[0];

        const result = await pool.query(`
            UPDATE shifts SET
                name = COALESCE($1, name),
                description = COALESCE($2, description),
                date = COALESCE($3, date),
                start_time = COALESCE($4, start_time),
                end_time = COALESCE($5, end_time),
                needed = COALESCE($6, needed),
                bereich = COALESCE($7, bereich)
            WHERE id = $8
            RETURNING *
        `, [name, description, date, start_time, end_time, needed, bereich, id]);

        const updatedShift = result.rows[0];

        // Event-Info für Benachrichtigung holen
        const eventResult = await pool.query('SELECT * FROM events WHERE id = $1', [updatedShift.event_id]);
        const event = eventResult.rows[0];

        // Benachrichtigungen bei relevanten Änderungen senden
        const notificationResult = await notifyShiftRegistrations(
            updatedShift,
            event,
            'updated',
            oldShift
        );

        res.json({
            ...updatedShift,
            notifications: notificationResult
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/shifts/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;

        // Schicht-Daten vor Löschung abrufen
        const shiftResult = await pool.query('SELECT * FROM shifts WHERE id = $1', [id]);
        if (shiftResult.rows.length === 0) {
            return res.status(404).json({ error: 'Shift not found' });
        }
        const shift = shiftResult.rows[0];

        // Event-Info für Benachrichtigung holen
        const eventResult = await pool.query('SELECT * FROM events WHERE id = $1', [shift.event_id]);
        const event = eventResult.rows[0];

        // Benachrichtigungen VOR Löschung senden
        const notificationResult = await notifyShiftRegistrations(shift, event, 'deleted');

        // Jetzt Schicht löschen
        await pool.query('DELETE FROM shifts WHERE id = $1', [id]);

        res.json({
            message: 'Shift deleted',
            id,
            notifications: notificationResult
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// REGISTRATIONS
// ============================================

app.get('/registrations', authenticateAny, async (req, res) => {
    try {
        const { event_id, member_id, include_guest_email } = req.query;
        let query = `
            SELECT r.*, m.vorname, m.nachname, e.title as event_title
            FROM registrations r
            LEFT JOIN members m ON r.member_id = m.id
            JOIN events e ON r.event_id = e.id
            WHERE 1=1
        `;
        const params = [];

        if (event_id) {
            params.push(event_id);
            query += ` AND r.event_id = $${params.length}`;
        }
        if (member_id) {
            // Wenn include_guest_email gesetzt ist, auch nach E-Mail des Mitglieds suchen
            if (include_guest_email) {
                // Mitglied-E-Mail laden
                const memberResult = await pool.query('SELECT email FROM members WHERE id = $1', [member_id]);
                const memberEmail = memberResult.rows[0]?.email;

                if (memberEmail) {
                    params.push(member_id);
                    params.push(memberEmail.toLowerCase());
                    query += ` AND (r.member_id = $${params.length - 1} OR LOWER(r.guest_email) = $${params.length})`;
                } else {
                    params.push(member_id);
                    query += ` AND r.member_id = $${params.length}`;
                }
            } else {
                params.push(member_id);
                query += ` AND r.member_id = $${params.length}`;
            }
        }

        query += ' ORDER BY r.created_at DESC';

        const result = await pool.query(query, params);

        // Schicht-Details für jede Registrierung laden
        const registrationsWithShifts = await Promise.all(result.rows.map(async (reg) => {
            if (reg.shift_ids && reg.shift_ids.length > 0) {
                const shiftsResult = await pool.query(
                    'SELECT id, name, date, start_time, end_time, bereich FROM shifts WHERE id = ANY($1)',
                    [reg.shift_ids]
                );
                reg.shifts = shiftsResult.rows;
            } else {
                reg.shifts = [];
            }
            return reg;
        }));

        res.json(registrationsWithShifts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/registrations', authenticateAny, async (req, res) => {
    try {
        const { event_id, member_id, guest_name, guest_email, shift_ids, notes } = req.body;

        const result = await pool.query(`
            INSERT INTO registrations (event_id, member_id, guest_name, guest_email, shift_ids, notes)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [event_id, member_id, guest_name, guest_email, shift_ids, notes]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Öffentliche Registrierung (Website-Formular, ersetzt n8n)
app.post('/registrations/public', async (req, res) => {
    try {
        const {
            type, eventId, eventTitle, organizerEmail,
            name, email, phone,
            shifts, shiftIds, // für Schicht-Anmeldung
            participants, // für Teilnehmer-Anmeldung
            notes,
            skipMemberCheck // Falls der User trotzdem als Gast anmelden möchte
        } = req.body;

        // Prüfen ob die E-Mail zu einem Mitglied gehört - wenn ja, automatisch verknüpfen
        let memberId = null;
        let isMember = false;
        if (email) {
            const memberCheck = await pool.query(
                'SELECT id, vorname, nachname, email FROM members WHERE LOWER(email) = LOWER($1)',
                [email]
            );

            if (memberCheck.rows.length > 0) {
                memberId = memberCheck.rows[0].id;
                isMember = true;
                console.log(`Registrierung automatisch verknüpft mit Mitglied: ${memberCheck.rows[0].vorname} ${memberCheck.rows[0].nachname}`);
            }
        }

        // Event laden (UUID oder Slug)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        let event;
        if (uuidRegex.test(eventId)) {
            event = await pool.query('SELECT * FROM events WHERE id = $1', [eventId]);
        } else {
            event = await pool.query('SELECT * FROM events WHERE slug = $1', [eventId]);
        }
        if (event.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Event nicht gefunden' });
        }

        // Registrierung speichern (mit member_id falls Mitglied erkannt)
        const registration = await pool.query(`
            INSERT INTO registrations (event_id, member_id, guest_name, guest_email, shift_ids, notes, status)
            VALUES ($1, $2, $3, $4, $5, $6, 'pending')
            RETURNING *
        `, [
            event.rows[0].id,
            memberId,
            name,
            email,
            type === 'shift' ? shiftIds : null,
            JSON.stringify({ phone, participants, shifts, notes })
        ]);

        // Schicht-Details für E-Mail aus DB laden
        let shiftInfo = '';
        if (type === 'shift' && shiftIds && shiftIds.length > 0) {
            const shiftDetails = await pool.query(
                'SELECT name, date, start_time, end_time, bereich FROM shifts WHERE id = ANY($1) ORDER BY date, start_time',
                [shiftIds]
            );
            if (shiftDetails.rows.length > 0) {
                const shiftLines = shiftDetails.rows.map(s => {
                    const date = s.date ? new Date(s.date).toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
                    const time = s.start_time && s.end_time ? `${s.start_time.substring(0,5)}-${s.end_time.substring(0,5)}` : '';
                    const bereich = s.bereich ? ` (${s.bereich})` : '';
                    return `- ${s.name}: ${date} ${time}${bereich}`;
                });
                shiftInfo = `\nGewählte Schichten:\n${shiftLines.join('\n')}`;
            }
        }

        // Bestätigung an Anmelder
        const confirmSubject = `Bestätigung Ihrer Anmeldung - ${eventTitle}`;
        const confirmBody = `
Guten Tag ${name},

Vielen Dank für Ihre Anmeldung${type === 'shift' ? ' als Helfer/in' : ''}!

Event: ${eventTitle}
${shiftInfo}
${participants ? `Anzahl Personen: ${participants}` : ''}
${notes ? `\nBemerkungen: ${notes}` : ''}

Wir werden Ihre Anmeldung bearbeiten und uns bei Ihnen melden.

Mit freundlichen Grüssen
Feuerwehrverein Raura
        `.trim();

        try {
            await axios.post(`${DISPATCH_API}/email/send`, {
                to: email,
                subject: confirmSubject,
                body: confirmBody
            });
        } catch (emailError) {
            console.error('Bestätigungs-E-Mail konnte nicht gesendet werden:', emailError.message);
        }

        // Benachrichtigung an Organisator
        const orgSubject = `Neue Anmeldung für ${eventTitle}`;
        const orgBody = `
Neue ${type === 'shift' ? 'Helfer-' : 'Teilnehmer-'}Anmeldung eingegangen!

Name: ${name}
E-Mail: ${email}
${phone ? `Telefon: ${phone}` : ''}
${shiftInfo}
${participants ? `Anzahl Personen: ${participants}` : ''}
${notes ? `\nBemerkungen: ${notes}` : ''}
        `.trim();

        try {
            await axios.post(`${DISPATCH_API}/email/send`, {
                to: organizerEmail || process.env.CONTACT_EMAIL || 'kontakt@fwv-raura.ch',
                subject: orgSubject,
                body: orgBody,
                event_id: event.rows[0].id
            });
        } catch (emailError) {
            console.error('Organisator-E-Mail konnte nicht gesendet werden:', emailError.message);
        }

        res.json({
            success: true,
            message: isMember ? 'Anmeldung erfolgreich (als Mitglied verknüpft)' : 'Anmeldung erfolgreich',
            registrationId: registration.rows[0].id,
            isMember: isMember
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// REGISTRATION MANAGEMENT (Vorstand)
// ============================================

// Get all registrations with filters (Vorstand only)
app.get('/registrations/manage', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { event_id, status } = req.query;
        let query = `
            SELECT r.*, e.title as event_title, e.slug as event_slug,
                   m.vorname, m.nachname
            FROM registrations r
            JOIN events e ON r.event_id = e.id
            LEFT JOIN members m ON r.member_id = m.id
            WHERE 1=1
        `;
        const params = [];

        if (event_id) {
            params.push(event_id);
            query += ` AND r.event_id = $${params.length}`;
        }
        if (status) {
            params.push(status);
            query += ` AND r.status = $${params.length}`;
        }

        query += ' ORDER BY r.created_at DESC';

        const result = await pool.query(query, params);

        // Parse notes JSON and add shift names
        for (const reg of result.rows) {
            if (reg.notes) {
                try {
                    reg.notes_data = JSON.parse(reg.notes);
                } catch (e) {
                    reg.notes_data = { notes: reg.notes };
                }
            }
            // Get shift names
            if (reg.shift_ids && reg.shift_ids.length > 0) {
                const shifts = await pool.query(
                    'SELECT id, name, date, start_time, end_time FROM shifts WHERE id = ANY($1)',
                    [reg.shift_ids]
                );
                reg.shifts = shifts.rows;
            }
        }

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Approve registration
app.post('/registrations/:id/approve', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            UPDATE registrations
            SET status = 'approved', approved_by = $2, approved_at = NOW(), confirmed_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [id, req.user.email || req.user.name]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Registration not found' });
        }

        const reg = result.rows[0];

        // Send approval email
        if (reg.guest_email) {
            const event = await pool.query('SELECT title FROM events WHERE id = $1', [reg.event_id]);
            try {
                await axios.post(`${DISPATCH_API}/email/send`, {
                    to: reg.guest_email,
                    subject: `Ihre Anmeldung wurde bestätigt - ${event.rows[0]?.title}`,
                    body: `Guten Tag ${reg.guest_name},\n\nIhre Anmeldung für "${event.rows[0]?.title}" wurde bestätigt.\n\nWir freuen uns auf Sie!\n\nMit freundlichen Grüssen\nFeuerwehrverein Raura`
                });
            } catch (emailErr) {
                console.error('Approval email failed:', emailErr.message);
            }
        }

        // Prüfen ob Arbeitsplan versendet werden kann (async, nicht blockierend)
        checkAndSendArbeitsplan(reg.event_id).then(result => {
            if (result.sent) {
                console.log(`Arbeitsplan automatisch versendet nach Genehmigung (${result.sentCount} Empfänger)`);
            }
        }).catch(err => console.error('Arbeitsplan-Check fehlgeschlagen:', err));

        res.json({ success: true, registration: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reject registration
app.post('/registrations/:id/reject', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const result = await pool.query(`
            UPDATE registrations
            SET status = 'rejected', approved_by = $2, approved_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [id, req.user.email || req.user.name]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Registration not found' });
        }

        const reg = result.rows[0];

        // Send rejection email
        if (reg.guest_email) {
            const event = await pool.query('SELECT title FROM events WHERE id = $1', [reg.event_id]);
            try {
                await axios.post(`${DISPATCH_API}/email/send`, {
                    to: reg.guest_email,
                    subject: `Ihre Anmeldung - ${event.rows[0]?.title}`,
                    body: `Guten Tag ${reg.guest_name},\n\nLeider können wir Ihre Anmeldung für "${event.rows[0]?.title}" nicht berücksichtigen.\n\n${reason ? `Grund: ${reason}\n\n` : ''}Bei Fragen kontaktieren Sie uns bitte.\n\nMit freundlichen Grüssen\nFeuerwehrverein Raura`
                });
            } catch (emailErr) {
                console.error('Rejection email failed:', emailErr.message);
            }
        }

        res.json({ success: true, registration: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Suggest alternative shift
app.post('/registrations/:id/suggest-alternative', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { newShiftId, shiftInfo, comment, email } = req.body;

        if (!newShiftId || !email) {
            return res.status(400).json({ error: 'newShiftId and email are required' });
        }

        // Get the registration
        const regResult = await pool.query('SELECT * FROM registrations WHERE id = $1', [id]);
        if (regResult.rows.length === 0) {
            return res.status(404).json({ error: 'Registration not found' });
        }
        const reg = regResult.rows[0];

        // Get event info
        const eventResult = await pool.query('SELECT title FROM events WHERE id = $1', [reg.event_id]);
        const eventTitle = eventResult.rows[0]?.title || 'Event';

        // Generate tokens for accept/decline
        const acceptToken = crypto.randomUUID();
        const declineToken = crypto.randomUUID();

        // Store the alternative suggestion in the registration notes
        const suggestionData = {
            suggested_shift_id: newShiftId,
            suggested_shift_info: shiftInfo,
            accept_token: acceptToken,
            decline_token: declineToken,
            suggested_at: new Date().toISOString(),
            suggested_by: req.user.email || req.user.name
        };

        await pool.query(`
            UPDATE registrations
            SET notes = COALESCE(notes, '{}')::jsonb || $2::jsonb
            WHERE id = $1
        `, [id, JSON.stringify({ alternative_suggestion: suggestionData })]);

        // Format shift info for email
        const shiftLabel = shiftInfo.bereich
            ? `${shiftInfo.bereich} - ${shiftInfo.name} (${shiftInfo.date} ${shiftInfo.time})`
            : `${shiftInfo.name} (${shiftInfo.date} ${shiftInfo.time})`;

        // Build email with accept/decline links
        const baseUrl = process.env.BASE_URL || 'https://api.fwv-raura.ch';
        const acceptUrl = `${baseUrl}/registrations/alternative-response/${acceptToken}`;
        const declineUrl = `${baseUrl}/registrations/alternative-response/${declineToken}`;

        const emailBody = `Guten Tag ${reg.guest_name},

${comment || 'Wir haben einen alternativen Vorschlag fuer deine Anmeldung.'}

Vorgeschlagene Schicht:
${shiftLabel}

Event: ${eventTitle}

Bitte klicke auf einen der folgenden Links:

✅ JA, ich uebernehme diese Schicht:
${acceptUrl}

❌ NEIN, ich moechte absagen:
${declineUrl}

Bei Fragen kontaktiere uns bitte.

Mit freundlichen Gruessen
Feuerwehrverein Raura`;

        // Send email via dispatch API
        await axios.post(`${DISPATCH_API}/email/send`, {
            to: email,
            subject: `Alternative Schicht vorgeschlagen - ${eventTitle}`,
            body: emailBody
        });

        logInfo('Alternative shift suggested', {
            registrationId: id,
            newShiftId,
            email,
            suggestedBy: req.user.email
        });

        res.json({ success: true, message: 'Vorschlag gesendet' });
    } catch (error) {
        logError('Error suggesting alternative', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Handle alternative response (accept/decline)
app.get('/registrations/alternative-response/:token', async (req, res) => {
    try {
        const { token } = req.params;

        // Find registration with this token
        const result = await pool.query(`
            SELECT r.*, e.title as event_title
            FROM registrations r
            JOIN events e ON r.event_id = e.id
            WHERE r.notes::text LIKE $1
        `, [`%${token}%`]);

        if (result.rows.length === 0) {
            return res.send(`
                <html>
                <head><title>Fehler</title></head>
                <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                    <h1>❌ Link ungueltig</h1>
                    <p>Dieser Link ist ungueltig oder bereits verwendet worden.</p>
                </body>
                </html>
            `);
        }

        const reg = result.rows[0];
        let notes;
        try {
            notes = typeof reg.notes === 'string' ? JSON.parse(reg.notes) : reg.notes;
        } catch(e) {
            notes = {};
        }

        const suggestion = notes?.alternative_suggestion;
        if (!suggestion) {
            return res.send(`
                <html>
                <head><title>Fehler</title></head>
                <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                    <h1>❌ Kein Vorschlag gefunden</h1>
                    <p>Fuer diese Anmeldung liegt kein alternativer Vorschlag vor.</p>
                </body>
                </html>
            `);
        }

        const isAccept = token === suggestion.accept_token;
        const isDecline = token === suggestion.decline_token;

        if (!isAccept && !isDecline) {
            return res.send(`
                <html>
                <head><title>Fehler</title></head>
                <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                    <h1>❌ Token ungueltig</h1>
                    <p>Dieser Bestaetigungslink ist ungueltig.</p>
                </body>
                </html>
            `);
        }

        if (isAccept) {
            // Accept: Update registration to new shift
            await pool.query(`
                UPDATE registrations
                SET shift_ids = ARRAY[$2::uuid],
                    status = 'approved',
                    confirmed_at = NOW(),
                    notes = notes::jsonb - 'alternative_suggestion'
                WHERE id = $1
            `, [reg.id, suggestion.suggested_shift_id]);

            logInfo('Alternative accepted', {
                registrationId: reg.id,
                newShiftId: suggestion.suggested_shift_id
            });

            return res.send(`
                <html>
                <head><title>Bestaetigt!</title></head>
                <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                    <h1>✅ Vielen Dank!</h1>
                    <p>Deine Anmeldung wurde auf die neue Schicht umgebucht:</p>
                    <p><strong>${suggestion.suggested_shift_info?.bereich ? suggestion.suggested_shift_info.bereich + ' - ' : ''}${suggestion.suggested_shift_info?.name}</strong></p>
                    <p>${suggestion.suggested_shift_info?.date} ${suggestion.suggested_shift_info?.time}</p>
                    <br>
                    <p>Wir freuen uns auf dich!</p>
                </body>
                </html>
            `);
        } else {
            // Decline: Reject registration
            await pool.query(`
                UPDATE registrations
                SET status = 'rejected',
                    notes = notes::jsonb - 'alternative_suggestion'
                WHERE id = $1
            `, [reg.id]);

            logInfo('Alternative declined', { registrationId: reg.id });

            return res.send(`
                <html>
                <head><title>Abgesagt</title></head>
                <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                    <h1>Schade!</h1>
                    <p>Deine Anmeldung fuer "${reg.event_title}" wurde storniert.</p>
                    <p>Vielleicht klappt es beim naechsten Mal!</p>
                </body>
                </html>
            `);
        }
    } catch (error) {
        logError('Error handling alternative response', { error: error.message });
        res.status(500).send(`
            <html>
            <head><title>Fehler</title></head>
            <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                <h1>❌ Fehler</h1>
                <p>Es ist ein Fehler aufgetreten. Bitte kontaktiere uns.</p>
            </body>
            </html>
        `);
    }
});

// Update registration (Vorstand)
app.put('/registrations/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { guest_name, guest_email, phone, shift_ids, notes, status } = req.body;

        const result = await pool.query(`
            UPDATE registrations
            SET guest_name = COALESCE($2, guest_name),
                guest_email = COALESCE($3, guest_email),
                phone = COALESCE($4, phone),
                shift_ids = COALESCE($5, shift_ids),
                notes = COALESCE($6, notes),
                status = COALESCE($7, status)
            WHERE id = $1
            RETURNING *
        `, [id, guest_name, guest_email, phone, shift_ids, notes, status]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Registration not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete registration (Vorstand)
app.delete('/registrations/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM registrations WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Registration not found' });
        }

        res.json({ success: true, message: 'Registration deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// CALENDAR (ICS)
// ============================================

app.get('/calendar/ics', async (req, res) => {
    try {
        const events = await pool.query('SELECT * FROM events WHERE status != $1 ORDER BY start_date', ['cancelled']);

        const calendar = ical({
            name: 'Feuerwehrverein Raura',
            timezone: 'Europe/Zurich'
        });

        events.rows.forEach(event => {
            calendar.createEvent({
                start: new Date(event.start_date),
                end: event.end_date ? new Date(event.end_date) : undefined,
                summary: event.title,
                description: event.description,
                location: event.location
            });
        });

        res.type('text/calendar').send(calendar.toString());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ARBEITSPLAN PDF GENERATION
// ============================================

app.post('/arbeitsplan/pdf', async (req, res) => {
    try {
        // Support both old format (eventId, shifts) and new format (event object or events array)
        const { eventId, eventTitle, shifts, event, events, logoBase64 } = req.body;

        // Determine which format is being used
        let eventsToProcess = [];

        if (events && Array.isArray(events) && events.length > 0) {
            // Multiple events (grouped Arbeitsplan)
            eventsToProcess = events;
        } else if (event) {
            // Single event object from frontend - load fresh registrations from DB
            const eventDbId = event.dbId || event.id;
            if (eventDbId) {
                // Load shifts with current registrations from database
                const shiftsResult = await pool.query(
                    'SELECT * FROM shifts WHERE event_id = $1 ORDER BY date, start_time',
                    [eventDbId]
                );

                const shiftsWithRegs = await Promise.all(shiftsResult.rows.map(async (shift) => {
                    const regsResult = await pool.query(`
                        SELECT r.id, r.guest_name, r.status, r.member_id, m.vorname, m.nachname
                        FROM registrations r
                        LEFT JOIN members m ON r.member_id = m.id
                        WHERE $1 = ANY(r.shift_ids) AND r.status IN ('approved', 'confirmed')
                    `, [shift.id]);

                    return {
                        ...shift,
                        registrations: {
                            approved: regsResult.rows.map(r => ({
                                id: r.id,
                                name: r.member_id ? `${r.vorname} ${r.nachname}` : r.guest_name
                            }))
                        }
                    };
                }));

                eventsToProcess = [{
                    ...event,
                    shifts: shiftsWithRegs.length > 0 ? shiftsWithRegs : event.shifts
                }];
            } else {
                eventsToProcess = [event];
            }
        } else if (shifts && shifts.length > 0) {
            // Old format with just shifts
            eventsToProcess = [{ title: eventTitle || 'Event', shifts }];
        } else {
            return res.status(400).json({ error: 'No event data provided' });
        }

        // Validate that we have shifts
        const hasShifts = eventsToProcess.some(e => e.shifts && e.shifts.length > 0);
        if (!hasShifts) {
            return res.status(400).json({ error: 'No shifts found in event data' });
        }

        // Create PDF document
        const isMultiEvent = eventsToProcess.length > 1;
        const mainTitle = isMultiEvent
            ? eventsToProcess.map(e => e.title).join(' / ')
            : eventsToProcess[0].title;

        const doc = new PDFDocument({
            size: 'A4',
            margin: 50,
            info: {
                Title: `Arbeitsplan ${mainTitle}`,
                Author: 'Feuerwehrverein Raura'
            }
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        const safeTitle = mainTitle.replace(/[^a-zA-Z0-9äöüÄÖÜ ]/g, '_').substring(0, 50);
        res.setHeader('Content-Disposition', `attachment; filename="Arbeitsplan_${safeTitle}.pdf"`);

        // Pipe PDF to response
        doc.pipe(res);

        // Process each event
        eventsToProcess.forEach((eventData, eventIndex) => {
            if (eventIndex > 0) {
                doc.addPage();
            }

            const shifts = eventData.shifts || [];

            // Header
            doc.fontSize(18).font('Helvetica-Bold').text('Feuerwehrverein Raura', { align: 'center' });
            doc.fontSize(14).font('Helvetica').text('Arbeitsplan', { align: 'center' });
            doc.moveDown(0.3);
            doc.fontSize(16).font('Helvetica-Bold').text(eventData.title || 'Event', { align: 'center' });
            doc.moveDown(1);

            // Get all unique Bereiche for table headers
            const allBereiche = [...new Set(shifts.map(s => s.bereich || 'Allgemein'))].sort();

            // Group shifts by date
            const shiftsByDate = {};
            shifts.forEach(shift => {
                const date = shift.date || 'Unbekannt';
                if (!shiftsByDate[date]) {
                    shiftsByDate[date] = [];
                }
                shiftsByDate[date].push(shift);
            });

            // Sort dates
            const sortedDates = Object.keys(shiftsByDate).sort();

            sortedDates.forEach(date => {
                // Date header
                const dateObj = new Date(date + 'T12:00:00');
                const dateStr = dateObj.toLocaleDateString('de-CH', {
                    weekday: 'long',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });

                doc.fontSize(12).font('Helvetica-Bold').text(dateStr);
                doc.moveDown(0.5);

                // Group shifts by time slot
                const byTimeSlot = {};
                shiftsByDate[date].forEach(shift => {
                    const startTime = shift.start_time || shift.startTime || '';
                    const endTime = shift.end_time || shift.endTime || '';
                    const timeKey = `${startTime}-${endTime}`;

                    if (!byTimeSlot[timeKey]) {
                        byTimeSlot[timeKey] = { startTime, endTime, bereiche: {} };
                    }

                    const bereich = shift.bereich || 'Allgemein';

                    // Get helpers from registrations
                    let helpers = [];
                    if (shift.registrations && shift.registrations.approved) {
                        helpers = shift.registrations.approved.map(r => r.name);
                    } else if (shift.helpers) {
                        helpers = shift.helpers;
                    }

                    byTimeSlot[timeKey].bereiche[bereich] = {
                        needed: shift.max_helpers || shift.needed || 1,
                        helpers
                    };
                });

                // Render as simple list (table is complex in PDFKit)
                Object.entries(byTimeSlot).sort((a, b) => a[0].localeCompare(b[0])).forEach(([timeKey, slot]) => {
                    const timeDisplay = slot.startTime && slot.endTime
                        ? `${slot.startTime.substring(0, 5)} - ${slot.endTime.substring(0, 5)}`
                        : timeKey;

                    doc.fontSize(10).font('Helvetica-Bold').text(`  ${timeDisplay}`);

                    allBereiche.forEach(bereich => {
                        const data = slot.bereiche[bereich];
                        if (data) {
                            const helperList = data.helpers.length > 0
                                ? data.helpers.join(', ')
                                : '(noch offen)';
                            const countStr = `${data.helpers.length}/${data.needed}`;

                            doc.fontSize(9).font('Helvetica')
                                .text(`      ${bereich} [${countStr}]: ${helperList}`);
                        }
                    });
                    doc.moveDown(0.3);
                });

                doc.moveDown(0.5);
            });

            // Springer section if available
            if (eventData.springer) {
                doc.moveDown(0.5);
                doc.fontSize(11).font('Helvetica-Bold').text('Springer:');
                doc.fontSize(10).font('Helvetica').text(`  ${eventData.springer}`);
            }

            // Notes if available
            if (eventData.notes) {
                doc.moveDown(0.5);
                doc.fontSize(11).font('Helvetica-Bold').text('Bemerkungen:');
                doc.fontSize(10).font('Helvetica').text(`  ${eventData.notes}`);
            }
        });

        // Footer on last page
        doc.moveDown(2);
        doc.fontSize(8).font('Helvetica').fillColor('#666666')
            .text(`Erstellt am ${new Date().toLocaleDateString('de-CH')} um ${new Date().toLocaleTimeString('de-CH')}`, { align: 'center' });

        // Finalize PDF
        doc.end();

    } catch (error) {
        console.error('PDF generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// TEILNEHMERLISTE PDF GENERATION
// ============================================

app.post('/teilnehmerliste/pdf', async (req, res) => {
    try {
        const { eventId, eventTitle, participants, shifts } = req.body;

        if (!eventId || (!participants || participants.length === 0)) {
            return res.status(400).json({ error: 'eventId and participants are required' });
        }

        // Create PDF document
        const doc = new PDFDocument({
            size: 'A4',
            margin: 50,
            info: {
                Title: `Teilnehmerliste ${eventTitle}`,
                Author: 'Feuerwehrverein Raura'
            }
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Teilnehmerliste_${eventTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`);

        // Pipe PDF to response
        doc.pipe(res);

        // Header
        doc.fontSize(20).font('Helvetica-Bold').text('Feuerwehrverein Raura', { align: 'center' });
        doc.fontSize(16).font('Helvetica').text('Teilnehmerliste', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(14).font('Helvetica-Bold').text(eventTitle, { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica').fillColor('#666666')
            .text(`${participants.length} Anmeldung${participants.length !== 1 ? 'en' : ''}`, { align: 'center' });
        doc.fillColor('#000000');
        doc.moveDown(1.5);

        // Check if we have shifts data - if so, render by shift
        if (shifts && shifts.length > 0) {
            // Render participants grouped by shift
            for (const shift of shifts) {
                const shiftParticipants = shift.participants || [];
                if (shiftParticipants.length === 0) continue;

                // Check for page break before shift header
                if (doc.y > 680) {
                    doc.addPage();
                }

                // Shift header
                doc.fontSize(12).font('Helvetica-Bold').fillColor('#1f2937');
                let shiftTitle = shift.name;
                if (shift.bereich) {
                    shiftTitle = `${shift.bereich} - ${shift.name}`;
                }
                if (shift.date) {
                    shiftTitle += `: ${shift.date}`;
                    if (shift.startTime && shift.endTime) {
                        shiftTitle += ` ${shift.startTime}-${shift.endTime}`;
                    }
                }
                doc.text(shiftTitle);
                doc.fillColor('#000000');
                doc.moveDown(0.3);

                // Table header
                const tableTop = doc.y;
                const col1 = 50;  // Nr.
                const col2 = 80;  // Name
                const col3 = 280; // E-Mail
                const col4 = 420; // Status

                doc.fontSize(9).font('Helvetica-Bold').fillColor('#4b5563');
                doc.text('Nr.', col1, tableTop);
                doc.text('Name', col2, tableTop);
                doc.text('E-Mail', col3, tableTop);
                doc.text('Status', col4, tableTop);
                doc.fillColor('#000000');

                // Line under header
                doc.moveTo(col1, tableTop + 12).lineTo(545, tableTop + 12).strokeColor('#d1d5db').stroke();
                doc.strokeColor('#000000');

                // Table rows
                let rowY = tableTop + 18;
                doc.font('Helvetica').fontSize(9);

                shiftParticipants.forEach((p, index) => {
                    // Check for page break
                    if (rowY > 750) {
                        doc.addPage();
                        rowY = 50;

                        // Continue shift title on new page
                        doc.fontSize(10).font('Helvetica-Bold').fillColor('#6b7280');
                        doc.text(`${shiftTitle} (Fortsetzung)`, col1, rowY);
                        doc.fillColor('#000000');
                        rowY += 20;

                        // Repeat table header
                        doc.fontSize(9).font('Helvetica-Bold').fillColor('#4b5563');
                        doc.text('Nr.', col1, rowY);
                        doc.text('Name', col2, rowY);
                        doc.text('E-Mail', col3, rowY);
                        doc.text('Status', col4, rowY);
                        doc.fillColor('#000000');
                        doc.moveTo(col1, rowY + 12).lineTo(545, rowY + 12).strokeColor('#d1d5db').stroke();
                        doc.strokeColor('#000000');
                        rowY += 18;
                        doc.font('Helvetica').fontSize(9);
                    }

                    doc.fillColor('#374151').text(`${index + 1}.`, col1, rowY);
                    doc.text(p.name || '-', col2, rowY, { width: 190 });
                    doc.text(p.email || '-', col3, rowY, { width: 130 });

                    // Status with color
                    const statusText = p.status === 'approved' ? 'Bestätigt' :
                                      p.status === 'pending' ? 'Ausstehend' :
                                      p.status === 'rejected' ? 'Abgelehnt' : p.status;
                    const statusColor = p.status === 'approved' ? '#22c55e' :
                                       p.status === 'pending' ? '#f59e0b' :
                                       p.status === 'rejected' ? '#ef4444' : '#666666';
                    doc.fillColor(statusColor).text(statusText, col4, rowY);
                    doc.fillColor('#000000');

                    // Add notes if available
                    if (p.notes) {
                        rowY += 12;
                        doc.fontSize(8).fillColor('#6b7280')
                            .text(`Bemerkungen: ${p.notes}`, col2, rowY, { width: 400 });
                        doc.fillColor('#000000').fontSize(9);
                    }

                    rowY += 16;
                });

                doc.y = rowY + 10;
                doc.moveDown(0.5);
            }
        } else {
            // No shifts data - render simple flat list (backwards compatible)
            const tableTop = doc.y;
            const col1 = 50;
            const col2 = 80;
            const col3 = 280;
            const col4 = 420;

            doc.fontSize(10).font('Helvetica-Bold');
            doc.text('Nr.', col1, tableTop);
            doc.text('Name', col2, tableTop);
            doc.text('E-Mail', col3, tableTop);
            doc.text('Status', col4, tableTop);

            doc.moveTo(col1, tableTop + 15).lineTo(550, tableTop + 15).stroke();

            let rowY = tableTop + 25;
            doc.font('Helvetica').fontSize(10);

            participants.forEach((p, index) => {
                if (rowY > 750) {
                    doc.addPage();
                    rowY = 50;

                    doc.fontSize(10).font('Helvetica-Bold');
                    doc.text('Nr.', col1, rowY);
                    doc.text('Name', col2, rowY);
                    doc.text('E-Mail', col3, rowY);
                    doc.text('Status', col4, rowY);
                    doc.moveTo(col1, rowY + 15).lineTo(550, rowY + 15).stroke();
                    rowY += 25;
                    doc.font('Helvetica').fontSize(10);
                }

                doc.text(`${index + 1}.`, col1, rowY);
                doc.text(p.name || '-', col2, rowY, { width: 190 });
                doc.text(p.email || '-', col3, rowY, { width: 130 });

                const statusText = p.status === 'approved' ? 'Bestätigt' :
                                  p.status === 'pending' ? 'Ausstehend' :
                                  p.status === 'rejected' ? 'Abgelehnt' : p.status;
                const statusColor = p.status === 'approved' ? '#22c55e' :
                                   p.status === 'pending' ? '#f59e0b' :
                                   p.status === 'rejected' ? '#ef4444' : '#666666';
                doc.fillColor(statusColor).text(statusText, col4, rowY);
                doc.fillColor('#000000');

                if (p.notes) {
                    rowY += 15;
                    doc.fontSize(8).fillColor('#666666')
                        .text(`Bemerkungen: ${p.notes}`, col2, rowY, { width: 400 });
                    doc.fillColor('#000000').fontSize(10);
                }

                rowY += 20;
            });
        }

        // Summary at the bottom
        if (doc.y < 700) {
            doc.moveDown(1);
            doc.fontSize(10).font('Helvetica-Bold');
            const approvedCount = participants.filter(p => p.status === 'approved').length;
            const pendingCount = participants.filter(p => p.status === 'pending').length;

            doc.text('Zusammenfassung:', 50);
            doc.font('Helvetica').fontSize(10);
            doc.text(`Bestätigt: ${approvedCount}`, 50, doc.y + 5);
            doc.text(`Ausstehend: ${pendingCount}`, 50, doc.y + 5);
            doc.text(`Total: ${participants.length}`, 50, doc.y + 5);
        }

        // Footer
        doc.fontSize(8).font('Helvetica').fillColor('#666666');
        doc.text(
            `Erstellt am ${new Date().toLocaleDateString('de-CH')} um ${new Date().toLocaleTimeString('de-CH')}`,
            50, 780, { align: 'center', width: 500 }
        );

        // Finalize PDF
        doc.end();

    } catch (error) {
        console.error('Teilnehmerliste PDF generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Arbeitsplan manuell versenden (Vorstand)
app.post('/events/:id/send-arbeitsplan', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const eventId = req.params.id;

        // Manueller Versand: Deadline- und Filled-Check überspringen
        const result = await checkAndSendArbeitsplan(eventId, {
            skipDeadlineCheck: true,
            skipFilledCheck: true
        });

        if (result.sent) {
            res.json({
                success: true,
                message: `Arbeitsplan an ${result.sentCount} Empfänger versendet`,
                sentCount: result.sentCount,
                successEmails: result.successEmails,
                errors: result.errors,
                postOnlyMembers: result.postOnlyMembers
            });
        } else {
            res.status(400).json({
                success: false,
                reason: result.reason
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// SHIFT REMINDERS (automated notifications)
// ============================================

// Send reminders for upcoming shifts
app.post('/shifts/send-reminders', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { days_ahead = 1 } = req.body;

        // Get shifts in the next X days
        const fromDate = new Date();
        const toDate = new Date();
        toDate.setDate(toDate.getDate() + days_ahead);

        const shiftsResult = await pool.query(`
            SELECT s.*, e.title as event_title, e.location, e.slug
            FROM shifts s
            JOIN events e ON s.event_id = e.id
            WHERE s.date BETWEEN $1 AND $2
            AND e.status NOT IN ('cancelled')
            ORDER BY s.date, s.start_time
        `, [fromDate.toISOString().split('T')[0], toDate.toISOString().split('T')[0]]);

        const shifts = shiftsResult.rows;
        let sentCount = 0;
        let errors = [];

        for (const shift of shifts) {
            // Get registrations for this shift
            const regsResult = await pool.query(`
                SELECT r.*, m.vorname, m.nachname, m.email
                FROM registrations r
                LEFT JOIN members m ON r.member_id = m.id
                WHERE r.event_id = $1
                AND r.shift_ids && ARRAY[$2::uuid]
                AND r.status = 'confirmed'
            `, [shift.event_id, shift.id]);

            const registrations = regsResult.rows;

            for (const reg of registrations) {
                const email = reg.email || reg.guest_email;
                const name = reg.vorname && reg.nachname ? `${reg.vorname} ${reg.nachname}` : reg.guest_name;

                if (!email) continue;

                const shiftDate = new Date(shift.date);
                const dateStr = shiftDate.toLocaleDateString('de-CH', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                const timeStr = shift.start_time && shift.end_time
                    ? `${shift.start_time} - ${shift.end_time}`
                    : shift.start_time || 'ganztägig';

                const subject = `Erinnerung: Ihre Schicht am ${dateStr}`;
                const body = `
Guten Tag ${name},

Dies ist eine Erinnerung an Ihre Schicht:

Event: ${shift.event_title}
Schicht: ${shift.name}
Datum: ${dateStr}
Zeit: ${timeStr}
${shift.location ? `Ort: ${shift.location}` : ''}

Bitte seien Sie pünktlich vor Ort.

Bei Fragen oder wenn Sie verhindert sind, melden Sie sich bitte umgehend bei uns.

Mit freundlichen Grüssen
Feuerwehrverein Raura
                `.trim();

                try {
                    await axios.post(`${DISPATCH_API}/email/send`, {
                        to: email,
                        subject: subject,
                        body: body,
                        event_id: shift.event_id
                    });
                    sentCount++;
                } catch (error) {
                    console.error(`Failed to send reminder to ${email}:`, error.message);
                    errors.push({ email, error: error.message });
                }
            }
        }

        res.json({
            success: true,
            shifts_checked: shifts.length,
            reminders_sent: sentCount,
            errors: errors
        });

    } catch (error) {
        console.error('Error sending shift reminders:', error);
        res.status(500).json({ error: error.message });
    }
});

// Cron-compatible endpoint (can be called without auth via API key)
app.post('/shifts/cron-reminders', requireApiKey, async (req, res) => {
    try {
        // Send reminders for shifts happening tomorrow
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() + 1);
        const toDate = new Date(fromDate);

        const shiftsResult = await pool.query(`
            SELECT s.*, e.title as event_title, e.location, e.slug
            FROM shifts s
            JOIN events e ON s.event_id = e.id
            WHERE s.date = $1
            AND e.status NOT IN ('cancelled')
            ORDER BY s.start_time
        `, [fromDate.toISOString().split('T')[0]]);

        const shifts = shiftsResult.rows;
        let sentCount = 0;

        for (const shift of shifts) {
            const regsResult = await pool.query(`
                SELECT r.*, m.vorname, m.nachname, m.email
                FROM registrations r
                LEFT JOIN members m ON r.member_id = m.id
                WHERE r.event_id = $1
                AND r.shift_ids && ARRAY[$2::uuid]
                AND r.status = 'confirmed'
            `, [shift.event_id, shift.id]);

            for (const reg of regsResult.rows) {
                const email = reg.email || reg.guest_email;
                const name = reg.vorname && reg.nachname ? `${reg.vorname} ${reg.nachname}` : reg.guest_name;

                if (!email) continue;

                const shiftDate = new Date(shift.date);
                const dateStr = shiftDate.toLocaleDateString('de-CH', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                const timeStr = shift.start_time && shift.end_time
                    ? `${shift.start_time} - ${shift.end_time}`
                    : shift.start_time || 'ganztägig';

                const subject = `Erinnerung: Ihre Schicht morgen am ${dateStr}`;
                const body = `
Guten Tag ${name},

Dies ist eine Erinnerung an Ihre Schicht MORGEN:

Event: ${shift.event_title}
Schicht: ${shift.name}
Datum: ${dateStr}
Zeit: ${timeStr}
${shift.location ? `Ort: ${shift.location}` : ''}

Bitte seien Sie pünktlich vor Ort.

Bei Fragen oder wenn Sie verhindert sind, melden Sie sich bitte umgehend bei uns.

Mit freundlichen Grüssen
Feuerwehrverein Raura
                `.trim();

                try {
                    await axios.post(`${DISPATCH_API}/email/send`, {
                        to: email,
                        subject: subject,
                        body: body,
                        event_id: shift.event_id
                    }, {
                        headers: { 'x-api-key': process.env.API_KEY }
                    });
                    sentCount++;
                } catch (error) {
                    console.error(`Failed to send reminder to ${email}:`, error.message);
                }
            }
        }

        res.json({
            success: true,
            date: fromDate.toISOString().split('T')[0],
            shifts_found: shifts.length,
            reminders_sent: sentCount
        });

    } catch (error) {
        console.error('Error in cron reminders:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper endpoint to get missing API key for auth middleware
function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
    }
    next();
}

// ============================================
// EVENT GROUPS (for combined Arbeitsplan)
// ============================================

// Get all event groups
app.get('/event-groups', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT g.*,
                   COALESCE(json_agg(
                       json_build_object(
                           'id', e.id,
                           'title', e.title,
                           'start_date', e.start_date,
                           'category', e.category
                       ) ORDER BY egm.sort_order
                   ) FILTER (WHERE e.id IS NOT NULL), '[]') as events
            FROM event_groups g
            LEFT JOIN event_group_members egm ON g.id = egm.group_id
            LEFT JOIN events e ON egm.event_id = e.id
            GROUP BY g.id
            ORDER BY g.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single event group with full event data
app.get('/event-groups/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const groupResult = await pool.query('SELECT * FROM event_groups WHERE id = $1', [id]);
        if (groupResult.rows.length === 0) {
            return res.status(404).json({ error: 'Group not found' });
        }

        const group = groupResult.rows[0];

        // Get events with full shift data
        const eventsResult = await pool.query(`
            SELECT e.*, egm.sort_order
            FROM events e
            JOIN event_group_members egm ON e.id = egm.event_id
            WHERE egm.group_id = $1
            ORDER BY egm.sort_order, e.start_date
        `, [id]);

        // Get shifts with registrations for each event
        const eventsWithShifts = await Promise.all(eventsResult.rows.map(async (event) => {
            const shifts = await pool.query(
                'SELECT * FROM shifts WHERE event_id = $1 ORDER BY date, start_time',
                [event.id]
            );

            const shiftsWithRegs = await Promise.all(shifts.rows.map(async (shift) => {
                const regs = await pool.query(`
                    SELECT r.id, r.guest_name, r.status, r.member_id, m.vorname, m.nachname
                    FROM registrations r
                    LEFT JOIN members m ON r.member_id = m.id
                    WHERE $1 = ANY(r.shift_ids)
                `, [shift.id]);

                const approved = regs.rows.filter(r => r.status === 'approved');
                return {
                    ...shift,
                    registrations: {
                        approved: approved.map(r => ({
                            id: r.id,
                            name: r.member_id ? `${r.vorname} ${r.nachname}` : r.guest_name
                        }))
                    }
                };
            }));

            return { ...event, shifts: shiftsWithRegs };
        }));

        res.json({ ...group, events: eventsWithShifts });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create event group
app.post('/event-groups', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { name, description, eventIds } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        const result = await pool.query(`
            INSERT INTO event_groups (name, description, created_by)
            VALUES ($1, $2, $3)
            RETURNING *
        `, [name, description, req.user.email]);

        const group = result.rows[0];

        // Add events to group
        if (eventIds && eventIds.length > 0) {
            for (let i = 0; i < eventIds.length; i++) {
                await pool.query(`
                    INSERT INTO event_group_members (group_id, event_id, sort_order)
                    VALUES ($1, $2, $3)
                    ON CONFLICT DO NOTHING
                `, [group.id, eventIds[i], i]);
            }
        }

        logInfo('Event group created', { groupId: group.id, name, eventCount: eventIds?.length || 0 });
        res.status(201).json(group);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update event group
app.put('/event-groups/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, eventIds } = req.body;

        const result = await pool.query(`
            UPDATE event_groups
            SET name = COALESCE($2, name),
                description = COALESCE($3, description)
            WHERE id = $1
            RETURNING *
        `, [id, name, description]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Group not found' });
        }

        // Update event memberships if provided
        if (eventIds) {
            await pool.query('DELETE FROM event_group_members WHERE group_id = $1', [id]);
            for (let i = 0; i < eventIds.length; i++) {
                await pool.query(`
                    INSERT INTO event_group_members (group_id, event_id, sort_order)
                    VALUES ($1, $2, $3)
                `, [id, eventIds[i], i]);
            }
        }

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete event group
app.delete('/event-groups/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM event_groups WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Generate combined Arbeitsplan PDF for a group
app.post('/event-groups/:id/arbeitsplan-pdf', async (req, res) => {
    try {
        const { id } = req.params;

        // Get group with events
        const groupResult = await pool.query('SELECT * FROM event_groups WHERE id = $1', [id]);
        if (groupResult.rows.length === 0) {
            return res.status(404).json({ error: 'Group not found' });
        }
        const group = groupResult.rows[0];

        // Get events with shifts
        const eventsResult = await pool.query(`
            SELECT e.*
            FROM events e
            JOIN event_group_members egm ON e.id = egm.event_id
            WHERE egm.group_id = $1
            ORDER BY egm.sort_order, e.start_date
        `, [id]);

        const eventsWithShifts = await Promise.all(eventsResult.rows.map(async (event) => {
            const shifts = await pool.query(
                'SELECT * FROM shifts WHERE event_id = $1 ORDER BY date, start_time',
                [event.id]
            );

            const shiftsWithRegs = await Promise.all(shifts.rows.map(async (shift) => {
                const regs = await pool.query(`
                    SELECT r.id, r.guest_name, r.status, r.member_id, m.vorname, m.nachname
                    FROM registrations r
                    LEFT JOIN members m ON r.member_id = m.id
                    WHERE $1 = ANY(r.shift_ids)
                `, [shift.id]);

                const approved = regs.rows.filter(r => r.status === 'approved');
                return {
                    ...shift,
                    registrations: {
                        approved: approved.map(r => ({
                            id: r.id,
                            name: r.member_id ? `${r.vorname} ${r.nachname}` : r.guest_name
                        }))
                    }
                };
            }));

            return { title: event.title, shifts: shiftsWithRegs };
        }));

        // Forward to regular PDF endpoint
        req.body = { events: eventsWithShifts };

        // Create PDF
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Arbeitsplan_${group.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`);
        doc.pipe(res);

        // Title page
        doc.fontSize(22).font('Helvetica-Bold').text('Feuerwehrverein Raura', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(18).text(group.name, { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(14).font('Helvetica').text('Kombinierter Arbeitsplan', { align: 'center' });
        doc.moveDown(2);

        // List of included events
        doc.fontSize(12).font('Helvetica-Bold').text('Enthaltene Events:');
        doc.moveDown(0.3);
        doc.fontSize(11).font('Helvetica');
        eventsWithShifts.forEach((e, i) => {
            doc.text(`  ${i + 1}. ${e.title}`);
        });

        // Individual event pages
        eventsWithShifts.forEach((eventData) => {
            doc.addPage();

            doc.fontSize(16).font('Helvetica-Bold').text('Feuerwehrverein Raura', { align: 'center' });
            doc.fontSize(12).font('Helvetica').text('Arbeitsplan', { align: 'center' });
            doc.moveDown(0.3);
            doc.fontSize(14).font('Helvetica-Bold').text(eventData.title, { align: 'center' });
            doc.moveDown(1);

            const shifts = eventData.shifts || [];
            const allBereiche = [...new Set(shifts.map(s => s.bereich || 'Allgemein'))].sort();

            // Group by date
            const byDate = {};
            shifts.forEach(s => {
                const d = s.date || 'Unbekannt';
                if (!byDate[d]) byDate[d] = [];
                byDate[d].push(s);
            });

            Object.keys(byDate).sort().forEach(date => {
                const dateObj = new Date(date + 'T12:00:00');
                doc.fontSize(11).font('Helvetica-Bold').text(dateObj.toLocaleDateString('de-CH', {
                    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
                }));
                doc.moveDown(0.3);

                // Group by time
                const byTime = {};
                byDate[date].forEach(s => {
                    const tKey = `${s.start_time}-${s.end_time}`;
                    if (!byTime[tKey]) byTime[tKey] = {};
                    const b = s.bereich || 'Allgemein';
                    byTime[tKey][b] = s;
                });

                Object.keys(byTime).sort().forEach(timeKey => {
                    const [start, end] = timeKey.split('-');
                    doc.fontSize(10).font('Helvetica-Bold').text(`  ${start?.substring(0,5) || ''} - ${end?.substring(0,5) || ''}`);

                    allBereiche.forEach(bereich => {
                        const shift = byTime[timeKey][bereich];
                        if (shift) {
                            const helpers = shift.registrations?.approved?.map(r => r.name) || [];
                            const needed = shift.max_helpers || 1;
                            doc.fontSize(9).font('Helvetica')
                                .text(`      ${bereich} [${helpers.length}/${needed}]: ${helpers.length > 0 ? helpers.join(', ') : '(noch offen)'}`);
                        }
                    });
                    doc.moveDown(0.2);
                });
                doc.moveDown(0.5);
            });
        });

        // Footer
        doc.fontSize(8).fillColor('#666666')
            .text(`Erstellt am ${new Date().toLocaleDateString('de-CH')}`, { align: 'center' });

        doc.end();

    } catch (error) {
        logError('Group Arbeitsplan PDF error', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// SHIFT REMINDERS
// ============================================

// Send reminders for shifts happening tomorrow
// This endpoint can be called by a cron job daily
app.post('/reminders/send-daily', async (req, res) => {
    try {
        // Calculate tomorrow's date
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        logInfo('Sending shift reminders for tomorrow', { date: tomorrowStr });

        // Find all shifts happening tomorrow with approved registrations
        const shiftsResult = await pool.query(`
            SELECT
                s.id as shift_id,
                s.name as shift_name,
                s.date as shift_date,
                s.start_time,
                s.end_time,
                s.bereich,
                e.id as event_id,
                e.title as event_title,
                e.location as event_location
            FROM shifts s
            JOIN events e ON s.event_id = e.id
            WHERE s.date = $1
            AND e.status != 'cancelled'
        `, [tomorrowStr]);

        if (shiftsResult.rows.length === 0) {
            return res.json({
                success: true,
                message: 'No shifts tomorrow',
                reminders_sent: 0
            });
        }

        let totalSent = 0;
        let totalSkipped = 0;
        const errors = [];

        for (const shift of shiftsResult.rows) {
            // Get approved registrations for this shift
            const registrationsResult = await pool.query(`
                SELECT
                    r.id as registration_id,
                    r.guest_name,
                    r.guest_email,
                    r.member_id,
                    m.vorname,
                    m.nachname,
                    m.email as member_email
                FROM registrations r
                LEFT JOIN members m ON r.member_id = m.id
                WHERE $1 = ANY(r.shift_ids)
                AND r.status IN ('approved', 'confirmed')
            `, [shift.shift_id]);

            for (const reg of registrationsResult.rows) {
                const email = reg.member_email || reg.guest_email;
                const name = reg.member_id
                    ? `${reg.vorname} ${reg.nachname}`
                    : reg.guest_name;

                if (!email) continue;

                // Check if reminder was already sent
                const existingReminder = await pool.query(`
                    SELECT id FROM shift_reminders
                    WHERE registration_id = $1
                    AND shift_id = $2
                    AND reminder_type = 'day_before'
                `, [reg.registration_id, shift.shift_id]);

                if (existingReminder.rows.length > 0) {
                    totalSkipped++;
                    continue;
                }

                // Format date and time
                const dateObj = new Date(shift.shift_date + 'T12:00:00');
                const dateFormatted = dateObj.toLocaleDateString('de-CH', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric'
                });
                const startTime = shift.start_time?.substring(0, 5) || '';
                const endTime = shift.end_time?.substring(0, 5) || '';

                const subject = `Erinnerung: Morgen ${shift.event_title}`;
                const body = `
Guten Tag ${name},

Dies ist eine freundliche Erinnerung, dass du morgen fuer folgende Schicht eingeteilt bist:

Event: ${shift.event_title}
Datum: ${dateFormatted}
Zeit: ${startTime} - ${endTime}
${shift.bereich ? `Bereich: ${shift.bereich}` : ''}
${shift.event_location ? `Ort: ${shift.event_location}` : ''}

Bitte erscheine puenktlich. Bei Verhinderung melde dich bitte so schnell wie moeglich.

Mit freundlichen Gruessen
Feuerwehrverein Raura
                `.trim();

                try {
                    await axios.post(`${DISPATCH_API}/email/send`, {
                        to: email,
                        subject: subject,
                        body: body,
                        event_id: shift.event_id
                    });

                    // Record that reminder was sent
                    await pool.query(`
                        INSERT INTO shift_reminders (registration_id, shift_id, reminder_type, email)
                        VALUES ($1, $2, 'day_before', $3)
                    `, [reg.registration_id, shift.shift_id, email]);

                    totalSent++;
                    logInfo('Reminder sent', {
                        email,
                        shiftId: shift.shift_id,
                        eventTitle: shift.event_title
                    });
                } catch (err) {
                    logError('Failed to send reminder', {
                        email,
                        error: err.message
                    });
                    errors.push({ email, error: err.message });
                }
            }
        }

        res.json({
            success: true,
            date: tomorrowStr,
            shifts_found: shiftsResult.rows.length,
            reminders_sent: totalSent,
            reminders_skipped: totalSkipped,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        logError('Error sending daily reminders', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Manual endpoint to preview reminders that would be sent (Vorstand only)
app.get('/reminders/preview', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { date } = req.query;
        const targetDate = date || (() => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            return tomorrow.toISOString().split('T')[0];
        })();

        // Find all shifts for the target date with registrations
        const result = await pool.query(`
            SELECT
                s.id as shift_id,
                s.name as shift_name,
                s.date as shift_date,
                s.start_time,
                s.end_time,
                s.bereich,
                e.title as event_title,
                r.id as registration_id,
                r.guest_name,
                r.guest_email,
                r.member_id,
                m.vorname,
                m.nachname,
                m.email as member_email,
                sr.id as reminder_already_sent
            FROM shifts s
            JOIN events e ON s.event_id = e.id
            JOIN registrations r ON s.id = ANY(r.shift_ids)
            LEFT JOIN members m ON r.member_id = m.id
            LEFT JOIN shift_reminders sr ON sr.registration_id = r.id
                AND sr.shift_id = s.id
                AND sr.reminder_type = 'day_before'
            WHERE s.date = $1
            AND e.status != 'cancelled'
            AND r.status IN ('approved', 'confirmed')
            ORDER BY s.start_time, s.bereich
        `, [targetDate]);

        const reminders = result.rows.map(row => ({
            shift: {
                id: row.shift_id,
                name: row.shift_name,
                date: row.shift_date,
                time: `${row.start_time?.substring(0,5) || ''} - ${row.end_time?.substring(0,5) || ''}`,
                bereich: row.bereich
            },
            event: row.event_title,
            person: {
                name: row.member_id ? `${row.vorname} ${row.nachname}` : row.guest_name,
                email: row.member_email || row.guest_email
            },
            already_sent: !!row.reminder_already_sent
        }));

        res.json({
            date: targetDate,
            total: reminders.length,
            pending: reminders.filter(r => !r.already_sent).length,
            already_sent: reminders.filter(r => r.already_sent).length,
            reminders
        });

    } catch (error) {
        logError('Error previewing reminders', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Manual trigger for sending reminders (Vorstand only)
app.post('/reminders/send', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { date } = req.body;

        if (!date) {
            return res.status(400).json({ error: 'Date is required' });
        }

        // Find all shifts for the target date with registrations
        const shiftsResult = await pool.query(`
            SELECT
                s.id as shift_id,
                s.name as shift_name,
                s.date as shift_date,
                s.start_time,
                s.end_time,
                s.bereich,
                e.id as event_id,
                e.title as event_title,
                e.location as event_location
            FROM shifts s
            JOIN events e ON s.event_id = e.id
            WHERE s.date = $1
            AND e.status != 'cancelled'
        `, [date]);

        let totalSent = 0;
        let totalSkipped = 0;
        const errors = [];

        for (const shift of shiftsResult.rows) {
            const registrationsResult = await pool.query(`
                SELECT
                    r.id as registration_id,
                    r.guest_name,
                    r.guest_email,
                    r.member_id,
                    m.vorname,
                    m.nachname,
                    m.email as member_email
                FROM registrations r
                LEFT JOIN members m ON r.member_id = m.id
                WHERE $1 = ANY(r.shift_ids)
                AND r.status IN ('approved', 'confirmed')
            `, [shift.shift_id]);

            for (const reg of registrationsResult.rows) {
                const email = reg.member_email || reg.guest_email;
                const name = reg.member_id
                    ? `${reg.vorname} ${reg.nachname}`
                    : reg.guest_name;

                if (!email) continue;

                // Check if reminder was already sent
                const existingReminder = await pool.query(`
                    SELECT id FROM shift_reminders
                    WHERE registration_id = $1
                    AND shift_id = $2
                    AND reminder_type = 'day_before'
                `, [reg.registration_id, shift.shift_id]);

                if (existingReminder.rows.length > 0) {
                    totalSkipped++;
                    continue;
                }

                const dateObj = new Date(shift.shift_date + 'T12:00:00');
                const dateFormatted = dateObj.toLocaleDateString('de-CH', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric'
                });
                const startTime = shift.start_time?.substring(0, 5) || '';
                const endTime = shift.end_time?.substring(0, 5) || '';

                const subject = `Erinnerung: ${shift.event_title} am ${dateFormatted}`;
                const body = `
Guten Tag ${name},

Dies ist eine freundliche Erinnerung an deine Schicht:

Event: ${shift.event_title}
Datum: ${dateFormatted}
Zeit: ${startTime} - ${endTime}
${shift.bereich ? `Bereich: ${shift.bereich}` : ''}
${shift.event_location ? `Ort: ${shift.event_location}` : ''}

Bitte erscheine puenktlich. Bei Verhinderung melde dich bitte so schnell wie moeglich.

Mit freundlichen Gruessen
Feuerwehrverein Raura
                `.trim();

                try {
                    await axios.post(`${DISPATCH_API}/email/send`, {
                        to: email,
                        subject: subject,
                        body: body,
                        event_id: shift.event_id
                    });

                    await pool.query(`
                        INSERT INTO shift_reminders (registration_id, shift_id, reminder_type, email)
                        VALUES ($1, $2, 'day_before', $3)
                    `, [reg.registration_id, shift.shift_id, email]);

                    totalSent++;
                } catch (err) {
                    errors.push({ email, error: err.message });
                }
            }
        }

        // Audit log
        await pool.query(`
            INSERT INTO audit_log (action, email, ip_address, details)
            VALUES ('REMINDERS_SENT', $1, $2, $3)
        `, [
            req.user?.email || 'system',
            getClientIp(req),
            JSON.stringify({ date, sent: totalSent, skipped: totalSkipped })
        ]);

        res.json({
            success: true,
            date,
            reminders_sent: totalSent,
            reminders_skipped: totalSkipped,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        logError('Error sending manual reminders', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`API-Events running on port ${PORT}`);
});
