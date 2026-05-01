/**
 * Taeglicher Backup-Export aller Vereinsdaten als XLSX, gemailt an den Vorstand.
 *
 * Sheets: Mitglieder, Beitraege, Rechnungen, Buchhaltung, Anmeldungen,
 *         Anlaesse, Versand, Audit-Log, Service-Accounts (nur Metadaten).
 *
 * Empfaenger: process.env.BACKUP_EMAIL (default: vorstand@fwv-raura.ch).
 * Wird bei Container-Start auf 03:00 Europe/Zurich geplant; nach jedem Lauf
 * wird der naechste Tag gleicher Zeit gesetzt.
 */

const XLSX = require('xlsx');
const axios = require('axios');

const yesNo = (v) => v === true ? 'ja' : v === false ? 'nein' : '';

async function loadAll(pool) {
    const q = (sql, params = []) => pool.query(sql, params).then(r => r.rows).catch(err => {
        console.error('[BACKUP] Query failed:', err.message, '|', sql.slice(0, 80));
        return [];
    });

    const [members, fees, invoices, transactions, registrations, events, dispatches, audit, serviceAccts, scheduled] = await Promise.all([
        q(`SELECT * FROM members ORDER BY nachname, vorname`),
        q(`SELECT p.*, m.vorname, m.nachname FROM membership_fee_payments p
           LEFT JOIN members m ON p.member_id = m.id
           ORDER BY p.year DESC, m.nachname`),
        q(`SELECT i.*, m.vorname, m.nachname FROM invoices i
           LEFT JOIN members m ON i.member_id = m.id
           ORDER BY i.issued_date DESC NULLS LAST`),
        q(`SELECT t.*, m.vorname, m.nachname FROM transactions t
           LEFT JOIN members m ON t.member_id = m.id
           ORDER BY t.date DESC`),
        q(`SELECT r.*, e.title AS event_title, m.vorname, m.nachname FROM registrations r
           LEFT JOIN events e ON r.event_id = e.id
           LEFT JOIN members m ON r.member_id = m.id
           ORDER BY r.created_at DESC`),
        q(`SELECT * FROM events ORDER BY start_date DESC`),
        q(`SELECT d.*, m.vorname, m.nachname FROM dispatch_log d
           LEFT JOIN members m ON d.member_id = m.id
           WHERE d.created_at >= NOW() - INTERVAL '90 days'
           ORDER BY d.created_at DESC`),
        q(`SELECT * FROM audit_log
           WHERE created_at >= NOW() - INTERVAL '90 days'
           ORDER BY created_at DESC LIMIT 5000`),
        q(`SELECT account_name, username, display_name, description, rotation_days, updated_at
           FROM service_account_credentials ORDER BY account_name`),
        q(`SELECT id, action, label, scheduled_at, status, started_at, finished_at
           FROM scheduled_jobs WHERE created_at >= NOW() - INTERVAL '30 days'
           ORDER BY scheduled_at DESC`)
    ]);

    return { members, fees, invoices, transactions, registrations, events, dispatches, audit, serviceAccts, scheduled };
}

function buildWorkbook(data) {
    const wb = XLSX.utils.book_new();

    const memberRows = data.members
        .filter(m => m.status !== 'Verstorben')
        .map(m => ({
            ID: m.id,
            Anrede: m.anrede || '', Vorname: m.vorname || '', Nachname: m.nachname || '',
            Geschlecht: m.geschlecht || '', Geburtstag: m.geburtstag || '',
            Eintrittsdatum: m.eintrittsdatum || '', Austrittsdatum: m.austrittsdatum || '',
            Strasse: m.strasse || '', Adresszusatz: m.adresszusatz || '',
            PLZ: m.plz || '', Ort: m.ort || '',
            'E-Mail': m.email || '', 'Versand-E-Mail': m.versand_email || '',
            Telefon: m.telefon || '', Mobile: m.mobile || '',
            Status: m.status || '', Funktion: m.funktion || '',
            'Feuerwehr-Zugehoerigkeit': m.feuerwehr_zugehoerigkeit || '',
            'T-Shirt-Groesse': m.tshirt_groesse || '', IBAN: m.iban || '',
            'Zustellung E-Mail': yesNo(m.zustellung_email),
            'Zustellung Post': yesNo(m.zustellung_post),
            Bemerkungen: m.bemerkungen || '',
            'Authentik-Synced': m.authentik_synced_at || ''
        }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(memberRows), 'Mitglieder');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.fees.map(p => ({
        Mitglied: `${p.vorname || ''} ${p.nachname || ''}`.trim(),
        'Member-ID': p.member_id, Jahr: p.year, Betrag: p.amount,
        Status: p.status, 'Bezahlt am': p.paid_date || '',
        Referenz: p.reference_nr || '', 'Bank-Referenz': p.bank_reference || '',
        Zahlungsart: p.payment_method || '', Notizen: p.notes || '',
        Erstellt: p.created_at || ''
    }))), 'Beitraege');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.invoices.map(i => ({
        Nummer: i.number, Mitglied: `${i.vorname || ''} ${i.nachname || ''}`.trim(),
        Empfaenger: i.recipient_name || '',
        Adresse: (i.recipient_address || '').replace(/\n/g, ', '),
        Subtotal: i.subtotal, MwSt: i.tax, Total: i.total,
        Status: i.status, Ausgestellt: i.issued_date || '',
        Faellig: i.due_date || '', Bezahlt: i.paid_date || '',
        Notizen: i.notes || ''
    }))), 'Rechnungen');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.transactions.map(t => ({
        Datum: t.date, Beschreibung: t.description, Betrag: t.amount,
        'Soll-Konto': t.debit_account_id || '', 'Haben-Konto': t.credit_account_id || '',
        Mitglied: `${t.vorname || ''} ${t.nachname || ''}`.trim(),
        'Event-ID': t.event_id || '', 'Rechnungs-ID': t.invoice_id || '',
        Beleg: t.receipt_url || ''
    }))), 'Buchhaltung');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.registrations.map(r => {
        let parsed = {};
        try { parsed = typeof r.notes === 'string' ? JSON.parse(r.notes) : (r.notes || {}); } catch (_) {}
        return {
            Anlass: r.event_title || '',
            Mitglied: r.member_id ? `${r.vorname || ''} ${r.nachname || ''}`.trim() : '',
            Gast: r.guest_name || '', 'Gast-Email': r.guest_email || '',
            Telefon: parsed.phone || '', Personen: parsed.participants || '',
            Status: r.status, Erstellt: r.created_at || '',
            Bestaetigt: r.approved_at || '', Notizen: parsed.notes || ''
        };
    })), 'Anmeldungen');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.events.map(e => ({
        ID: e.id, Titel: e.title, Kategorie: e.category || '',
        Start: e.start_date || '', Ende: e.end_date || '',
        Ort: e.location || '', Anmeldeschluss: e.registration_deadline || '',
        'Max. Teilnehmer': e.max_participants || '',
        Status: e.status || '', Organisator: e.organizer_email || '',
        Beschreibung: (e.description || '').slice(0, 500)
    }))), 'Anlaesse');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.dispatches.map(d => ({
        Datum: d.sent_at || d.created_at || '',
        Typ: d.type, Status: d.status,
        Empfaenger: d.recipient_email || d.recipient_address || '',
        Mitglied: `${d.vorname || ''} ${d.nachname || ''}`.trim(),
        Betreff: d.subject || '', Fehler: d.error_message || ''
    }))), 'Versand');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.audit.map(a => ({
        Zeit: a.created_at, Aktion: a.action, EntityType: a.entity_type || '',
        EntityID: a.entity_id || '', Email: a.email || '', IP: a.ip_address || '',
        Werte: typeof a.new_values === 'object' ? JSON.stringify(a.new_values) : (a.new_values || '')
    }))), 'Audit-Log');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.serviceAccts.map(s => ({
        Account: s.account_name, User: s.username, Anzeige: s.display_name,
        Beschreibung: s.description, 'Rotation (Tage)': s.rotation_days,
        'Letzte Aenderung': s.updated_at
    }))), 'Service-Accounts');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.scheduled.map(j => ({
        Aktion: j.action, Bezeichnung: j.label || '',
        Geplant: j.scheduled_at, Status: j.status,
        Gestartet: j.started_at || '', Beendet: j.finished_at || ''
    }))), 'Scheduled-Jobs');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function runDailyBackup(pool) {
    const recipient = process.env.BACKUP_EMAIL || 'vorstand@fwv-raura.ch';
    const PORT = process.env.PORT || 3000;
    console.log('[BACKUP] Starting daily backup export ->', recipient);
    try {
        const data = await loadAll(pool);
        const buf = buildWorkbook(data);
        const today = new Date().toISOString().split('T')[0];
        const filename = `fwv-backup-${today}.xlsx`;

        const apiKey = process.env.API_KEY || process.env.INTERNAL_API_KEY;
        await axios.post(`http://localhost:${PORT}/email/send`, {
            to: recipient,
            subject: `FWV Raura — Tagesbackup ${today}`,
            body: `Anbei das automatische Tagesbackup aller Vereinsdaten als Excel-Datei.\n\n` +
                  `Inhalt: Mitglieder, Beitraege, Rechnungen, Buchhaltung, Anmeldungen, Anlaesse, ` +
                  `Versand-Historie (90 Tage), Audit-Log (90 Tage), Service-Accounts, Scheduled-Jobs.\n\n` +
                  `Diese E-Mail wird taeglich automatisch versendet. Bitte sicher archivieren.\n\n` +
                  `Feuerwehrverein Raura`,
            attachments: [{
                filename,
                content: buf.toString('base64'),
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }]
        }, { headers: apiKey ? { 'x-api-key': apiKey } : {} });

        console.log(`[BACKUP] Sent ${filename} (${buf.length} bytes) to ${recipient}`);
    } catch (err) {
        console.error('[BACKUP] Daily backup failed:', err.message);
    }
}

/**
 * Plant den naechsten Lauf auf 03:00 Europe/Zurich (lokal). Nach jedem Lauf
 * wird neu auf naechsten Tag 03:00 geplant. setTimeout statt setInterval —
 * so ist die Uhrzeit stabil auch ueber DST-Wechsel.
 */
function scheduleNext(pool) {
    const now = new Date();
    const next = new Date(now);
    next.setHours(3, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const ms = next.getTime() - now.getTime();
    console.log('[BACKUP] Next daily backup scheduled at', next.toISOString(), `(in ${Math.round(ms / 60000)} min)`);
    setTimeout(async () => {
        await runDailyBackup(pool);
        scheduleNext(pool);
    }, ms);
}

module.exports = { runDailyBackup, scheduleNext };
