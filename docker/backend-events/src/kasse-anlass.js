// ---------------------------------------------------------------------------
// Kasse <-> Anlass (Oktober 2026)
//
// Die Kasse (simple-order-system, order.fwv-raura.ch) zeigt bei TWINT einen
// QR-Code. Bisher gab es dort genau einen; jetzt kann jeder Anlass seinen
// eigenen haben (z.B. Chilbi auf ein anderes Konto als die GV). Die Kasse
// fragt hier nach dem Anlass, der gerade laeuft, und nimmt dessen QR - hat
// der Anlass keinen, gilt der Vereins-Standard (twint-qr.png der Kasse).
//
// Regel "aktueller Anlass":
//  - laeuft gerade: Beginn - 2 h bis Ende + 2 h, Ortszeit Europe/Zurich
//    (start_date/end_date sind TIMESTAMP ohne Zone und meinen Ortszeit).
//    Ohne Ende gilt das Ende des Starttages (23:59:59).
//  - nicht abgesagt, kein Entwurf, kein Vorschlag (auch nicht abgelehnt),
//    nicht "Datum noch offen" (dort ist start_date nur ein Platzhalter).
//  - bei mehreren: der zuletzt begonnene (der Aufbau-Anlass am Nachmittag
//    weicht dem Fest am Abend).
// Anders als der Kiosk (/arbeitsplan/kiosk: laufend oder naechster, nur mit
// Schichten): Fuer eine Zahlung darf kein Anlass von naechster Woche gelten.
//
// Das Bild liegt wie pdf_attachment als Base64 in der Datenbank - aber in
// einer eigenen Tabelle, damit die vielen "SELECT e.*" nicht bei jedem
// Abruf ein Bild mitschleppen. events.twint_qr_url zeigt auf den Abruf
// (/events/<id>/twint-qr?v=<Zeitstempel>) oder ist NULL.
// ---------------------------------------------------------------------------

const PUFFER_MS = 2 * 60 * 60 * 1000;
const AUSGESCHLOSSEN = ['cancelled', 'draft', 'proposed', 'rejected'];
const MAX_BILD_BYTES = 2 * 1024 * 1024;

// Bildtypen, die als QR-Code taugen. Kein SVG: das liefe als Dokument mit
// Skript im Browser, wenn jemand die Bild-Adresse direkt oeffnet.
const BILDTYPEN = {
    'image/png': b => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
    'image/jpeg': b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    'image/webp': b => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
    'image/gif': b => b.length > 6 && b.toString('ascii', 0, 4) === 'GIF8'
};

const SCHEMA_SQL = [
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS twint_qr_url TEXT`,
    `CREATE TABLE IF NOT EXISTS event_twint_qr (
        event_id UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
        content_type VARCHAR(40) NOT NULL,
        data TEXT NOT NULL,
        groesse INTEGER,
        hochgeladen_von VARCHAR(200),
        hochgeladen_am TIMESTAMP NOT NULL DEFAULT NOW()
    )`
];

// 'YYYY-MM-DD HH:MM[:SS]' (Ortszeit, ohne Zone) -> vergleichbare Zahl.
// Bewusst ohne Zeitzone gerechnet: beide Seiten sind Zuercher Ortszeit.
function ortszeitMs(wert) {
    if (!wert) return null;
    const m = String(wert).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}

// Ende des Anlasses (Ortszeit-ms): end_date, sonst Ende des Starttages.
function endeMs(anlass) {
    const ende = ortszeitMs(anlass.end_date);
    if (ende !== null) return ende;
    const start = ortszeitMs(anlass.start_date);
    if (start === null) return null;
    const tag = new Date(start);
    return Date.UTC(tag.getUTCFullYear(), tag.getUTCMonth(), tag.getUTCDate(), 23, 59, 59);
}

function zaehltFuerKasse(anlass) {
    if (!anlass || anlass.datum_offen === true) return false;
    return !AUSGESCHLOSSEN.includes(String(anlass.status || '').toLowerCase());
}

// Laeuft der Anlass zum Zeitpunkt (Ortszeit 'YYYY-MM-DD HH:MM:SS')?
function laeuft(anlass, zeitpunkt) {
    if (!zaehltFuerKasse(anlass)) return false;
    const jetzt = ortszeitMs(zeitpunkt);
    const start = ortszeitMs(anlass.start_date);
    const ende = endeMs(anlass);
    if (jetzt === null || start === null || ende === null) return false;
    return start - PUFFER_MS <= jetzt && jetzt <= ende + PUFFER_MS;
}

// Der aktuelle Anlass fuer die Kasse - oder null. Bei mehreren gewinnt der
// zuletzt begonnene; bei gleichem Beginn entscheidet die id (stabil).
function aktuellerAnlass(anlaesse, zeitpunkt) {
    const laufend = (anlaesse || []).filter(a => laeuft(a, zeitpunkt));
    laufend.sort((a, b) => (ortszeitMs(b.start_date) - ortszeitMs(a.start_date))
        || String(b.id).localeCompare(String(a.id)));
    return laufend[0] || null;
}

// Auswahlliste fuer die Kassen-Einstellungen: laufende und kommende Anlaesse
// (Ende + 2 h noch nicht vorbei), aelteste zuerst.
function kommendeAnlaesse(anlaesse, zeitpunkt, limit = 30) {
    const jetzt = ortszeitMs(zeitpunkt);
    return (anlaesse || [])
        .filter(a => zaehltFuerKasse(a) && endeMs(a) !== null && endeMs(a) + PUFFER_MS >= jetzt)
        .sort((a, b) => (ortszeitMs(a.start_date) - ortszeitMs(b.start_date))
            || String(a.id).localeCompare(String(b.id)))
        .slice(0, limit);
}

// Hat der Anlass Service (Bedienung an den Tischen)? Dann zeigt die Kasse
// Tische und die Bestellart "Tisch", sonst nur Bar. Massgebend sind die
// Schichten: mindestens eine mit Bereich "Service" - oder, weil der Bereich
// oft auf "Allgemein" stehen bleibt, mit dem Wort "Service" im Namen
// ("Service", "Service Abend", "Service 1"). Gross/klein egal.
// schichten: [{ bereich, name }] (aus SCHICHTEN_SQL) oder null.
const SERVICE_WORT = /(^|[^a-z0-9äöüß])service([^a-z0-9äöüß]|$)/i;
function istServiceSchicht(schicht) {
    if (!schicht) return false;
    const bereich = String(schicht.bereich || '').trim().toLowerCase();
    if (bereich === 'service') return true;
    return SERVICE_WORT.test(String(schicht.name || '').trim());
}

function hatService(schichten) {
    return Array.isArray(schichten) && schichten.some(istServiceSchicht);
}

// Spalte "schichten" fuer die Kassen-Abfragen (Tabellen-Alias e = events).
const SCHICHTEN_SQL = `(SELECT COALESCE(json_agg(json_build_object('bereich', s.bereich, 'name', s.name)), '[]'::json)
            FROM shifts s WHERE s.event_id = e.id) AS schichten`;

// Was die Kasse von einem Anlass braucht - nicht mehr.
function kassenAnsicht(anlass) {
    if (!anlass) return null;
    return {
        id: anlass.id,
        title: anlass.title,
        start_date: anlass.start_date,
        end_date: anlass.end_date || null,
        location: anlass.location || null,
        status: anlass.status || null,
        twint_qr_url: anlass.twint_qr_url || null,
        hat_service: hatService(anlass.schichten)
    };
}

// Hochgeladenes Bild pruefen: { data (Base64 oder data:-URI), content_type }.
// Liefert { buffer, contentType } oder { fehler, status }.
function bildPruefen(body) {
    let data = body && typeof body.data === 'string' ? body.data.trim() : '';
    let contentType = body && typeof body.content_type === 'string' ? body.content_type.trim().toLowerCase() : '';
    if (data.startsWith('data:')) {
        const komma = data.indexOf(',');
        if (komma === -1) return { fehler: 'Ungueltige data:-Adresse', status: 400 };
        const kopf = data.substring(5, komma).split(';')[0].toLowerCase();
        if (!contentType && kopf) contentType = kopf;
        data = data.substring(komma + 1);
    }
    if (!data) return { fehler: 'Kein Bild (data fehlt)', status: 400 };
    if (contentType === 'image/jpg') contentType = 'image/jpeg';
    const buffer = Buffer.from(data, 'base64');
    if (buffer.length === 0) return { fehler: 'Kein Bild (data leer)', status: 400 };
    if (buffer.length > MAX_BILD_BYTES) return { fehler: 'Bild zu gross (max 2 MB)', status: 413 };
    // Typ aus dem Inhalt bestimmen; die Angabe des Absenders ist nur ein Hinweis.
    const erkannt = Object.keys(BILDTYPEN).find(t => BILDTYPEN[t](buffer));
    if (!erkannt) return { fehler: 'Nur PNG, JPEG, WebP oder GIF erlaubt', status: 400 };
    return { buffer, contentType: erkannt };
}

function qrPfad(eventId, zeit = Date.now()) {
    return `/events/${eventId}/twint-qr?v=${zeit}`;
}

module.exports = {
    SCHEMA_SQL, MAX_BILD_BYTES, PUFFER_MS,
    ortszeitMs, endeMs, laeuft, aktuellerAnlass, kommendeAnlaesse, kassenAnsicht,
    istServiceSchicht, hatService, SCHICHTEN_SQL,
    bildPruefen, qrPfad, zaehltFuerKasse
};
