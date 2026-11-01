// Einladung zu einem Anlass - Inhalt im Layout von vorstand.html
// (buildEventInvitationBody): Titel, Einleitung, Beschreibung, Tabelle
// Was/Wo/Wann/Anmeldung/Anmeldeschluss/Kosten, bei Helfer-Anlaessen die
// Schichten, Gruss mit Praesident und Aktuar und QR-Code zur Anmeldung.
//
// Bisher gab es dieses Layout nur im Browser (vorstand.html); die App schickte
// Einladungen deshalb im Standard-Layout. Hier steht es fuer alle: Brief und
// E-Mail (nachricht-layout.js, Option inhaltHtml) und damit Website und App.
//
// Zeiten liegen als Schweizer Ortszeit ohne Zeitzone in der Datenbank
// (timestamp without time zone) - darum als Text gelesen (anlassLaden), nicht
// als Date: so rechnet nichts um.

const QRCode = require('qrcode');
const L = require('./nachricht-layout');

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August',
    'September', 'Oktober', 'November', 'Dezember'];
const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

// Anlass-Arten mit Helferaufruf statt Einladung (HELFER_KATEGORIEN, vorstand.html).
const HELFER_KATEGORIEN = ['Dorffest'];

/** "2026-11-28T18:00" -> { datum: "Samstag, 28. November 2026", zeit: "18:00" }. */
function zeitpunkt(text) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(text || ''));
    if (!m) return null;
    const [, j, mo, t, h, mi] = m;
    const tag = new Date(Date.UTC(+j, +mo - 1, +t)).getUTCDay();
    return {
        tag: `${j}-${mo}-${t}`,
        datum: `${WOCHENTAGE[tag]}, ${+t}. ${MONATE[+mo - 1]} ${j}`,
        kurz: `${+t}. ${MONATE[+mo - 1]} ${j}`,
        zeit: h ? `${h}:${mi}` : null
    };
}

/** Wann-Zeile: "Samstag, 28. November 2026, 18:00–22:00 Uhr". */
function wannText(anlass) {
    if (anlass.datum_offen) return 'Datum noch offen';
    const von = zeitpunkt(anlass.start_date);
    if (!von) return '';
    const bis = zeitpunkt(anlass.end_date);
    if (!bis) return von.zeit ? `${von.datum}, ${von.zeit} Uhr` : von.datum;
    if (bis.tag === von.tag) {
        return von.zeit && bis.zeit ? `${von.datum}, ${von.zeit}–${bis.zeit} Uhr` : von.datum;
    }
    const a = von.zeit ? `${von.datum}, ${von.zeit} Uhr` : von.datum;
    const b = bis.zeit ? `${bis.datum}, ${bis.zeit} Uhr` : bis.datum;
    return `${a} – ${b}`;
}

/** Anmeldeschluss als Datum ("22. November 2026"). */
function schlussText(anlass) {
    const s = zeitpunkt(anlass.registration_deadline);
    return s ? s.kurz : '';
}

/** Adresse der Anlass-Seite (wie der QR in vorstand.html). */
function anlassSeite(anlass) {
    return `https://www.fwv-raura.ch/events.html?event=${encodeURIComponent(anlass.slug || anlass.id)}`;
}

/** {{event_title}}, {{event_date}}, {{event_location}} im Text ersetzen. */
function anlassPlatzhalter(text, anlass) {
    if (!text || !anlass) return text || '';
    return String(text)
        .replace(/\{\{\s*event_title\s*\}\}/g, () => anlass.title || '')
        .replace(/\{\{\s*event_date\s*\}\}/g, () => wannText(anlass))
        .replace(/\{\{\s*event_location\s*\}\}/g, () => anlass.location || '');
}

const ZELLE = 'font-weight:bold;padding:0.5mm 5mm 0.5mm 0;vertical-align:top;';

/** Schichten nach Tag (Helferaufruf), leer ohne Schichten oder bei anderen Arten. */
function schichtBlock(anlass, schichten) {
    if (!HELFER_KATEGORIEN.includes(anlass.category || '') || !schichten || !schichten.length) return '';
    const nachTag = {};
    for (const s of schichten) (nachTag[String(s.date || '').slice(0, 10)] ||= []).push(s);
    const zeit = t => String(t || '').slice(0, 5);
    const zeilen = Object.keys(nachTag).sort().map(tag => {
        const eintraege = nachTag[tag]
            .sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')))
            .map(s => {
                const spanne = s.start_time ? `${zeit(s.start_time)}–${zeit(s.end_time)}` : '';
                return `${L.escapeHtml(s.bereich || s.name || '')} ${spanne} (${L.escapeHtml(s.needed || 1)})`;
            }).join(' &middot; ');
        const z = zeitpunkt(tag);
        const titel = z ? `${z.datum.split(',')[0]}, ${tag.split('-').reverse().join('.')}` : tag;
        return `<tr><td style="${ZELLE}white-space:nowrap;">${titel}</td><td>${eintraege}</td></tr>`;
    }).join('');
    // Zwei Zahlen, die gern verwechselt werden: wie viele Schichten
    // ausgeschrieben sind und wie viele Helfer sie zusammen brauchen.
    const gesamt = schichten.reduce((n, s) => n + (Number(s.needed) || 1), 0);
    return `
                <div style="margin:3mm 0 1mm 0;font-weight:bold;">Wir suchen Helferinnen und Helfer</div>
                <div style="margin:0 0 2mm 0;">Ausgeschrieben sind
                    <strong>${schichten.length} verschiedene Schichten</strong> mit zusammen
                    <strong>${gesamt} Helferschichten</strong>, die besetzt werden wollen.
                    Trag dich für die Schichten ein, die dir passen —
                    über den QR-Code unten oder auf <strong>www.fwv-raura.ch</strong> beim Anlass.
                    Zwei Schichten am Stück sind uns lieber als zwei einzelne über den Tag verteilt.</div>
                <table style="border-collapse:collapse;margin:0 0 3mm 0;">${zeilen}</table>
                <div style="margin:0 0 3mm 0;font-size:9pt;color:#555;">Die Zahl in Klammern ist der Bedarf pro Schicht.</div>`;
}

/**
 * Inhalt der Einladung als HTML (ohne Briefkopf - den setzt
 * nachricht-layout.js). [introHtml] ist der vom Vorstand geschriebene Text,
 * schon als HTML (L.textZuHtml) und mit Mitglieder-Platzhaltern ersetzt.
 * [qr] ist ein data:-Bild oder leer.
 */
function einladungHtml({ anlass, schichten = [], introHtml = '', praesident, aktuar, qr = '' }) {
    const e = L.escapeHtml;
    const wann = wannText(anlass);
    const schluss = schlussText(anlass);
    const zeilen = [
        `<tr><td style="${ZELLE}width:38mm;">Was:</td><td>${e(anlass.title)}</td></tr>`,
        anlass.location ? `<tr><td style="${ZELLE}">Wo:</td><td>${e(anlass.location)}</td></tr>` : '',
        wann ? `<tr><td style="${ZELLE}">Wann:</td><td style="font-weight:bold;">${e(wann)}</td></tr>` : '',
        `<tr><td style="${ZELLE}">Anmeldung:</td><td>${anlass.registration_required ? 'Zwingend' : 'Freiwillig'}</td></tr>`,
        schluss ? `<tr><td style="${ZELLE}color:#c00;">Anmeldeschluss:</td><td style="color:#c00;font-weight:bold;">${e(schluss)}</td></tr>` : '',
        anlass.cost ? `<tr><td style="${ZELLE}">Kosten:</td><td>${e(anlass.cost)}</td></tr>` : ''
    ].filter(Boolean).join('');
    const beschreibung = anlass.description
        ? `<div style="margin:0 0 3mm 0;white-space:pre-wrap;">${e(anlass.description)}</div>`
        : '';
    const schichtHtml = schichtBlock(anlass, schichten);
    const untertitel = anlass.subtitle || wann;
    const seite = anlassSeite(anlass);
    return `
                <div style="font-size:13pt;font-weight:bold;text-decoration:underline;margin-bottom:1mm;">${e(anlass.title)}</div>
                ${untertitel ? `<div style="font-size:10pt;margin-bottom:3mm;">${e(untertitel)}</div>` : ''}
                <hr style="border:none;border-top:1px solid #000;margin:0 0 3mm 0;">
                ${introHtml ? `<div style="margin-bottom:3mm;">${introHtml}</div>` : ''}
                ${beschreibung}
                <p style="margin:0 0 2mm 0;">Die wichtigsten Daten nochmals zusammengefasst:</p>
                <table style="margin:0 0 3mm 0;border-collapse:collapse;">${zeilen}</table>
                ${schichtHtml}
                <p style="margin:0 0 3mm 0;">Anmeldung und alle Infos: <a href="${e(seite)}">${e(seite)}</a></p>
                <p style="margin:0;">${schichtHtml
        ? 'Ohne Helferinnen und Helfer geht es nicht — herzlichen Dank fürs Mitmachen.'
        : 'Wir freuen uns über zahlreiches Erscheinen.'}</p>
                <p style="margin:0 0 3mm 0;">Im Namen des Vorstandes.</p>
                <p style="margin:0 0 6mm 0;">Mit freundlichen Grüssen</p>
                <table style="width:100%;border-collapse:collapse;page-break-inside:avoid;">
                    <tr>
                        <td style="vertical-align:top;width:50%;"><div>${e(praesident || 'Präsident FWV Raura')}</div><div>Präsident</div></td>
                        <td style="vertical-align:top;width:30%;"><div>${e(aktuar || 'Aktuar FWV Raura')}</div><div>Aktuar</div></td>
                        <td style="vertical-align:top;width:20%;text-align:right;">${qr ? `<img src="${qr}" alt="QR-Code Anlass" style="width:25mm;height:25mm;">` : ''}</td>
                    </tr>
                </table>`;
}

/** Anlass, Schichten, Praesident und Aktuar aus der Datenbank, dazu der QR. */
async function einladungDaten(pool, eventId) {
    const r = await pool.query(
        `SELECT id, slug, title, subtitle, description, location, category, cost, datum_offen,
                registration_required,
                to_char(start_date, 'YYYY-MM-DD"T"HH24:MI') AS start_date,
                to_char(end_date, 'YYYY-MM-DD"T"HH24:MI') AS end_date,
                to_char(registration_deadline, 'YYYY-MM-DD"T"HH24:MI') AS registration_deadline
           FROM events WHERE id::text = $1`, [String(eventId)]);
    const anlass = r.rows[0];
    if (!anlass) return null;
    const schichten = (await pool.query(
        `SELECT to_char(date, 'YYYY-MM-DD') AS date, start_time::text AS start_time, end_time::text AS end_time,
                bereich, name, needed
           FROM shifts WHERE event_id = $1 ORDER BY date, start_time`, [anlass.id])).rows;
    const funktion = async muster => {
        const m = (await pool.query(
            `SELECT vorname, nachname FROM members WHERE funktion ~* $1 AND funktion !~* 'vize'
              ORDER BY nachname LIMIT 1`, [muster])).rows[0];
        return m ? `${m.vorname || ''} ${m.nachname || ''}`.trim() : null;
    };
    const qr = await QRCode.toDataURL(anlassSeite(anlass), { margin: 0, errorCorrectionLevel: 'M', scale: 4 });
    return { anlass, schichten, praesident: await funktion('pr[aä]sident'), aktuar: await funktion('aktuar'), qr };
}

module.exports = {
    HELFER_KATEGORIEN, zeitpunkt, wannText, schlussText, anlassSeite, anlassPlatzhalter,
    schichtBlock, einladungHtml, einladungDaten
};
