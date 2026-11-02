// DEUTSCH: Abhängigkeiten laden - Express-Server, Sicherheit, Datenbank, Kalender, PDF, Auth
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool, types } = require('pg');
const ical = require('ical-generator').default;
const axios = require('axios');
const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { authenticateToken, authenticateAny, requireRole, hatRolle } = require('./auth-middleware');
const arbeitsplan = require('./arbeitsplan');
const arbeitsplanUpdate = require('./arbeitsplan-update');
const { formatDateDE, bereichLesbar, renderArbeitsplanPdf } = arbeitsplan;
const buildArbeitsplan = eventId => arbeitsplan.buildArbeitsplan(pool, eventId);
const registrationDetailsText = (eventId, shiftIds) => arbeitsplan.registrationDetailsText(pool, eventId, shiftIds);
const appAnsicht = require('./app-ansicht');
const { schichtKonflikte, eindeutig, konfliktText, zeitKonflikte, zeitText } = require('./doppelte-schicht');
const organisatorAnsicht = require('./organisator-ansicht');
const { anlassIcs, icsDateiname } = require('./ics');
const { mitAnlassLogo, escapeHtml } = require('./anlass-mail');
const { STANDARD_ORGANISATOR, ohneOrganisator, istStandardOrganisator } = require('./organisator-standard');
const mitorganisatoren = require('./mitorganisatoren');
const { schichtenPruefen } = require('./schicht-eintrag');
const doppelteAnmeldung = require('./doppelte-anmeldung');
const { pushZielDaten, mitZiel } = require('./push-ziel');
const { listenLimit } = require('./liste-limit');
const kasseAnlass = require('./kasse-anlass');

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

/**
 * DEUTSCH: Push-Benachrichtigung ueber api-members verschicken.
 * api-members hat das Firebase-Admin-SDK + die fcm_tokens-Tabelle;
 * wir delegieren via internem HTTP-Call.
 */
async function pushToMember(memberId, notificationType, title, body, data = {}) {
    if (!memberId) return;
    const url = (process.env.MEMBERS_API_URL || 'http://api-members:3000') + '/internal/push-to-member';
    const key = process.env.INTERNAL_API_KEY;
    if (!key) {
        console.warn('INTERNAL_API_KEY not set — skipping push');
        return;
    }
    try {
        // Anlass-Mitteilungen mit eventId: ziel 'anlass' (src/push-ziel.js).
        await axios.post(url, { memberId, notificationType, title, body, data: mitZiel(notificationType, data) },
            { headers: { 'X-Internal-Key': key }, timeout: 5000 });
    } catch (err) {
        console.error('pushToMember failed:', err.message);
    }
}

/**
 * DEUTSCH: Ist der Anlass zur Anmeldung offen? Anmeldepflichtig, kein Vorschlag,
 * Entwurf, abgesagt oder abgeschlossen, Anmeldeschluss und Anlass nicht vorbei.
 */
function anmeldungOffen(e) {
    if (!e || !e.registration_required) return false;
    if (['proposed', 'draft', 'cancelled', 'completed'].includes(e.status)) return false;
    const jetzt = new Date();
    if (e.registration_deadline && new Date(e.registration_deadline) < jetzt) return false;
    const ende = e.end_date || e.start_date;
    if (ende && !e.datum_offen) {
        const heute = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate());
        if (new Date(ende) < heute) return false;
    }
    return true;
}

/**
 * DEUTSCH: Push an alle Mitglieder, dass man sich fuer den Anlass anmelden kann
 * (Kanal 'event_update', Antippen fuehrt zum Anlass). Hoechstens einmal je
 * Anlass: events.anmeldung_gemeldet_at (Migration 031). Fire-and-forget.
 */
async function anmeldungOffenMelden(e, titel) {
    if (!anmeldungOffen(e) || !process.env.INTERNAL_API_KEY) return;
    try {
        const frei = await pool.query(
            'UPDATE events SET anmeldung_gemeldet_at = NOW() WHERE id = $1 AND anmeldung_gemeldet_at IS NULL RETURNING id',
            [e.id]);
        if (frei.rows.length === 0) return;
        const membersUrl = (process.env.MEMBERS_API_URL || 'http://api-members:3000') + '/internal/push-broadcast';
        const dateStr = e.start_date && !e.datum_offen
            ? new Date(e.start_date).toLocaleDateString('de-CH', { day: 'numeric', month: 'long' })
            : '';
        await axios.post(membersUrl, {
            notificationType: 'event_update',
            title: `${titel}: ${e.title}`,
            body: `${dateStr ? dateStr + ' — ' : ''}Jetzt in der App anmelden.`,
            data: mitZiel('event_update', { eventId: e.id })
        }, { headers: { 'X-Internal-Key': process.env.INTERNAL_API_KEY }, timeout: 10000 });
    } catch (err) {
        console.error('Anmeldung-offen-Broadcast fehlgeschlagen:', err.message);
    }
}

async function ensureAnmeldungGemeldetSchema() {
    await pool.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS anmeldung_gemeldet_at TIMESTAMP');
}

/**
 * DEUTSCH: Push an den Vorstand ueber api-members /internal/vorstand-meldung
 * (src/vorstand-melder.js dort: Empfaenger nach Funktion, Abschalter, Sperrfrist
 * und Buendeln je Anlass). Fire-and-forget - die Anmeldung haengt nie daran.
 */
function vorstandMelden(art, angaben, ausloeser = null) {
    const key = process.env.INTERNAL_API_KEY;
    if (!key) return;
    const url = (process.env.MEMBERS_API_URL || 'http://api-members:3000') + '/internal/vorstand-meldung';
    axios.post(url, { art, angaben, ausloeser }, { headers: { 'X-Internal-Key': key }, timeout: 5000 })
        .catch(err => console.error('Vorstand-Push fehlgeschlagen:', err.message));
}

async function memberIdByEmail(email) {
    if (!email) return null;
    const url = (process.env.MEMBERS_API_URL || 'http://api-members:3000') + '/internal/member-id-by-email';
    const key = process.env.INTERNAL_API_KEY;
    if (!key) return null;
    try {
        const resp = await axios.get(url, {
            params: { email },
            headers: { 'X-Internal-Key': key },
            timeout: 5000
        });
        return resp.data.memberId || null;
    } catch (err) {
        console.error('memberIdByEmail failed:', err.message);
        return null;
    }
}

// Dispatch API für E-Mails
const DISPATCH_API = process.env.DISPATCH_API_URL || 'http://api-dispatch:3000';

/**
 * DEUTSCH: Einheitlich Push + E-Mail an einen Anmelder schicken.
 * - Mitglied (member_id gesetzt): Push via api-members + E-Mail an die in members.email gespeicherte Adresse.
 * - Gast (guest_email gesetzt, kein member_id): nur E-Mail an guest_email.
 *
 * action: 'added' | 'approved' | 'rejected' | 'updated' | 'deleted'
 */
/**
 * DEUTSCH: Wenn ein 'approved'-Eintrag entfernt/abgelehnt wurde, pruefen ob das Event
 * vorher voll war. Wenn ja: Mail + Push an alle Mitglieder.
 *  - Vor Anmeldeschluss: "Anmeldung wieder offen"
 *  - Nach Anmeldeschluss: "Platz frei geworden"
 */
// DEUTSCH: Personen einer Anmeldung (aus dem notes-JSON, "participants", mind. 1).
// Eine Anmeldung kann mehrere Personen umfassen — Kapazitaets-Zaehlungen muessen
// PERSONEN summieren, nicht Anmelde-Zeilen.
function registrationPersons(reg) {
    try {
        const n = typeof reg.notes === 'string' ? JSON.parse(reg.notes) : (reg.notes || {});
        const v = parseInt(n?.participants, 10);
        if (Number.isFinite(v) && v > 1) return v;
    } catch (_) { /* alte/nicht-JSON notes zaehlen als 1 Person */ }
    return 1;
}

function sumRegistrationPersons(rows) {
    return rows.reduce((sum, r) => sum + registrationPersons(r), 0);
}

async function notifySlotFreed({ eventId, prevStatus, freedPersons = 1 }) {
    if (prevStatus !== 'approved') return;
    try {
        const ev = await pool.query(
            `SELECT id, title, slug, image_url, max_participants, registration_deadline
             FROM events WHERE id = $1`, [eventId]
        );
        if (ev.rows.length === 0) return;
        const event = ev.rows[0];
        if (!event.max_participants) return; // ohne Kapazitaetslimit kein Broadcast

        // approved-PERSONEN JETZT (nach DELETE/UPDATE) — nicht Zeilen zaehlen
        const cnt = await pool.query(
            `SELECT notes FROM registrations
             WHERE event_id = $1 AND status = 'approved'`, [eventId]
        );
        const approvedNow = sumRegistrationPersons(cnt.rows);
        // Vorher waren es approvedNow + freigewordene Personen — war es da voll?
        const wasFull = (approvedNow + Math.max(1, freedPersons)) >= event.max_participants;
        if (!wasFull) return;
        if (approvedNow >= event.max_participants) return; // immer noch voll

        const deadlinePassed = event.registration_deadline
            && new Date(event.registration_deadline) < new Date();
        const subject = deadlinePassed
            ? `Platz frei geworden: ${event.title}`
            : `Anmeldung wieder offen: ${event.title}`;
        const body = deadlinePassed
            ? `Bei "${event.title}" ist ein Platz frei geworden. Falls du nachtraeglich teilnehmen moechtest, melde dich beim Vorstand.`
            : `Bei "${event.title}" gibt es wieder freie Plaetze. Du kannst dich jetzt wieder anmelden.`;

        // E-Mail an Mitglieder-Alias (alle aktiven Mitglieder mit zustellung_email=true)
        try {
            await axios.post(`${DISPATCH_API}/email/send`, mitAnlassLogo(event, {
                to: 'mitglieder@fwv-raura.ch',
                subject,
                body,
                event_id: eventId,
                sammeln: true
            }));
        } catch (e) { console.error('notifySlotFreed email failed:', e.message); }

        // Push-Broadcast an alle Mitglieder (ueber api-members)
        try {
            const membersUrl = (process.env.MEMBERS_API_URL || 'http://api-members:3000') + '/internal/push-broadcast';
            await axios.post(membersUrl, {
                notificationType: 'event_update',
                title: subject,
                body,
                data: mitZiel('event_update', { eventId })
            }, {
                headers: { 'X-Internal-Key': process.env.INTERNAL_API_KEY },
                timeout: 10000
            });
        } catch (e) { console.error('notifySlotFreed push failed:', e.message); }
    } catch (err) {
        console.error('notifySlotFreed failed:', err.message);
    }
}


async function notifyRegistrationChange({ eventId, eventTitle, memberId, guestName, guestEmail, action, shiftIds }) {
    const titles = {
        added:    `Anmeldung: ${eventTitle}`,
        approved: `Anmeldung bestaetigt: ${eventTitle}`,
        rejected: `Anmeldung abgelehnt: ${eventTitle}`,
        updated:  `Anmeldung aktualisiert: ${eventTitle}`,
        deleted:  `Anmeldung entfernt: ${eventTitle}`
    };
    const bodies = {
        added:    'Du wurdest zu einer Veranstaltung angemeldet.',
        approved: 'Deine Anmeldung wurde bestaetigt.',
        rejected: 'Deine Anmeldung wurde abgelehnt.',
        updated:  'Deine Anmeldung wurde bearbeitet.',
        deleted:  'Deine Anmeldung wurde geloescht.'
    };
    const title = titles[action] || `Anmeldung: ${eventTitle}`;
    const body  = bodies[action] || 'Deine Anmeldung wurde aktualisiert.';

    // Push (nur fuer Mitglieder)
    if (memberId) {
        pushToMember(memberId, 'event_update', title, body, { eventId }).catch(() => {});
    }

    // E-Mail-Empfaenger ermitteln: Member-E-Mail bevorzugt vor guest_email
    let targetEmail = guestEmail || null;
    let targetName  = guestName || '';
    if (memberId) {
        try {
            const m = await pool.query('SELECT vorname, nachname, email FROM members WHERE id = $1', [memberId]);
            if (m.rows[0]) {
                targetEmail = m.rows[0].email || targetEmail;
                targetName = `${m.rows[0].vorname || ''} ${m.rows[0].nachname || ''}`.trim() || targetName;
            }
        } catch (_) {}
    }
    if (!targetEmail) return;

    const greeting = targetName ? `Guten Tag ${targetName}` : 'Guten Tag';
    let details = '';
    try {
        details = await registrationDetailsText(eventId, shiftIds);
    } catch (e) {
        console.error('Anmelde-Details fuer E-Mail nicht ladbar:', e.message);
    }
    const emailBody = `${greeting},\n\n${body}${details ? `\n\n${details}` : ''}\n\nMit freundlichen Gruessen\nFeuerwehrverein Raura`;
    // Fuer das Logo: eigenes Bild des Anlasses nachladen (Titel reicht fuer die Reihe)
    let anlass = { title: eventTitle };
    try {
        const ev = await pool.query('SELECT title, image_url FROM events WHERE id = $1', [eventId]);
        if (ev.rows[0]) anlass = ev.rows[0];
    } catch (_) {}
    try {
        await axios.post(`${DISPATCH_API}/email/send`, mitAnlassLogo(anlass, {
            to: targetEmail,
            subject: title,
            body: emailBody,
            event_id: eventId,
            sammeln: true
        }));
    } catch (e) {
        console.error('notifyRegistrationChange email failed:', e.message);
    }
}

// DEUTSCH: Axios-Interceptor — fügt automatisch den API-Key bei Dispatch-Calls hinzu
axios.interceptors.request.use((config) => {
    if (config.url && config.url.startsWith(DISPATCH_API) && process.env.API_KEY) {
        config.headers = config.headers || {};
        config.headers['x-api-key'] = process.env.API_KEY;
    }
    return config;
});

// ===========================================
// LOGGING UTILITIES
// DEUTSCH: Strukturiertes JSON-Logging für alle Service-Nachrichten
// ===========================================
// DEUTSCH: Generische Log-Funktion mit Zeitstempel, Service-Name und Level
function log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, service: SERVICE_NAME, level, message, ...data };
    console.log(JSON.stringify(logEntry));
}
function logInfo(message, data = {}) { log('INFO', message, data); }
function logWarn(message, data = {}) { log('WARN', message, data); }
function logError(message, data = {}) { log('ERROR', message, data); }

// DEUTSCH: Ermittelt die echte Client-IP (berücksichtigt Cloudflare, Proxy-Header)
function getClientIp(req) {
    if (req.headers['cf-connecting-ip']) return req.headers['cf-connecting-ip'];
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) return forwardedFor.split(',')[0].trim();
    if (req.headers['x-real-ip']) return req.headers['x-real-ip'];
    return req.ip;
}

// ============================================
// HELPER FUNCTIONS
// DEUTSCH: Hilfsfunktionen für Datumsformatierung, Registrierungen und Benachrichtigungen
// ============================================

// Helper: Datum in deutschem Format

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
// DEUTSCH: Sendet E-Mail an alle Registrierten einer Schicht bei Änderung oder Absage
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

        let subject, body, pushText = null;
        const zeit = [shift.start_time, shift.end_time].filter(Boolean).map(t => String(t).substring(0, 5)).join('-');

        if (changeType === 'deleted') {
            subject = `Schicht abgesagt - ${event.title}`;
            pushText = `${shift.name} · ${formatDateDE(shift.date)}${zeit ? ` ${zeit}` : ''}`;
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
            pushText = `${shift.name}: ${changes.join(', ')}`;
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

        // Push an Mitglieder (auch ohne E-Mail-Adresse); Antippen fuehrt zum Anlass.
        if (reg.member_id && pushText) {
            pushToMember(reg.member_id, 'shift_reminder', subject, pushText, { eventId: event.id }).catch(() => {});
        }

        if (!email) continue;

        try {
            await axios.post(`${DISPATCH_API}/email/send`, mitAnlassLogo(event, {
                to: email,
                subject: subject,
                body: body,
                event_id: event.id,
                sammeln: true
            }));
            sent++;
            console.log(`Schicht-Benachrichtigung gesendet an ${email}`);
        } catch (err) {
            console.error(`Benachrichtigung an ${email} fehlgeschlagen:`, err.message);
            errors.push({ email, error: err.message });
        }
    }

    return { sent, errors };
}

// DEUTSCH: Arbeitsplan an alle Eingeteilten (E-Mail mit PDF, Push, Brief bei
// Post-Wunsch). Erstversand (checkAndSendArbeitsplan) und Aktualisierung
// (arbeitsplanUpdateTick) nehmen denselben Weg. Mit [aenderungen] (Zeilen aus
// arbeitsplan-update.js planVergleich) ist es eine Aktualisierung: Betreff
// "geaendert", Aenderungen im Text, Brief nur bei genug Vorlauf, sonst Liste
// an den Organisator ("bitte anrufen").
async function arbeitsplanVerschicken(event, plan, { aenderungen = null } = {}) {
    const eventId = event.id;
    const update = Array.isArray(aenderungen);
    const regsResult = await pool.query(`
        SELECT r.id, r.guest_name, r.guest_email, r.member_id, r.shift_ids,
               m.vorname, m.nachname, m.email as member_email, m.zustellung_email
        FROM registrations r
        LEFT JOIN members m ON r.member_id = m.id
        WHERE r.event_id = $1
        AND r.status IN ('approved', 'confirmed')
    `, [eventId]);
    const pdfBase64 = (await renderArbeitsplanPdf(plan)).toString('base64');

    // Eine Mail pro Person, nicht pro Anmeldung.
    const gesehen = new Set();
    const empfaenger = regsResult.rows.filter(r => {
        const schluessel = r.member_id || (r.guest_email || '').trim().toLowerCase() || (r.guest_name || '').trim().toLowerCase();
        if (!schluessel || gesehen.has(schluessel)) return !schluessel;
        gesehen.add(schluessel);
        return true;
    });

    const liste = update ? aenderungen.map(z => `- ${z}`).join('\n') : '';
    const betreff = update ? `Arbeitsplan geändert - ${event.title}` : `Arbeitsplan - ${event.title}`;
    const einleitung = update
        ? `Der Arbeitsplan für "${event.title}" hat sich geändert:\n\n${liste}\n\nAnbei der aktuelle Arbeitsplan als PDF mit allen Schichten und Helfern. Bitte nur noch diese Fassung verwenden.`
        : `Der Arbeitsplan für "${event.title}" ist fertig.\n\nAnbei finden Sie den Arbeitsplan als PDF mit allen Schichten und Helfern.`;

    let sentCount = 0;
    const errors = [];
    const successEmails = [];
    const postOnlyMembers = [];
    const pingenResults = [];
    const anrufen = [];

    for (const reg of empfaenger) {
        const name = reg.member_id ? `${reg.vorname} ${reg.nachname}` : reg.guest_name;
        if (reg.member_id) {
            pushToMember(reg.member_id, 'event_update', update ? `Arbeitsplan geändert: ${event.title}` : `Arbeitsplan: ${event.title}`,
                update ? 'Der Arbeitsplan hat sich geändert.' : 'Der Arbeitsplan ist fertig.', { eventId: event.id }).catch(() => {});
        }
        if (reg.member_id && reg.zustellung_email === false) {
            postOnlyMembers.push({ name, email: reg.member_email, member_id: reg.member_id });
            continue;
        }
        const email = reg.member_email || reg.guest_email;
        if (!email) {
            errors.push({ name, error: 'Keine E-Mail-Adresse vorhanden' });
            continue;
        }
        try {
            await axios.post(`${DISPATCH_API}/email/send`, mitAnlassLogo(event, {
                to: email,
                subject: betreff,
                body: `Guten Tag ${name},\n\n${einleitung}\n\nBei Fragen kontaktieren Sie uns bitte.\n\nMit freundlichen Grüssen\nFeuerwehrverein Raura`,
                attachments: [{
                    filename: `Arbeitsplan_${event.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
                    content: pdfBase64,
                    contentType: 'application/pdf'
                }]
            }));
            sentCount++;
            successEmails.push({ name, email });
        } catch (err) {
            console.error(`Arbeitsplan an ${email} fehlgeschlagen:`, err.message);
            errors.push({ name, email, error: err.message });
        }
    }

    // Post: beim Erstversand immer, bei Aenderungen nur mit genug Vorlauf
    // (Brief braucht 2-3 Tage) - sonst muss der Organisator anrufen.
    const briefMoeglich = !update || arbeitsplanUpdate.briefNochSinnvoll(event.start_datum);
    for (const postMember of postOnlyMembers) {
        if (!postMember.member_id) continue;
        if (!briefMoeglich) { anrufen.push(postMember.name); continue; }
        try {
            const pingenResponse = await axios.post(`${DISPATCH_API}/pingen/send-arbeitsplan`, {
                event_id: eventId,
                member_id: postMember.member_id,
                pdf_base64: pdfBase64,
                aenderungen: update ? aenderungen : undefined
            });
            if (pingenResponse.data.success) {
                pingenResults.push({ name: postMember.name, letterId: pingenResponse.data.letterId, status: 'sent' });
            }
        } catch (pingenErr) {
            console.error(`Pingen-Versand an ${postMember.name} fehlgeschlagen:`, pingenErr.message);
            pingenResults.push({ name: postMember.name, status: 'failed', error: pingenErr.response?.data?.error || pingenErr.message });
            anrufen.push(postMember.name);
        }
    }

    // Organisator: bei Aenderungen eine Zusammenfassung, mit allen, die nicht
    // rechtzeitig erreicht werden (Post-Wunsch, zu kurz vor dem Anlass).
    if (update) {
        const an = event.organizer_email || process.env.VORSTAND_EMAIL;
        // Mitorganisatoren in Kopie (ohne Doppelte, ohne den Haupt-Empfaenger).
        const kopie = an ? mitorganisatoren.empfaengerListe([], await mitorganisatorenEmails(eventId), [an]) : [];
        if (an) {
            const anrufText = anrufen.length
                ? `\n\nBITTE ANRUFEN - diese Helfer wollen Post, ein Brief kaeme zu spaet:\n${anrufen.map(n => `- ${n}`).join('\n')}`
                : '';
            await axios.post(`${DISPATCH_API}/email/send`, mitAnlassLogo(event, {
                to: an,
                cc: kopie.length ? kopie.join(', ') : undefined,
                subject: `Arbeitsplan geändert und verschickt - ${event.title}`,
                body: `Hallo ${event.organizer_name || ''}\n\nDer Arbeitsplan für "${event.title}" hat sich geändert und ist an alle Eingeteilten verschickt (${sentCount} E-Mails, ${pingenResults.filter(r => r.status === 'sent').length} Briefe):\n\n${liste}${anrufText}\n\nFeuerwehrverein Raura`,
                attachments: [{
                    filename: `Arbeitsplan_${event.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
                    content: pdfBase64,
                    contentType: 'application/pdf'
                }]
            })).catch(err => console.error('Arbeitsplan-Aenderung an Organisator:', err.message));
        }
    }

    return { sentCount, successEmails, errors, postOnlyMembers, pingenResults, anrufen };
}

// DEUTSCH: Taktgeber fuer Aenderungen nach dem Versand (arbeitsplan-update.js):
// vergleicht den aktuellen Plan mit dem verschickten Stand und verschickt
// gebuendelt, wenn sich eine Weile nichts mehr geaendert hat.
async function arbeitsplanUpdateTick() {
    const r = await pool.query(`
        SELECT id, title, image_url, status, organizer_email, organizer_name,
               to_char(start_date, 'YYYY-MM-DD"T"HH24:MI') AS start_datum,
               arbeitsplan_stand_json, arbeitsplan_neu_stand, arbeitsplan_neu_seit
          FROM events
         WHERE arbeitsplan_sent_at IS NOT NULL AND COALESCE(status, '') <> 'cancelled'
           AND COALESCE(end_date, start_date) >= NOW() - INTERVAL '6 hours'`);
    for (const ev of r.rows) {
        try {
            const plan = await buildArbeitsplan(ev.id);
            if (!plan) continue;
            const aktuell = arbeitsplanUpdate.planSchichten(plan);
            const schritt = arbeitsplanUpdate.naechsterSchritt({
                standJson: ev.arbeitsplan_stand_json, neuStand: ev.arbeitsplan_neu_stand,
                neuSeit: ev.arbeitsplan_neu_seit, aktuell, startDatum: ev.start_datum
            });
            if (schritt.art === 'anfangen') {
                await pool.query('UPDATE events SET arbeitsplan_stand_json = $2 WHERE id = $1', [ev.id, JSON.stringify(aktuell)]);
            } else if (schritt.art === 'zuruecksetzen') {
                await pool.query('UPDATE events SET arbeitsplan_neu_stand = NULL, arbeitsplan_neu_seit = NULL WHERE id = $1', [ev.id]);
            } else if (schritt.art === 'merken') {
                await pool.query('UPDATE events SET arbeitsplan_neu_stand = $2, arbeitsplan_neu_seit = NOW() WHERE id = $1', [ev.id, schritt.hash]);
            } else if (schritt.art === 'versenden') {
                const aenderungen = arbeitsplanUpdate.planVergleich(ev.arbeitsplan_stand_json, aktuell);
                // Erst den Stand setzen: scheitert der Versand halb, geht er nicht doppelt raus.
                await pool.query(`UPDATE events SET arbeitsplan_stand_json = $2, arbeitsplan_neu_stand = NULL,
                                  arbeitsplan_neu_seit = NULL WHERE id = $1`, [ev.id, JSON.stringify(aktuell)]);
                const e = await arbeitsplanVerschicken(ev, plan, { aenderungen });
                logInfo('Arbeitsplan-Aenderung verschickt', { event: ev.title, aenderungen: aenderungen.length, mails: e.sentCount, anrufen: e.anrufen.length });
            }
        } catch (err) {
            console.error(`Arbeitsplan-Aenderung ${ev.title}:`, err.message);
        }
    }
}


// Helper: Prüfen ob alle Schichten eines Events besetzt sind und Arbeitsplan versenden
// options.skipDeadlineCheck = true für manuellen Versand
// options.skipFilledCheck = true um auch bei nicht voll besetzten Schichten zu senden
// DEUTSCH: Prüft ob Arbeitsplan-Versand fällig ist (Deadline + alle Schichten besetzt) und versendet per E-Mail
async function checkAndSendArbeitsplan(eventId, options = {}) {
    try {
        // Event-Daten mit Deadline und Versandstatus abrufen
        const eventResult = await pool.query(`
            SELECT id, title, image_url, registration_deadline, arbeitsplan_sent_at, status,
                   to_char(start_date, 'YYYY-MM-DD"T"HH24:MI') AS start_datum, organizer_email, organizer_name
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

        const plan = await buildArbeitsplan(eventId);
        const ergebnis = await arbeitsplanVerschicken(event, plan);

        // Versandstatus und verschickten Stand merken (Vergleich fuer spaetere
        // Aenderungen, arbeitsplan-update.js).
        await pool.query(`
            UPDATE events SET arbeitsplan_sent_at = NOW(), arbeitsplan_stand_json = $2,
                              arbeitsplan_neu_stand = NULL, arbeitsplan_neu_seit = NULL
             WHERE id = $1
        `, [eventId, JSON.stringify(arbeitsplanUpdate.planSchichten(plan))]);

        console.log(`Arbeitsplan für Event "${event.title}" versendet: ${ergebnis.sentCount} E-Mails, ${ergebnis.pingenResults.filter(r => r.status === 'sent').length} Briefe`);
        return { sent: true, ...ergebnis };

    } catch (error) {
        console.error('Fehler beim Arbeitsplan-Versand:', error);
        return { sent: false, reason: error.message };
    }
}

// DEUTSCH: Sicherheits-Header, CORS, JSON-Body-Parser und Proxy-Vertrauen konfigurieren
app.use(helmet());
app.use(cors());
// 30mb: Organisator-Notizen koennen Base64-kodierte Bilder/Dokumente enthalten
// (max 10 MB pro Datei -> ~13 MB Base64; mehrere Anhaenge pro Notiz moeglich).
app.use(express.json({ limit: '30mb' }));
app.set('trust proxy', true);

// ===========================================
// REQUEST LOGGING MIDDLEWARE
// DEUTSCH: Loggt jede Anfrage (ausser /health) mit Request-ID, Methode, Pfad und Dauer
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
// DEUTSCH: Gibt Service-Status und Version zurück (fuer Monitoring/Docker)
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'api-events', version: process.env.APP_VERSION || '0.0.0' });
});

// ============================================
// EVENTS
// DEUTSCH: CRUD-Endpunkte fuer Anlässe/Events inkl. Schichten und Registrierungen
// ============================================

// ---------------------------------------------------------------------------
// Kontaktdaten der Angemeldeten nur fuer den Vorstand
//
// /events und /events/:id sind oeffentlich (Eventseite, Kalender). Sie lieferten
// zu jeder Anmeldung auch E-Mail, Telefon und Bemerkungen mit — jeder konnte
// so die Adressen aller Helfer abrufen (Oktober 2026: 96 E-Mail-Adressen, 56
// Bemerkungen, darin z.B. Allergien). Die oeffentliche Seite zeigt nur Namen
// und Zahlen; die Kontaktdaten braucht nur die Verwaltung, und die schickt
// immer ihr Token mit (vorstand.html, Vorstand-App, Desktop).
// ---------------------------------------------------------------------------
// Token des Organisator-Logins (POST /events/login, HS256 type
// 'event-organizer') — oder null.
function eventOrganisatorToken(req) {
    const token = (req.headers.authorization || '').split(' ')[1];
    if (!token) return null;
    try {
        const d = jwt.verify(token, process.env.JWT_SECRET);
        return d && d.type === 'event-organizer' ? d : null;
    } catch (_) {
        return null;
    }
}

// Angemeldeter Benutzer (req.user) bei oeffentlichen Endpunkten, die mit
// Token mehr liefern — oder null. Ein ungueltiges Token heisst hier nur
// "anonym", die Antwort bleibt oeffentlich.
function optionalerBenutzer(req) {
    if (!req.headers.authorization && !req.headers['x-api-key']) return Promise.resolve(null);
    // Organisator-Token kennt authenticateAny nicht; es wuerde sonst noch
    // gegen Authentik (Netz) geprueft und dort abgelehnt.
    if (eventOrganisatorToken(req)) return Promise.resolve(null);
    return new Promise(resolve => {
        // authenticateAny antwortet bei ungueltigem Token selbst mit 401 — hier
        // soll es nur "anonym" heissen.
        const abgelehnt = {
            status: () => abgelehnt,
            json: () => resolve(null),
            send: () => resolve(null),
            sendStatus: () => resolve(null)
        };
        try {
            authenticateAny(req, abgelehnt, () => resolve(req.user || null));
        } catch (_) {
            resolve(null);
        }
    });
}

const istVorstandBenutzer = user => hatRolle(user, 'vorstand', 'admin');

// Wer fragt an — fuer `app.kann_bearbeiten`: Vorstand darf alles, ein
// Organisator seinen Anlass (gleiche Regel wie GET /events/organized-by-me),
// ein Organisator-Login genau sein Event.
async function anfragender(req) {
    const orgToken = eventOrganisatorToken(req);
    if (orgToken) {
        // Entfernter Mitorganisator: sein Token gilt nicht mehr.
        const gueltig = await organisatorLoginGueltig(orgToken);
        return { vorstand: false, identity: null, organisatorEventId: gueltig ? orgToken.event_id : null };
    }
    const user = await optionalerBenutzer(req);
    if (!user) return { vorstand: false, identity: null, organisatorEventId: null };
    if (istVorstandBenutzer(user)) return { vorstand: true, identity: null, organisatorEventId: null };
    return { vorstand: false, identity: await resolveOrganizerIdentity(req), organisatorEventId: null };
}

function darfBearbeiten(wer, event) {
    if (wer.vorstand) return true;
    if (wer.organisatorEventId && String(wer.organisatorEventId) === String(event.id)) return true;
    return isOrganizerIdentityMatch(wer.identity, event);
}

// Haengt die app-Bloecke (src/app-ansicht.js) an Anlaesse aus GET /events
// bzw. /events/:id. Belegte Personen nur bei Teilnehmer-Limit abfragen (wie
// die Kapazitaetspruefung in POST /registrations/public).
async function mitAppAnsicht(events, wer) {
    const zeit = appAnsicht.jetzt();
    return Promise.all(events.map(async event => {
        let belegtePersonen = 0;
        if (event.max_participants) {
            const r = await pool.query(
                `SELECT notes FROM registrations WHERE event_id = $1 AND status IN ('approved', 'pending')`,
                [event.id]);
            belegtePersonen = sumRegistrationPersons(r.rows);
        }
        return appAnsicht.anlassAnsicht(event, { belegtePersonen, kannBearbeiten: darfBearbeiten(wer, event), zeit });
    }));
}

// Felder der Anlass-Zeile, die nie oeffentlich sein duerfen: Zugang zum
// Organisator-Login (der Hash ist ungesalzenes SHA-256 — offline knackbar)
// und der PDF-Anhang (gross; hat einen eigenen Download /events/:id/pdf).
const INTERNE_ANLASS_FELDER = ['event_email', 'event_password_hash', 'event_password_encrypted', 'pdf_attachment'];

function ohneKontaktdaten(event) {
    const nurName = ({ id, name }) => ({ id, name });
    const regs = r => r && {
        ...r,
        approved: (r.approved || []).map(nurName),
        pending: (r.pending || []).map(nurName)
    };
    const oeffentlich = { ...event };
    for (const feld of INTERNE_ANLASS_FELDER) delete oeffentlich[feld];
    return {
        ...oeffentlich,
        shifts: (event.shifts || []).map(shift => ({ ...shift, registrations: regs(shift.registrations) })),
        directRegistrations: regs(event.directRegistrations)
    };
}

// DEUTSCH: meal_options ist JSONB. node-pg macht aus einem JS-Array ein
// Postgres-Array ('{"a","b"}') — das ist kein JSON, das UPDATE scheiterte
// mit "invalid input syntax for type json". Darum als JSON-Text schicken.
function jsonbWert(feld, wert) {
    if (feld === 'meal_options' && wert !== null && wert !== undefined && typeof wert !== 'string') {
        return JSON.stringify(wert);
    }
    return wert;
}

// ---------------------------------------------------------------------------
// TWINT-QR pro Anlass und "aktueller Anlass" fuer die Kasse
// (src/kasse-anlass.js; Tabelle event_twint_qr, Spalte events.twint_qr_url)
//
//  - GET    /events/:id/twint-qr          Bild (oeffentlich wie /events/:id/pdf -
//                                         der QR haengt ohnehin am Stand)
//  - PUT    /events/:id/twint-qr          { data, content_type } Vorstand/Organisator
//  - DELETE /events/:id/twint-qr          Vorstand/Organisator
//  - PUT/DELETE /events/my-event/twint-qr externer Organisator (Event-Login)
//  - GET    /events/kasse/aktuell         Kasse (Service-Schluessel)
//  - GET    /events/kasse/anlaesse        Kasse: laufende und kommende
//  - GET    /events/kasse/anlaesse/:id    Kasse: ein bestimmter Anlass
// Stehen vor GET /events/:id, damit "kasse" nie als Anlass-id gilt.
// ---------------------------------------------------------------------------
async function ensureArbeitsplanUpdateSchema() {
    await pool.query(`ALTER TABLE events
        ADD COLUMN IF NOT EXISTS arbeitsplan_stand_json JSONB,
        ADD COLUMN IF NOT EXISTS arbeitsplan_neu_stand TEXT,
        ADD COLUMN IF NOT EXISTS arbeitsplan_neu_seit TIMESTAMP`);
}

async function ensureKasseAnlassSchema() {
    for (const sql of kasseAnlass.SCHEMA_SQL) await pool.query(sql);
}

// Service-Schluessel der Kasse: X-Order-API-Key (derselbe geteilte Schluessel,
// mit dem die Kasse schon das Inventar aufruft und api-members die Kasse)
// oder der allgemeine interne x-api-key. Kein Benutzer-Token: die Kasse
// fragt ohne angemeldete Person nach.
function gleicherSchluessel(a, b) {
    if (!a || !b) return false;
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function kasseSchluessel(req, res, next) {
    // Live heisst derselbe Wert in api-events INVENTORY_KEY (siehe unten).
    const kassenKey = process.env.ORDER_API_KEY || process.env.INVENTORY_KEY;
    if (gleicherSchluessel(req.headers['x-order-api-key'], kassenKey)
        || gleicherSchluessel(req.headers['x-api-key'], process.env.API_KEY)) {
        return next();
    }
    return res.status(401).json({ error: 'Kein gueltiger Kassen-Schluessel' });
}

// UUID_MUSTER steht weiter unten (bei den Anmeldungen); die Routen hier
// laufen erst nach dem Laden der Datei.

// Kandidaten fuer die Kasse. Grob in SQL eingegrenzt (Ende bzw. Beginn
// hoechstens einen Tag vorbei), die genaue Regel steht in kasse-anlass.js.
async function kassenKandidaten(zeitpunkt) {
    const r = await pool.query(`
        SELECT e.id, e.slug, e.title, e.start_date, e.end_date, e.location, e.status, e.datum_offen, e.twint_qr_url,
               ${kasseAnlass.SCHICHTEN_SQL}
          FROM events e
         WHERE COALESCE(status, '') NOT IN ('cancelled', 'draft', 'proposed', 'rejected')
           AND datum_offen IS NOT TRUE
           AND COALESCE(end_date, start_date) >= $1::timestamp - INTERVAL '1 day'
         ORDER BY start_date, id`, [zeitpunkt]);
    return r.rows;
}

app.get('/events/kasse/aktuell', kasseSchluessel, async (req, res) => {
    try {
        const zeitpunkt = appAnsicht.zuerich(appAnsicht.jetzt()).zeitpunkt;
        const anlass = kasseAnlass.aktuellerAnlass(await kassenKandidaten(zeitpunkt), zeitpunkt);
        res.json({ anlass: kasseAnlass.kassenAnsicht(anlass), zeitpunkt });
    } catch (error) {
        console.error('GET /events/kasse/aktuell:', error.message);
        res.status(500).json({ error: 'Aktueller Anlass konnte nicht bestimmt werden' });
    }
});

app.get('/events/kasse/anlaesse', kasseSchluessel, async (req, res) => {
    try {
        const zeitpunkt = appAnsicht.zuerich(appAnsicht.jetzt()).zeitpunkt;
        const liste = kasseAnlass.kommendeAnlaesse(await kassenKandidaten(zeitpunkt), zeitpunkt);
        res.json({ anlaesse: liste.map(kasseAnlass.kassenAnsicht) });
    } catch (error) {
        console.error('GET /events/kasse/anlaesse:', error.message);
        res.status(500).json({ error: 'Anlaesse konnten nicht geladen werden' });
    }
});

app.get('/events/kasse/anlaesse/:id', kasseSchluessel, async (req, res) => {
    if (!UUID_MUSTER.test(req.params.id)) return res.status(404).json({ error: 'Anlass nicht gefunden' });
    try {
        const r = await pool.query(
            `SELECT e.id, e.slug, e.title, e.start_date, e.end_date, e.location, e.status, e.datum_offen, e.twint_qr_url,
                    ${kasseAnlass.SCHICHTEN_SQL}
               FROM events e WHERE e.id = $1`, [req.params.id]);
        if (!r.rows.length) return res.status(404).json({ error: 'Anlass nicht gefunden' });
        res.json({ anlass: kasseAnlass.kassenAnsicht(r.rows[0]) });
    } catch (error) {
        console.error('GET /events/kasse/anlaesse/:id:', error.message);
        res.status(500).json({ error: 'Anlass konnte nicht geladen werden' });
    }
});

app.get('/events/:id/twint-qr', async (req, res) => {
    if (!UUID_MUSTER.test(req.params.id)) return res.status(404).json({ error: 'Kein TWINT-QR vorhanden' });
    try {
        const r = await pool.query('SELECT content_type, data FROM event_twint_qr WHERE event_id = $1', [req.params.id]);
        if (!r.rows.length) return res.status(404).json({ error: 'Kein TWINT-QR vorhanden' });
        res.setHeader('Content-Type', r.rows[0].content_type);
        // Die Adresse traegt ?v=<Zeit> - ein neues Bild hat eine neue Adresse.
        res.setHeader('Cache-Control', 'public, max-age=300');
        // helmet setzt same-origin; vorstand.html (www) und die Apps binden
        // das Bild aber von hier ein.
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.send(Buffer.from(r.rows[0].data, 'base64'));
    } catch (error) {
        console.error('GET /events/:id/twint-qr:', error.message);
        res.status(500).json({ error: 'TWINT-QR konnte nicht geladen werden' });
    }
});

// Speichern/Entfernen - gemeinsam fuer Vorstand/Organisator (Mitglieder-
// bzw. Authentik-Token) und den externen Organisator-Login (my-event).
async function twintQrSpeichern(eventId, req, res, von) {
    try {
        const bild = kasseAnlass.bildPruefen(req.body);
        if (bild.fehler) return res.status(bild.status).json({ error: bild.fehler });
        const url = kasseAnlass.qrPfad(eventId);
        const wer = String(von || 'unbekannt').substring(0, 200);
        await pool.query(`
            INSERT INTO event_twint_qr (event_id, content_type, data, groesse, hochgeladen_von, hochgeladen_am)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (event_id) DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data,
                groesse = EXCLUDED.groesse, hochgeladen_von = EXCLUDED.hochgeladen_von, hochgeladen_am = NOW()`,
        [eventId, bild.contentType, bild.buffer.toString('base64'), bild.buffer.length, wer]);
        await pool.query('UPDATE events SET twint_qr_url = $1, updated_at = NOW() WHERE id = $2', [url, eventId]);
        logInfo('TWINT_QR_HOCHGELADEN', { eventId, von: wer, bytes: bild.buffer.length });
        res.json({ twint_qr_url: url, content_type: bild.contentType, groesse: bild.buffer.length });
    } catch (error) {
        console.error('TWINT-QR speichern:', error.message);
        res.status(500).json({ error: 'TWINT-QR konnte nicht gespeichert werden' });
    }
}

async function twintQrEntfernen(eventId, res, von) {
    try {
        await pool.query('DELETE FROM event_twint_qr WHERE event_id = $1', [eventId]);
        await pool.query('UPDATE events SET twint_qr_url = NULL, updated_at = NOW() WHERE id = $1', [eventId]);
        logInfo('TWINT_QR_ENTFERNT', { eventId, von });
        res.json({ twint_qr_url: null });
    } catch (error) {
        console.error('TWINT-QR entfernen:', error.message);
        res.status(500).json({ error: 'TWINT-QR konnte nicht entfernt werden' });
    }
}

// Externer Organisator (Event-Login, Token type 'event-organizer'): sein
// Anlass. Steht vor /events/:id/twint-qr, sonst gaelte "my-event" als id.
app.put('/events/my-event/twint-qr', authenticateEventOrganizer, (req, res) =>
    twintQrSpeichern(req.eventOrganizer.event_id, req, res, req.eventOrganizer.email));
app.delete('/events/my-event/twint-qr', authenticateEventOrganizer, (req, res) =>
    twintQrEntfernen(req.eventOrganizer.event_id, res, req.eventOrganizer.email));

// Vorstand oder Organisator/Mitorganisator des Anlasses (ensureOrganizerAccess).
app.put('/events/:id/twint-qr', authenticateAny, async (req, res) => {
    if (!UUID_MUSTER.test(req.params.id)) return res.status(404).json({ error: 'Event nicht gefunden' });
    try {
        const event = await ensureOrganizerAccess(req, res, req.params.id);
        if (!event) return; // 403/404 bereits gesendet
        await twintQrSpeichern(event.id, req, res, req.user?.email || req.user?.name);
    } catch (error) {
        console.error('PUT /events/:id/twint-qr:', error.message);
        res.status(500).json({ error: 'TWINT-QR konnte nicht gespeichert werden' });
    }
});

app.delete('/events/:id/twint-qr', authenticateAny, async (req, res) => {
    if (!UUID_MUSTER.test(req.params.id)) return res.status(404).json({ error: 'Event nicht gefunden' });
    try {
        const event = await ensureOrganizerAccess(req, res, req.params.id);
        if (!event) return;
        await twintQrEntfernen(event.id, res, req.user?.email || req.user?.name);
    } catch (error) {
        console.error('DELETE /events/:id/twint-qr:', error.message);
        res.status(500).json({ error: 'TWINT-QR konnte nicht entfernt werden' });
    }
});

// DEUTSCH: Alle Events auflisten, optional gefiltert nach upcoming/category, inkl. Schichten und Registrierungen
app.get('/events', async (req, res) => {
    try {
        const { upcoming, category, aktuell } = req.query;
        const limit = listenLimit(req.query.limit);
        let query = `
            SELECT e.*,
                   m.vorname as organizer_vorname,
                   m.nachname as organizer_nachname,
                   m.email as organizer_member_email
            FROM events e
            LEFT JOIN members m ON e.organizer_id = m.id
            WHERE 1=1
              AND (e.status IS NULL OR e.status NOT IN ('proposed', 'rejected'))
        `;
        const params = [];

        if (upcoming === 'true') {
            // Laufende Anlaesse (Chilbi ueber mehrere Tage) zaehlen mit.
            query += ' AND COALESCE(e.end_date, e.start_date) >= NOW()';
        }
        if (category) {
            params.push(category);
            query += ` AND e.category = $${params.length}`;
        }
        // Fuer die Mitglieder-App: nicht abgesagt und noch nicht vorbei
        // (Ende bzw. Beginn ist heute oder spaeter, Ortszeit Zuerich).
        // Anlaesse mit "Datum noch offen" gehoeren dazu, egal welcher
        // Platzhalter im Datum steht — und kommen ans Ende.
        if (aktuell === 'true') {
            params.push(appAnsicht.zuerich(appAnsicht.jetzt()).datum);
            query += ` AND COALESCE(e.status, '') <> 'cancelled'`
                + ` AND (e.datum_offen IS TRUE OR COALESCE(e.end_date, e.start_date)::date >= $${params.length}::date)`;
            query += ` ORDER BY (e.datum_offen IS TRUE), CASE WHEN e.datum_offen IS TRUE THEN e.title END, e.start_date, e.id`;
        } else if (upcoming === 'true') {
            // Startseite "Kommende Termine": naechste zuerst; "Datum noch
            // offen" (Platzhalter-Datum) ans Ende, sonst verdraengen die
            // Platzhalter mit ?limit=3 die echten Termine.
            query += ' ORDER BY (e.datum_offen IS TRUE), e.start_date, e.id';
        } else {
            query += ' ORDER BY e.start_date, e.id';
        }
        // Limit erst nach der Sortierung (die naechsten N), parametrisiert.
        if (limit !== null) {
            params.push(limit);
            query += ` LIMIT $${params.length}`;
        }
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
                    SELECT r.id, r.guest_name, r.guest_email, r.phone, r.notes, r.status, r.member_id, m.vorname, m.nachname, m.email AS member_email
                    FROM registrations r
                    LEFT JOIN members m ON r.member_id = m.id
                    WHERE $1 = ANY(r.shift_ids)
                `, [shift.id]);

                const approved = registrations.rows.filter(r => r.status === 'approved');
                const pending = registrations.rows.filter(r => r.status === 'pending');
                // Schicht-Anmeldungen liefern jetzt auch E-Mail/Telefon/Notizen mit
                // (fuer Anzeige, Alternativ-Vorschlag-Prefill und PDF).
                const mapReg = r => ({
                    id: r.id,
                    name: r.member_id ? `${r.vorname} ${r.nachname}` : r.guest_name,
                    email: r.member_email || r.guest_email || null,
                    phone: r.phone || null,
                    notes: r.notes || null
                });

                return {
                    ...shift,
                    registrations: {
                        approved: approved.map(mapReg),
                        pending: pending.map(mapReg),
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

        const wer = await anfragender(req);
        const mitApp = await mitAppAnsicht(events, wer);
        res.json(wer.vorstand ? mitApp : mitApp.map(ohneKontaktdaten));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: PDF-Anhang eines Events herunterladen
app.get('/events/:id/pdf', async (req, res) => {
    try {
        const { id } = req.params;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        let result;
        if (uuidRegex.test(id)) {
            result = await pool.query('SELECT pdf_attachment, pdf_filename FROM events WHERE id = $1', [id]);
        } else {
            result = await pool.query('SELECT pdf_attachment, pdf_filename FROM events WHERE slug = $1', [id]);
        }
        if (result.rows.length === 0 || !result.rows[0].pdf_attachment) {
            return res.status(404).json({ error: 'Kein PDF vorhanden' });
        }
        const buffer = Buffer.from(result.rows[0].pdf_attachment, 'base64');
        const filename = result.rows[0].pdf_filename || 'anhang.pdf';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// DEUTSCH: Proxy zur Inventar-API — Rezepte & Einkaufsliste eines Events.
// Zugriff nur fuer Vorstand/Admin oder den Organisator des Events. Die
// Inventar-API selbst ist per internem Key geschuetzt (x-order-api-key),
// deshalb laeuft der Zugriff des Frontends ueber diesen Proxy.
// ============================================================
const INVENTORY_URL = process.env.INVENTORY_URL || 'https://inventar.fwv-raura.ch';
const INVENTORY_KEY = process.env.INVENTORY_KEY || process.env.ORDER_API_KEY || '';

async function requireEventRecipeAccess(req, res, next) {
    try {
        const isPrivileged = hatRolle(req.user, 'vorstand', 'admin');
        const ev = await pool.query(
            'SELECT id, slug, organizer_email, organizer_id FROM events WHERE slug = $1 OR id::text = $1 LIMIT 1',
            [req.params.id]
        );
        if (ev.rows.length === 0) return res.status(404).json({ error: 'Event nicht gefunden' });
        req.eventSlug = ev.rows[0].slug;
        let isOrganizer = false;
        if (!isPrivileged) {
            const identity = await resolveOrganizerIdentity(req);
            isOrganizer = isOrganizerIdentityMatch(identity, ev.rows[0]);
        }
        if (isPrivileged || isOrganizer) return next();
        return res.status(403).json({ error: 'Nur Vorstand oder Organisator' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// DEUTSCH: Die Inventar-API vertraut dieser Kopfzeile nur zusammen mit dem
// internen Key — so stehen bei "gekauft von", Belegen und Lager-Buchungen die
// handelnde Person statt nichts.
function inventarKopf(req, extra = {}) {
    const email = req.user?.email;
    return {
        'x-order-api-key': INVENTORY_KEY,
        ...(typeof email === 'string' && email ? { 'x-fwv-user-email': email } : {}),
        ...extra
    };
}

async function proxyInventory(req, res, path) {
    try {
        const r = await axios.get(`${INVENTORY_URL}/api/events/${encodeURIComponent(req.eventSlug)}/${path}`, {
            headers: inventarKopf(req),
            timeout: 8000
        });
        res.json(r.data);
    } catch (error) {
        console.error(`Inventar-Proxy (${path}) fehlgeschlagen:`, error.message);
        res.status(502).json({ error: 'Inventar-API nicht erreichbar' });
    }
}

// DEUTSCH: Generischer Inventar-Proxy fuer Schreib-Operationen (POST/PUT/DELETE)
// auf event-bezogene Ressourcen. Leitet Body + Status/Fehler durch.
async function proxyInventoryReq(req, res, method, subpath) {
    try {
        const url = `${INVENTORY_URL}/api/events/${encodeURIComponent(req.eventSlug)}/${subpath}`;
        const r = await axios({
            method,
            url,
            headers: inventarKopf(req, { 'Content-Type': 'application/json' }),
            data: (method === 'get' || method === 'delete') ? undefined : (req.body || {}),
            timeout: 8000
        });
        res.status(r.status).json(r.data);
    } catch (error) {
        const st = error.response?.status || 502;
        res.status(st).json(error.response?.data || { error: 'Inventar-API nicht erreichbar' });
    }
}

// DEUTSCH: Proxy fuer die NICHT event-bezogenen Listen (Rezepte/Materialien zum
// Anwaehlen). Zugriff wieder nur Vorstand/Organisator (requireEventRecipeAccess).
async function proxyInventoryList(req, res, listPath) {
    try {
        const r = await axios.get(`${INVENTORY_URL}/api/${listPath}`, {
            headers: { 'x-order-api-key': INVENTORY_KEY },
            timeout: 8000
        });
        res.json(r.data);
    } catch (error) {
        console.error(`Inventar-Listen-Proxy (${listPath}) fehlgeschlagen:`, error.message);
        res.status(502).json({ error: 'Inventar-API nicht erreichbar' });
    }
}

app.get('/events/:id/recipes', authenticateAny, requireEventRecipeAccess, (req, res) => proxyInventory(req, res, 'recipes'));
app.get('/events/:id/shopping-list', authenticateAny, requireEventRecipeAccess, (req, res) => proxyInventory(req, res, 'shopping-list'));

// DEUTSCH: Bearbeiten des Event-Rezept-/Materialmoduls (Vorstand/Organisator).
app.post('/events/:id/recipes', authenticateAny, requireEventRecipeAccess, (req, res) => proxyInventoryReq(req, res, 'post', 'recipes'));
app.put('/events/:id/recipes/:recipeId', authenticateAny, requireEventRecipeAccess, (req, res) => proxyInventoryReq(req, res, 'put', `recipes/${encodeURIComponent(req.params.recipeId)}`));
app.delete('/events/:id/recipes/:recipeId', authenticateAny, requireEventRecipeAccess, (req, res) => proxyInventoryReq(req, res, 'delete', `recipes/${encodeURIComponent(req.params.recipeId)}`));
app.post('/events/:id/manual-items', authenticateAny, requireEventRecipeAccess, (req, res) => proxyInventoryReq(req, res, 'post', 'manual-items'));
app.delete('/events/:id/manual-items/:itemId', authenticateAny, requireEventRecipeAccess, (req, res) => proxyInventoryReq(req, res, 'delete', `manual-items/${encodeURIComponent(req.params.itemId)}`));
// Listen zum Anwaehlen (Rezepte + Materialien aus dem Lager).
app.get('/events/:id/available-recipes', authenticateAny, requireEventRecipeAccess, (req, res) => proxyInventoryList(req, res, 'recipes'));
app.get('/events/:id/available-items', authenticateAny, requireEventRecipeAccess, (req, res) => proxyInventoryList(req, res, 'items'));

// DEUTSCH: Einkauf (Organisator-Bereich der Mitglieder-App, frueher die
// Einkaufs-PWA): Positionen abhaken, Belege (Kassenzettel-Fotos) und das
// Gekaufte ins Lager zurueckbuchen. Zugriff wie oben: Vorstand/Admin oder
// Organisator des Anlasses.
app.patch('/events/:id/shopping-list/:itemId', authenticateAny, requireEventRecipeAccess, (req, res) => proxyInventoryReq(req, res, 'patch', `shopping-list/${encodeURIComponent(req.params.itemId)}`));
app.post('/events/:id/shopping-list/restock', authenticateAny, requireEventRecipeAccess, (req, res) => proxyInventoryReq(req, res, 'post', 'shopping-list/restock'));
app.get('/events/:id/receipts', authenticateAny, requireEventRecipeAccess, (req, res) => proxyInventory(req, res, 'receipts'));
app.delete('/events/:id/receipts/:receiptId', authenticateAny, requireEventRecipeAccess, (req, res) => proxyInventoryReq(req, res, 'delete', `receipts/${encodeURIComponent(req.params.receiptId)}`));

// Beleg hochladen: multipart/form-data (Feld "image", optional amount, note,
// paid_by) wird unveraendert an die Inventar-API weitergestreamt — die prueft
// Typ (Bild) und Groesse (10 MB) selbst.
const BELEG_MAX_BYTES = 10 * 1024 * 1024 + 64 * 1024; // Foto + Formular-Rahmen
app.post('/events/:id/receipts', authenticateAny, requireEventRecipeAccess, async (req, res) => {
    const typ = req.headers['content-type'] || '';
    if (!typ.toLowerCase().startsWith('multipart/form-data')) {
        return res.status(400).json({ error: 'Beleg-Foto bitte als multipart/form-data im Feld "image" senden.' });
    }
    const laenge = Number(req.headers['content-length']);
    if (Number.isFinite(laenge) && laenge > BELEG_MAX_BYTES) {
        return res.status(413).json({ error: 'Das Foto ist zu gross (höchstens 10 MB).' });
    }
    try {
        const r = await axios.post(
            `${INVENTORY_URL}/api/events/${encodeURIComponent(req.eventSlug)}/receipts`,
            req,
            {
                headers: inventarKopf(req, {
                    'Content-Type': typ,
                    ...(Number.isFinite(laenge) ? { 'Content-Length': String(laenge) } : {})
                }),
                maxBodyLength: BELEG_MAX_BYTES,
                maxContentLength: 1024 * 1024,
                timeout: 30000
            }
        );
        res.status(r.status).json(r.data);
    } catch (error) {
        const st = error.response?.status || 502;
        res.status(st).json(error.response?.data || { error: 'Inventar-API nicht erreichbar' });
    }
});

// Belegbild: die Inventar-API legt es unter /api/uploads/ ab. Die App laedt
// es hierueber (mit Anmeldung), statt die Inventar-Adresse zu kennen. Nur
// Pfade unter /api/uploads/ werden geholt.
app.get('/events/:id/receipts/:receiptId/image', authenticateAny, requireEventRecipeAccess, async (req, res) => {
    try {
        const liste = await axios.get(`${INVENTORY_URL}/api/events/${encodeURIComponent(req.eventSlug)}/receipts`, {
            headers: inventarKopf(req),
            timeout: 8000
        });
        const beleg = (Array.isArray(liste.data) ? liste.data : []).find(b => String(b.id) === String(req.params.receiptId));
        const pfad = beleg && typeof beleg.image_url === 'string' ? beleg.image_url : '';
        if (!/^\/api\/uploads\/[A-Za-z0-9._-]+$/.test(pfad)) {
            return res.status(404).json({ error: 'Beleg nicht gefunden' });
        }
        const bild = await axios.get(`${INVENTORY_URL}${pfad}`, { responseType: 'arraybuffer', timeout: 15000 });
        res.setHeader('Content-Type', bild.headers['content-type'] || 'image/jpeg');
        res.setHeader('Content-Disposition', `inline; filename="beleg-${String(beleg.id).replace(/[^0-9]/g, '')}${(pfad.match(/\.[A-Za-z0-9]+$/) || ['.jpg'])[0]}"`);
        res.send(Buffer.from(bild.data));
    } catch (error) {
        const st = error.response?.status === 404 ? 404 : 502;
        res.status(st).json({ error: st === 404 ? 'Beleg nicht gefunden' : 'Inventar-API nicht erreichbar' });
    }
});

// DEUTSCH: Einzelnes Event abrufen (per UUID oder Slug), inkl. Schichten und Registrierungen
// ============================================================
// DEUTSCH: Event-Vorschlaege. Mitglieder koennen Events VORSCHLAGEN (nicht
// direkt anlegen). Ein Vorschlag ist ein Event mit status='proposed'. Der
// Vorstand genehmigt es (Status -> planned, Organisator waehlbar) oder lehnt ab.
// ============================================================

// Mitglied schlaegt ein Event vor (jede*r eingeloggte User).
app.post('/events/propose', authenticateAny, async (req, res) => {
    try {
        const { title, subtitle, description, start_date, end_date, location, category, cost } = req.body || {};
        if (!title || !String(title).trim()) return res.status(400).json({ error: 'title ist ein Pflichtfeld' });
        if (!start_date) return res.status(400).json({ error: 'start_date ist ein Pflichtfeld' });

        // Vorschlagenden als DEFAULT-Organisator hinterlegen — bei der Genehmigung
        // im Bearbeiten-Formular waehlbar (Vorstand kann jemand anderen setzen).
        // organizer_email = Login-Mail (fuer den E-Mail-Match), organizer_id =
        // passende Mitglieds-ID falls vorhanden.
        const proposerEmail = req.user?.email || null;
        const proposerName = req.user?.name || null;
        let proposerMemberId = null;
        if (proposerEmail) {
            const m = await pool.query('SELECT id FROM members WHERE LOWER(email) = LOWER($1) LIMIT 1', [proposerEmail]);
            proposerMemberId = m.rows[0]?.id || null;
        }

        const base = String(title).toLowerCase()
            .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 80) || 'vorschlag';
        const slug = `${base}-${crypto.randomBytes(3).toString('hex')}`;

        const result = await pool.query(`
            INSERT INTO events (
                slug, title, subtitle, description, start_date, end_date, location, category,
                cost, status, organizer_name, organizer_email, organizer_id, registration_required
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'proposed',$10,$11,$12,false)
            RETURNING *
        `, [
            slug, title, subtitle || null, description || null, start_date, end_date || null,
            location || null, category || null, cost || null,
            proposerName, proposerEmail, proposerMemberId
        ]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('POST /events/propose error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Vorstand/Admin: alle offenen Event-Vorschlaege (status='proposed').
app.get('/events/proposals', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT e.*, m.vorname AS organizer_vorname, m.nachname AS organizer_nachname,
                   m.email AS organizer_member_email
            FROM events e
            LEFT JOIN members m ON e.organizer_id = m.id
            WHERE e.status = 'proposed'
            ORDER BY e.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/events/:id', async (req, res, next) => {
    // Reservierte IDs sind eigene Routen — weiterleiten, damit Express
    // den spezifischeren Handler findet (sonst 404 weil dies hier matcht).
    if (['my-event', 'login', 'organized-by-me', 'organisator-uebersicht', 'proposals'].includes(req.params.id)) return next();
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
                SELECT r.id, r.guest_name, r.guest_email, r.phone, r.notes, r.status, r.member_id, m.vorname, m.nachname, m.email AS member_email
                FROM registrations r
                LEFT JOIN members m ON r.member_id = m.id
                WHERE $1 = ANY(r.shift_ids)
            `, [shift.id]);

            const approved = registrations.rows.filter(r => r.status === 'approved');
            const pending = registrations.rows.filter(r => r.status === 'pending');
            // Schicht-Anmeldungen liefern jetzt auch E-Mail/Telefon/Notizen mit.
            const mapReg = r => ({
                id: r.id,
                name: r.member_id ? `${r.vorname} ${r.nachname}` : r.guest_name,
                email: r.member_email || r.guest_email || null,
                phone: r.phone || null,
                notes: r.notes || null
            });

            return {
                ...shift,
                registrations: {
                    approved: approved.map(mapReg),
                    pending: pending.map(mapReg),
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

        const antwort = {
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
        };
        const wer = await anfragender(req);
        const [mitApp] = await mitAppAnsicht([antwort], wer);
        res.json(wer.vorstand ? mitApp : ohneKontaktdaten(mitApp));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Neues Event erstellen (nur Vorstand/Admin). Generiert optional Event-Zugang fuer Organisatoren
app.post('/events', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        let {
            slug, title, subtitle, description, start_date, end_date,
            location, category, registration_required,
            registration_deadline, max_participants, cost, status, image_url, tags,
            organizer_name, organizer_email, organizer_id, create_access,
            meal_options, pdf_attachment, pdf_filename,
            // DEUTSCH: Termin steht noch nicht fest. start_date bleibt trotzdem
            // gesetzt — als grobe Einordnung fuer Sortierung und Kalender —,
            // wird aber nirgends als Datum angezeigt.
            datum_offen
        } = req.body;

        // Ohne Organisator organisiert der Vorstand (organisator-standard.js).
        const vorstandOrganisiert = ohneOrganisator({ organizer_id, organizer_name, organizer_email });
        if (vorstandOrganisiert) ({ organizer_name, organizer_email } = STANDARD_ORGANISATOR);

        // Pflichtfelder pruefen, sonst 400 statt undurchschaubarem 500
        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'title ist ein Pflichtfeld' });
        }
        if (!start_date) {
            return res.status(400).json({ error: 'start_date ist ein Pflichtfeld' });
        }

        // Slug automatisch aus Titel generieren falls keiner mitgeliefert (z.B. von der App).
        // Zusatz "-<6Hex>" verhindert Kollisionen mit bestehenden Events.
        if (!slug) {
            const base = title
                .toLowerCase()
                .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
                .normalize('NFD').replace(/[̀-ͯ]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .substring(0, 80) || 'event';
            slug = `${base}-${crypto.randomBytes(3).toString('hex')}`;
        }

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

        // Kein Token-Zugang, wenn der Organisator ein verknuepftes Mitglied ist
        // (organizer_id gesetzt) — das Mitglied verwaltet das Event einfach in der
        // Mitglieder-App (E-Mail-Match). Der Token-Portal-Pfad bleibt nur fuer
        // externe Nicht-Mitglieder (Freitext-Organisator ohne organizer_id).
        if (create_access && organizer_email && !isVorstandMember && !organizer_id) {
            // Event-spezifische E-Mail generieren
            eventEmail = `${slug}@fwv-raura.ch`;
            // Zufallspasswort, das niemand kennt (scrypt mit Salz): der
            // Organisator legt sein Passwort ueber den Link in der Mail selbst
            // fest (passwortLinkSenden).
            eventPassword = mitorganisatoren.neuesPasswort();
            eventPasswordHash = mitorganisatoren.passwortHashen(eventPassword);
            // Ablaufdatum: 3 Monate nach Event-Ende
            const endDateObj = end_date ? new Date(end_date) : new Date(start_date);
            eventAccessExpires = new Date(endDateObj);
            eventAccessExpires.setMonth(eventAccessExpires.getMonth() + 3);
        }

        // Kein verschluesselt abgelegtes Passwort mehr - es kennt nur der Organisator.
        const eventPasswordEncrypted = null;

        const result = await pool.query(`
            INSERT INTO events (
                slug, title, subtitle, description, start_date, end_date,
                location, category, registration_required,
                registration_deadline, max_participants, cost, status, image_url, tags,
                organizer_name, organizer_email, event_email, event_password_hash, event_password_encrypted, event_access_expires,
                meal_options, pdf_attachment, pdf_filename, organizer_id, datum_offen
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
            RETURNING *
        `, [
            slug, title, subtitle, description, start_date, end_date,
            location, category, registration_required,
            registration_deadline, max_participants, cost, status || 'planned', image_url, tags,
            organizer_name || null, organizer_email || null, eventEmail, eventPasswordHash, eventPasswordEncrypted, eventAccessExpires,
            meal_options ? JSON.stringify(meal_options) : null,
            pdf_attachment || null, pdf_filename || null, organizer_id || null,
            // DEUTSCH: Termin steht noch nicht fest. start_date bleibt gesetzt (grobe
            // Einordnung fuer die Sortierung), wird aber nirgends angezeigt.
            datum_offen === true
        ]);

        const newEvent = result.rows[0];

        // Neuer Anlass MIT Anmeldung: alle Mitglieder per App-Push informieren
        // (Kanal 'event_update'). Bewusst nur Anmelde-Anlaesse und keine Vorschlaege
        // ('proposed'), damit nicht jede Sitzung einen Push ausloest.
        anmeldungOffenMelden(newEvent, 'Neuer Anlass');

        // Organisator benachrichtigen (immer wenn organizer_email gesetzt)
        if (organizer_email && !create_access && !vorstandOrganisiert) {
            try {
                const eventUrl = `https://fwv-raura.ch/events.html?event=${newEvent.slug || newEvent.id}`;
                // Verknuepftes Mitglied → auf die Mitglieder-App verweisen (vorstand.html
                // waere fuer Nicht-Vorstand gesperrt); sonst auf das Vorstand-Dashboard.
                const manageHint = organizer_id
                    ? `Du kannst das Event direkt in der Mitglieder-App unter "Organisieren" verwalten — Anmeldungen einsehen und genehmigen, Schichten und Details bearbeiten, Teilnehmerliste als PDF.`
                    : `Du kannst die Anmeldungen im Vorstand-Dashboard verwalten:\nhttps://fwv-raura.ch/vorstand.html`;
                await axios.post(`${DISPATCH_API}/email/send`, mitAnlassLogo(newEvent, {
                    to: organizer_email,
                    subject: `Du bist Organisator/in: ${title}`,
                    body: `Hallo ${organizer_name || 'Organisator/in'},\n\nDu wurdest als Organisator/in fuer das Event "${title}" eingetragen.\n\nDatum: ${start_date ? new Date(start_date).toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'wird noch mitgeteilt'}\nOrt: ${newEvent.location || 'wird noch mitgeteilt'}\n\n${manageHint}\n\nEventseite:\n${eventUrl}\n\nBei Fragen wende dich an den Aktuar.\n\nFreundliche Gruesse\nFeuerwehrverein Raura`,
                    event_id: newEvent.id
                }));
                console.log(`Organisator-Benachrichtigung gesendet an ${organizer_email}`);
            } catch (emailErr) {
                console.error('Organisator-Benachrichtigung fehlgeschlagen:', emailErr.message);
            }
        }

        // E-Mail mit Login und Link "Passwort festlegen" (create_access Modus)
        if (create_access && organizer_email && eventPassword) {
            try {
                await passwortLinkSenden({
                    eventId: newEvent.id, organizerId: null, an: organizer_email, name: organizer_name,
                    titel: title, loginEmail: eventEmail, gueltigBis: eventAccessExpires
                });
                console.log(`Event-Zugang (Link) gesendet an ${organizer_email}`);
            } catch (emailErr) {
                console.error('Fehler beim Senden der Zugangsdaten:', emailErr.message);
            }
        }

        res.status(201).json(newEvent);
    } catch (error) {
        logError('POST /events failed', { error: error.message, code: error.code, detail: error.detail, body_keys: Object.keys(req.body || {}) });
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Event aktualisieren (nur Vorstand/Admin). Kann auch Event-Zugang nachträglich erstellen
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
            'event_email', 'event_password_hash', 'event_access_expires',
            'meal_options', 'pdf_attachment', 'pdf_filename',
            // DEUTSCH: Termin steht noch nicht fest. start_date bleibt trotzdem
            // gesetzt — als grobe Einordnung fuer die Sortierung —, wird aber
            // nirgends angezeigt. Vorher landeten solche Anlaesse alle auf dem
            // 31.12. und standen im Kalender als Silvester-Auflauf.
            'datum_offen'
        ];

        const filteredUpdates = {};
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                filteredUpdates[key] = jsonbWert(key, value);
            }
        }

        const fields = Object.keys(filteredUpdates);
        const values = Object.values(filteredUpdates);

        if (fields.length === 0) {
            return res.status(400).json({ error: 'Keine gueltigen Felder zum Aktualisieren' });
        }

        const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
        values.push(id);

        // Vorherigen Organisator laden (um Änderung zu erkennen)
        const oldEvent = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
        const oldOrgEmail = oldEvent.rows[0]?.organizer_email;
        const oldStatus = oldEvent.rows[0]?.status;

        const result = await pool.query(`
            UPDATE events SET ${setClause}, updated_at = NOW()
            WHERE id = $${values.length}
            RETURNING *
        `, values);

        let updatedEvent = result.rows[0];
        // Organisator entfernt? Dann organisiert wieder der Vorstand.
        if (updatedEvent && ohneOrganisator(updatedEvent)) {
            const standard = await pool.query(
                'UPDATE events SET organizer_name = $1, organizer_email = $2 WHERE id = $3 RETURNING *',
                [STANDARD_ORGANISATOR.organizer_name, STANDARD_ORGANISATOR.organizer_email, id]);
            updatedEvent = standard.rows[0] || updatedEvent;
        }

        // Vorschlag genehmigt (proposed -> planned): den vorschlagenden Organisator
        // (organizer_id = Mitglied) per App-Push informieren, dass sein Event-
        // Vorschlag angenommen wurde und er nun organisieren kann.
        if (oldStatus === 'proposed' && updatedEvent.status === 'planned' && updatedEvent.organizer_id) {
            pushToMember(
                updatedEvent.organizer_id, 'event_update',
                `Vorschlag genehmigt: ${updatedEvent.title}`,
                'Dein Event-Vorschlag wurde vom Vorstand genehmigt — du bist als Organisator eingetragen.',
                { eventId: id }
            ).catch(() => {});
        }

        // Erst jetzt zur Anmeldung offen (Vorschlag genehmigt, Anmeldung
        // eingeschaltet, Anmeldeschluss verlaengert): alle Mitglieder informieren.
        if (updatedEvent && !anmeldungOffen(oldEvent.rows[0])) {
            anmeldungOffenMelden(updatedEvent, 'Anmeldung offen');
        }

        // Organisator benachrichtigen wenn neu zugewiesen
        const newOrgEmail = updatedEvent.organizer_email;
        // Verknuepftes Mitglied (organizer_id gesetzt) → kein Token-Zugang noetig,
        // es verwaltet das Event in der Mitglieder-App (E-Mail-Match).
        const isLinkedMember = !!updatedEvent.organizer_id;
        // M2: Zugang auch erstellen, wenn "Organisator-Zugang einrichten" angehakt ist
        // und noch keiner existiert — vorher wirkte create_access im Edit nur bei
        // einem Organisator-E-Mail-Wechsel.
        // Die Vorgabe "Vorstand" bekommt keine "Du bist Organisator"-Mail.
        if (newOrgEmail && !istStandardOrganisator(updatedEvent) &&
            (newOrgEmail !== oldOrgEmail || (create_access && !updatedEvent.event_email))) {
            // Pruefen ob Vorstandsmitglied (braucht keine separaten Zugangsdaten)
            const vorstandEmails = [
                'praesident@fwv-raura.ch', 'aktuar@fwv-raura.ch', 'kassier@fwv-raura.ch',
                'materialwart@fwv-raura.ch', 'beisitzer@fwv-raura.ch', 'vorstand@fwv-raura.ch'
            ];
            const isVorstand = vorstandEmails.some(ve => newOrgEmail.toLowerCase() === ve.toLowerCase());

            // Fuer Nicht-Vorstand UND Nicht-verknuepftes-Mitglied: Event-Zugang
            // anlegen, falls es noch keinen gibt, und einen Link "Passwort
            // festlegen" schicken - kein Passwort mehr in der Mail.
            // Verknuepfte Mitglieder brauchen keinen Zugang - sie nutzen die App.
            let passwortLink = null;
            if (!isVorstand && !isLinkedMember) {
                if (!updatedEvent.event_email || !updatedEvent.event_password_hash) {
                    const eventEmail = updatedEvent.event_email || `${updatedEvent.slug}@fwv-raura.ch`;
                    const endDate = updatedEvent.end_date ? new Date(updatedEvent.end_date) : new Date(updatedEvent.start_date);
                    const accessExpires = new Date(endDate);
                    accessExpires.setMonth(accessExpires.getMonth() + 3);
                    await pool.query(
                        'UPDATE events SET event_email = $1, event_password_hash = $2, event_password_encrypted = NULL, event_access_expires = $3 WHERE id = $4',
                        [eventEmail, mitorganisatoren.passwortHashen(mitorganisatoren.neuesPasswort()), accessExpires, id]
                    );
                    updatedEvent.event_email = eventEmail;
                    updatedEvent.event_access_expires = accessExpires;
                    console.log(`Event-Zugang erstellt: ${eventEmail}`);
                }
                passwortLink = await passwortLinkErstellen(id, null);
            }

            try {
                const eventUrl = `https://fwv-raura.ch/events.html?event=${updatedEvent.slug || updatedEvent.id}`;
                let emailBody;

                if (isVorstand) {
                    emailBody = `Hallo ${updatedEvent.organizer_name || 'Organisator/in'},\n\nDu wurdest als Organisator/in fuer das Event "${updatedEvent.title}" eingetragen.\n\nDatum: ${updatedEvent.start_date ? new Date(updatedEvent.start_date).toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'wird noch mitgeteilt'}\nOrt: ${updatedEvent.location || 'wird noch mitgeteilt'}\n\nDu kannst die Anmeldungen im Vorstand-Dashboard verwalten:\nhttps://fwv-raura.ch/vorstand.html\n\nEventseite:\n${eventUrl}\n\nBei Fragen wende dich an den Aktuar.\n\nFreundliche Gruesse\nFeuerwehrverein Raura`;
                } else if (isLinkedMember) {
                    // Verknuepftes Mitglied: verwaltet das Event in der Mitglieder-App,
                    // keine Token-Zugangsdaten (vorstand.html waere fuer Nicht-Vorstand gesperrt).
                    emailBody = `Hallo ${updatedEvent.organizer_name || 'Organisator/in'},\n\nDu wurdest als Organisator/in fuer das Event "${updatedEvent.title}" eingetragen.\n\nDatum: ${updatedEvent.start_date ? new Date(updatedEvent.start_date).toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'wird noch mitgeteilt'}\nOrt: ${updatedEvent.location || 'wird noch mitgeteilt'}\n\nDu kannst das Event direkt in der Mitglieder-App unter "Organisieren" verwalten — Anmeldungen einsehen und genehmigen, Schichten und Details bearbeiten, Teilnehmerliste als PDF.\n\nEventseite:\n${eventUrl}\n\nBei Fragen wende dich an den Aktuar.\n\nFreundliche Gruesse\nFeuerwehrverein Raura`;
                } else {
                    const dashboardUrl = 'https://fwv-raura.ch/event-dashboard.html';
                    emailBody = `Hallo ${updatedEvent.organizer_name || 'Organisator/in'},\n\nDu wurdest als Organisator/in fuer das Event "${updatedEvent.title}" eingetragen.\n\nDatum: ${updatedEvent.start_date ? new Date(updatedEvent.start_date).toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'wird noch mitgeteilt'}\nOrt: ${updatedEvent.location || 'wird noch mitgeteilt'}`;

                    if (passwortLink) {
                        emailBody += `\n\nDein Login fuer das Event-Dashboard (${dashboardUrl}):\nE-Mail: ${updatedEvent.event_email}\n\nBitte lege dein Passwort selbst fest - der Link gilt ${mitorganisatoren.LINK_TAGE} Tage:\n${passwortLink}\n\nAbgelaufen? Im Event-Dashboard unter "Passwort vergessen?" bekommst du einen neuen Link.\n\nDieser Zugang ist gueltig bis ${new Date(updatedEvent.event_access_expires || Date.now()).toLocaleDateString('de-CH')}.`;
                    }

                    emailBody += `\n\nIm Dashboard kannst du:\n- Alle Anmeldungen einsehen\n- Anmeldungen genehmigen oder ablehnen\n- Den Ueberblick ueber die Teilnehmerzahl behalten\n\nDu wirst automatisch per E-Mail benachrichtigt, wenn sich jemand anmeldet.`;
                    emailBody += `\n\nEventseite:\n${eventUrl}\n\nBei Fragen wende dich an den Aktuar (aktuar@fwv-raura.ch).\n\nFreundliche Gruesse\nFeuerwehrverein Raura`;
                }

                await axios.post(`${DISPATCH_API}/email/send`, mitAnlassLogo(updatedEvent, {
                    to: newOrgEmail,
                    subject: `Du bist Organisator/in: ${updatedEvent.title}`,
                    body: emailBody,
                    event_id: updatedEvent.id
                }));
                console.log(`Organisator-Benachrichtigung gesendet an ${newOrgEmail} fuer Event "${updatedEvent.title}" (${isVorstand ? 'Vorstand' : 'mit Zugangsdaten'})`);
            } catch (emailErr) {
                console.error('Organisator-Benachrichtigung fehlgeschlagen:', emailErr.message);
            }
        }

        res.json(updatedEvent);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Event löschen (nur Vorstand/Admin). Löscht auch zugehörige Schichten/Registrierungen (CASCADE)
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
// DEUTSCH: Separates Login-System für externe Event-Organisatoren (nicht Vorstand)
// ============================================

// DEUTSCH: Login fuer Event-Organisatoren mit event-spezifischer E-Mail und Passwort, gibt JWT zurück
// --- Passwort selbst festlegen (externe Organisatoren) ----------------------
// Statt eines Passworts im Klartext bekommt der Organisator einen Link, mit
// dem er sein Passwort selbst festlegt (event-dashboard.html?passwort=...).

/** Neuer Link fuer den Haupt-Organisator (organizerId null) oder einen
 * externen Mitorganisator; gibt die Adresse zurueck. */
async function passwortLinkErstellen(eventId, organizerId) {
    const { token, hash } = mitorganisatoren.linkToken();
    await pool.query(
        `INSERT INTO organisator_passwort_links (token_hash, event_id, organizer_id, gueltig_bis)
         VALUES ($1, $2, $3, NOW() + make_interval(days => $4))`,
        [hash, eventId, organizerId, mitorganisatoren.LINK_TAGE]);
    return mitorganisatoren.linkAdresse(token);
}

async function passwortLinkSenden({ eventId, organizerId, an, name, titel, loginEmail, gueltigBis, rolle }) {
    const link = await passwortLinkErstellen(eventId, organizerId);
    await axios.post(`${DISPATCH_API}/email/send`, {
        to: an,
        ...mitorganisatoren.passwortLinkMail({ name, titel, loginEmail, link, gueltigBis, rolle }),
        event_id: eventId
    });
}

// Link einloesen: Passwort festlegen. Oeffentlich, der Token ist der Ausweis.
app.post('/events/passwort-setzen', async (req, res) => {
    try {
        const { token, passwort } = req.body || {};
        if (typeof token !== 'string' || token.length < 20) {
            return res.status(400).json({ error: 'Ungueltiger Link' });
        }
        if (!mitorganisatoren.passwortGenuegt(passwort)) {
            return res.status(400).json({ error: 'Das Passwort braucht mindestens 10 Zeichen' });
        }
        const r = await pool.query(
            `UPDATE organisator_passwort_links SET benutzt_at = NOW()
              WHERE token_hash = $1 AND benutzt_at IS NULL AND gueltig_bis > NOW()
              RETURNING event_id, organizer_id`,
            [mitorganisatoren.tokenHash(token)]);
        if (r.rows.length === 0) {
            return res.status(400).json({ error: 'Der Link ist abgelaufen oder wurde schon benutzt. Unter "Passwort vergessen?" bekommen Sie einen neuen.' });
        }
        const { event_id, organizer_id } = r.rows[0];
        const hash = mitorganisatoren.passwortHashen(passwort);
        let login;
        if (organizer_id) {
            login = (await pool.query(
                'UPDATE event_organizers SET password_hash = $1 WHERE id = $2 RETURNING email', [hash, organizer_id])).rows[0]?.email;
        } else {
            login = (await pool.query(
                'UPDATE events SET event_password_hash = $1, event_password_encrypted = NULL WHERE id = $2 RETURNING event_email',
                [hash, event_id])).rows[0]?.event_email;
        }
        if (!login) return res.status(400).json({ error: 'Der Zugang existiert nicht mehr' });
        // Andere offene Links fuer denselben Zugang verfallen.
        await pool.query(
            `UPDATE organisator_passwort_links SET benutzt_at = NOW()
              WHERE event_id = $1 AND organizer_id IS NOT DISTINCT FROM $2 AND benutzt_at IS NULL`,
            [event_id, organizer_id]);
        res.json({ success: true, email: login });
    } catch (error) {
        console.error('POST /events/passwort-setzen:', error.message);
        res.status(500).json({ error: 'Passwort nicht gespeichert' });
    }
});

// "Passwort vergessen?": neuer Link an die hinterlegte Adresse. Antwortet
// immer gleich, damit sich nicht pruefen laesst, welche Logins es gibt.
const passwortLinkVersuche = new Map(); // IP -> Zeitpunkte der letzten Stunde
app.post('/events/passwort-vergessen', async (req, res) => {
    const antwort = { success: true, message: 'Falls es diesen Zugang gibt, ist ein Link unterwegs.' };
    try {
        const ip = getClientIp(req) || 'unbekannt';
        const jetzt = Date.now();
        const versuche = (passwortLinkVersuche.get(ip) || []).filter(t => jetzt - t < 3600e3);
        if (versuche.length >= 5) return res.status(429).json({ error: 'Zu viele Versuche - bitte spaeter nochmals' });
        versuche.push(jetzt);
        passwortLinkVersuche.set(ip, versuche);

        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!mitorganisatoren.emailGueltig(email)) return res.json(antwort);
        // Haupt-Organisator: Login ist die Anlass-Adresse, der Link geht an
        // die hinterlegte Adresse des Organisators.
        const haupt = await pool.query(
            `SELECT id, title, organizer_name, organizer_email, event_email, event_access_expires FROM events
              WHERE LOWER(event_email) = $1 AND organizer_email IS NOT NULL
                AND (event_access_expires IS NULL OR event_access_expires > NOW())`, [email]);
        for (const e of haupt.rows) {
            await passwortLinkSenden({ eventId: e.id, organizerId: null, an: e.organizer_email, name: e.organizer_name,
                titel: e.title, loginEmail: e.event_email, gueltigBis: e.event_access_expires || new Date() });
        }
        const mit = await pool.query(
            `SELECT o.id, o.name, o.email, o.access_expires, e.id AS event_id, e.title FROM event_organizers o
               JOIN events e ON e.id = o.event_id
              WHERE o.member_id IS NULL AND LOWER(o.email) = $1
                AND (o.access_expires IS NULL OR o.access_expires > NOW())`, [email]);
        for (const o of mit.rows) {
            await passwortLinkSenden({ eventId: o.event_id, organizerId: o.id, an: o.email, name: o.name,
                titel: o.title, loginEmail: o.email, gueltigBis: o.access_expires || new Date(), rolle: 'Mitorganisator' });
        }
        res.json(antwort);
    } catch (error) {
        console.error('POST /events/passwort-vergessen:', error.message);
        res.json(antwort);
    }
});

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

        // Externe Mitorganisatoren haben einen eigenen Login (eigene E-Mail,
        // eigenes Passwort, src/mitorganisatoren.js). Nur wenn der Login des
        // Haupt-Organisators nicht passt — dessen Pruefung bleibt unveraendert.
        const hauptPasswortOk = result.rows.length > 0 &&
            mitorganisatoren.hauptPasswortPruefen(password, result.rows[0].event_password_hash);
        if (!hauptPasswortOk) {
            const mit = await mitorganisatorLogin(email, password);
            if (mit) return res.status(mit.status).json(mit.json);
        }

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Ungueltige Zugangsdaten' });
        }

        const event = result.rows[0];

        // Pruefen ob Zugang abgelaufen
        if (event.event_access_expires && new Date(event.event_access_expires) < new Date()) {
            return res.status(401).json({ error: 'Der Zugang ist abgelaufen. Bitte kontaktieren Sie den Vorstand.' });
        }

        // Nach dem Anlass (oder wenn er abgesagt ist) gilt der Zugang nicht
        // mehr — erst nach der Passwort-Pruefung melden, damit die Antwort
        // nicht verraet, ob es die Adresse gibt.
        const passwortOk = mitorganisatoren.hauptPasswortPruefen(password, event.event_password_hash);
        const gesperrt = passwortOk ? organisatorAnsicht.organisatorLoginGesperrt(event) : null;
        if (gesperrt) {
            return res.status(403).json({ error: gesperrt, code: 'anlass_vorbei' });
        }

        // Passwort pruefen
        if (!passwortOk) {
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

// DEUTSCH: Login eines externen Mitorganisators (Tabelle event_organizers) —
// { status, json } oder null, wenn kein Eintrag mit diesem Passwort passt.
// Dieselbe E-Mail kann bei mehreren Anlaessen Mitorganisator sein; jeder
// Eintrag hat sein eigenes Passwort, das passende bestimmt den Anlass.
async function mitorganisatorLogin(email, password) {
    let kandidaten;
    try {
        kandidaten = (await pool.query(
            `SELECT o.id, o.name, o.email, o.password_hash, o.access_expires,
                    e.id AS event_id, e.title, e.slug, e.status, e.start_date, e.end_date, e.datum_offen
               FROM event_organizers o
               JOIN events e ON e.id = o.event_id
              WHERE o.member_id IS NULL AND o.password_hash IS NOT NULL
                AND LOWER(o.email) = LOWER($1)
              ORDER BY e.start_date DESC`,
            [String(email).trim()])).rows;
    } catch (e) {
        console.error('Mitorganisator-Login:', e.message);
        return null;
    }
    const passend = kandidaten.filter(k => mitorganisatoren.passwortPruefen(String(password), k.password_hash));
    if (passend.length === 0) return null;
    const abgelaufen = k => k.access_expires && new Date(k.access_expires) < new Date();
    const k = passend.find(x => !abgelaufen(x) && !organisatorAnsicht.organisatorLoginGesperrt(x)) || passend[0];
    if (abgelaufen(k)) {
        return { status: 401, json: { error: 'Der Zugang ist abgelaufen. Bitte kontaktieren Sie den Vorstand.' } };
    }
    const gesperrt = organisatorAnsicht.organisatorLoginGesperrt(k);
    if (gesperrt) return { status: 403, json: { error: gesperrt, code: 'anlass_vorbei' } };

    const token = jwt.sign({
        type: 'event-organizer',
        event_id: k.event_id,
        event_title: k.title,
        event_email: k.email,
        organizer_name: k.name,
        // Eintrag in event_organizers: wird er entfernt, gilt das Token nicht mehr
        organisator_id: k.id
    }, process.env.JWT_SECRET, { expiresIn: '24h' });
    return {
        status: 200,
        json: {
            success: true,
            token,
            event: { id: k.event_id, title: k.title, slug: k.slug, organizer_name: k.name }
        }
    };
}

// DEUTSCH: Gilt ein Organisator-Login-Token noch? Das des Haupt-Organisators
// immer (wie bisher); das eines Mitorganisators nur, solange sein Eintrag
// besteht und nicht abgelaufen ist (Entfernen widerruft den Zugang sofort).
async function organisatorLoginGueltig(decoded) {
    if (!decoded || !decoded.organisator_id) return true;
    try {
        const r = await pool.query(
            `SELECT 1 FROM event_organizers
              WHERE id = $1 AND event_id = $2
                AND (access_expires IS NULL OR access_expires > NOW())`,
            [decoded.organisator_id, decoded.event_id]);
        return r.rows.length > 0;
    } catch (e) {
        console.error('organisatorLoginGueltig:', e.message);
        return false;
    }
}

// DEUTSCH: Event-Daten fuer eingeloggten Organisator abrufen (nur sein eigenes Event, inkl. Schichten und Registrierungen)
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

        // Login-Daten des Haupt-Organisators gehen niemanden etwas an — auch
        // nicht die Mitorganisatoren, die dieselbe Route nutzen.
        const zeile = { ...event };
        for (const f of INTERNE_ANLASS_FELDER) delete zeile[f];
        res.json({
            ...zeile,
            // Wer angemeldet ist (Haupt- oder Mitorganisator) — fuers Dashboard
            angemeldet_als: req.eventOrganizer.organizer_name || event.organizer_name || null,
            shifts: shifts.rows,
            registrations: registrations.rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Registrierung genehmigen (Organisator). Sendet Bestätigungs-E-Mail und prüft Arbeitsplan-Versand
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

        const event = await pool.query('SELECT title FROM events WHERE id = $1', [eventId]);
        notifyRegistrationChange({
            eventId, eventTitle: event.rows[0]?.title || 'Event',
            memberId: reg.member_id, guestName: reg.guest_name, guestEmail: reg.guest_email,
            shiftIds: reg.shift_ids,
            action: 'approved'
        }).catch(() => {});

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

// DEUTSCH: Registrierung ablehnen (Organisator). Sendet Ablehnungs-E-Mail mit optionalem Grund
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

        const event = await pool.query('SELECT title FROM events WHERE id = $1', [eventId]);
        notifyRegistrationChange({
            eventId, eventTitle: event.rows[0]?.title || 'Event',
            memberId: reg.member_id, guestName: reg.guest_name, guestEmail: reg.guest_email,
            shiftIds: reg.shift_ids,
            action: 'rejected'
        }).catch(() => {});

        res.json({ success: true, registration: reg });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Arbeitsplan manuell versenden (Organisator). Überspringt Deadline- und Besetzungs-Prüfung
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

// DEUTSCH: Mitgliederliste fuer Event-Organisatoren (nur Name, E-Mail, Telefon)
app.get('/events/my-event/members', authenticateEventOrganizer, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, vorname, nachname, email, mobile, telefon
            FROM members
            WHERE status = 'Aktivmitglied'
            ORDER BY nachname, vorname
        `);
        res.json(result.rows.map(m => ({
            id: m.id,
            name: `${m.vorname} ${m.nachname}`.trim(),
            vorname: m.vorname,
            nachname: m.nachname,
            email: m.email,
            telefon: m.mobile || m.telefon || ''
        })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Teilnehmer manuell hinzufuegen (Event-Organisator). Optional
// shift_ids: die Person gleich in Schichten eintragen (src/schicht-eintrag.js).
app.post('/events/my-event/registrations', authenticateEventOrganizer, async (req, res) => {
    try {
        const eventId = req.eventOrganizer.event_id;
        const { member_id, guest_name, guest_email, guest_phone, participants, notes } = req.body;

        if (!member_id && !guest_name) {
            return res.status(400).json({ error: 'Mitglied oder Gastname erforderlich' });
        }

        const name = guest_name || '';
        const email = guest_email || '';

        const schichten = await schichtenPruefen(pool, {
            eventId, shiftIds: req.body.shift_ids, memberId: member_id || null, email
        });
        if (schichten.fehler) return res.status(schichten.fehler.status).json(schichten.fehler.body);

        // Teilnehmer ohne Schicht: dieselbe Person nicht zweimal
        // (src/doppelte-anmeldung.js). Von Hand eingetragen ist ein Doppel
        // eher ein Versehen - darum 409 mit Text statt still 200.
        const teilnahme = doppelteAnmeldung.istTeilnahme(schichten.shiftIds);
        const eintrag = await doppelteAnmeldung.mitAnmeldeSperre(pool, eventId, async (db) => {
            if (teilnahme) {
                const bestehend = await doppelteAnmeldung.bestehendeTeilnahme(db, {
                    eventId, memberId: member_id || null, email, name
                });
                if (bestehend) return { bestehend };
            }
            const r = await db.query(`
                INSERT INTO registrations (event_id, member_id, guest_name, guest_email, shift_ids, notes, status)
                VALUES ($1, $2, $3, $4, $5, $6, 'approved')
                RETURNING *
            `, [
                eventId,
                member_id || null,
                name,
                email,
                schichten.shiftIds ?? null,
                JSON.stringify({ phone: guest_phone, participants: participants || 1, notes })
            ]);
            return { reg: r.rows[0] };
        });
        if (eintrag.bestehend) {
            return res.status(409).json({
                error: doppelteAnmeldung.hinweisVorstand(eintrag.bestehend),
                code: 'bereits_angemeldet',
                registration: eintrag.bestehend
            });
        }

        const reg = eintrag.reg;
        res.json({ success: true, registration: reg, warnung: schichten.warnung ?? null });

        // Wie beim Eintrag in der App: Person und Organisatoren informieren.
        pool.query('SELECT title FROM events WHERE id = $1', [eventId])
            .then(ev => notifyRegistrationChange({
                eventId, eventTitle: ev.rows[0]?.title || 'Event',
                memberId: reg.member_id, guestName: reg.guest_name, guestEmail: reg.guest_email,
                shiftIds: reg.shift_ids, action: 'added'
            }))
            .catch(() => {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Middleware: Prüft JWT-Token auf Typ 'event-organizer' und setzt req.eventOrganizer.
// Ist der Anlass inzwischen vorbei oder abgesagt, gilt auch ein noch nicht
// abgelaufenes Token nicht mehr (wie beim Login).
async function authenticateEventOrganizer(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token erforderlich' });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        return res.status(401).json({ error: 'Ungueltiger Token' });
    }
    if (decoded.type !== 'event-organizer') {
        return res.status(403).json({ error: 'Nur fuer Event-Organisatoren' });
    }
    try {
        const ev = await pool.query(
            'SELECT id, status, start_date, end_date, datum_offen FROM events WHERE id = $1', [decoded.event_id]);
        const gesperrt = organisatorAnsicht.organisatorLoginGesperrt(ev.rows[0]);
        if (gesperrt) return res.status(401).json({ error: gesperrt, code: 'anlass_vorbei' });
        if (!(await organisatorLoginGueltig(decoded))) {
            return res.status(401).json({ error: 'Der Zugang wurde entfernt.', code: 'zugang_entfernt' });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
    req.eventOrganizer = decoded;
    next();
}

// ============================================
// SHIFTS
// DEUTSCH: CRUD-Endpunkte fuer Schichten (Arbeitsblöcke innerhalb von Events)
// ============================================

// DEUTSCH: Alle Schichten auflisten, optional gefiltert nach event_id
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

// DEUTSCH: Neue Schicht erstellen (nur Vorstand/Admin) mit Name, Datum, Zeit und Bereich
app.post('/shifts', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { event_id, name, description, date, start_time, end_time, needed, bereich } = req.body;

        // Pflichtfelder pruefen
        if (!event_id) return res.status(400).json({ error: 'event_id ist ein Pflichtfeld' });
        if (!name) return res.status(400).json({ error: 'name ist ein Pflichtfeld' });
        if (!date) return res.status(400).json({ error: 'date ist ein Pflichtfeld' });

        const result = await pool.query(`
            INSERT INTO shifts (event_id, name, description, date, start_time, end_time, needed, bereich)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [event_id, name, description, date, start_time, end_time, needed, bereich || 'Allgemein']);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('POST /shifts error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Schicht aktualisieren (nur Vorstand/Admin). Benachrichtigt Registrierte bei relevanten Änderungen
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

// DEUTSCH: Schicht löschen (nur Vorstand/Admin). Benachrichtigt alle Registrierten über Absage
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
// DEUTSCH: Verwaltung von Anmeldungen (Helfer/Teilnehmer) für Events und Schichten
// ============================================

// DEUTSCH: Registrierungen auflisten, gefiltert nach event_id/member_id. Lädt auch Schicht-Details pro Registrierung
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

// DEUTSCH: Neue Registrierung erstellen (authentifiziert, z.B. via Vorstand-App). Vorstand kann Status direkt setzen (z.B. 'approved')
app.post('/registrations', authenticateAny, async (req, res) => {
    try {
        const { event_id, member_id, guest_name, guest_email, notes, status } = req.body;
        const shift_ids = eindeutig(req.body.shift_ids);

        // Vorstand/Admin darf Status direkt setzen, sonst immer 'pending'
        const isPrivileged = hatRolle(req.user, 'vorstand', 'admin');
        const regStatus = (isPrivileged && status) ? status : 'pending';

        // Niemand zweimal auf derselben Schicht (src/doppelte-schicht.js).
        const doppelt = await schichtKonflikte(pool, {
            eventId: event_id, memberId: member_id, email: guest_email, shiftIds: shift_ids
        });
        if (doppelt.length > 0) {
            return res.status(409).json({
                error: `Bereits auf dieser Schicht eingetragen: ${konfliktText(doppelt)}`,
                code: 'schicht_doppelt'
            });
        }
        const gleichzeitig = await zeitKonflikte(pool, {
            memberId: member_id, email: guest_email, shiftIds: shift_ids
        });
        if (gleichzeitig.length > 0) {
            return res.status(409).json({
                error: `Gleichzeitig schon eingeteilt: ${zeitText(gleichzeitig)}`,
                code: 'schicht_gleichzeitig'
            });
        }

        // Teilnehmer ohne Schicht: dieselbe Person nicht zweimal
        // (src/doppelte-anmeldung.js). So entstanden am Spaghetti-Plausch 2026
        // vier Zeilen "Degen, Heinz" in 5 Sekunden: vorstand.html "Person
        // hinzufuegen" schickte bei jedem Klick ein neues POST hierher.
        // Vorstand/Admin bekommen 409 (Versehen), ein Mitglied, das sich
        // selbst nochmals anmeldet, die bestehende Anmeldung (200).
        const eintrag = await doppelteAnmeldung.mitAnmeldeSperre(pool, event_id, async (db) => {
            if (doppelteAnmeldung.istTeilnahme(shift_ids)) {
                const bestehend = await doppelteAnmeldung.bestehendeTeilnahme(db, {
                    eventId: event_id, memberId: member_id || null, email: guest_email || '', name: guest_name || ''
                });
                if (bestehend) return { bestehend };
            }
            const r = await db.query(`
                INSERT INTO registrations (event_id, member_id, guest_name, guest_email, shift_ids, notes, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `, [event_id, member_id, guest_name, guest_email, shift_ids, notes, regStatus]);
            return { reg: r.rows[0] };
        });
        if (eintrag.bestehend) {
            if (isPrivileged) {
                return res.status(409).json({
                    error: doppelteAnmeldung.hinweisVorstand(eintrag.bestehend),
                    code: 'bereits_angemeldet',
                    registration: eintrag.bestehend
                });
            }
            return res.status(200).json({
                ...eintrag.bestehend,
                bereits_angemeldet: true,
                message: doppelteAnmeldung.hinweisSelbst(eintrag.bestehend, null)
            });
        }

        const reg = eintrag.reg;

        // Push an den Vorstand nur, wenn die Anmeldung noch bestaetigt werden
        // muss - traegt der Vorstand selbst ein, weiss er es schon.
        if (reg.status === 'pending' && !isPrivileged) {
            pool.query(`SELECT e.title,
                    (SELECT TRIM(CONCAT(m.vorname, ' ', m.nachname)) FROM members m WHERE m.id = $2::uuid) AS mitglied
                  FROM events e WHERE e.id = $1`, [event_id, member_id || null])
                .then(e => vorstandMelden('anmeldung', {
                    id: event_id, name: guest_name || e.rows[0]?.mitglied || '', anlass: e.rows[0]?.title
                }, member_id || null))
                .catch(err => console.error('Vorstand-Push (Anlass) fehlgeschlagen:', err.message));
        }

        // Benachrichtigungen. Frueher ging nur eine Mail an den ganzen Vorstand
        // ("Status: approved", ohne Schicht) — der Vorstand informierte sich
        // ueber seine eigene Arbeit, waehrend die eingetragene Person nichts
        // erfuhr. Jetzt: die Person wie beim Eintrag durch einen Organisator,
        // der Organisator (wenn er es nicht selbst war) und der Vorstand, alle
        // mit Anlass, Datum, Ort und Schichten.
        try {
            const event = await pool.query('SELECT title, organizer_email FROM events WHERE id = $1', [event_id]);
            const eventTitle = event.rows[0]?.title || 'Unbekanntes Event';

            notifyRegistrationChange({
                eventId: event_id, eventTitle,
                memberId: reg.member_id, guestName: reg.guest_name, guestEmail: reg.guest_email,
                action: 'added', shiftIds: reg.shift_ids
            }).catch(() => {});

            let personName = guest_name;
            if (!personName && member_id) {
                const member = await pool.query('SELECT vorname, nachname FROM members WHERE id = $1', [member_id]);
                if (member.rows.length > 0) {
                    personName = `${member.rows[0].vorname} ${member.rows[0].nachname}`;
                }
            }
            const eingetragenVon = req.user.email || req.user.name || 'Vorstand';
            const statusText = { approved: 'bestätigt', pending: 'offen', rejected: 'abgelehnt' }[regStatus] || regStatus;
            const details = await registrationDetailsText(event_id, reg.shift_ids);

            const body = `${personName || 'Unbekannt'} wurde für ${eventTitle} eingetragen (${statusText}).

${details}
${guest_email ? `\nE-Mail: ${guest_email}` : ''}
Eingetragen von: ${eingetragenVon}${notes ? `\nBemerkungen: ${notes}` : ''}`;
            const subject = `Neue Anmeldung: ${personName || 'Unbekannt'} – ${eventTitle}`;

            const empfaenger = [process.env.CONTACT_EMAIL || 'vorstand@fwv-raura.ch'];
            const organisator = (event.rows[0]?.organizer_email || '').trim();
            if (organisator && organisator.toLowerCase() !== String(eingetragenVon).toLowerCase()
                && !empfaenger.some(e => e.toLowerCase() === organisator.toLowerCase())) {
                empfaenger.push(organisator);
            }
            // Mitorganisatoren teilen die Arbeit — sie erfahren es auch.
            empfaenger.push(...mitorganisatoren.empfaengerListe([], await mitorganisatorenEmails(event_id),
                [...empfaenger, eingetragenVon]));
            for (const to of empfaenger) {
                await axios.post(`${DISPATCH_API}/email/send`, { to, subject, body, event_id, sammeln: true });
            }
        } catch (emailErr) {
            console.error('Benachrichtigung zur Vorstands-Anmeldung fehlgeschlagen:', emailErr.message);
        }

        res.status(201).json(reg);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Öffentliche Registrierung via Website-Formular (kein Login nötig). Erkennt Mitglieder automatisch per E-Mail, sendet Bestätigung an Anmelder und Benachrichtigung an Organisator
// DEUTSCH: Schema fuer Gaeste-Anmelde-Bestaetigungen (Double-Opt-in). Unbestaetigte
// Gaeste-Anmeldungen liegen hier — NICHT in registrations — bis der Gast den Link in
// der Bestaetigungs-Mail klickt; erst dann wird die eigentliche Anmeldung erstellt.
// So koennen Fake-/Fremd-Anmeldungen gar nicht erst in der Vorstand-Liste auftauchen.
async function ensureRegistrationConfirmationsSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS registration_confirmations (
            token TEXT PRIMARY KEY,
            event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            email TEXT,
            payload JSONB NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            expires_at TIMESTAMP NOT NULL
        )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reg_confirm_expires ON registration_confirmations(expires_at)`);
}

// DEUTSCH: Legt die eigentliche Anmeldung an (Insert + Audit-Push + Bestaetigungs-/
// Organisator-Mails) und gibt die Registrierungs-Zeile zurueck. Wird direkt aufgerufen
// (Mitglieder / Anmeldungen ohne E-Mail) ODER nach erfolgreicher Gast-Bestaetigung.
// Nur die Zeile anlegen ([db]: Pool oder Transaktions-Client).
async function anmeldungEinfuegen(db, ctx) {
    const {
        ev, memberId, name, email, phone, type,
        shiftIds, shifts, notes, meal_selection, allergies,
        requestedPersons, companions
    } = ctx;
    const r = await db.query(`
        INSERT INTO registrations (event_id, member_id, guest_name, guest_email, shift_ids, notes, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        RETURNING *
    `, [
        ev.id, memberId || null, name, email,
        type === 'shift' ? eindeutig(shiftIds) : null,
        JSON.stringify({
            phone,
            participants: requestedPersons,
            companions: (companions && companions.length) ? companions : null,
            shifts, notes,
            meal_selection: meal_selection || null,
            allergies: allergies || null
        })
    ]);
    return r.rows[0];
}

// Teilnehmer-Anmeldung unter der Anmelde-Sperre des Anlasses: ist dieselbe
// Person schon angemeldet (src/doppelte-anmeldung.js), kommt { bestehend }
// zurueck, sonst { reg } (frisch eingefuegt). [pruefen](db) darf vorher
// noch { fehler } liefern (z.B. Anlass voll) - auch unter der Sperre.
async function teilnahmeAnlegen(ctx, pruefen = null) {
    return doppelteAnmeldung.mitAnmeldeSperre(pool, ctx.ev.id, async (db) => {
        const bestehend = await doppelteAnmeldung.bestehendeTeilnahme(db, {
            eventId: ctx.ev.id, memberId: ctx.memberId || null, email: ctx.email || '', name: ctx.name || ''
        });
        if (bestehend) return { bestehend };
        if (pruefen) {
            const fehler = await pruefen(db);
            if (fehler) return { fehler };
        }
        return { reg: await anmeldungEinfuegen(db, ctx) };
    });
}

// [vorhanden]: schon eingefuegte Zeile (teilnahmeAnlegen) - dann nur noch
// Audit, Push und Mails.
async function finalizeRegistration(ctx, vorhanden = null) {
    const {
        ev, memberId, isMember, name, email, phone, type,
        shiftIds, shifts, notes, meal_selection, allergies,
        requestedPersons
    } = ctx;
    const eventTitle = ev.title;
    const eventId = ev.id;

    const registration = { rows: [vorhanden || await anmeldungEinfuegen(pool, ctx)] };

    // Push an den Vorstand: neue Anmeldung wartet auf Bestaetigung (pending).
    // Wer sich selbst anmeldet, bekommt keinen Push.
    vorstandMelden('anmeldung', { id: eventId, name, anlass: eventTitle }, memberId || null);

    // Audit-Eintrag (Audit-Log im Vorstand-Bereich)
    try {
        await pool.query(`
            INSERT INTO audit_log (action, entity_type, email, new_values, created_at)
            VALUES ('EVENT_REGISTRATION', 'registration', $1, $2, NOW())
        `, [
            email || null,
            JSON.stringify({ name, eventTitle, eventId, type: type || 'participant', isMember })
        ]);
    } catch (auditError) {
        console.error('Audit-Log fuer Anmeldung fehlgeschlagen:', auditError.message);
    }

    let mealInfo = '';
    if (meal_selection) mealInfo += `\nMenüwahl: ${meal_selection}`;
    if (allergies) mealInfo += `\nAllergien/Unverträglichkeiten: ${allergies}`;

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

    // Gleicher Block wie in der spaeteren Bestaetigung (Datum, Ort, Schichten, Kontakt)
    let details = `Event: ${eventTitle}\n${shiftInfo}`;
    try {
        details = await registrationDetailsText(eventId, type === 'shift' ? shiftIds : null) || details;
    } catch (e) {
        console.error('Anmelde-Details fuer E-Mail nicht ladbar:', e.message);
    }

    // Name im Betreff: Ehepaare teilen sich hier oft eine Adresse - so sieht
    // man im gemeinsamen Postfach sofort, fuer wen die Bestaetigung ist.
    const confirmSubject = `Bestätigung Ihrer Anmeldung - ${eventTitle}${name ? ` (${name})` : ''}`;
    const confirmBody = `
Guten Tag ${name},

Vielen Dank für Ihre Anmeldung${type === 'shift' ? ' als Helfer/in' : ''}!

${details}

${requestedPersons ? `Anzahl Personen: ${requestedPersons}` : ''}${mealInfo}
${notes ? `\nBemerkungen: ${notes}` : ''}

Wir werden Ihre Anmeldung bearbeiten und uns bei Ihnen melden.

Mit freundlichen Grüssen
Feuerwehrverein Raura
    `.trim();
    try {
        await axios.post(`${DISPATCH_API}/email/send`, mitAnlassLogo(ev, { to: email, subject: confirmSubject, body: confirmBody }));
    } catch (emailError) {
        console.error('Bestätigungs-E-Mail konnte nicht gesendet werden:', emailError.message);
    }

    if (memberId) {
        pushToMember(memberId, 'event_update', confirmSubject,
            'Wir haben deine Anmeldung erhalten und melden uns bei dir.', { eventId }).catch(() => {});
    }

    const orgSubject = `Neue Anmeldung für ${eventTitle}`;
    const orgBody = `
Neue ${type === 'shift' ? 'Helfer-' : 'Teilnehmer-'}Anmeldung eingegangen!

Name: ${name}
E-Mail: ${email}
${phone ? `Telefon: ${phone}` : ''}
${shiftInfo}
${requestedPersons ? `Anzahl Personen: ${requestedPersons}` : ''}${mealInfo}
${notes ? `\nBemerkungen: ${notes}` : ''}
    `.trim();
    // Empfaenger nur aus der Datenbank: Frueher galt eine vom Geraet
    // mitgeschickte organizerEmail als Ausweichadresse — so liess sich die
    // Benachrichtigung (mit Name, E-Mail, Telefon) an eine beliebige Adresse
    // umleiten. Auch alte, noch unbestaetigte Gast-Anmeldungen, deren Payload
    // sie noch enthaelt, ignorieren sie jetzt.
    const notifyEmail = (ev.category === 'GV')
        ? 'vorstand@fwv-raura.ch'
        : (ev.organizer_email || process.env.CONTACT_EMAIL || 'kontakt@fwv-raura.ch');
    // Mitorganisatoren bekommen dieselbe Meldung (nicht bei der GV — die
    // geht nur an den Vorstand). Jede Adresse nur einmal.
    const orgEmpfaenger = ev.category === 'GV'
        ? [notifyEmail]
        : mitorganisatoren.empfaengerListe(notifyEmail, await mitorganisatorenEmails(eventId));
    for (const to of orgEmpfaenger) {
        try {
            await axios.post(`${DISPATCH_API}/email/send`, { to, subject: orgSubject, body: orgBody, event_id: eventId, sammeln: true });
        } catch (emailError) {
            console.error('Organisator-E-Mail konnte nicht gesendet werden:', emailError.message);
        }
    }

    return registration.rows[0];
}

// DEUTSCH: Mitglied zum mitgeschickten Token (optional) — oder null. Die Route
// ist oeffentlich (Website-Formular); schickt die App ihr Token mit, zaehlt
// das Mitglied aus dem Token, nicht die E-Mail im Formular. Vorstand-
// Funktions-Tokens, API-Key und Organisator-Login sind keine Mitglieder.
async function mitgliedAusToken(req) {
    if (eventOrganisatorToken(req)) return null;
    const user = await optionalerBenutzer(req);
    if (!user || user.id === 'api' || user.role) return null;
    const kennung = user.id ? String(user.id) : null;
    const email = (user.email || '').toLowerCase();
    if (!kennung && !email) return null;
    const m = await pool.query(
        `SELECT id, vorname, nachname, email
           FROM members
          WHERE ($1::text IS NOT NULL AND (id::text = $1 OR authentik_user_id = $1))
             OR ($2 <> '' AND LOWER(email) = $2)
          ORDER BY (id::text = COALESCE($1, '')) DESC,
                   (COALESCE(authentik_user_id, '') = COALESCE($1, '')) DESC
          LIMIT 1`,
        [kennung, email]
    );
    return m.rows[0] || null;
}

app.post('/registrations/public', async (req, res) => {
    try {
        // eventTitle und organizerEmail (aeltere Clients schicken sie noch)
        // werden bewusst nicht gelesen: Titel und Empfaenger kommen aus der
        // Datenbank.
        let { name, email } = req.body;
        const {
            type, eventId,
            phone,
            shifts, shiftIds, // für Schicht-Anmeldung
            participants, // für Teilnehmer-Anmeldung
            notes,
            meal_selection, // DEUTSCH: Gewähltes Menü (für GV-Events)
            allergies, // DEUTSCH: Allergien/Unverträglichkeiten (für GV-Events)
            skipMemberCheck // Falls der User trotzdem als Gast anmelden möchte
        } = req.body;

        // DEUTSCH: Honeypot gegen Bots — ein im Formular verstecktes Feld ("website").
        // Menschen lassen es leer; Bots fuellen es aus. Gefuellt -> still als "Erfolg"
        // abweisen (kein Insert, keine Mail), damit der Bot keinen Unterschied merkt.
        if (typeof req.body?.website === 'string' && req.body.website.trim() !== '') {
            return res.json({ success: true, message: 'Anmeldung erfolgreich' });
        }

        // Mit gueltigem Mitglieder-Token: Mitglied, Name und E-Mail aus dem
        // Token (die E-Mail im Formular koennte jede sein). Ohne: wie bisher
        // ueber die E-Mail im Formular.
        let memberId = null;
        let isMember = false;
        const tokenMitglied = await mitgliedAusToken(req);
        if (tokenMitglied) {
            memberId = tokenMitglied.id;
            isMember = true;
            name = [tokenMitglied.vorname, tokenMitglied.nachname].filter(Boolean).join(' ') || name;
            // Mitglieder ohne E-Mail: die Bestaetigung geht an die Adresse aus
            // dem Formular (nur Zustellung, nicht Erkennung).
            email = tokenMitglied.email || email;
        } else if (email) {
            const memberCheck = await pool.query(
                'SELECT id, vorname, nachname, email FROM members WHERE LOWER(email) = LOWER($1)',
                [email]
            );

            if (memberCheck.rows.length > 0) {
                // Paare teilen sich oft eine Adresse: das Mitglied mit dem
                // Namen aus dem Formular nehmen, nicht einfach das erste.
                const treffer = memberCheck.rows.find(m => doppelteAnmeldung.gleicherName(
                    [m.vorname, m.nachname].filter(Boolean).join(' '), name)) || memberCheck.rows[0];
                memberId = treffer.id;
                isMember = true;
                console.log(`Registrierung automatisch verknüpft mit Mitglied: ${treffer.vorname} ${treffer.nachname}`);
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

        // DEUTSCH: Anmeldeschluss + Kapazitaetslimit pruefen.
        // Hinweis: Organisator/Vorstand nutzen die /events/:id/registrations-as-organizer
        // bzw. /registrations Endpoints und werden von dieser Pruefung NICHT betroffen.
        const ev = event.rows[0];
        // DEUTSCH: Abgesagte Events - keine Anmeldung moeglich.
        if ((ev.status || '') === 'cancelled') {
            return res.status(409).json({
                success: false,
                message: 'Dieses Event wurde abgesagt – eine Anmeldung ist nicht möglich.',
                code: 'event_cancelled'
            });
        }
        if (ev.registration_deadline && new Date(ev.registration_deadline) < new Date()) {
            return res.status(409).json({
                success: false,
                message: 'Der Anmeldeschluss fuer dieses Event ist bereits vorbei. '
                    + 'Bitte melde dich telefonisch beim Organisator oder beim Vorstand, '
                    + 'wenn du dich trotzdem noch anmelden moechtest.',
                code: 'deadline_passed'
            });
        }
        // Helfer: weitere Schichten ja, dieselbe Schicht nein
        // (src/doppelte-schicht.js). Teilnehmer: siehe weiter unten.
        if (type === 'shift') {
            const doppelt = await schichtKonflikte(pool, {
                eventId: ev.id, memberId, email, shiftIds: shiftIds
            });
            if (doppelt.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: `Du bist für diese Schicht schon eingetragen: ${konfliktText(doppelt)}.`,
                    code: 'schicht_doppelt'
                });
            }
            const gleichzeitig = await zeitKonflikte(pool, { memberId, email, shiftIds });
            if (gleichzeitig.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: `Zu dieser Zeit bist du schon eingeteilt: ${zeitText(gleichzeitig)}.`,
                    code: 'schicht_gleichzeitig'
                });
            }
        }
        // Teilnehmer: dieselbe Person nicht zweimal (src/doppelte-anmeldung.js).
        // Frueher sperrte hier schon dieselbe E-Mail - auch Paare mit
        // gemeinsamer Adresse, die sich je selbst anmelden wollten. Jetzt
        // zaehlt Mitglied/Adresse UND Name; ein zweiter Versuch derselben
        // Person (Doppelklick) bekommt die bestehende Anmeldung zurueck.
        const requestedPersons = Math.min(Math.max(parseInt(participants, 10) || 1, 1), 50);
        const schonAngemeldet = (bestehend) => res.json({
            success: true,
            bereits_angemeldet: true,
            registrationId: bestehend.id,
            isMember,
            message: doppelteAnmeldung.hinweisSelbst(bestehend, requestedPersons)
        });
        if (type !== 'shift') {
            const bestehend = await doppelteAnmeldung.bestehendeTeilnahme(pool, {
                eventId: ev.id, memberId, email, name
            });
            if (bestehend) return schonAngemeldet(bestehend);
        }

        // DEUTSCH: Kapazitaet in PERSONEN pruefen (eine Anmeldung kann mehrere
        // Personen umfassen) — inkl. der jetzt angefragten Personenzahl.
        // Liefert die 409-Antwort oder null; laeuft beim Einfuegen nochmals
        // unter der Anmelde-Sperre.
        const kapazitaetPruefen = async (db) => {
            if (!ev.max_participants) return null;
            const cnt = await db.query(
                `SELECT notes FROM registrations
                 WHERE event_id = $1 AND status IN ('approved', 'pending')`,
                [ev.id]
            );
            const used = sumRegistrationPersons(cnt.rows);
            const free = ev.max_participants - used;
            if (free >= requestedPersons) return null;
            return {
                success: false,
                message: free <= 0
                    ? 'Das Event ist bereits voll. Bitte wende dich an den Organisator.'
                    : `Es sind nur noch ${free} freie ${free === 1 ? 'Platz' : 'Plätze'} verfügbar (angefragt: ${requestedPersons}). Bitte reduziere die Personenzahl oder wende dich an den Organisator.`,
                code: 'event_full',
                freeSpots: Math.max(0, free)
            };
        };
        const voll = await kapazitaetPruefen(pool);
        if (voll) return res.status(409).json(voll);

        // DEUTSCH: Begleitpersonen (Namen der weiteren Personen) — vom Formular
        // mitgeschickt, sanitisiert (max 49 Namen, je max 100 Zeichen).
        // DEUTSCH: Begleitpersonen — Objekte {name, email?, phone?}; blanke Strings
        // (aeltere Frontend-Version) werden als {name} uebernommen.
        const companions = Array.isArray(req.body.companions)
            ? req.body.companions
                .map((c) => {
                    if (typeof c === 'string') {
                        const n = c.trim().substring(0, 100);
                        return n ? { name: n } : null;
                    }
                    const n = String(c?.name || '').trim().substring(0, 100);
                    if (!n) return null;
                    const o = { name: n };
                    const em = String(c?.email || '').trim().substring(0, 200);
                    const ph = String(c?.phone || '').trim().substring(0, 50);
                    if (em) o.email = em;
                    if (ph) o.phone = ph;
                    return o;
                })
                .filter(Boolean)
                .slice(0, 49)
            : [];

        // DEUTSCH: Kontext fuer die Finalisierung buendeln.
        const ctx = {
            ev, memberId, isMember, name, email, phone, type,
            shiftIds, shifts, notes, meal_selection, allergies,
            requestedPersons, companions
        };

        // DEUTSCH: Double-Opt-in fuer GAESTE (kein erkanntes Mitglied): Anmeldung erst
        // nach E-Mail-Bestaetigung anlegen. Verhindert Spam-/Fremd-Anmeldungen mit
        // erfundener oder fremder Adresse. Mitglieder (E-Mail == bekanntes Mitglied) und
        // Anmeldungen ohne E-Mail ueberspringen das und werden sofort angelegt.
        if (!isMember && email) {
            const token = crypto.randomBytes(24).toString('hex');
            const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 Tage gueltig
            const payload = {
                memberId, isMember, name, email, phone, type,
                shiftIds, shifts, notes, meal_selection, allergies,
                requestedPersons, companions
            };
            await pool.query(
                `INSERT INTO registration_confirmations (token, event_id, email, payload, expires_at)
                 VALUES ($1, $2, $3, $4, $5)`,
                [token, ev.id, email, JSON.stringify(payload), expiresAt]
            );
            const confirmUrl = `${process.env.BASE_URL || 'https://api.fwv-raura.ch'}/registrations/confirm?token=${token}`;
            const optinBody = `
Guten Tag ${name},

fast geschafft! Bitte bestätige deine Anmeldung für "${ev.title}" mit einem Klick:

${confirmUrl}

Ohne Bestätigung wird die Anmeldung nicht wirksam. Der Link ist 3 Tage gültig.
Falls du dich nicht angemeldet hast, ignoriere diese E-Mail einfach.

Mit freundlichen Grüssen
Feuerwehrverein Raura
            `.trim();
            try {
                await axios.post(`${DISPATCH_API}/email/send`, mitAnlassLogo(ev, {
                    to: email,
                    subject: `Bitte bestätige deine Anmeldung – ${ev.title}${name ? ` (${name})` : ''}`,
                    body: optinBody
                }));
            } catch (emailError) {
                console.error('Opt-in-Bestätigungsmail fehlgeschlagen:', emailError.message);
            }
            return res.json({
                success: true,
                pending_confirmation: true,
                message: 'Fast geschafft! Wir haben dir eine E-Mail geschickt – bitte bestätige deine Anmeldung über den Link darin.'
            });
        }

        // Mitglied ODER keine E-Mail: sofort finalisieren. Teilnehmer unter
        // der Anmelde-Sperre: vier Klicks in 5 Sekunden ergeben eine Zeile.
        let reg;
        if (type !== 'shift') {
            const eintrag = await teilnahmeAnlegen(ctx, kapazitaetPruefen);
            if (eintrag.bestehend) return schonAngemeldet(eintrag.bestehend);
            if (eintrag.fehler) return res.status(409).json(eintrag.fehler);
            reg = await finalizeRegistration(ctx, eintrag.reg);
        } else {
            reg = await finalizeRegistration(ctx);
        }
        res.json({
            success: true,
            message: isMember ? 'Anmeldung erfolgreich (als Mitglied verknüpft)' : 'Anmeldung erfolgreich',
            registrationId: reg.id,
            isMember
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DEUTSCH: Gast bestaetigt seine Anmeldung (Double-Opt-in). Oeffentlich erreichbar
// ueber den Link aus der Bestaetigungs-Mail. Legt die eigentliche Anmeldung an
// (finalizeRegistration) und zeigt eine kleine Bestaetigungsseite im Browser.
app.get('/registrations/confirm', async (req, res) => {
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const page = (title, msg, ok) => `<!doctype html><html lang="de"><head><meta charset="utf-8">`
        + `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>`
        + `<style>body{font-family:system-ui,-apple-system,sans-serif;background:#f3f4f6;margin:0;padding:2rem;`
        + `display:flex;justify-content:center}main{background:#fff;max-width:30rem;width:100%;border-radius:1rem;`
        + `padding:2rem;box-shadow:0 1px 3px rgba(0,0,0,.12);text-align:center}.i{font-size:3rem;line-height:1}`
        + `h1{font-size:1.25rem;margin:.75rem 0 .75rem;color:#111}p{color:#374151;line-height:1.5}`
        + `a{display:inline-block;margin-top:1.5rem;color:#dc2626;text-decoration:none;font-weight:600}</style></head>`
        + `<body><main><div class="i">${ok ? '✅' : '⚠️'}</div><h1>${esc(title)}</h1><p>${esc(msg)}</p>`
        + `<a href="https://fwv-raura.ch">Zur FWV-Raura-Website</a></main></body></html>`;
    try {
        const { token } = req.query;
        if (!token || typeof token !== 'string') {
            return res.status(400).send(page('Ungültiger Link', 'Es fehlt ein gültiges Bestätigungs-Token.', false));
        }
        const c = await pool.query('SELECT * FROM registration_confirmations WHERE token = $1', [token]);
        if (c.rows.length === 0) {
            return res.status(404).send(page('Link ungültig', 'Dieser Bestätigungslink ist ungültig oder wurde bereits verwendet.', false));
        }
        const row = c.rows[0];
        if (new Date(row.expires_at) < new Date()) {
            await pool.query('DELETE FROM registration_confirmations WHERE token = $1', [token]);
            return res.status(410).send(page('Link abgelaufen', 'Dieser Bestätigungslink ist abgelaufen. Bitte melde dich bei Bedarf erneut an.', false));
        }
        const evq = await pool.query('SELECT * FROM events WHERE id = $1', [row.event_id]);
        if (evq.rows.length === 0) {
            await pool.query('DELETE FROM registration_confirmations WHERE token = $1', [token]);
            return res.status(404).send(page('Anlass nicht gefunden', 'Der Anlass existiert nicht mehr.', false));
        }
        const ev = evq.rows[0];
        if ((ev.status || '') === 'cancelled') {
            await pool.query('DELETE FROM registration_confirmations WHERE token = $1', [token]);
            return res.status(409).send(page('Anlass abgesagt', 'Dieser Anlass wurde inzwischen abgesagt – eine Anmeldung ist nicht mehr möglich.', false));
        }
        const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
        if (payload.type !== 'shift') {
            // Zweimal bestaetigt (zwei Mails, zweimal geklickt): eine Zeile.
            const eintrag = await teilnahmeAnlegen({ ...payload, ev });
            await pool.query('DELETE FROM registration_confirmations WHERE token = $1', [token]);
            if (eintrag.bestehend) {
                return res.send(page('Schon angemeldet',
                    doppelteAnmeldung.hinweisSelbst(eintrag.bestehend, payload.requestedPersons), true));
            }
            await finalizeRegistration({ ...payload, ev }, eintrag.reg);
        } else {
            await finalizeRegistration({ ...payload, ev });
            await pool.query('DELETE FROM registration_confirmations WHERE token = $1', [token]);
        }
        return res.send(page('Anmeldung bestätigt',
            `Danke${payload.name ? ', ' + payload.name : ''}! Deine Anmeldung für „${ev.title}" ist bestätigt. Der Organisator wurde informiert und meldet sich bei dir.`, true));
    } catch (error) {
        console.error('Registrierungs-Bestätigung fehlgeschlagen:', error.message);
        return res.status(500).send('<!doctype html><meta charset="utf-8"><p>Ein Fehler ist aufgetreten. Bitte versuche es später erneut.</p>');
    }
});

// ============================================
// REGISTRATION MANAGEMENT (Vorstand)
// DEUTSCH: Verwaltung von Registrierungen durch den Vorstand (genehmigen, ablehnen, alternative Schicht vorschlagen)
// ============================================

// DEUTSCH: Alle Registrierungen mit Filtern abrufen (nur Vorstand). Inkl. Schicht-Details und geparste Notizen
// DEUTSCH: Eigene Anmeldungen des eingeloggten Users (Mitglieder-App-Profil).
// Matcht entweder ueber member_id (wenn das members-Backend die Mitgliedschaft verknuepft hat)
// oder ueber guest_email == req.user.email als Fallback.
app.get('/registrations/mine', authenticateAny, async (req, res) => {
    try {
        // Das Mitglied ueber alle drei Kennungen suchen, nicht nur ueber die
        // E-Mail: Sieben Mitglieder haben keine, und die bekamen hier
        // stillschweigend eine leere Liste zurueck — nicht als Fehler,
        // sondern als "du bist nirgends eingeteilt". Genau die Leute, die am
        // Fest wissen wollen, wann sie dran sind.
        const email = (req.user?.email || '').toLowerCase();
        const kennung = req.user?.id;
        const benutzername = req.user?.benutzername || null;
        const istUuid = typeof kennung === 'string' &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(kennung);

        let memberId = istUuid ? kennung : null;
        if (!memberId && (email || benutzername)) {
            const m = await pool.query(
                'SELECT id FROM members WHERE LOWER(email) = $1 OR LOWER(benutzername) = LOWER($2) LIMIT 1',
                [email, benutzername]
            );
            if (m.rows.length) memberId = m.rows[0].id;
        }
        if (!memberId && !email) return res.json([]);

        const result = await pool.query(
            `SELECT r.*, e.title AS event_title, e.slug AS event_slug,
                    e.start_date AS event_start_date, e.end_date AS event_end_date,
                    e.location AS event_location
             FROM registrations r
             JOIN events e ON r.event_id = e.id
             WHERE ($1 <> '' AND LOWER(r.guest_email) = $1)
                OR ($2::uuid IS NOT NULL AND r.member_id = $2::uuid)
             ORDER BY e.start_date DESC`,
            [email, memberId]
        );
        // Schicht-Namen fuer alle vorkommenden shift_ids in einer einzigen Query holen
        const allShiftIds = Array.from(new Set(
            result.rows.flatMap(r => Array.isArray(r.shift_ids) ? r.shift_ids : [])
        ));
        const shiftMap = {};
        if (allShiftIds.length > 0) {
            const shifts = await pool.query(
                // bereich und date muessen mit: Ohne sie zeigen die
                // Mitglieder-Apps "Schicht 1 - 12:00-14:00" und sonst nichts.
                // Bei der Chilbi gibt es das am Samstag und am Sonntag, in Bar
                // und Kueche - vier identische Zeilen, und niemand weiss, fuer
                // welche er sich eingetragen hat.
                `SELECT id, name, bereich, date, start_time, end_time
                 FROM shifts WHERE id = ANY($1::uuid[])`,
                [allShiftIds]
            );
            for (const s of shifts.rows) {
                shiftMap[s.id] = {
                    id: s.id, name: s.name, bereich: s.bereich, date: s.date,
                    start_time: s.start_time, end_time: s.end_time
                };
            }
        }
        for (const reg of result.rows) {
            if (reg.notes) {
                try { reg.parsed_notes = JSON.parse(reg.notes); } catch (_) {}
            }
            reg.shifts = (Array.isArray(reg.shift_ids) ? reg.shift_ids : [])
                .map(id => shiftMap[id])
                .filter(Boolean);
        }
        // status_text/-farbe, event_datum_text, shifts[].beschriftung
        res.json(result.rows.map(appAnsicht.anmeldungAnsicht));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Events bei denen der eingeloggte User der Organisator ist (per E-Mail-Match).
// Erlaubt der Mitglieder-App den "Organisator"-Tab automatisch einzublenden ohne
// separates Event-Login.
// DEUTSCH: Loest die "Organisator-Identitaet" des eingeloggten Users auf:
// die Mitglieds-ID (fuer den organizer_id-Match) und die bekannten IDENTITAETS-
// E-Mails (Login-Mail + Mitglieds-Haupt-email). Damit wird Organisator-Zugriff
// robust erkannt — egal ob das Event per organizer_id verknuepft ist oder der
// User sich mit einer anderen Mail einloggt als in members.email steht (Aufloesung
// dann ueber authentik_user_id == Token-sub).
//
// Bewusst NICHT ueber versand_email: die ist nicht eindeutig (mehrere Mitglieder
// koennen dieselbe Versand-Adresse teilen) — sie zum Matchen zu nutzen wuerde in
// einem Autorisierungs-Pfad Zugriff ueber-gewaehren.
async function resolveOrganizerIdentity(req) {
    const loginEmail = (req.user?.email || '').toLowerCase();
    const authId = req.user?.id ? String(req.user.id) : null;
    const emails = new Set();
    let memberId = null;
    if (loginEmail) emails.add(loginEmail);
    if (loginEmail || authId) {
        try {
            // $2::text: ohne Typ scheiterte die Abfrage bei jedem
            // angemeldeten Benutzer ("could not determine data type of
            // parameter $2") — der Fehler wurde nur geloggt, erkannt wurde
            // der Organisator dann bloss ueber organizer_email.
            const m = await pool.query(
                `SELECT id, LOWER(email) AS email
                   FROM members
                  WHERE ($1 <> '' AND LOWER(email) = $1)
                     OR ($2::text IS NOT NULL AND authentik_user_id = $2::text)
                  ORDER BY (LOWER(email) = $1) DESC
                  LIMIT 1`,
                [loginEmail, authId]
            );
            if (m.rows[0]) {
                memberId = m.rows[0].id;
                if (m.rows[0].email) emails.add(m.rows[0].email);
            }
        } catch (e) {
            console.error('resolveOrganizerIdentity error:', e.message);
        }
    }
    // Anlaesse, bei denen die Identitaet Mitorganisator ist (event_organizers):
    // Mitglieder ueber member_id, Externe ueber ihre E-Mail (wie organizer_email).
    let mitAnlaesse = [];
    if (memberId || emails.size > 0) {
        try {
            const r = await pool.query(
                `SELECT DISTINCT event_id::text AS id FROM event_organizers
                  WHERE ($1::uuid IS NOT NULL AND member_id = $1::uuid)
                     OR (member_id IS NULL AND LOWER(email) = ANY($2::text[]))`,
                [memberId, [...emails]]);
            mitAnlaesse = r.rows.map(x => x.id);
        } catch (e) {
            console.error('resolveOrganizerIdentity (Mitorganisatoren) error:', e.message);
        }
    }
    return { memberId, emails: [...emails], mitAnlaesse };
}

// DEUTSCH: Ist die Identitaet HAUPT-Organisator des Event-Rows?
// (organizer_id-Match ODER eine der bekannten E-Mails == organizer_email).
// Nur er (und der Vorstand) verwaltet die Mitorganisatoren.
function istHauptorganisator(identity, event) {
    if (!identity || !event) return false;
    if (identity.memberId && event.organizer_id &&
        String(event.organizer_id) === String(identity.memberId)) return true;
    const oe = (event.organizer_email || '').toLowerCase();
    return oe !== '' && identity.emails.includes(oe);
}

// DEUTSCH: Prueft ob die aufgeloeste Identitaet Organisator des Event-Rows ist:
// Haupt-Organisator oder Mitorganisator (gleiche Rechte). Der Event-Row
// braucht dafuer `id`.
function isOrganizerIdentityMatch(identity, event) {
    if (istHauptorganisator(identity, event)) return true;
    return !!identity && !!event && event.id != null &&
        (identity.mitAnlaesse || []).includes(String(event.id));
}

// DEUTSCH: E-Mail-Adressen aller Mitorganisatoren eines Anlasses (Mitglieder:
// members.email, Externe: ihre E-Mail) — fuer Benachrichtigungen.
async function mitorganisatorenEmails(eventId) {
    try {
        const r = await pool.query(
            `SELECT COALESCE(NULLIF(TRIM(m.email), ''), o.email) AS email
               FROM event_organizers o
               LEFT JOIN members m ON m.id = o.member_id
              WHERE o.event_id = $1
              ORDER BY o.created_at, o.id`,
            [eventId]);
        return r.rows.map(x => x.email).filter(Boolean);
    } catch (e) {
        console.error('mitorganisatorenEmails:', e.message);
        return [];
    }
}

app.get('/events/organized-by-me', authenticateAny, async (req, res) => {
    try {
        const identity = await resolveOrganizerIdentity(req);
        if (identity.emails.length === 0 && !identity.memberId) return res.json([]);
        const result = await pool.query(
            `SELECT * FROM events
              WHERE ( LOWER(organizer_email) = ANY($1::text[])
                      OR ($2::uuid IS NOT NULL AND organizer_id = $2::uuid)
                      OR id = ANY($3::uuid[]) )
                AND (status IS NULL OR status NOT IN ('proposed', 'rejected'))
                -- ohne Enddatum zaehlt der Beginn — sonst blieben eintaegige
                -- Anlaesse ohne end_date fuer immer "aktuell"
                AND COALESCE(end_date, start_date) >= NOW() - INTERVAL '7 days'
              ORDER BY start_date ASC`,
            [identity.emails, identity.memberId, identity.mitAnlaesse]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Organisator-Uebersicht fuer die Apps — ein Aufruf statt einer
// Abfrage pro Anlass (Punkt 6 in docs/flutter-mitglieder-app-plan.md). Pro
// Anlass: Zeile, Schichten und app-Block wie GET /events, dazu
// organisator { aktuell, zahlen, aktionen, anmeldungen } mit anzeigefertigen
// Anmeldungen (src/organisator-ansicht.js).
//
// Wer was sieht:
//  - Organisator-Login (POST /events/login): genau sein Anlass, solange er
//    nicht vorbei oder abgesagt ist.
//  - Vorstand/Admin: alle aktuellen Anlaesse; mit ?vergangene=true dazu die
//    vergangenen der letzten 24 Monate (neuste zuerst, nach den aktuellen),
//    mit demselben organisator-Block - voll verwaltbar. Fuer alle anderen
//    wird der Parameter ignoriert.
//  - Mitglied: die Anlaesse, die es organisiert (gleiche Regel wie
//    GET /events/organized-by-me) — aktuelle und die der letzten 7 Tage.
//  - sonst: leere Liste. Kontaktdaten der Angemeldeten bekommt nur, wer den
//    Anlass organisiert (test/datenschutz.test.js).
// Wie weit der Vorstand mit ?vergangene=true zurueckschaut.
const VERGANGENE_MONATE = 24;

async function organisatorUebersichtZugang(req, res, next) {
    const orgToken = eventOrganisatorToken(req);
    if (orgToken) {
        req.organisatorLogin = orgToken;
        return next();
    }
    return authenticateAny(req, res, next);
}

// identity (nur zugang 'mitglied'): wer anfragt — der Haupt-Organisator darf
// die Mitorganisatoren verwalten, ein Mitorganisator nicht.
async function anlaesseFuerUebersicht(where, params, zugang, identity = null) {
    const zeit = appAnsicht.jetzt();
    const events = (await pool.query(
        `SELECT e.*,
                COALESCE(NULLIF(TRIM(CONCAT(m.vorname, ' ', m.nachname)), ''), e.organizer_name) AS organizer_name
           FROM events e
           LEFT JOIN members m ON e.organizer_id = m.id
          WHERE ${where}
            AND (e.status IS NULL OR e.status NOT IN ('proposed', 'rejected'))`,
        params)).rows;
    if (events.length === 0) return [];
    const ids = events.map(e => e.id);
    const [shifts, regs] = await Promise.all([
        pool.query('SELECT * FROM shifts WHERE event_id = ANY($1::uuid[]) ORDER BY date, start_time, id', [ids]),
        pool.query(
            `SELECT r.*, m.vorname AS member_vorname, m.nachname AS member_nachname,
                    m.email AS member_email, m.mobile AS member_mobile, m.telefon AS member_telefon
               FROM registrations r
               LEFT JOIN members m ON r.member_id = m.id
              WHERE r.event_id = ANY($1::uuid[])
              ORDER BY r.created_at, r.id`,
            [ids])
    ]);
    return organisatorAnsicht.anlaesseSortieren(events.map(e => organisatorAnsicht.anlassFuerOrganisator(
        { ...e, shifts: shifts.rows.filter(s => s.event_id === e.id) },
        regs.rows.filter(r => r.event_id === e.id),
        {
            zugang, zeit,
            organisatorenVerwalten: zugang === 'vorstand' ||
                (zugang === 'mitglied' && istHauptorganisator(identity, e))
        })));
}

app.get('/events/organisator-uebersicht', organisatorUebersichtZugang, async (req, res) => {
    try {
        const zeit = appAnsicht.jetzt();
        const heute = appAnsicht.zuerich(zeit).datum;
        // Letzter Tag (Ende, sonst Beginn) als Datum — Ortszeit wie gespeichert.
        const letzterTag = `COALESCE(e.end_date, e.start_date)::date`;

        if (req.organisatorLogin) {
            const ev = await pool.query('SELECT id, status, start_date, end_date, datum_offen FROM events WHERE id = $1',
                [req.organisatorLogin.event_id]);
            const gesperrt = organisatorAnsicht.organisatorLoginGesperrt(ev.rows[0], zeit);
            if (gesperrt) return res.status(401).json({ error: gesperrt, code: 'anlass_vorbei' });
            if (!(await organisatorLoginGueltig(req.organisatorLogin))) {
                return res.status(401).json({ error: 'Der Zugang wurde entfernt.', code: 'zugang_entfernt' });
            }
            const anlaesse = await anlaesseFuerUebersicht('e.id = $1', [ev.rows[0].id], 'organisator-login');
            return res.json({ zugang: 'organisator-login', anlaesse });
        }

        if (istVorstandBenutzer(req.user)) {
            const vergangene = req.query.vergangene === 'true';
            // Ohne Parameter ab heute, sonst ab heute vor 24 Monaten.
            const ab = vergangene ? `($1::date - INTERVAL '${VERGANGENE_MONATE} months')::date` : '$1::date';
            const anlaesse = await anlaesseFuerUebersicht(
                `(e.datum_offen IS TRUE OR ${letzterTag} >= ${ab})`, [heute], 'vorstand');
            return res.json({ zugang: 'vorstand', vergangene, anlaesse });
        }

        const identity = await resolveOrganizerIdentity(req);
        if (identity.emails.length === 0 && !identity.memberId) return res.json({ zugang: 'mitglied', anlaesse: [] });
        const anlaesse = await anlaesseFuerUebersicht(
            `( LOWER(e.organizer_email) = ANY($1::text[])
               OR ($2::uuid IS NOT NULL AND e.organizer_id = $2::uuid)
               OR e.id = ANY($4::uuid[]) )
             AND (e.datum_offen IS TRUE OR ${letzterTag} >= $3::date - 7)`,
            [identity.emails, identity.memberId, heute, identity.mitAnlaesse], 'mitglied', identity);
        res.json({ zugang: 'mitglied', anlaesse });
    } catch (error) {
        console.error('GET /events/organisator-uebersicht error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Ein Anlass als .ics-Datei ("Zum Kalender"). Oeffentlich wie
// GET /events/:id; nicht fuer Anlaesse mit "Datum noch offen" (404).
app.get('/events/:id/ics', async (req, res) => {
    try {
        const { id } = req.params;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const r = await pool.query(
            `SELECT id, title, subtitle, description, location, start_date, end_date, status, datum_offen
               FROM events WHERE ${uuidRegex.test(id) ? 'id = $1' : 'slug = $1'}
                AND (status IS NULL OR status NOT IN ('proposed', 'rejected'))`,
            [id]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Anlass nicht gefunden' });
        const ics = anlassIcs(r.rows[0]);
        if (!ics) return res.status(404).json({ error: 'Das Datum steht noch nicht fest.' });
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${icsDateiname(r.rows[0])}"`);
        res.send(ics);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Anmeldungen fuer ein Event, das der eingeloggte User organisiert.
// Erlaubt Mitgliedern (per E-Mail-Match auf event.organizer_email) Anmeldungen zu sehen,
// ohne dass sie sich mit dem Event-Token einloggen muessen.
app.get('/events/:id/organizer-registrations', authenticateAny, async (req, res) => {
    try {
        const { id } = req.params;
        const isPrivileged = hatRolle(req.user, 'vorstand', 'admin');

        const event = await pool.query('SELECT id, organizer_email, organizer_id FROM events WHERE id = $1', [id]);
        if (event.rows.length === 0) return res.status(404).json({ error: 'Event nicht gefunden' });

        let isOrganizer = false;
        if (!isPrivileged) {
            const identity = await resolveOrganizerIdentity(req);
            isOrganizer = isOrganizerIdentityMatch(identity, event.rows[0]);
        }
        if (!isPrivileged && !isOrganizer) {
            return res.status(403).json({ error: 'Kein Zugriff auf dieses Event' });
        }

        const regs = await pool.query(
            `SELECT r.*, m.vorname AS member_vorname, m.nachname AS member_nachname
             FROM registrations r
             LEFT JOIN members m ON r.member_id = m.id
             WHERE r.event_id = $1
             ORDER BY r.created_at DESC`,
            [id]
        );
        for (const reg of regs.rows) {
            if (reg.notes) {
                try { reg.parsed_notes = JSON.parse(reg.notes); } catch (_) { /* keep raw */ }
            }
        }
        res.json(regs.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Anmeldung als Event-Organisator (per E-Mail-Match) genehmigen.
app.post('/events/:eventId/registrations/:regId/approve-as-organizer', authenticateAny, async (req, res) => {
    return organizerActOnRegistration(req, res, 'approved');
});

// DEUTSCH: Anmeldung als Event-Organisator ablehnen.
app.post('/events/:eventId/registrations/:regId/reject-as-organizer', authenticateAny, async (req, res) => {
    return organizerActOnRegistration(req, res, 'rejected');
});

// DEUTSCH: Hilfs-Funktion fuer organisator-auth (E-Mail-Match auf event.organizer_email
// oder Vorstand/Admin). Setzt req.event als Side-Effect.
async function ensureOrganizerAccess(req, res, eventId) {
    const isPrivileged = hatRolle(req.user, 'vorstand', 'admin');
    const event = await pool.query('SELECT id, title, organizer_email, organizer_id FROM events WHERE id = $1', [eventId]);
    if (event.rows.length === 0) { res.status(404).json({ error: 'Event nicht gefunden' }); return null; }
    let isOrganizer = false;
    if (!isPrivileged) {
        const identity = await resolveOrganizerIdentity(req);
        isOrganizer = isOrganizerIdentityMatch(identity, event.rows[0]);
    }
    if (!isPrivileged && !isOrganizer) {
        res.status(403).json({ error: 'Kein Zugriff auf dieses Event' });
        return null;
    }
    return event.rows[0];
}

// ============================================================
// DEUTSCH: Mitorganisatoren (src/mitorganisatoren.js, Tabelle event_organizers).
//  - GET    /events/:id/organizers         alle Organisatoren (Vorstand + alle Organisatoren)
//  - POST   /events/:id/organizers         { member_id } oder { name, email } (extern, mit Login)
//  - DELETE /events/:id/organizers/:orgId  entfernt; ein Login gilt ab sofort nicht mehr
// Hinzufuegen/entfernen: Vorstand und Haupt-Organisator. Den Haupt-Organisator
// aendert weiterhin nur der Vorstand (PUT /events/:id).
// ============================================================
async function ensureMitorganisatorenSchema() {
    for (const sql of mitorganisatoren.SCHEMA_SQL) await pool.query(sql);
}

// Vorstand/Admin oder Haupt-Organisator — sonst 403 (null zurueck).
async function ensureOrganisatorenVerwalten(req, res, eventId) {
    const event = await pool.query(
        `SELECT e.id, e.title, e.slug, e.start_date, e.end_date, e.location, e.image_url,
                e.organizer_email, e.organizer_id, e.organizer_name,
                NULLIF(TRIM(CONCAT(m.vorname, ' ', m.nachname)), '') AS organizer_member_name
           FROM events e LEFT JOIN members m ON m.id = e.organizer_id
          WHERE e.id = $1`, [eventId]);
    if (event.rows.length === 0) { res.status(404).json({ error: 'Event nicht gefunden' }); return null; }
    if (hatRolle(req.user, 'vorstand', 'admin')) return event.rows[0];
    const identity = await resolveOrganizerIdentity(req);
    if (!istHauptorganisator(identity, event.rows[0])) {
        res.status(403).json({ error: 'Mitorganisatoren verwalten nur der Vorstand und der Haupt-Organisator' });
        return null;
    }
    return event.rows[0];
}

const UUID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

app.get('/events/:id/organizers', authenticateAny, async (req, res) => {
    try {
        if (!UUID_MUSTER.test(req.params.id)) return res.status(404).json({ error: 'Event nicht gefunden' });
        const event = await ensureOrganizerAccess(req, res, req.params.id);
        if (!event) return;
        const [haupt, liste] = await Promise.all([
            pool.query(
                `SELECT e.organizer_id, e.organizer_email, e.organizer_name,
                        NULLIF(TRIM(CONCAT(m.vorname, ' ', m.nachname)), '') AS member_name, m.email AS member_email
                   FROM events e LEFT JOIN members m ON m.id = e.organizer_id WHERE e.id = $1`, [event.id]),
            pool.query(
                `SELECT o.*, m.vorname AS member_vorname, m.nachname AS member_nachname, m.email AS member_email
                   FROM event_organizers o LEFT JOIN members m ON m.id = o.member_id
                  WHERE o.event_id = $1 ORDER BY o.created_at, o.id`, [event.id])
        ]);
        const h = haupt.rows[0] || {};
        const hatHaupt = !!(h.organizer_id || h.member_name || h.organizer_name || h.organizer_email);
        let darfVerwalten = hatRolle(req.user, 'vorstand', 'admin');
        if (!darfVerwalten) darfVerwalten = istHauptorganisator(await resolveOrganizerIdentity(req), event);
        res.json({
            hauptorganisator: hatHaupt ? {
                member_id: h.organizer_id || null,
                name: h.member_name || h.organizer_name || h.organizer_email,
                email: h.organizer_email || h.member_email || null
            } : null,
            mitorganisatoren: liste.rows.map(mitorganisatoren.eintragAnsicht),
            darf_verwalten: darfVerwalten
        });
    } catch (error) {
        console.error('GET /events/:id/organizers error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/events/:id/organizers', authenticateAny, async (req, res) => {
    try {
        if (!UUID_MUSTER.test(req.params.id)) return res.status(404).json({ error: 'Event nicht gefunden' });
        const event = await ensureOrganisatorenVerwalten(req, res, req.params.id);
        if (!event) return;
        const { member_id } = req.body || {};
        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
        const von = req.user?.email || req.user?.name || 'Unbekannt';
        const eventUrl = `https://fwv-raura.ch/events.html?event=${event.slug || event.id}`;
        const hauptName = event.organizer_member_name || event.organizer_name || null;

        if (member_id) {
            // Mitglied: verwaltet den Anlass in der Mitglieder-App, kein eigener Login.
            if (!UUID_MUSTER.test(String(member_id))) return res.status(400).json({ error: 'Ungueltige Mitglieds-ID' });
            const m = await pool.query('SELECT id, vorname, nachname, email FROM members WHERE id = $1', [member_id]);
            if (m.rows.length === 0) return res.status(404).json({ error: 'Mitglied nicht gefunden' });
            if (event.organizer_id && String(event.organizer_id) === String(member_id)) {
                return res.status(409).json({ error: 'Das Mitglied ist bereits Haupt-Organisator' });
            }
            const mitglied = m.rows[0];
            const ins = await pool.query(
                `INSERT INTO event_organizers (event_id, member_id, created_by)
                 VALUES ($1, $2, $3)
                 ON CONFLICT DO NOTHING
                 RETURNING *`, [event.id, member_id, von]);
            if (ins.rows.length === 0) return res.status(409).json({ error: 'Das Mitglied ist bereits Mitorganisator' });
            const name = [mitglied.vorname, mitglied.nachname].filter(Boolean).join(' ');
            pushToMember(member_id, 'event_update', `Mitorganisator/in: ${event.title}`,
                'Du kannst den Anlass jetzt in der App unter "Organisator" verwalten.', { eventId: event.id })
                .catch(() => {});
            if (mitglied.email) {
                axios.post(`${DISPATCH_API}/email/send`, mitAnlassLogo(event, {
                    to: mitglied.email,
                    ...mitorganisatoren.mitgliedMail({ name, titel: event.title, eventUrl, hauptorganisator: hauptName }),
                    event_id: event.id,
                    sammeln: true
                })).catch(e => console.error('Mitorganisator-Mail fehlgeschlagen:', e.message));
            }
            return res.status(201).json(mitorganisatoren.eintragAnsicht({
                ...ins.rows[0], member_vorname: mitglied.vorname, member_nachname: mitglied.nachname,
                member_email: mitglied.email
            }));
        }

        // Extern: eigener Login (E-Mail + Passwort) fuers Event-Dashboard,
        // Zugangsdaten per E-Mail — wie beim externen Haupt-Organisator.
        if (!name || !mitorganisatoren.emailGueltig(email)) {
            return res.status(400).json({ error: 'Mitglied oder Name und gueltige E-Mail erforderlich' });
        }
        if ((event.organizer_email || '').trim().toLowerCase() === email.toLowerCase()) {
            return res.status(409).json({ error: 'Diese E-Mail gehoert dem Haupt-Organisator' });
        }
        const passwort = mitorganisatoren.neuesPasswort();
        const bis = mitorganisatoren.zugangBis(event);
        const ins = await pool.query(
            `INSERT INTO event_organizers (event_id, name, email, password_hash, access_expires, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT DO NOTHING
             RETURNING *`,
            [event.id, name.slice(0, 200), email.toLowerCase().slice(0, 200),
                mitorganisatoren.passwortHashen(passwort), bis, von]);
        if (ins.rows.length === 0) return res.status(409).json({ error: 'Diese E-Mail ist bereits Mitorganisator' });
        let mailGesendet = true;
        try {
            await passwortLinkSenden({
                eventId: event.id, organizerId: ins.rows[0].id, an: email, name, titel: event.title,
                loginEmail: email.toLowerCase(), gueltigBis: bis, rolle: 'Mitorganisator'
            });
        } catch (e) {
            mailGesendet = false;
            console.error('Mitorganisator-Zugangsdaten nicht gesendet:', e.message);
        }
        res.status(201).json({ ...mitorganisatoren.eintragAnsicht(ins.rows[0]), zugang_gesendet: mailGesendet });
    } catch (error) {
        console.error('POST /events/:id/organizers error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/events/:id/organizers/:orgId', authenticateAny, async (req, res) => {
    try {
        if (!UUID_MUSTER.test(req.params.id) || !UUID_MUSTER.test(req.params.orgId)) {
            return res.status(404).json({ error: 'Nicht gefunden' });
        }
        const event = await ensureOrganisatorenVerwalten(req, res, req.params.id);
        if (!event) return;
        const del = await pool.query(
            'DELETE FROM event_organizers WHERE id = $1 AND event_id = $2 RETURNING id',
            [req.params.orgId, event.id]);
        if (del.rows.length === 0) return res.status(404).json({ error: 'Mitorganisator nicht gefunden' });
        res.json({ success: true });
    } catch (error) {
        console.error('DELETE /events/:id/organizers error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Anmeldung als Event-Organisator bearbeiten.
// Erlaubt: guest_name, guest_email, guest_phone, participants, notes, status,
// shift_ids (ersetzt die Schichten; [] oder null = ohne Schicht; geprueft wie
// beim Eintragen, src/schicht-eintrag.js). Felder die nicht im Body sind,
// bleiben unveraendert.
app.put('/events/:eventId/registrations/:regId/as-organizer', authenticateAny, async (req, res) => {
    try {
        const { eventId, regId } = req.params;
        const event = await ensureOrganizerAccess(req, res, eventId);
        if (!event) return;

        const existing = await pool.query(
            'SELECT * FROM registrations WHERE id = $1 AND event_id = $2',
            [regId, eventId]
        );
        if (existing.rows.length === 0) return res.status(404).json({ error: 'Anmeldung nicht gefunden' });
        const reg = existing.rows[0];

        const { guest_name, guest_email, guest_phone, participants, notes, status } = req.body || {};

        const schichten = await schichtenPruefen(pool, {
            eventId, shiftIds: (req.body || {}).shift_ids,
            memberId: reg.member_id, email: guest_email ?? reg.guest_email, ausser: regId
        });
        if (schichten.fehler) return res.status(schichten.fehler.status).json(schichten.fehler.body);

        // notes ist JSON {phone, participants, notes} — wir mergen
        let notesJson = {};
        try { notesJson = typeof reg.notes === 'string' ? JSON.parse(reg.notes) : (reg.notes || {}); } catch (_) { notesJson = {}; }
        if (guest_phone !== undefined) notesJson.phone = guest_phone;
        if (participants !== undefined) notesJson.participants = participants;
        if (notes !== undefined) notesJson.notes = notes;

        const result = await pool.query(`
            UPDATE registrations SET
                guest_name  = COALESCE($1, guest_name),
                guest_email = COALESCE($2, guest_email),
                notes       = $3,
                status      = COALESCE($4, status),
                shift_ids   = CASE WHEN $7::boolean THEN $8::uuid[] ELSE shift_ids END
            WHERE id = $5 AND event_id = $6
            RETURNING *
        `, [
            guest_name ?? null,
            guest_email ?? null,
            JSON.stringify(notesJson),
            status ?? null,
            regId, eventId,
            schichten.angegeben,
            schichten.angegeben ? schichten.shiftIds : null
        ]);

        res.json({ success: true, registration: result.rows[0], warnung: schichten.warnung ?? null });

        const updated = result.rows[0];
        const statusChanged = status && status !== existing.rows[0].status;
        const action = statusChanged
            ? (status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'updated')
            : 'updated';
        notifyRegistrationChange({
            eventId, eventTitle: event.title,
            memberId: updated?.member_id, guestName: updated?.guest_name, guestEmail: updated?.guest_email,
            shiftIds: updated?.shift_ids,
            action
        }).catch(() => {});
        // Status-Wechsel approved -> nicht-approved kann Platz freimachen
        if (statusChanged && existing.rows[0].status === 'approved' && status !== 'approved') {
            notifySlotFreed({ eventId, prevStatus: 'approved', freedPersons: registrationPersons(existing.rows[0]) }).catch(() => {});
        }
    } catch (error) {
        console.error('PUT registrations as-organizer failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Anmeldung als Event-Organisator loeschen.
app.delete('/events/:eventId/registrations/:regId/as-organizer', authenticateAny, async (req, res) => {
    try {
        const { eventId, regId } = req.params;
        const event = await ensureOrganizerAccess(req, res, eventId);
        if (!event) return;

        // Vor dem DELETE Member-/Guest-Daten holen — nach dem DELETE haben wir nichts mehr.
        const before = await pool.query(
            'SELECT member_id, guest_name, guest_email, status, notes, shift_ids FROM registrations WHERE id = $1 AND event_id = $2',
            [regId, eventId]
        );
        if (before.rows.length === 0) return res.status(404).json({ error: 'Anmeldung nicht gefunden' });

        await pool.query(
            'DELETE FROM registrations WHERE id = $1 AND event_id = $2',
            [regId, eventId]
        );
        res.json({ success: true, deleted_id: regId });

        notifyRegistrationChange({
            eventId, eventTitle: event.title,
            memberId: before.rows[0].member_id,
            guestName: before.rows[0].guest_name, guestEmail: before.rows[0].guest_email,
            shiftIds: before.rows[0].shift_ids,
            action: 'deleted'
        }).catch(() => {});
        notifySlotFreed({ eventId, prevStatus: before.rows[0].status, freedPersons: registrationPersons(before.rows[0]) }).catch(() => {});
    } catch (error) {
        console.error('DELETE registrations as-organizer failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Anmeldung als Event-Organisator (per E-Mail-Match) hinzufuegen.
// Fuer Gaeste die telefonisch / persoenlich gemeldet haben — Status direkt 'approved'.
app.post('/events/:id/registrations-as-organizer', authenticateAny, async (req, res) => {
    try {
        const { id } = req.params;
        const isPrivileged = hatRolle(req.user, 'vorstand', 'admin');

        const event = await pool.query('SELECT id, organizer_email, organizer_id FROM events WHERE id = $1', [id]);
        if (event.rows.length === 0) return res.status(404).json({ error: 'Event nicht gefunden' });

        let isOrganizer = false;
        if (!isPrivileged) {
            const identity = await resolveOrganizerIdentity(req);
            isOrganizer = isOrganizerIdentityMatch(identity, event.rows[0]);
        }
        if (!isPrivileged && !isOrganizer) {
            return res.status(403).json({ error: 'Kein Zugriff auf dieses Event' });
        }

        const { member_id, guest_name, guest_email, guest_phone, participants, notes } = req.body || {};
        if (!member_id && !guest_name) {
            return res.status(400).json({ error: 'Mitglied oder Gastname erforderlich' });
        }

        // Optional gleich in Schichten eintragen (src/schicht-eintrag.js).
        const schichten = await schichtenPruefen(pool, {
            eventId: id, shiftIds: (req.body || {}).shift_ids, memberId: member_id || null, email: guest_email
        });
        if (schichten.fehler) return res.status(schichten.fehler.status).json(schichten.fehler.body);

        // Teilnehmer ohne Schicht: dieselbe Person nicht zweimal
        // (src/doppelte-anmeldung.js) - 409, von Hand ist es ein Versehen.
        const teilnahme = doppelteAnmeldung.istTeilnahme(schichten.shiftIds);
        const eintrag = await doppelteAnmeldung.mitAnmeldeSperre(pool, id, async (db) => {
            if (teilnahme) {
                const bestehend = await doppelteAnmeldung.bestehendeTeilnahme(db, {
                    eventId: id, memberId: member_id || null, email: guest_email || '', name: guest_name || ''
                });
                if (bestehend) return { bestehend };
            }
            const r = await db.query(`
                INSERT INTO registrations (event_id, member_id, guest_name, guest_email, shift_ids, notes, status, approved_by, approved_at)
                VALUES ($1, $2, $3, $4, $5, $6, 'approved', $7, NOW())
                RETURNING *
            `, [
                id,
                member_id || null,
                guest_name || '',
                guest_email || '',
                schichten.shiftIds ?? null,
                JSON.stringify({ phone: guest_phone, participants: participants || 1, notes }),
                req.user.email || req.user.name || 'organizer'
            ]);
            return { reg: r.rows[0] };
        });
        if (eintrag.bestehend) {
            return res.status(409).json({
                error: doppelteAnmeldung.hinweisVorstand(eintrag.bestehend),
                code: 'bereits_angemeldet',
                registration: eintrag.bestehend
            });
        }
        res.json({ success: true, registration: eintrag.reg, warnung: schichten.warnung ?? null });

        const ev = await pool.query('SELECT title FROM events WHERE id=$1', [id]);
        const newReg = eintrag.reg;
        notifyRegistrationChange({
            eventId: id, eventTitle: ev.rows[0]?.title || 'Event',
            memberId: newReg.member_id,
            guestName: newReg.guest_name, guestEmail: newReg.guest_email,
            shiftIds: newReg.shift_ids,
            action: 'added'
        }).catch(() => {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// DEUTSCH: Organisator-Endpunkte fuer Event- und Schicht-Verwaltung.
// Autorisierung ueber ensureOrganizerAccess (E-Mail-Match auf
// event.organizer_email oder Vorstand/Admin-Gruppe). Organisatoren duerfen den
// INHALT ihres Events pflegen, aber NICHT Organisator/Zugang/Passwort/Slug.
// ============================================================

// Organisator: Event-Grunddaten bearbeiten (eingeschraenkte Feldliste).
app.put('/events/:id/as-organizer', authenticateAny, async (req, res) => {
    try {
        const { id } = req.params;
        const event = await ensureOrganizerAccess(req, res, id);
        if (!event) return; // 403/404 bereits gesendet

        // Bewusst OHNE slug/organizer_*/event_email/event_password_hash/
        // event_access_expires/image_url/tags — die bleiben Vorstand/Admin vorbehalten.
        const allowedFields = [
            'title', 'subtitle', 'description', 'start_date', 'end_date',
            'location', 'category', 'registration_required', 'registration_deadline',
            'max_participants', 'cost', 'status',
            'meal_options', 'pdf_attachment', 'pdf_filename'
        ];
        const filteredUpdates = {};
        for (const [key, value] of Object.entries(req.body || {})) {
            if (allowedFields.includes(key)) filteredUpdates[key] = jsonbWert(key, value);
        }
        const fields = Object.keys(filteredUpdates);
        const values = Object.values(filteredUpdates);
        if (fields.length === 0) {
            return res.status(400).json({ error: 'Keine gueltigen Felder zum Aktualisieren' });
        }
        const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
        values.push(id);
        const vorher = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
        const result = await pool.query(`
            UPDATE events SET ${setClause}, updated_at = NOW()
            WHERE id = $${values.length}
            RETURNING *
        `, values);
        // Erst jetzt zur Anmeldung offen: alle Mitglieder informieren.
        if (result.rows[0] && !anmeldungOffen(vorher.rows[0])) {
            anmeldungOffenMelden(result.rows[0], 'Anmeldung offen');
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('PUT /events/:id/as-organizer error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Organisator: Schicht zu einem organisierten Event hinzufuegen.
app.post('/events/:id/shifts-as-organizer', authenticateAny, async (req, res) => {
    try {
        const { id } = req.params;
        const event = await ensureOrganizerAccess(req, res, id);
        if (!event) return;
        const { name, description, date, start_time, end_time, needed, bereich } = req.body || {};
        if (!name) return res.status(400).json({ error: 'name ist ein Pflichtfeld' });
        if (!date) return res.status(400).json({ error: 'date ist ein Pflichtfeld' });
        const result = await pool.query(`
            INSERT INTO shifts (event_id, name, description, date, start_time, end_time, needed, bereich)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [id, name, description, date, start_time, end_time, needed, bereich || 'Allgemein']);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('POST /events/:id/shifts-as-organizer error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Organisator: Schicht eines organisierten Events bearbeiten (+ Registrierte benachrichtigen).
app.put('/events/:eventId/shifts/:shiftId/as-organizer', authenticateAny, async (req, res) => {
    try {
        const { eventId, shiftId } = req.params;
        const event = await ensureOrganizerAccess(req, res, eventId);
        if (!event) return;
        const oldShiftResult = await pool.query('SELECT * FROM shifts WHERE id = $1', [shiftId]);
        if (oldShiftResult.rows.length === 0) return res.status(404).json({ error: 'Shift not found' });
        const oldShift = oldShiftResult.rows[0];
        if (oldShift.event_id !== eventId) return res.status(403).json({ error: 'Schicht gehoert nicht zu diesem Event' });
        const { name, description, date, start_time, end_time, needed, bereich } = req.body || {};
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
        `, [name, description, date, start_time, end_time, needed, bereich, shiftId]);
        const updatedShift = result.rows[0];
        const evFull = await pool.query('SELECT * FROM events WHERE id = $1', [eventId]);
        const notificationResult = await notifyShiftRegistrations(updatedShift, evFull.rows[0], 'updated', oldShift);
        res.json({ ...updatedShift, notifications: notificationResult });
    } catch (error) {
        console.error('PUT shift as-organizer error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Organisator: Schicht loeschen (+ Registrierte ueber Absage benachrichtigen).
app.delete('/events/:eventId/shifts/:shiftId/as-organizer', authenticateAny, async (req, res) => {
    try {
        const { eventId, shiftId } = req.params;
        const event = await ensureOrganizerAccess(req, res, eventId);
        if (!event) return;
        const shiftResult = await pool.query('SELECT * FROM shifts WHERE id = $1', [shiftId]);
        if (shiftResult.rows.length === 0) return res.status(404).json({ error: 'Shift not found' });
        const shift = shiftResult.rows[0];
        if (shift.event_id !== eventId) return res.status(403).json({ error: 'Schicht gehoert nicht zu diesem Event' });
        const evFull = await pool.query('SELECT * FROM events WHERE id = $1', [eventId]);
        const notificationResult = await notifyShiftRegistrations(shift, evFull.rows[0], 'deleted');
        await pool.query('DELETE FROM shifts WHERE id = $1', [shiftId]);
        res.json({ message: 'Shift deleted', notifications: notificationResult });
    } catch (error) {
        console.error('DELETE shift as-organizer error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

async function organizerActOnRegistration(req, res, newStatus) {
    try {
        const { eventId, regId } = req.params;
        const isPrivileged = hatRolle(req.user, 'vorstand', 'admin');

        const event = await pool.query('SELECT id, title, organizer_email, organizer_id FROM events WHERE id = $1', [eventId]);
        if (event.rows.length === 0) return res.status(404).json({ error: 'Event nicht gefunden' });

        let isOrganizer = false;
        if (!isPrivileged) {
            const identity = await resolveOrganizerIdentity(req);
            isOrganizer = isOrganizerIdentityMatch(identity, event.rows[0]);
        }
        if (!isPrivileged && !isOrganizer) {
            return res.status(403).json({ error: 'Kein Zugriff auf dieses Event' });
        }

        // Vorherigen Status fuer Slot-Freed-Erkennung mitnehmen
        const prevStatusQ = await pool.query(
            'SELECT status FROM registrations WHERE id = $1 AND event_id = $2',
            [regId, eventId]
        );
        const prevStatus = prevStatusQ.rows[0]?.status;

        const result = await pool.query(
            `UPDATE registrations SET status = $1, approved_by = $2, approved_at = NOW()
             WHERE id = $3 AND event_id = $4
             RETURNING *`,
            [newStatus, req.user.email || req.user.name, regId, eventId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Anmeldung nicht gefunden' });

        const reg = result.rows[0];
        notifyRegistrationChange({
            eventId, eventTitle: event.rows[0].title,
            memberId: reg.member_id, guestName: reg.guest_name, guestEmail: reg.guest_email,
            shiftIds: reg.shift_ids,
            action: newStatus === 'approved' ? 'approved' : 'rejected'
        }).catch(() => {});
        if (prevStatus === 'approved' && newStatus !== 'approved') {
            notifySlotFreed({ eventId, prevStatus, freedPersons: registrationPersons(reg) }).catch(() => {});
        }

        res.json({ success: true, registration: reg });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

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

// DEUTSCH: Registrierung genehmigen (Vorstand). Sendet Bestätigungs-E-Mail und prüft Arbeitsplan-Versand
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

        const ev = await pool.query('SELECT title FROM events WHERE id = $1', [reg.event_id]);
        notifyRegistrationChange({
            eventId: reg.event_id, eventTitle: ev.rows[0]?.title || 'Event',
            memberId: reg.member_id, guestName: reg.guest_name, guestEmail: reg.guest_email,
            shiftIds: reg.shift_ids,
            action: 'approved'
        }).catch(() => {});

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

// DEUTSCH: Registrierung ablehnen (Vorstand). Sendet Ablehnungs-E-Mail mit optionalem Grund
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

        const ev = await pool.query('SELECT title FROM events WHERE id = $1', [reg.event_id]);
        notifyRegistrationChange({
            eventId: reg.event_id, eventTitle: ev.rows[0]?.title || 'Event',
            memberId: reg.member_id, guestName: reg.guest_name, guestEmail: reg.guest_email,
            shiftIds: reg.shift_ids,
            action: 'rejected'
        }).catch(() => {});

        res.json({ success: true, registration: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Alternative Schicht vorschlagen (Vorstand). Sendet E-Mail mit Link zur neuen Schicht
// Kern: schlaegt einer Anmeldung eine alternative Schicht vor (Notes-Update +
// E-Mail mit Accept/Decline-Links + Push). Von Vorstand- und Organisator-Route
// gemeinsam genutzt. `actor` ist die Kennung des Ausloesenden (fuer suggested_by).
// `shiftInfo` darf ein Objekt ({bereich?,name,date,time}) ODER ein fertiges
// Label (String) sein. Wirft { status, error } bei Validierungsfehlern.
async function suggestAlternativeForRegistration(regId, payload, actor) {
    // Die Adresse kommt aus der Anmeldung, nicht vom Client: sonst liesse sich
    // die Mail (Absender Verein) an jede beliebige Adresse schicken.
    const { newShiftId, shiftInfo, comment } = payload || {};
    if (!newShiftId) {
        throw { status: 400, error: 'newShiftId is required' };
    }

    const regResult = await pool.query('SELECT * FROM registrations WHERE id = $1', [regId]);
    if (regResult.rows.length === 0) {
        throw { status: 404, error: 'Registration not found' };
    }
    const reg = regResult.rows[0];
    let email = reg.guest_email || null;
    if (reg.member_id) {
        const m = await pool.query('SELECT email, versand_email FROM members WHERE id = $1', [reg.member_id]);
        email = m.rows[0]?.versand_email || m.rows[0]?.email || email;
    }
    if (!email) {
        throw { status: 400, error: 'Die Anmeldung hat keine E-Mail-Adresse' };
    }

    const eventResult = await pool.query('SELECT title, image_url FROM events WHERE id = $1', [reg.event_id]);
    const eventTitle = eventResult.rows[0]?.title || 'Event';

    const acceptToken = crypto.randomUUID();
    const declineToken = crypto.randomUUID();

    const suggestionData = {
        suggested_shift_id: newShiftId,
        suggested_shift_info: shiftInfo,
        accept_token: acceptToken,
        decline_token: declineToken,
        suggested_at: new Date().toISOString(),
        suggested_by: actor
    };

    await pool.query(`
        UPDATE registrations
        SET notes = COALESCE(notes, '{}')::jsonb || $2::jsonb
        WHERE id = $1
    `, [regId, JSON.stringify({ alternative_suggestion: suggestionData })]);

    // shiftInfo kann ein Objekt (Web/Desktop) oder ein fertiges Label (App) sein
    const shiftLabel = (shiftInfo && typeof shiftInfo === 'object')
        ? (shiftInfo.bereich
            ? `${shiftInfo.bereich} - ${shiftInfo.name} (${shiftInfo.date} ${shiftInfo.time})`
            : `${shiftInfo.name} (${shiftInfo.date} ${shiftInfo.time})`)
        : (shiftInfo ? String(shiftInfo) : 'Alternative Schicht');

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

    await axios.post(`${DISPATCH_API}/email/send`, mitAnlassLogo(eventResult.rows[0] || { title: eventTitle }, {
        to: email,
        subject: `Alternative Schicht vorgeschlagen - ${eventTitle}`,
        body: emailBody,
        sammeln: true
    }));

    if (reg.member_id) {
        pushToMember(
            reg.member_id, 'shift_reminder',
            `Neue Schicht vorgeschlagen: ${eventTitle}`,
            `Schicht: ${shiftLabel}. Bitte in der App oder per E-Mail bestaetigen.`,
            { eventId: reg.event_id }
        ).catch(() => {});
    }

    logInfo('Alternative shift suggested', { registrationId: regId, newShiftId, email, suggestedBy: actor });
    return { success: true, message: 'Vorschlag gesendet', eventId: reg.event_id };
}

// Vorstand/Admin: alternative Schicht vorschlagen.
app.post('/registrations/:id/suggest-alternative', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const result = await suggestAlternativeForRegistration(req.params.id, req.body, req.user.email || req.user.name);
        res.json({ success: result.success, message: result.message });
    } catch (error) {
        if (error && error.status) return res.status(error.status).json({ error: error.error });
        logError('Error suggesting alternative', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Organisator (E-Mail-Match): alternative Schicht vorschlagen (event-scoped).
app.post('/events/:eventId/registrations/:regId/suggest-alternative-as-organizer', authenticateAny, async (req, res) => {
    try {
        const { eventId, regId } = req.params;
        const event = await ensureOrganizerAccess(req, res, eventId);
        if (!event) return; // 403/404 bereits gesendet
        // Sicherstellen, dass die Anmeldung wirklich zu diesem Event gehoert
        const chk = await pool.query('SELECT event_id FROM registrations WHERE id = $1', [regId]);
        if (chk.rows.length === 0) return res.status(404).json({ error: 'Registration not found' });
        if (chk.rows[0].event_id !== eventId) return res.status(403).json({ error: 'Anmeldung gehoert nicht zu diesem Event' });
        const actor = req.user.email || req.user.name;
        const result = await suggestAlternativeForRegistration(regId, req.body, actor);
        res.json({ success: result.success, message: result.message });
    } catch (error) {
        if (error && error.status) return res.status(error.status).json({ error: error.error });
        logError('Error suggesting alternative (organizer)', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Antwort auf Schicht-Alternativvorschlag verarbeiten (Token-basiert, per Link aus E-Mail). Zeigt HTML-Seite mit Ergebnis
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
            // Steht die Person auf der vorgeschlagenen Schicht schon (ueber eine
            // andere Anmeldung), nicht ein zweites Mal eintragen.
            const doppelt = await schichtKonflikte(pool, {
                eventId: reg.event_id, memberId: reg.member_id, email: reg.guest_email,
                shiftIds: [suggestion.suggested_shift_id], ausser: reg.id
            });
            if (doppelt.length > 0) {
                return res.send(`
                    <html>
                    <head><title>Schon eingetragen</title></head>
                    <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                        <h1>Schon eingetragen</h1>
                        <p>Du stehst für diese Schicht bereits auf dem Plan - es ist nichts mehr zu tun.</p>
                    </body>
                    </html>
                `);
            }
            // Zu dieser Zeit schon anderswo eingeteilt? Dann nicht uebernehmen.
            const gleichzeitig = await zeitKonflikte(pool, {
                memberId: reg.member_id, email: reg.guest_email,
                shiftIds: [suggestion.suggested_shift_id], ausser: reg.id
            });
            if (gleichzeitig.length > 0) {
                return res.status(409).send(`
                    <html>
                    <head><meta charset="utf-8"><title>Zeit schon belegt</title></head>
                    <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                        <h1>Zu dieser Zeit schon eingeteilt</h1>
                        <p>${escapeHtml(zeitText(gleichzeitig))}</p>
                        <p>Bitte melde dich beim Organisator, damit er eine andere Lösung findet.</p>
                    </body>
                    </html>
                `);
            }
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

// DEUTSCH: Registrierung bearbeiten (Vorstand). Kann Name, E-Mail, Schichten, Status und Mitglied-Zuordnung ändern
app.put('/registrations/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { guest_name, guest_email, phone, notes, status, member_id, participants } = req.body;
        const shift_ids = eindeutig(req.body.shift_ids);

        if (Array.isArray(shift_ids) && shift_ids.length > 0) {
            const bisher = (await pool.query(
                'SELECT event_id, member_id, guest_email FROM registrations WHERE id = $1', [id])).rows[0];
            if (!bisher) return res.status(404).json({ error: 'Registration not found' });
            const doppelt = await schichtKonflikte(pool, {
                eventId: bisher.event_id,
                memberId: member_id || bisher.member_id,
                email: guest_email ?? bisher.guest_email,
                shiftIds: shift_ids, ausser: id
            });
            if (doppelt.length > 0) {
                return res.status(409).json({
                    error: `Bereits mit einer anderen Anmeldung auf dieser Schicht: ${konfliktText(doppelt)}`,
                    code: 'schicht_doppelt'
                });
            }
            const gleichzeitig = await zeitKonflikte(pool, {
                memberId: member_id || bisher.member_id,
                email: guest_email ?? bisher.guest_email,
                shiftIds: shift_ids, ausser: id
            });
            if (gleichzeitig.length > 0) {
                return res.status(409).json({
                    error: `Gleichzeitig schon eingeteilt: ${zeitText(gleichzeitig)}`,
                    code: 'schicht_gleichzeitig'
                });
            }
        }

        // DEUTSCH: participants/phone werden ins BESTEHENDE notes-JSON gemerged
        // (dort liegen auch companions/allergies/meal — nicht ueberschreiben!).
        // Ein explizit uebergebenes notes hat weiterhin Vorrang (wie bisher).
        let mergedNotes = notes;
        if (mergedNotes === undefined && (participants !== undefined || phone !== undefined)) {
            const cur = await pool.query('SELECT notes FROM registrations WHERE id = $1', [id]);
            if (cur.rows.length === 0) {
                return res.status(404).json({ error: 'Registration not found' });
            }
            let obj = {};
            try {
                obj = cur.rows[0].notes ? JSON.parse(cur.rows[0].notes) : {};
                if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
                    obj = { notes: cur.rows[0].notes };
                }
            } catch (_) {
                // Alte Freitext-Notizen als Bemerkung erhalten
                obj = cur.rows[0].notes ? { notes: cur.rows[0].notes } : {};
            }
            if (participants !== undefined) {
                obj.participants = Math.min(Math.max(parseInt(participants, 10) || 1, 1), 50);
            }
            if (phone !== undefined) obj.phone = String(phone);
            mergedNotes = JSON.stringify(obj);
        }

        const result = await pool.query(`
            UPDATE registrations
            SET guest_name = COALESCE($2, guest_name),
                guest_email = COALESCE($3, guest_email),
                phone = COALESCE($4, phone),
                shift_ids = COALESCE($5, shift_ids),
                notes = COALESCE($6, notes),
                status = COALESCE($7, status),
                member_id = COALESCE($8, member_id)
            WHERE id = $1
            RETURNING *
        `, [id, guest_name, guest_email, phone, shift_ids, mergedNotes, status, member_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Registration not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Registrierung löschen (Vorstand)
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
// DEUTSCH: iCal-Feed fuer Kalender-Abonnement (Google Calendar, Apple, etc.)
// ============================================

/**
 * DEUTSCH: Aggregierter Kalender fuer die Mitglieder-App.
 * Liefert events + Mitgliederbeitrags-Faelligkeiten + bezahlte Beitraege +
 * Briefe/E-Mails (aus dispatch_log).
 *
 * Sichtbarkeitsregeln:
 *  - Mitglieder: events (alle, Titel/Ort/Zeit), eigene Beitraege/Dispatches.
 *    Vorstandsitzungen sehen Mitglieder NUR mit Titel + Datum
 *    (ohne Ort/Zeit/Beschreibung).
 *  - Vorstand/Admin: zusaetzlich alle Beitragszahlungen + alle Dispatches +
 *    volle Vorstandsitzungs-Details.
 *
 * Query-Params: from=YYYY-MM-DD&to=YYYY-MM-DD (default: -12M / +24M).
 */
app.get('/calendar/items', authenticateAny, async (req, res) => {
    try {
        const isPrivileged = hatRolle(req.user, 'vorstand', 'admin');
        // Fertig fuer die Apps: datum_text, sortiert; E-Mails und Briefe nur
        // fuer den Vorstand (src/app-ansicht.js).
        const fertig = items => res.json(appAnsicht.kalenderAnsicht(items, { vorstand: isPrivileged }));
        const today = appAnsicht.jetzt();
        const defaultFrom = new Date(today); defaultFrom.setMonth(defaultFrom.getMonth() - 12);
        const defaultTo   = new Date(today); defaultTo.setMonth(defaultTo.getMonth() + 24);
        const from = req.query.from || defaultFrom.toISOString().substring(0, 10);
        const to   = req.query.to   || defaultTo.toISOString().substring(0, 10);

        const myEmail = (req.user?.email || '').toLowerCase();
        let myId = null;
        if (myEmail) {
            try {
                const m = await pool.query('SELECT id FROM members WHERE LOWER(email) = $1 LIMIT 1', [myEmail]);
                myId = m.rows[0]?.id || null;
            } catch (_) {}
        }

        const items = [];

        // 1) Events — alle nicht-abgesagten. Vorstandsitzungs-Details fuer Mitglieder zensieren.
        try {
            const ev = await pool.query(
                `SELECT id, title, category, description, start_date, end_date, location
                 FROM events
                 WHERE COALESCE(end_date, start_date)::date >= $1::date
                   AND start_date::date <= $2::date
                   AND COALESCE(status, '') <> 'cancelled'
                   -- "Datum noch offen": das Datum ist nur ein Platzhalter
                   AND datum_offen IS NOT TRUE`,
                [from, to]
            );
            for (const e of ev.rows) {
                if (!e.start_date) continue;
                const isBoardMeeting = (e.category || '').toLowerCase().includes('vorstand');
                const subtitle = (() => {
                    if (isBoardMeeting && !isPrivileged) return null;
                    const parts = [];
                    // start_date ist ein timestamp — Uhrzeit extrahieren wenn nicht 00:00
                    const ts = String(e.start_date);
                    const match = ts.match(/T(\d{2}:\d{2})/) || ts.match(/ (\d{2}:\d{2})/);
                    if (match && match[1] !== '00:00') parts.push(match[1]);
                    if (e.location) parts.push(e.location);
                    return parts.join(' · ') || null;
                })();
                const description = (isBoardMeeting && !isPrivileged) ? null : e.description;
                items.push({
                    id: 'event:' + e.id,
                    type: isBoardMeeting ? 'board_meeting' : 'event',
                    date: String(e.start_date).substring(0, 10),
                    title: e.title || 'Anlass',
                    subtitle,
                    description: description || null,
                    refId: e.id
                });
            }
        } catch (err) { console.error('calendar events query failed:', err.message); }

        // 2) Mitgliederbeitrag-Faelligkeiten
        try {
            const settings = await pool.query(
                `SELECT year, due_date, amount FROM membership_fee_settings
                 WHERE due_date BETWEEN $1::date AND $2::date`,
                [from, to]
            );
            for (const s of settings.rows) {
                items.push({
                    id: 'fee_due:' + s.year,
                    type: 'fee_due',
                    date: String(s.due_date).substring(0, 10),
                    title: `Mitgliederbeitrag ${s.year} faellig`,
                    subtitle: `CHF ${Number(s.amount).toFixed(2)}`,
                    refId: String(s.year)
                });
            }
        } catch (_) {}

        // 3) Bezahlte Beitraege
        try {
            const paidParams = [from, to];
            let paidWhere = `p.paid_date BETWEEN $1::date AND $2::date AND p.status = 'paid'`;
            if (!isPrivileged) {
                if (!myId) return fertig(items);
                paidWhere += ' AND p.member_id = $3';
                paidParams.push(myId);
            }
            const paid = await pool.query(
                `SELECT p.year, p.paid_date, p.amount, p.member_id, m.vorname, m.nachname
                 FROM membership_fee_payments p
                 LEFT JOIN members m ON p.member_id = m.id
                 WHERE ${paidWhere}`,
                paidParams
            );
            for (const p of paid.rows) {
                const name = `${p.vorname || ''} ${p.nachname || ''}`.trim();
                items.push({
                    id: 'fee_paid:' + p.year + ':' + p.member_id,
                    type: 'fee_paid',
                    date: String(p.paid_date).substring(0, 10),
                    title: isPrivileged && name
                        ? `${name}: Beitrag ${p.year} bezahlt`
                        : `Beitrag ${p.year} bezahlt`,
                    subtitle: `CHF ${Number(p.amount).toFixed(2)}`,
                    refId: String(p.year)
                });
            }
        } catch (_) {}

        // 4) Versendete Briefe / E-Mails — nur Vorstand. Mitglieder sahen hier
        // frueher ihre eigenen; die Apps haben sie dann selbst wieder
        // ausgeblendet.
        if (isPrivileged) try {
            const dispParams = [from, to];
            const dispWhere = `d.sent_at::date BETWEEN $1::date AND $2::date AND d.status = 'sent'`;
            const disp = await pool.query(
                `SELECT d.id, d.type, d.subject, d.sent_at, d.member_id, m.vorname, m.nachname
                 FROM dispatch_log d
                 LEFT JOIN members m ON d.member_id = m.id
                 WHERE ${dispWhere}
                 ORDER BY d.sent_at`,
                dispParams
            );
            for (const d of disp.rows) {
                const name = `${d.vorname || ''} ${d.nachname || ''}`.trim();
                const isLetter = d.type === 'letter';
                const subj = d.subject || (isLetter ? 'Brief versendet' : 'E-Mail versendet');
                items.push({
                    id: 'dispatch:' + d.id,
                    type: isLetter ? 'letter' : 'email',
                    date: String(d.sent_at).substring(0, 10),
                    title: subj,
                    subtitle: isPrivileged && name ? `→ ${name}` : (isLetter ? 'Brief' : 'E-Mail'),
                    refId: d.id
                });
            }
        } catch (_) {}

        fertig(items);
    } catch (error) {
        console.error('GET /calendar/items failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Generiert ICS-Kalender-Datei mit allen nicht-abgesagten Events
app.get('/calendar/ics', async (req, res) => {
    try {
        // Nur echte Termine: Ideen mit offenem Datum standen sonst alle am
        // 31.12. im abonnierten Kalender; Entwuerfe, Vorschlaege, abgelehnte
        // und abgesagte Anlaesse gehoeren auch nicht hinein.
        const events = await pool.query(`
            SELECT * FROM events
            WHERE COALESCE(status, '') NOT IN ('cancelled', 'draft', 'proposed', 'rejected')
              AND COALESCE(datum_offen, false) = false
            ORDER BY start_date`);

        const calendar = ical({
            name: 'Feuerwehrverein Raura',
            timezone: 'Europe/Zurich'
        });

        events.rows.forEach(event => {
            calendar.createEvent({
                // Feste UID: Kalender-Apps ersetzen den Eintrag bei Aenderungen.
                id: `${event.id}@fwv-raura.ch`,
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
// DEUTSCH: PDF-Generierung fuer Arbeitspläne (Schicht-Übersicht mit Helfern, tabellarisch nach Datum/Bereich)
// ============================================

// DEUTSCH: Generiert Arbeitsplan als PDF. Unterstützt Einzel-Event, Multi-Event und Legacy-Format
// ---------------------------------------------------------------------------
// Arbeitsplan fuer den Kiosk im Roten Schopf
//
// Der Laptop im Schopf hat keine angemeldete Person und weist sich mit einem
// Schluessel aus. Er holt genau einen Anlass: den, der gerade laeuft, sonst
// den naechsten. Mehr braucht die Kachel nicht, und alles andere waere auf
// einem 1280x800-Schirm ohnehin nicht lesbar.
//
// Bewusst nur bestaetigte Anmeldungen: Am Fest zaehlt, wer eingeteilt ist.
// Wer noch auf Bestaetigung wartet, steht nicht im Plan an der Wand.
// ---------------------------------------------------------------------------
app.get('/arbeitsplan/kiosk', async (req, res) => {
    if (!process.env.KIOSK_KEY || req.headers['x-kiosk-key'] !== process.env.KIOSK_KEY) {
        return res.status(401).json({ error: 'Kein gueltiger Kiosk-Schluessel' });
    }
    try {
        // Laufender Anlass zuerst (end_date kann fehlen — dann gilt der
        // Starttag), sonst der naechste. Vergangenes faellt raus.
        //
        // Nur Anlaesse MIT Schichten: In der Agenda stehen auch Einladungen
        // anderer Vereine und Termine ohne Arbeitsplan. Ohne diese Bedingung
        // zeigte die Kachel den naechstgelegenen davon an — mit leerem Plan,
        // waehrend die Chilbi mit ihren Schichten dahinter unsichtbar blieb.
        const anlass = await pool.query(`
            SELECT e.id, e.title, e.start_date, e.end_date
            FROM events e
            WHERE e.status != 'cancelled'
              AND COALESCE(e.end_date, e.start_date)::date >= CURRENT_DATE
              AND EXISTS (SELECT 1 FROM shifts s WHERE s.event_id = e.id)
            ORDER BY e.start_date
            LIMIT 1
        `);
        if (!anlass.rows.length) {
            return res.json({ anlass: null, tage: [] });
        }
        const e = anlass.rows[0];

        const schichten = await pool.query(`
            SELECT s.id, s.name, s.date, s.start_time, s.end_time, s.needed, s.bereich,
                   COALESCE(
                       json_agg(
                           COALESCE(m.vorname || ' ' || m.nachname, r.guest_name)
                           ORDER BY COALESCE(m.vorname, r.guest_name)
                       ) FILTER (WHERE r.id IS NOT NULL),
                       '[]'
                   ) AS besetzt
            FROM shifts s
            LEFT JOIN registrations r
                   ON s.id = ANY(r.shift_ids) AND r.status = 'approved'
            LEFT JOIN members m ON m.id = r.member_id
            WHERE s.event_id = $1
            GROUP BY s.id
            ORDER BY s.date, s.start_time
        `, [e.id]);

        // Nach Tagen gruppieren, damit die Kachel den heutigen Tag
        // hervorheben kann, ohne selbst zu rechnen.
        const tage = [];
        for (const s of schichten.rows) {
            const tag = s.date instanceof Date
                ? s.date.toISOString().slice(0, 10)
                : String(s.date).slice(0, 10);
            let eintrag = tage.find(t => t.tag === tag);
            if (!eintrag) {
                eintrag = { tag, schichten: [] };
                tage.push(eintrag);
            }
            eintrag.schichten.push({
                name: s.name,
                bereich: s.bereich,
                von: s.start_time ? String(s.start_time).slice(0, 5) : null,
                bis: s.end_time ? String(s.end_time).slice(0, 5) : null,
                gebraucht: s.needed,
                besetzt: s.besetzt
            });
        }

        res.json({
            anlass: { titel: e.title, beginn: e.start_date, ende: e.end_date },
            tage
        });
    } catch (error) {
        console.error('GET /arbeitsplan/kiosk:', error.message);
        res.status(500).json({ error: 'Arbeitsplan konnte nicht geladen werden' });
    }
});

// ============================================
// DIRECT PDF LINKS (GET endpoints)
// DEUTSCH: GET-Endpunkte für direkten PDF-Download (z.B. Link in E-Mail)
// ============================================


// DEUTSCH: Arbeitsplan als Tabelle (JSON) fuer alle Oberflaechen. Oeffentlich
// wie das PDF und die Schichtbelegung auf der Eventseite.
app.get('/events/:id/arbeitsplan', async (req, res) => {
    try {
        const plan = await buildArbeitsplan(req.params.id);
        if (!plan) return res.status(404).json({ error: 'Event not found' });
        res.json(plan);
    } catch (error) {
        console.error('GET /events/:id/arbeitsplan:', error.message);
        res.status(500).json({ error: 'Arbeitsplan konnte nicht geladen werden' });
    }
});


// DEUTSCH: Arbeitsplan-PDF direkt per GET abrufen (per Event-ID). Inhalt aus buildArbeitsplan()
app.get('/events/:id/pdf/arbeitsplan', async (req, res) => {
    try {
        const plan = await buildArbeitsplan(req.params.id);
        if (!plan) {
            return res.status(404).json({ error: 'Event not found' });
        }
        if (plan.tage.length === 0) {
            return res.status(400).json({ error: 'No shifts found for this event' });
        }
        const buffer = await renderArbeitsplanPdf(plan);

        res.setHeader('Content-Type', 'application/pdf');
        const safeTitle = plan.anlass.replace(/[^a-zA-Z0-9äöüÄÖÜ ]/g, '_').substring(0, 50);
        res.setHeader('Content-Disposition', `attachment; filename="Arbeitsplan_${safeTitle}.pdf"`);
        res.send(buffer);
    } catch (error) {
        console.error('Direct Arbeitsplan PDF error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ARBEITSPLAN EINE WOCHE VOR DEM ANLASS
// DEUTSCH: Taeglicher Job — schickt den aktuellen Arbeitsplan einmalig an alle
// eingeteilten Helfer (Schicht-Anmeldungen, bestaetigt, Gaeste inklusive).
// Wer ihn nicht per E-Mail bekommt (keine Adresse, Mitglied mit Post-
// Zustellung, Versandfehler), wird dem Organisator und dem Vorstand in EINER
// Mail gemeldet — mit dem PDF im Anhang, damit sie ihn zustellen koennen.
// Unabhaengig von arbeitsplan_sent_at (Versand sobald alle Schichten besetzt):
// das hier ist die Erinnerung mit dem Stand eine Woche vorher.
// Eigenes Flag events.arbeitsplan_reminder_sent_at (Migration 025) -> einmalig.
// ============================================
const ARBEITSPLAN_REMINDER_DAYS = 7;   // so viele Tage vor dem Anlass (oder weniger, falls verpasst)
const ARBEITSPLAN_REMINDER_HOUR = 8;   // Timer verschickt fruehestens ab 08:00 Uhr Schweizer Zeit
const ARBEITSPLAN_POST_MIN_DAYS = 3;   // Brief (Pingen) nur, wenn er sicher vor dem Anlass ankommt
const VORSTAND_EMAIL = 'vorstand@fwv-raura.ch';

async function ensureArbeitsplanReminderSchema() {
    await pool.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS arbeitsplan_reminder_sent_at TIMESTAMP');
}

// DEUTSCH: Anlaesse, deren Beginn (Eventstart oder erste Schicht, was frueher ist)
// zwischen morgen und in 7 Tagen liegt und die noch keinen Versand hatten.
// Vergangene und heutige Anlaesse nie — dann ist es zu spaet.
async function findDueArbeitsplanReminders() {
    const result = await pool.query(`
        WITH ev AS (
            SELECT e.id, e.title, e.image_url, e.location, e.status, e.organizer_name,
                   COALESCE(NULLIF(TRIM(e.organizer_email), ''), om.email) AS organizer_email,
                   e.arbeitsplan_reminder_sent_at,
                   LEAST(e.start_date::date,
                         (SELECT MIN(s.date) FROM shifts s WHERE s.event_id = e.id)) AS beginn
            FROM events e
            LEFT JOIN members om ON om.id = e.organizer_id
            WHERE EXISTS (SELECT 1 FROM shifts s WHERE s.event_id = e.id)
        )
        SELECT ev.*, (ev.beginn - (NOW() AT TIME ZONE 'Europe/Zurich')::date) AS tage_bis
        FROM ev
        WHERE ev.arbeitsplan_reminder_sent_at IS NULL
          AND COALESCE(ev.status, '') NOT IN ('cancelled', 'proposed', 'rejected', 'completed')
          AND ev.beginn >  (NOW() AT TIME ZONE 'Europe/Zurich')::date
          AND ev.beginn <= (NOW() AT TIME ZONE 'Europe/Zurich')::date + $1::int
        ORDER BY ev.beginn
    `, [ARBEITSPLAN_REMINDER_DAYS]);
    return result.rows;
}

// DEUTSCH: Telefon/Adresse fuer die Meldung an Organisator/Vorstand.
function reminderContactInfo(p) {
    const parts = [];
    if (p.phone) parts.push(`Tel. ${p.phone}`);
    if (p.address) parts.push(p.address);
    return parts.length ? parts.join(', ') : 'keine Kontaktdaten hinterlegt';
}

// DEUTSCH: Arbeitsplan fuer EINEN Anlass verschicken. dryRun: nur ermitteln,
// wer was bekaeme (nichts senden, nichts markieren).
async function sendArbeitsplanReminder(event, { dryRun = false } = {}) {
    // Atomar beanspruchen — verhindert Doppelversand (mehrere Replicas, Timer + manueller Aufruf)
    if (!dryRun) {
        const claim = await pool.query(`
            UPDATE events SET arbeitsplan_reminder_sent_at = NOW()
            WHERE id = $1 AND arbeitsplan_reminder_sent_at IS NULL
            RETURNING id
        `, [event.id]);
        if (claim.rows.length === 0) return { eventId: event.id, title: event.title, skipped: 'bereits versendet' };
    }
    const releaseClaim = async () => {
        if (dryRun) return;
        await pool.query('UPDATE events SET arbeitsplan_reminder_sent_at = NULL WHERE id = $1', [event.id])
            .catch(e => logError('Arbeitsplan-Versand: Flag zuruecksetzen fehlgeschlagen', { eventId: event.id, error: e.message }));
    };

    try {
        const plan = await buildArbeitsplan(event.id);
        if (!plan || plan.tage.length === 0) {
            await releaseClaim();
            return { eventId: event.id, title: event.title, skipped: 'keine Schichten' };
        }

        // Eingeteilte Helfer: bestaetigte Schicht-Anmeldungen (Mitglieder und Gaeste)
        const regsResult = await pool.query(`
            SELECT r.id, r.member_id, r.guest_name, r.guest_email, r.shift_ids, r.notes,
                   m.vorname, m.nachname, m.email AS member_email, m.zustellung_email,
                   m.telefon, m.mobile, m.strasse, m.plz, m.ort
            FROM registrations r
            LEFT JOIN members m ON m.id = r.member_id
            WHERE r.event_id = $1
              AND r.status IN ('approved', 'confirmed')
              AND r.shift_ids IS NOT NULL AND cardinality(r.shift_ids) > 0
            ORDER BY r.created_at
        `, [event.id]);

        // Noch niemand eingeteilt: Flag wieder freigeben, damit spaeter Bestaetigte
        // (innerhalb der Woche) den Plan beim naechsten Lauf noch bekommen.
        if (regsResult.rows.length === 0) {
            await releaseClaim();
            return { eventId: event.id, title: event.title, skipped: 'keine eingeteilten Helfer' };
        }

        const shiftsResult = await pool.query(
            'SELECT id, name, date, start_time, end_time, bereich FROM shifts WHERE event_id = $1',
            [event.id]
        );
        const shiftById = new Map(shiftsResult.rows.map(s => [s.id, s]));

        // Pro Person nur EINE Nachricht (mehrere Anmeldungen derselben Person zusammenfassen)
        const persons = new Map();
        for (const r of regsResult.rows) {
            const email = (r.member_id ? r.member_email : r.guest_email) || null;
            const name = r.member_id ? `${r.vorname} ${r.nachname}` : (r.guest_name || 'Unbekannt');
            const key = r.member_id ? `m:${r.member_id}` : (email ? `e:${email.toLowerCase()}` : `r:${r.id}`);
            let notes = {};
            try { notes = typeof r.notes === 'string' ? JSON.parse(r.notes) : (r.notes || {}); } catch (_) { /* alte notes */ }
            const address = r.member_id && r.strasse
                ? `${r.strasse}, ${[r.plz, r.ort].filter(Boolean).join(' ')}`.trim()
                : null;
            if (!persons.has(key)) {
                persons.set(key, {
                    name, email,
                    memberId: r.member_id || null,
                    postOnly: !!r.member_id && r.zustellung_email === false,
                    phone: r.member_id ? (r.mobile || r.telefon || notes?.phone || null) : (notes?.phone || null),
                    address,
                    shiftIds: new Set()
                });
            }
            r.shift_ids.forEach(id => persons.get(key).shiftIds.add(id));
        }

        const datum = formatDateDE(String(event.beginn).slice(0, 10));
        const wann = event.tage_bis === 1 ? 'Morgen' : (event.tage_bis === 7 ? 'In einer Woche' : `In ${event.tage_bis} Tagen`);
        const pdfBase64 = dryRun ? null : (await renderArbeitsplanPdf(plan)).toString('base64');
        const attachment = {
            filename: `Arbeitsplan_${event.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
            content: pdfBase64,
            contentType: 'application/pdf'
        };

        const perEmail = [];   // per E-Mail erhalten
        const perPost = [];    // per Post (Pingen) versendet
        const offen = [];      // noch zuzustellen (mit Grund)

        for (const p of persons.values()) {
            const schichten = [...p.shiftIds].map(id => shiftById.get(id)).filter(Boolean)
                .sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`))
                .map(s => {
                    const zeit = s.start_time && s.end_time
                        ? `${String(s.start_time).slice(0, 5)} - ${String(s.end_time).slice(0, 5)}` : 'ganztägig';
                    return `- ${formatDateDE(String(s.date).slice(0, 10))}, ${zeit}: ${s.name || 'Schicht'}${s.bereich ? ` (${bereichLesbar(s.bereich)})` : ''}`;
                });

            // Mitglied will Post statt E-Mail -> wie beim bisherigen Arbeitsplan-Versand per Pingen
            if (p.postOnly) {
                if (event.tage_bis < ARBEITSPLAN_POST_MIN_DAYS) {
                    offen.push({ ...p, grund: 'möchte Post, ein Brief käme aber zu spät' });
                    continue;
                }
                if (dryRun) { perPost.push(p); continue; }
                try {
                    const pingen = await axios.post(`${DISPATCH_API}/pingen/send-arbeitsplan`, {
                        event_id: event.id,
                        member_id: p.memberId,
                        pdf_base64: pdfBase64
                    });
                    if (pingen.data?.success) {
                        perPost.push({ ...p, letterId: pingen.data.letterId });
                        logInfo('Arbeitsplan per Post versendet', { eventId: event.id, name: p.name, letterId: pingen.data.letterId });
                    } else {
                        offen.push({ ...p, grund: 'möchte Post, Brief-Versand fehlgeschlagen' });
                    }
                } catch (err) {
                    logError('Arbeitsplan Pingen-Versand fehlgeschlagen', { eventId: event.id, name: p.name, error: err.response?.data?.error || err.message });
                    offen.push({ ...p, grund: `möchte Post, Brief-Versand fehlgeschlagen (${err.response?.data?.error || err.message})` });
                }
                continue;
            }

            if (!p.email) {
                offen.push({ ...p, grund: 'keine E-Mail-Adresse' });
                continue;
            }
            if (dryRun) { perEmail.push(p); continue; }

            try {
                await axios.post(`${DISPATCH_API}/email/send`, mitAnlassLogo(event, {
                    to: p.email,
                    subject: `Arbeitsplan - ${event.title}`,
                    body: `Guten Tag ${p.name},

${wann} ist es soweit: "${event.title}" am ${datum}${event.location ? ` (${event.location})` : ''}.

Sie sind für folgende Schichten eingeteilt:
${schichten.join('\n')}

Anbei finden Sie den aktuellen Arbeitsplan als PDF mit allen Schichten und Helfern.

Falls Sie verhindert sind, melden Sie sich bitte so bald wie möglich${event.organizer_name ? ` bei ${event.organizer_name}` : ' bei uns'}.

Mit freundlichen Grüssen
Feuerwehrverein Raura`,
                    attachments: [attachment],
                    event_id: event.id
                }));
                perEmail.push(p);
                logInfo('Arbeitsplan per E-Mail versendet', { eventId: event.id, email: p.email });
            } catch (err) {
                logError('Arbeitsplan per E-Mail fehlgeschlagen', { eventId: event.id, email: p.email, error: err.message });
                offen.push({ ...p, grund: `E-Mail an ${p.email} fehlgeschlagen` });
            }

            if (p.memberId) {
                pushToMember(p.memberId, 'event_update', `Arbeitsplan: ${event.title}`,
                    `Der Arbeitsplan für ${datum} ist da.`, { eventId: event.id }).catch(() => {});
            }
        }

        const summary = {
            eventId: event.id,
            title: event.title,
            beginn: String(event.beginn).slice(0, 10),
            tageBis: event.tage_bis,
            perEmail: perEmail.map(p => ({ name: p.name, email: p.email })),
            perPost: perPost.map(p => ({ name: p.name, address: p.address })),
            offen: offen.map(p => ({ name: p.name, phone: p.phone, address: p.address, grund: p.grund })),
            meldungAn: null
        };

        // Dispatch komplett nicht erreichbar -> niemand hat etwas bekommen: Flag
        // freigeben, der naechste Lauf versucht es erneut.
        if (!dryRun && perEmail.length === 0 && perPost.length === 0 && offen.some(p => p.grund.startsWith('E-Mail an'))) {
            await releaseClaim();
            logWarn('Arbeitsplan-Versand: keine Zustellung erfolgreich, wird erneut versucht', { eventId: event.id });
            return { ...summary, retry: true };
        }

        // Meldung an Organisator + Vorstand: wer hat den Plan NICHT per E-Mail bekommen
        if (offen.length > 0 || perPost.length > 0) {
            const to = event.organizer_email || VORSTAND_EMAIL;
            // Kopie an den Vorstand und alle Mitorganisatoren (ohne Doppelte).
            const ccListe = mitorganisatoren.empfaengerListe(
                to.toLowerCase() !== VORSTAND_EMAIL ? [VORSTAND_EMAIL] : [], await mitorganisatorenEmails(event.id), [to]);
            const cc = ccListe.length ? ccListe.join(', ') : undefined;
            summary.meldungAn = [to, ...ccListe];

            if (!dryRun) {
                const offenText = offen.length
                    ? offen.map(p => `- ${p.name} — ${reminderContactInfo(p)} (${p.grund})`).join('\n')
                    : '- niemand';
                const postText = perPost.length
                    ? `\n\nPer Post (Pingen) versendet — nichts zu tun:\n${perPost.map(p => `- ${p.name}${p.address ? ` — ${p.address}` : ''}`).join('\n')}`
                    : '';
                try {
                    await axios.post(`${DISPATCH_API}/email/send`, {
                        to,
                        cc,
                        subject: offen.length
                            ? `Arbeitsplan ${event.title}: ${offen.length} Person(en) noch zustellen`
                            : `Arbeitsplan ${event.title}: per Post versendet`,
                        body: `Guten Tag${event.organizer_name ? ` ${event.organizer_name}` : ''},

Der Arbeitsplan für "${event.title}" am ${datum} wurde heute an die eingeteilten Helferinnen und Helfer verschickt (${perEmail.length} per E-Mail).

Diese Personen haben den Arbeitsplan nicht per E-Mail erhalten — bitte zustellen:
${offenText}${postText}

Der aktuelle Arbeitsplan ist als PDF angehängt.

Mit freundlichen Grüssen
Feuerwehrverein Raura (automatische Nachricht)`,
                        attachments: [attachment],
                        event_id: event.id
                    });
                    logInfo('Arbeitsplan: Meldung an Organisator/Vorstand gesendet', { eventId: event.id, to, cc, offen: offen.length });
                } catch (err) {
                    logError('Arbeitsplan: Meldung an Organisator/Vorstand fehlgeschlagen', { eventId: event.id, to, error: err.message });
                    summary.meldungFehler = err.message;
                }
            }
        }

        if (!dryRun) {
            try {
                await pool.query(`
                    INSERT INTO audit_log (action, entity_type, entity_id, new_values, created_at)
                    VALUES ('ARBEITSPLAN_REMINDER_SENT', 'event', $1, $2, NOW())
                `, [event.id, JSON.stringify({
                    title: event.title,
                    perEmail: perEmail.length,
                    perPost: perPost.length,
                    offen: summary.offen
                })]);
            } catch (auditError) {
                console.error('Audit-Log fuer Arbeitsplan-Versand fehlgeschlagen:', auditError.message);
            }
            logInfo('Arbeitsplan eine Woche vorher versendet', {
                eventId: event.id, title: event.title,
                perEmail: perEmail.length, perPost: perPost.length, offen: offen.length
            });
        }
        return summary;
    } catch (error) {
        await releaseClaim();
        throw error;
    }
}

// DEUTSCH: Alle faelligen Anlaesse abarbeiten. Ein Fehler bei einem Anlass
// haelt die anderen nicht auf.
async function runArbeitsplanReminders({ dryRun = false } = {}) {
    const events = await findDueArbeitsplanReminders();
    const results = [];
    for (const event of events) {
        try {
            results.push(await sendArbeitsplanReminder(event, { dryRun }));
        } catch (err) {
            logError('Arbeitsplan-Versand fehlgeschlagen', { eventId: event.id, error: err.message });
            results.push({ eventId: event.id, title: event.title, error: err.message });
        }
    }
    return results;
}

// DEUTSCH: Timer im Container — prueft stuendlich, verschickt aber erst ab
// 08:00 Uhr Schweizer Zeit. Dank Flag nur einmal pro Anlass; ein verpasster
// Tag (Container down) wird beim naechsten Lauf nachgeholt.
let arbeitsplanReminderRunning = false;
async function arbeitsplanReminderTick() {
    if (arbeitsplanReminderRunning) return;
    const hour = Number(new Intl.DateTimeFormat('de-CH', {
        timeZone: 'Europe/Zurich', hour: '2-digit', hour12: false
    }).format(new Date()));
    if (hour < ARBEITSPLAN_REMINDER_HOUR) return;
    arbeitsplanReminderRunning = true;
    try {
        const results = await runArbeitsplanReminders();
        if (results.length > 0) logInfo('Arbeitsplan-Versand-Lauf beendet', { events: results.length });
    } catch (err) {
        logError('Arbeitsplan-Versand-Lauf fehlgeschlagen', { error: err.message });
    } finally {
        arbeitsplanReminderRunning = false;
    }
}

// DEUTSCH: Arbeitsplan-Aenderungen sofort pruefen (sonst alle 5 Minuten,
// arbeitsplanUpdateTick) - fuer Tests und von Hand. Verschickt nur, was der
// Taktgeber auch verschicken wuerde (Ruhezeit eingehalten).
app.post('/reminders/arbeitsplan-aenderungen', requireApiKey, async (req, res) => {
    try {
        await arbeitsplanUpdateTick();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Manuell / per Cron ausloesen (API-Key). { dry_run: true } = nur Vorschau.
// Ignoriert die 08:00-Uhr-Grenze.
app.post('/reminders/arbeitsplan', requireApiKey, async (req, res) => {
    try {
        const dryRun = req.body?.dry_run === true || req.query.dry_run === 'true';
        const results = await runArbeitsplanReminders({ dryRun });
        res.json({ success: true, dry_run: dryRun, events: results });
    } catch (error) {
        logError('POST /reminders/arbeitsplan', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Vorschau fuer den Vorstand: welche Anlaesse sind faellig, wer bekaeme
// den Arbeitsplan per E-Mail / Post, wer muesste ihn persoenlich bekommen.
app.get('/reminders/arbeitsplan/preview', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const results = await runArbeitsplanReminders({ dryRun: true });
        res.json({ events: results });
    } catch (error) {
        logError('GET /reminders/arbeitsplan/preview', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Alle Angemeldeten (approved+pending) manuell ueber eine Event-
// Aenderung informieren. Kanal je Empfaenger nach Zustellpraeferenz: Mitglieder
// mit zustellung_post + Adresse -> Brief via Pingen; sonst E-Mail (Gast-/
// Mitglieds-Mail). Der Vorstand-JWT des Aufrufers wird an die Dispatch-Endpoints
// weitergereicht. Mehrfach-Anmeldungen derselben Person -> nur EINE Nachricht.
// Kern: benachrichtigt alle Angemeldeten (bestaetigt + wartend) eines Events per
// E-Mail oder Brief (je nach Zustellpraeferenz). Von der Vorstand- und der
// Organisator-Route gemeinsam genutzt. Wirft { status, error } bei
// Validierungs-/Nicht-gefunden-Fehlern; res-Handling macht die jeweilige Route.
async function notifyEventRegistrants(eventId, payload, authHeader) {
    const { subject, message } = payload || {};
    if (!message || !String(message).trim()) {
        throw { status: 400, error: 'Nachricht (message) ist erforderlich' };
    }
    const ev = await pool.query('SELECT id, title, slug, image_url, start_date, location FROM events WHERE id = $1', [eventId]);
    if (ev.rows.length === 0) throw { status: 404, error: 'Event nicht gefunden' };
    const event = ev.rows[0];
    const subj = (subject && String(subject).trim()) || `Änderung: ${event.title}`;
    const fwd = authHeader ? { headers: { Authorization: authHeader } } : {};

    const regs = await pool.query(`
        SELECT r.id, r.guest_name, r.guest_email, r.member_id,
               m.vorname, m.nachname, m.email AS member_email,
               m.zustellung_email, m.zustellung_post, m.strasse, m.plz, m.ort
        FROM registrations r
        LEFT JOIN members m ON r.member_id = m.id
        WHERE r.event_id = $1 AND r.status IN ('approved', 'pending')
    `, [eventId]);

    const seen = new Set();
    let emailed = 0, posted = 0, skipped = 0, pushed = 0;
    const unreachable = [];

    for (const r of regs.rows) {
        const key = r.member_id || (r.guest_email || '').toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);

        // Zusaetzlich App-Push an Mitglieder (respektiert notification_preferences —
        // Mitglieder ohne App / mit deaktiviertem 'event_update' bekommen keinen).
        if (r.member_id) {
            pushToMember(r.member_id, 'event_update', subj, String(message).trim(), { eventId }).catch(() => {});
            pushed++;
        }

        const name = r.member_id ? `${r.vorname || ''} ${r.nachname || ''}`.trim() : (r.guest_name || '');
        const email = r.guest_email || r.member_email || null;
        const postOk = r.member_id && r.zustellung_post && r.strasse && r.plz && r.ort;
        const body = `${name ? `Hallo ${name},` : 'Hallo,'}\n\n${String(message).trim()}\n\nBetrifft: ${event.title}\n\nFreundliche Grüsse\nFeuerwehrverein Raura`;

        try {
            if (postOk) {
                await axios.post(`${DISPATCH_API}/pingen/send-manual`, {
                    member_id: r.member_id, event_id: eventId, subject: subj, body, staging: false
                }, fwd);
                posted++;
            } else if (email) {
                await axios.post(`${DISPATCH_API}/email/send`, mitAnlassLogo(event, {
                    to: email, subject: subj, body, event_id: eventId
                }), fwd);
                emailed++;
            } else {
                skipped++;
                unreachable.push(name || key);
            }
        } catch (e) {
            skipped++;
            unreachable.push(`${name || key} (Fehler)`);
            console.error('notify-registrants send failed:', name, e.message);
        }
    }

    return { success: true, emailed, posted, skipped, pushed, unreachable };
}

// Vorstand/Admin: Angemeldete ueber eine Aenderung informieren.
app.post('/events/:id/notify-registrants', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const result = await notifyEventRegistrants(req.params.id, req.body, req.headers['authorization']);
        res.json(result);
    } catch (error) {
        if (error && error.status) return res.status(error.status).json({ error: error.error });
        console.error('notify-registrants error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Organisator (E-Mail-Match auf event.organizer_email): Angemeldete informieren.
app.post('/events/:id/notify-registrants-as-organizer', authenticateAny, async (req, res) => {
    try {
        const event = await ensureOrganizerAccess(req, res, req.params.id);
        if (!event) return; // 403/404 wurde bereits gesendet
        const result = await notifyEventRegistrants(req.params.id, req.body, req.headers['authorization']);
        res.json(result);
    } catch (error) {
        if (error && error.status) return res.status(error.status).json({ error: error.error });
        console.error('notify-registrants-as-organizer error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Ziel eines Vorstand-Pushs ({ ziel, eventId } im Body) pruefen:
// { daten } fuer FCM, oder { fehler } (unbekanntes Ziel, Anlass fehlt).
async function pushZielPruefen(eingabe) {
    let daten;
    try {
        daten = pushZielDaten(eingabe);
    } catch (e) {
        return { fehler: e.error || 'Ungültiges Ziel' };
    }
    if (daten.eventId) {
        const ev = await pool.query('SELECT id FROM events WHERE id = $1', [daten.eventId]);
        if (ev.rows.length === 0) return { fehler: 'Anlass nicht gefunden' };
    }
    return { daten };
}

// DEUTSCH: Vorstand/Admin — App-Push-Broadcast an alle Mitglieder. Kanal
// 'general' (Mitglieder koennen ihn in der App-Einstellung abschalten). Erreicht
// nur Mitglieder mit installierter App + erlaubten Benachrichtigungen; E-Mail/Post
// bleiben die universellen Kanaele. Leitet an api-members /internal/push-broadcast.
// Optional ziel ('anlass' + eventId, 'profil', 'beitraege'): wohin das Antippen
// in der App fuehrt; ohne Ziel zeigt die App die Mitteilung als Dialog.
app.post('/push/broadcast', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { title, body } = req.body || {};
        if (!title || !String(title).trim() || !body || !String(body).trim()) {
            return res.status(400).json({ error: 'title und body sind erforderlich' });
        }
        // Optional: wohin das Antippen fuehrt (src/push-ziel.js).
        const ziel = await pushZielPruefen(req.body);
        if (ziel.fehler) return res.status(400).json({ error: ziel.fehler });
        const key = process.env.INTERNAL_API_KEY;
        if (!key) return res.status(500).json({ error: 'INTERNAL_API_KEY nicht gesetzt' });
        const membersUrl = (process.env.MEMBERS_API_URL || 'http://api-members:3000') + '/internal/push-broadcast';
        const resp = await axios.post(membersUrl, {
            notificationType: 'general',
            title: String(title).trim(),
            body: String(body).trim(),
            data: ziel.daten
        }, { headers: { 'X-Internal-Key': key }, timeout: 15000 });
        res.json({ success: true, sent: resp.data?.sent ?? null });
    } catch (error) {
        console.error('POST /push/broadcast error:', error.message);
        res.status(502).json({ error: 'Push-Broadcast fehlgeschlagen' });
    }
});

// DEUTSCH: Vorstand/Admin — gezielte Benachrichtigung an AUSGEWAEHLTE Mitglieder
// (Push, optional zusaetzlich E-Mail). memberIds = Array von Mitglieds-UUIDs.
// Optional ziel/eventId wie bei /push/broadcast.
app.post('/push/to-members', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { memberIds, title, body, alsoEmail } = req.body || {};
        if (!Array.isArray(memberIds) || memberIds.length === 0) {
            return res.status(400).json({ error: 'memberIds (Array) erforderlich' });
        }
        if (!title || !String(title).trim() || !body || !String(body).trim()) {
            return res.status(400).json({ error: 'title und body erforderlich' });
        }
        const ziel = await pushZielPruefen(req.body);
        if (ziel.fehler) return res.status(400).json({ error: ziel.fehler });
        const t = String(title).trim(), b = String(body).trim();
        const fwd = req.headers['authorization'] ? { headers: { Authorization: req.headers['authorization'] } } : {};
        let members = [];
        if (alsoEmail) {
            const mr = await pool.query('SELECT id, vorname, email FROM members WHERE id = ANY($1::uuid[])', [memberIds]);
            members = mr.rows;
        }
        const byId = new Map(members.map(m => [m.id, m]));
        let pushed = 0, emailed = 0;
        for (const id of memberIds) {
            pushToMember(id, 'general', t, b, ziel.daten).catch(() => {});
            pushed++;
            if (alsoEmail) {
                const m = byId.get(id);
                if (m && m.email) {
                    try {
                        await axios.post(`${DISPATCH_API}/email/send`, {
                            to: m.email, subject: t,
                            body: `${m.vorname ? `Hallo ${m.vorname},` : 'Hallo,'}\n\n${b}\n\nFreundliche Gruesse\nFeuerwehrverein Raura`
                        }, fwd);
                        emailed++;
                    } catch (e) { console.error('to-members E-Mail fehlgeschlagen:', e.message); }
                }
            }
        }
        res.json({ success: true, pushed, emailed });
    } catch (error) {
        console.error('POST /push/to-members error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Teilnehmerliste-PDF direkt per GET abrufen. Zeigt alle Registrierten nach Schicht sortiert
app.get('/events/:id/pdf/teilnehmerliste', async (req, res) => {
    try {
        const { id } = req.params;

        // Load event
        const eventResult = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
        if (eventResult.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }
        const event = eventResult.rows[0];

        // Die Liste enthaelt Kontaktdaten aller Angemeldeten — nur fuer den
        // Vorstand und den Organisator dieses Anlasses (bis Oktober 2026 frei
        // abrufbar). Alle Aufrufer (Vorstand-Seite/-Apps, Organisator-Bereich)
        // schicken ihr Token mit.
        const wer = await anfragender(req);
        if (!darfBearbeiten(wer, event)) {
            return res.status(wer.vorstand || wer.identity || wer.organisatorEventId ? 403 : 401)
                .json({ error: 'Nur fuer Vorstand und Organisator dieses Anlasses' });
        }

        // Load shifts
        const shiftsResult = await pool.query(
            'SELECT * FROM shifts WHERE event_id = $1 ORDER BY date, start_time',
            [id]
        );

        // Load all registrations for this event.
        // Kein DISTINCT: r.id ist Primaerschluessel und der LEFT JOIN auf member_id
        // liefert genau eine Zeile pro Anmeldung -> DISTINCT war ueberfluessig und
        // brach an "ORDER BY COALESCE(...) muss in Select-Liste stehen".
        const regsResult = await pool.query(`
            SELECT r.id, r.guest_name, r.guest_email, r.status, r.shift_ids, r.notes,
                   r.member_id, m.vorname, m.nachname, m.email as member_email
            FROM registrations r
            LEFT JOIN members m ON r.member_id = m.id
            WHERE r.event_id = $1 AND r.status <> 'rejected'
            ORDER BY COALESCE(m.nachname, r.guest_name)
        `, [id]);

        if (regsResult.rows.length === 0) {
            return res.status(400).json({ error: 'No registrations found for this event' });
        }

        // Build participants and shifts data
        const participants = regsResult.rows.map(r => ({
            name: r.member_id ? `${r.vorname} ${r.nachname}` : r.guest_name,
            email: r.member_email || r.guest_email,
            status: r.status,
            notes: r.notes,
            shift_ids: r.shift_ids
        }));

        const shifts = shiftsResult.rows.map(s => {
            const shiftParticipants = regsResult.rows
                .filter(r => r.shift_ids && r.shift_ids.includes(s.id))
                .map(r => ({
                    name: r.member_id ? `${r.vorname} ${r.nachname}` : r.guest_name,
                    email: r.member_email || r.guest_email,
                    status: r.status,
                    notes: r.notes
                }));

            const dateStr = s.date instanceof Date ? s.date.toISOString().split('T')[0] : s.date;

            return {
                id: s.id,
                name: s.name,
                bereich: s.bereich,
                date: dateStr,
                startTime: s.start_time,
                endTime: s.end_time,
                participants: shiftParticipants
            };
        });

        // Create PDF
        const doc = new PDFDocument({ size: 'A4', margin: 50, info: {
            Title: `Teilnehmerliste ${event.title}`,
            Author: 'Feuerwehrverein Raura'
        }});

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Teilnehmerliste_${event.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`);
        doc.pipe(res);

        // Header
        doc.fontSize(20).font('Helvetica-Bold').text('Feuerwehrverein Raura', { align: 'center' });
        doc.fontSize(16).font('Helvetica').text('Teilnehmerliste', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(14).font('Helvetica-Bold').text(event.title, { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica').fillColor('#666666')
            .text(`${participants.length} Anmeldung${participants.length !== 1 ? 'en' : ''}`, { align: 'center' });
        doc.fillColor('#000000');
        doc.moveDown(1.5);

        // Name inkl. Personenzahl (bei Begleitung) aus dem notes-JSON.
        const participantLabel = (p) => {
            let n = p.name || '-';
            try {
                const nt = typeof p.notes === 'string' ? JSON.parse(p.notes) : p.notes;
                if (nt && parseInt(nt.participants, 10) > 1) n += ` (${nt.participants} Pers.)`;
            } catch (_) { /* alte Freitext-Notiz -> nur Name */ }
            return n;
        };

        // Wiederverwendbare Teilnehmer-Tabelle (Nr./Name/E-Mail/Status).
        const renderTable = (list) => {
            const tableTop = doc.y;
            const col1 = 50, col2 = 80, col3 = 280, col4 = 420;

            doc.fontSize(9).font('Helvetica-Bold').fillColor('#4b5563');
            doc.text('Nr.', col1, tableTop);
            doc.text('Name', col2, tableTop);
            doc.text('E-Mail', col3, tableTop);
            doc.text('Status', col4, tableTop);
            doc.fillColor('#000000');
            doc.moveTo(col1, tableTop + 12).lineTo(545, tableTop + 12).strokeColor('#d1d5db').stroke();

            let rowY = tableTop + 18;
            doc.font('Helvetica').fontSize(9);

            list.forEach((p, index) => {
                if (rowY > 750) {
                    doc.addPage();
                    rowY = 50;
                }

                doc.fillColor('#374151').text(`${index + 1}.`, col1, rowY);
                doc.text(participantLabel(p), col2, rowY, { width: 190 });
                doc.text(p.email || '-', col3, rowY, { width: 130 });

                const statusText = p.status === 'approved' ? 'Bestätigt' :
                                  p.status === 'pending' ? 'Ausstehend' :
                                  p.status === 'rejected' ? 'Abgelehnt' : p.status;
                const statusColor = p.status === 'approved' ? '#22c55e' :
                                   p.status === 'pending' ? '#f59e0b' : '#ef4444';
                doc.fillColor(statusColor).text(statusText, col4, rowY);
                doc.fillColor('#000000');

                rowY += 16;

                // Zusatzinfos aus dem notes-JSON (Menue/Allergien/Telefon/Begleitung)
                // — kuechen-/organisationsrelevant, v.a. bei GV.
                try {
                    const nt = typeof p.notes === 'string' ? JSON.parse(p.notes) : p.notes;
                    if (nt && typeof nt === 'object') {
                        const bits = [];
                        if (nt.meal_selection) bits.push(`Menü: ${nt.meal_selection}`);
                        if (nt.allergies) bits.push(`Allergien: ${nt.allergies}`);
                        if (nt.phone) bits.push(`Tel: ${nt.phone}`);
                        if (Array.isArray(nt.companions) && nt.companions.length) {
                            bits.push('mit: ' + nt.companions
                                .map(c => typeof c === 'string' ? c : [c && c.name, c && c.email, c && c.phone].filter(Boolean).join(' '))
                                .join(', '));
                        }
                        if (bits.length) {
                            doc.fontSize(8).fillColor(nt.allergies ? '#b45309' : '#6b7280')
                                .text(bits.join('  ·  '), col2, rowY, { width: 455 });
                            doc.fillColor('#000000').fontSize(9);
                            rowY += 13;
                        }
                    }
                } catch (_) { /* Freitext-Notiz ignorieren */ }
            });

            doc.y = rowY + 10;
        };

        // Render nach Schichten
        for (const shift of shifts) {
            if (shift.participants.length === 0) continue;

            if (doc.y > 680) doc.addPage();

            // Shift header
            doc.fontSize(12).font('Helvetica-Bold').fillColor('#1f2937');
            let shiftTitle = shift.name;
            if (shift.bereich) shiftTitle = `${shift.bereich} - ${shift.name}`;
            if (shift.date) {
                const dateObj = new Date(shift.date + 'T12:00:00');
                shiftTitle += `: ${dateObj.toLocaleDateString('de-CH')}`;
                if (shift.startTime && shift.endTime) {
                    shiftTitle += ` ${shift.startTime.substring(0,5)}-${shift.endTime.substring(0,5)}`;
                }
            }
            doc.text(shiftTitle);
            doc.fillColor('#000000');
            doc.moveDown(0.3);

            renderTable(shift.participants);
            doc.moveDown(0.5);
        }

        // Direkt-Anmeldungen (ohne Schicht): Anlaesse ganz ohne Schichten
        // (Taco-Abend etc.) ODER Direktanmeldungen neben Schichten. Ohne diesen
        // Block blieb die Liste bei schichtlosen Events komplett leer.
        const directList = participants.filter(
            p => !Array.isArray(p.shift_ids) || p.shift_ids.length === 0
        );
        if (directList.length > 0) {
            if (doc.y > 680) doc.addPage();
            // Ueberschrift nur, wenn es daneben auch Schicht-Abschnitte gibt.
            if (shifts.some(s => s.participants.length > 0)) {
                doc.fontSize(12).font('Helvetica-Bold').fillColor('#1f2937').text('Direktanmeldungen');
                doc.fillColor('#000000');
                doc.moveDown(0.3);
            }
            renderTable(directList);
        }

        doc.moveDown(2);
        doc.fontSize(8).font('Helvetica').fillColor('#666666')
            .text(`Erstellt am ${new Date().toLocaleDateString('de-CH')} um ${new Date().toLocaleTimeString('de-CH')}`, { align: 'center' });

        doc.end();

    } catch (error) {
        console.error('Direct Teilnehmerliste PDF error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// TEILNEHMERLISTE PDF GENERATION
// DEUTSCH: PDF mit Teilnehmerliste (Name, E-Mail, Status), gruppiert nach Schichten oder als Flachliste
// ============================================

// DEUTSCH: Teilnehmerliste als PDF generieren (POST mit Daten aus Frontend). Unterstützt Schicht-Gruppierung und Flachliste
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

// DEUTSCH: Arbeitsplan manuell per E-Mail/Post versenden (Vorstand). Überspringt alle Prüfungen
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
// DEUTSCH: Erinnerungs-E-Mails an Helfer vor ihren Schichten
// ============================================



// DEUTSCH: Middleware: Prüft API-Key im Header (fuer Cron-Jobs und interne Aufrufe)
function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
    }
    next();
}

// ============================================
// EVENT GROUPS (for combined Arbeitsplan)
// DEUTSCH: Gruppen von Events für kombinierten Arbeitsplan (z.B. mehrtägige Anlässe)
// ============================================

// DEUTSCH: Alle Event-Gruppen mit ihren zugehörigen Events auflisten
// DEUTSCH: Auswahllisten fuer Anlass-Formulare (Organisator in der App).
// Einzige Quelle fuer "welche Kategorie braucht eine Anmeldung" — stand
// vorher in jeder App einzeln (src/app-ansicht.js).
app.get('/event-optionen', (req, res) => {
    res.json({
        kategorien: appAnsicht.KATEGORIEN,
        anmeldepflichtige_kategorien: appAnsicht.ANMELDEPFLICHTIGE_KATEGORIEN,
        bereiche: appAnsicht.BEREICHE.map(wert => ({ wert, text: bereichLesbar(wert) })),
        status: [
            { wert: 'planned', text: 'Geplant' },
            { wert: 'confirmed', text: 'Bestätigt' },
            { wert: 'cancelled', text: 'Abgesagt' },
            { wert: 'completed', text: 'Abgeschlossen' }
        ]
    });
});

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

// DEUTSCH: Einzelne Event-Gruppe mit vollständigen Event-Daten, Schichten und Registrierungen
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

// DEUTSCH: Neue Event-Gruppe erstellen (Vorstand) und optional Events zuweisen
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

// DEUTSCH: Event-Gruppe aktualisieren (Vorstand). Ersetzt bei Bedarf die Event-Zuordnungen komplett
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

// DEUTSCH: Event-Gruppe löschen (Vorstand)
app.delete('/event-groups/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM event_groups WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// SHIFT REMINDERS
// DEUTSCH: Tägliche Erinnerungen an Helfer (Tag vor Schicht). Prüft ob Erinnerung bereits gesendet wurde
// ============================================

// DEUTSCH: Tägliche Erinnerungen senden für morgige Schichten. Speichert in shift_reminders um Duplikate zu vermeiden
// Push eine Stunde vor Schichtbeginn an Mitglieder mit bestaetigter Schicht.
// Fenster 45-65 Minuten bei einem Takt von 5 Minuten: jede Schicht faellt
// sicher hinein; doppelt verhindert die Tabelle shift_reminders (eindeutig je
// Anmeldung, Schicht und Art). Zeiten sind Schweizer Ortszeit.
async function schichtStundeVorherTick(jetzt = new Date()) {
    try {
        const r = await pool.query(`
            SELECT r.id AS registration_id, r.member_id, s.id AS shift_id, s.name,
                   to_char(s.start_time, 'HH24:MI') AS beginn, to_char(s.end_time, 'HH24:MI') AS ende,
                   s.bereich, e.id AS event_id, e.title
            FROM shifts s
            JOIN events e ON e.id = s.event_id
            JOIN registrations r ON r.event_id = s.event_id AND r.shift_ids && ARRAY[s.id]
            WHERE e.status != 'cancelled'
              AND r.status = 'approved'
              AND r.member_id IS NOT NULL
              AND ((s.date + s.start_time) AT TIME ZONE 'Europe/Zurich')
                  BETWEEN $1::timestamptz + interval '45 minutes' AND $1::timestamptz + interval '65 minutes'
        `, [jetzt]);
        let gesendet = 0;
        for (const z of r.rows) {
            const neu = await pool.query(`
                INSERT INTO shift_reminders (registration_id, shift_id, reminder_type)
                VALUES ($1, $2, 'hour_before')
                ON CONFLICT (registration_id, shift_id, reminder_type) DO NOTHING
                RETURNING id
            `, [z.registration_id, z.shift_id]);
            if (!neu.rows.length) continue;
            await pushToMember(z.member_id, 'shift_reminder', `In einer Stunde: ${z.title}`,
                `${z.name}${z.bereich ? ' (' + z.bereich + ')' : ''} · ${z.beginn}–${z.ende}`,
                { eventId: z.event_id }).catch(() => {});
            gesendet++;
        }
        if (gesendet) logInfo('Schicht-Erinnerung 1 h vorher', { gesendet });
        return r.rows;
    } catch (error) {
        console.error('Schicht-Erinnerung 1 h vorher:', error.message);
        return [];
    }
}

// Nur der Cronjob (docker/cron/shift-reminders.sh, im Container ueber
// localhost) oder mit API-Schluessel. Ueber Traefik war die Route offen -
// jeder konnte die Vortags-Erinnerungen ausloesen.
function nurLokalOderSchluessel(req, res, next) {
    const von = req.socket?.remoteAddress || '';
    if (['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(von)) return next();
    return requireApiKey(req, res, next);
}

app.post('/reminders/send-daily', nurLokalOderSchluessel, async (req, res) => {
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
                e.image_url as event_image_url,
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
                    // DEUTSCH: Atomarer Insert mit ON CONFLICT — verhindert doppelte Erinnerungen (Race Condition)
                    const insertResult = await pool.query(`
                        INSERT INTO shift_reminders (registration_id, shift_id, reminder_type, email)
                        VALUES ($1, $2, 'day_before', $3)
                        ON CONFLICT (registration_id, shift_id, reminder_type) DO NOTHING
                        RETURNING id
                    `, [reg.registration_id, shift.shift_id, email]);

                    if (insertResult.rows.length === 0) {
                        totalSkipped++;
                        continue;
                    }

                    await axios.post(`${DISPATCH_API}/email/send`, mitAnlassLogo({ title: shift.event_title, image_url: shift.event_image_url }, {
                        to: email,
                        subject: subject,
                        body: body,
                        event_id: shift.event_id
                    }));
                    if (reg.member_id) {
                        pushToMember(reg.member_id, 'shift_reminder', subject,
                            `${shift.event_title} · ${dateFormatted} ${startTime}-${endTime}`,
                            { eventId: shift.event_id }).catch(() => {});
                    }

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

// DEUTSCH: Vorschau: Zeigt an welche Erinnerungen für ein Datum gesendet würden (Vorstand, ohne tatsächlichen Versand)
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


// ============================================================
// Organisator-Notizen: beliebig viele Notizen pro Event, jeweils
// mit Text und optionalen Bild-/Dokument-Anhaengen. Zugriff via
// ensureOrganizerAccess (Organisator des Events ODER Vorstand/Admin).
// Anhaenge liegen als Base64 in der DB (wie pdf_attachment); kein
// Objekt-Storage. Download setzt den passenden Content-Type.
// ============================================================
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB pro Datei (roh)

async function ensureOrganizerNotesSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS event_organizer_notes (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            content TEXT,
            created_by VARCHAR(200),
            created_at TIMESTAMP DEFAULT NOW()
        )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_org_notes_event ON event_organizer_notes(event_id)`);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS event_organizer_note_attachments (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            note_id UUID NOT NULL REFERENCES event_organizer_notes(id) ON DELETE CASCADE,
            filename VARCHAR(300),
            content_type VARCHAR(120),
            size INTEGER,
            data TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_org_note_att_note ON event_organizer_note_attachments(note_id)`);
}

// DEUTSCH: base64-Laenge grob in Bytes umrechnen (ignoriert Padding/Zeilenumbrueche).
function base64Bytes(str) { return Math.floor((str || '').length * 3 / 4); }

// DEUTSCH: Erlaubt data:-URIs (z.B. vom Web-Client) — trennt Header ab und leitet
// ggf. den Content-Type daraus ab. Mutiert das Anhang-Objekt.
function stripDataUri(a) {
    if (a && typeof a.data === 'string' && a.data.startsWith('data:')) {
        const comma = a.data.indexOf(',');
        if (comma !== -1) {
            const ct = a.data.substring(5, comma).split(';')[0];
            if (!a.content_type && ct) a.content_type = ct;
            a.data = a.data.substring(comma + 1);
        }
    }
    return a;
}

// GET: alle Notizen eines Events (mit Anhang-Metadaten, OHNE die Base64-Blobs).
app.get('/events/:id/organizer-notes', authenticateAny, async (req, res) => {
    try {
        const event = await ensureOrganizerAccess(req, res, req.params.id);
        if (!event) return;
        const notes = await pool.query(
            `SELECT id, content, created_by, created_at
               FROM event_organizer_notes WHERE event_id = $1 ORDER BY created_at DESC`,
            [event.id]
        );
        const noteIds = notes.rows.map(n => n.id);
        const attByNote = {};
        if (noteIds.length) {
            const atts = await pool.query(
                `SELECT id, note_id, filename, content_type, size
                   FROM event_organizer_note_attachments
                  WHERE note_id = ANY($1::uuid[]) ORDER BY created_at ASC`,
                [noteIds]
            );
            for (const a of atts.rows) {
                (attByNote[a.note_id] = attByNote[a.note_id] || []).push({
                    id: a.id, filename: a.filename, content_type: a.content_type, size: a.size
                });
            }
        }
        res.json(notes.rows.map(n => ({ ...n, attachments: attByNote[n.id] || [] })));
    } catch (error) {
        console.error('GET organizer-notes error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST: neue Notiz anlegen. Body: { content?, attachments?: [{filename, content_type, data(base64)}] }.
app.post('/events/:id/organizer-notes', authenticateAny, async (req, res) => {
    const event = await ensureOrganizerAccess(req, res, req.params.id);
    if (!event) return;
    const { content } = req.body || {};
    const atts = (Array.isArray(req.body?.attachments) ? req.body.attachments : []).map(stripDataUri);
    const text = (content || '').toString();
    if (!text.trim() && atts.length === 0) {
        return res.status(400).json({ error: 'Notiz braucht Text oder mindestens einen Anhang' });
    }
    for (const a of atts) {
        if (!a || typeof a.data !== 'string' || !a.data) {
            return res.status(400).json({ error: 'Ungueltiger Anhang (data fehlt)' });
        }
        if (base64Bytes(a.data) > MAX_ATTACHMENT_BYTES) {
            return res.status(413).json({ error: `Anhang "${a.filename || ''}" zu gross (max 10 MB)` });
        }
    }
    const createdBy = req.user?.name || req.user?.email || 'Unbekannt';
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const noteRes = await client.query(
            `INSERT INTO event_organizer_notes (event_id, content, created_by)
             VALUES ($1, $2, $3) RETURNING id, content, created_by, created_at`,
            [event.id, text.trim() || null, createdBy]
        );
        const note = noteRes.rows[0];
        const savedAtts = [];
        for (const a of atts) {
            const attRes = await client.query(
                `INSERT INTO event_organizer_note_attachments (note_id, filename, content_type, size, data)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id, filename, content_type, size`,
                [note.id,
                 (a.filename || 'datei').toString().substring(0, 300),
                 (a.content_type || 'application/octet-stream').toString().substring(0, 120),
                 base64Bytes(a.data), a.data]
            );
            savedAtts.push(attRes.rows[0]);
        }
        await client.query('COMMIT');
        res.status(201).json({ ...note, attachments: savedAtts });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('POST organizer-notes error:', error.message);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// DELETE: ganze Notiz loeschen (Anhaenge kaskadieren via FK).
app.delete('/events/:id/organizer-notes/:noteId', authenticateAny, async (req, res) => {
    try {
        const event = await ensureOrganizerAccess(req, res, req.params.id);
        if (!event) return;
        const del = await pool.query(
            `DELETE FROM event_organizer_notes WHERE id = $1 AND event_id = $2 RETURNING id`,
            [req.params.noteId, event.id]
        );
        if (del.rows.length === 0) return res.status(404).json({ error: 'Notiz nicht gefunden' });
        res.json({ success: true });
    } catch (error) {
        console.error('DELETE organizer-notes error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// DELETE: einzelnen Anhang einer Notiz loeschen.
app.delete('/events/:id/organizer-notes/:noteId/attachments/:attId', authenticateAny, async (req, res) => {
    try {
        const event = await ensureOrganizerAccess(req, res, req.params.id);
        if (!event) return;
        const del = await pool.query(
            `DELETE FROM event_organizer_note_attachments a
              USING event_organizer_notes n
              WHERE a.id = $1 AND a.note_id = $2 AND a.note_id = n.id AND n.event_id = $3
              RETURNING a.id`,
            [req.params.attId, req.params.noteId, event.id]
        );
        if (del.rows.length === 0) return res.status(404).json({ error: 'Anhang nicht gefunden' });
        res.json({ success: true });
    } catch (error) {
        console.error('DELETE organizer-note attachment error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET: Anhang herunterladen (Bild/Dokument) — setzt Content-Type + Dateiname.
// Auth per Bearer noetig; Clients laden das Bild via fetch->Blob (nicht <img src>).
app.get('/events/:id/organizer-notes/:noteId/attachments/:attId', authenticateAny, async (req, res) => {
    try {
        const event = await ensureOrganizerAccess(req, res, req.params.id);
        if (!event) return;
        const att = await pool.query(
            `SELECT a.filename, a.content_type, a.data
               FROM event_organizer_note_attachments a
               JOIN event_organizer_notes n ON a.note_id = n.id
              WHERE a.id = $1 AND a.note_id = $2 AND n.event_id = $3`,
            [req.params.attId, req.params.noteId, event.id]
        );
        if (att.rows.length === 0) return res.status(404).json({ error: 'Anhang nicht gefunden' });
        const row = att.rows[0];
        const buffer = Buffer.from(row.data, 'base64');
        res.setHeader('Content-Type', row.content_type || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${(row.filename || 'datei').replace(/"/g, '')}"`);
        res.send(buffer);
    } catch (error) {
        console.error('GET organizer-note attachment error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// DEUTSCH: Server starten auf konfiguriertem Port
app.listen(PORT, () => {
    console.log(`API-Events running on port ${PORT}`);
    ensureOrganizerNotesSchema()
        .then(() => console.log('Organisator-Notizen-Schema bereit'))
        .catch(e => console.error('ensureOrganizerNotesSchema failed:', e.message));
    ensureMitorganisatorenSchema()
        .then(() => console.log('Mitorganisatoren-Schema bereit'))
        .catch(e => console.error('ensureMitorganisatorenSchema failed:', e.message));
    ensureRegistrationConfirmationsSchema()
        .then(() => console.log('Registrierungs-Bestätigungs-Schema bereit'))
        .catch(e => console.error('ensureRegistrationConfirmationsSchema failed:', e.message));
    ensureKasseAnlassSchema()
        .then(() => console.log('TWINT-QR-Schema (Kasse) bereit'))
        .catch(e => console.error('ensureKasseAnlassSchema failed:', e.message));

    // Schicht-Erinnerung eine Stunde vorher (Push), alle 5 Minuten geprueft.
    // Nur Push: Die Mail kommt schon am Vortag (/reminders/send-daily).
    if (process.env.NODE_ENV !== 'test') {
        setTimeout(schichtStundeVorherTick, 90 * 1000);
        setInterval(schichtStundeVorherTick, 5 * 60 * 1000);
    }

    // Arbeitsplan eine Woche vor dem Anlass: stuendlich pruefen (erster Lauf nach
    // 1 Minute). Bewusst nur mit ARBEITSPLAN_REMINDER_ENABLED=true: der Versand
    // schickt echte Mails und kostenpflichtige Briefe, das soll niemand durch
    // ein blosses Deploy ausloesen.
    ensureAnmeldungGemeldetSchema()
        .catch(e => console.error('Schema anmeldung_gemeldet_at:', e.message));

    // Arbeitsplan nach dem Versand geaendert: alle 5 Minuten vergleichen,
    // gebuendelt verschicken (arbeitsplan-update.js). Beim ersten Lauf wird
    // fuer schon verschickte Plaene nur der Stand gemerkt - nichts rueckwirkend.
    // Abschalten mit ARBEITSPLAN_UPDATE_ENABLED=false.
    ensureArbeitsplanUpdateSchema()
        .then(() => {
            if (process.env.NODE_ENV === 'test' || process.env.ARBEITSPLAN_UPDATE_ENABLED === 'false') return;
            setTimeout(() => arbeitsplanUpdateTick().catch(e => console.error('arbeitsplanUpdateTick:', e.message)), 2 * 60 * 1000);
            setInterval(() => arbeitsplanUpdateTick().catch(e => console.error('arbeitsplanUpdateTick:', e.message)), 5 * 60 * 1000);
            console.log('Arbeitsplan-Aenderungen: Timer gestartet');
        })
        .catch(e => console.error('ensureArbeitsplanUpdateSchema failed:', e.message));

    ensureArbeitsplanReminderSchema()
        .then(() => {
            if (process.env.ARBEITSPLAN_REMINDER_ENABLED !== 'true') {
                console.log('Arbeitsplan-Versand eine Woche vorher: aus (ARBEITSPLAN_REMINDER_ENABLED=true zum Einschalten)');
                return;
            }
            setTimeout(arbeitsplanReminderTick, 60 * 1000);
            setInterval(arbeitsplanReminderTick, 60 * 60 * 1000);
            console.log('Arbeitsplan-Versand eine Woche vorher: Timer gestartet');
        })
        .catch(e => console.error('ensureArbeitsplanReminderSchema failed:', e.message));
});
