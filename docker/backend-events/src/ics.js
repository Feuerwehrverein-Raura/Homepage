// DEUTSCH: Ein Anlass als iCalendar-Datei (GET /events/:id/ics, "Zum
// Kalender" in den Apps).
//
// Die Datenbank speichert Ortszeit Zuerich ohne Zone ("2026-10-17 10:00:00");
// genau so geht sie mit TZID=Europe/Zurich hinaus — keine Umrechnung ueber
// die Server-Zeitzone (der Server laeuft auf UTC). Mitternacht heisst
// "ganztaegig" (wie zerlege in app-ansicht.js). Gleicher Aufbau wie bisher
// in der App (flutter/fwv_core kalender_export.dart).
//
// Reine Funktion, getestet in test/organisator-ansicht.test.js.

const appAnsicht = require('./app-ansicht');

const VTIMEZONE_ZUERICH = [
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Zurich',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE'
];

const kompakt = datum => datum.replace(/-/g, '');
const zeitKompakt = zeit => `${zeit.replace(':', '')}00`;

function tagDanach(datum) {
    const [j, m, t] = datum.split('-').map(Number);
    return new Date(Date.UTC(j, m - 1, t + 1)).toISOString().slice(0, 10).replace(/-/g, '');
}

function utc(zeit) {
    return zeit.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Text-Werte nach RFC 5545 maskieren.
function textWert(s) {
    return String(s)
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r\n|\r|\n/g, '\\n');
}

// Zeilen ueber 75 Bytes falten, ohne Mehrbyte-Zeichen zu zerschneiden.
function falten(zeile) {
    if (Buffer.byteLength(zeile) <= 75) return zeile;
    const teile = [];
    let puffer = '';
    let bytes = 0;
    let grenze = 75;
    for (const zeichen of zeile) {
        const laenge = Buffer.byteLength(zeichen);
        if (bytes + laenge > grenze) {
            teile.push(puffer);
            puffer = '';
            bytes = 0;
            grenze = 74;
        }
        puffer += zeichen;
        bytes += laenge;
    }
    teile.push(puffer);
    return teile.join('\r\n ');
}

// .ics-Inhalt oder null, wenn das Datum fehlt oder noch offen ist.
function anlassIcs(event, { zeit = appAnsicht.jetzt() } = {}) {
    if (appAnsicht.istDatumOffen(event)) return null;
    const beginn = appAnsicht.zerlege(event.start_date);
    if (!beginn) return null;
    const ende = appAnsicht.zerlege(event.end_date);
    const ganztags = !beginn.zeit;
    const beschreibung = [event.subtitle, event.description].filter(t => t && String(t).trim()).join('\n\n');

    const zeilen = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Feuerwehrverein Raura//api-events//DE',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        ...(ganztags ? [] : VTIMEZONE_ZUERICH),
        'BEGIN:VEVENT',
        `UID:anlass-${event.id}@fwv-raura.ch`,
        `DTSTAMP:${utc(zeit)}`,
        ...(ganztags
            ? [`DTSTART;VALUE=DATE:${kompakt(beginn.datum)}`,
                // Ende ist bei ganztaegigen Eintraegen exklusiv: Tag danach.
                `DTEND;VALUE=DATE:${tagDanach(ende ? ende.datum : beginn.datum)}`]
            : [`DTSTART;TZID=Europe/Zurich:${kompakt(beginn.datum)}T${zeitKompakt(beginn.zeit)}`,
                ...(ende ? [`DTEND;TZID=Europe/Zurich:${kompakt(ende.datum)}T${ende.zeit ? zeitKompakt(ende.zeit) : '235900'}`] : [])]),
        `SUMMARY:${textWert(event.title || 'Anlass')}`,
        ...(event.location ? [`LOCATION:${textWert(event.location)}`] : []),
        ...(beschreibung ? [`DESCRIPTION:${textWert(beschreibung)}`] : []),
        ...(event.status === 'cancelled' ? ['STATUS:CANCELLED'] : []),
        'END:VEVENT',
        'END:VCALENDAR'
    ];
    return zeilen.map(falten).join('\r\n') + '\r\n';
}

// "Chilbi_2026.ics"
function icsDateiname(event) {
    const basis = String(event.title || '')
        .replace(/[^A-Za-z0-9ÄÖÜäöüéèàç -]/g, '')
        .trim()
        .replace(/\s+/g, '_');
    return `${basis || 'Anlass'}.ics`;
}

module.exports = { anlassIcs, icsDateiname };
