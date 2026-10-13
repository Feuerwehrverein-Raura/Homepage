// DEUTSCH: Anzeige-fertige Werte fuer die Apps ("app"-Bloecke).
//
// Die neue Flutter-Mitglieder-App rechnet nichts selbst: Datumstexte,
// Belegung, ob man sich anmelden kann und warum nicht, Status-Texte — das
// alles liefert das Backend fertig. Bisher hat jede App (Android, iOS) das
// selbst gerechnet, jede ein bisschen anders.
//
// Nur reine Funktionen, ohne Datenbank und ohne Server: getestet in
// test/app-ansicht.test.js, der Vertrag mit der App in test/app-vertrag.test.js
// (fixtures/anlaesse-app.json, meine-anmeldungen.json, kalender-app.json).
//
// Zeiten: Die Datenbank speichert Anlaesse und Schichten als Ortszeit ohne
// Zeitzone ("2026-10-17 17:00:00"). Der Server laeuft auf UTC; "heute" und
// "jetzt" werden deshalb ausdruecklich in Europe/Zurich bestimmt.

const { bereichLesbar } = require('./arbeitsplan');
const { anlassLogo, anlassReihe } = require('./anlass-logo');

// Kategorien, bei denen eine Anmeldung noetig ist. Stand bisher doppelt in
// den Apps (members-android OrganizerEditEventActivity, members-ios
// OrganizerOptions) — hier ist jetzt die einzige Quelle.
const ANMELDEPFLICHTIGE_KATEGORIEN = ['Dorffest', 'GV', 'Aufbau', 'Abbau', 'Ausflug mit Anmeldung'];
const KATEGORIEN = ['Dorffest', 'GV', 'Aufbau', 'Abbau', 'Ausflug', 'Ausflug mit Anmeldung', 'Sonstiges'];
const BEREICHE = ['Allgemein', 'Kueche', 'Bar', 'Service', 'Kasse', 'Springer', 'Vorbereitung', 'Aufbau', 'Abbau'];

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August',
    'September', 'Oktober', 'November', 'Dezember'];

// "Jetzt" — in Tests ueber TEST_JETZT festgelegt, damit die Vertrags-Dateien
// nicht jeden Tag anders aussehen. In Produktion nie gesetzt.
function jetzt() {
    const fest = process.env.TEST_JETZT;
    if (fest) {
        const d = new Date(fest);
        if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date();
}

// Zeitpunkt -> Ortszeit Zuerich: { datum: 'YYYY-MM-DD', zeitpunkt: 'YYYY-MM-DD HH:MM:SS' }
function zuerich(zeit = jetzt()) {
    const teile = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(zeit).map(p => [p.type, p.value]));
    const datum = `${teile.year}-${teile.month}-${teile.day}`;
    return { datum, zeitpunkt: `${datum} ${teile.hour}:${teile.minute}:${teile.second}` };
}

// Wert aus der Datenbank ("2026-10-17", "2026-10-17 17:00:00",
// "2026-10-17T17:00", Date) -> { datum, zeit } mit zeit 'HH:MM' oder null.
// Mitternacht gilt als "keine Uhrzeit" (so werden ganztaegige Anlaesse
// gespeichert).
function zerlege(wert) {
    if (wert === null || wert === undefined || wert === '') return null;
    const text = wert instanceof Date ? wert.toISOString() : String(wert);
    const m = text.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
    if (!m) return null;
    const zeit = m[2] && m[2] !== '00:00' ? m[2] : null;
    return { datum: m[1], zeit };
}

function uhrzeit(wert) {
    if (!wert) return null;
    const m = String(wert).match(/^(\d{2}:\d{2})/);
    return m ? m[1] : null;
}

function wochentagIndex(datum) {
    const [j, mo, t] = datum.split('-').map(Number);
    return new Date(Date.UTC(j, mo - 1, t)).getUTCDay();
}

// "Samstag, 17. Oktober 2026"
function datumLang(datum) {
    if (!datum) return null;
    const [j, mo, t] = datum.slice(0, 10).split('-').map(Number);
    return `${WOCHENTAGE[wochentagIndex(datum.slice(0, 10))]}, ${t}. ${MONATE[mo - 1]} ${j}`;
}

// "Sa 17.10." bzw. mit Jahr "Sa 17.10.2026"
function datumKurz(datum, mitJahr = false) {
    if (!datum) return null;
    const d = datum.slice(0, 10);
    const [j, mo, t] = d.split('-');
    return `${WOCHENTAGE[wochentagIndex(d)].slice(0, 2)} ${t}.${mo}.${mitJahr ? j : ''}`;
}

// "17:00–22:00", "17:00" oder null (ohne "Uhr")
function zeitspanne(von, bis) {
    const a = uhrzeit(von), b = uhrzeit(bis);
    if (a && b) return `${a}–${b}`;
    return a || null;
}

// Datum eines Anlasses: ein Tag lang ausgeschrieben, mehrere Tage kurz als
// Spanne ("Sa 17.10. – So 18.10.2026"; ueber den Jahreswechsel mit beiden
// Jahren).
function anlassDatumText(start, ende) {
    const s = zerlege(start);
    if (!s) return null;
    const e = zerlege(ende);
    if (!e || e.datum <= s.datum) return datumLang(s.datum);
    const gleichesJahr = s.datum.slice(0, 4) === e.datum.slice(0, 4);
    return `${datumKurz(s.datum, !gleichesJahr)} – ${datumKurz(e.datum, true)}`;
}

// Uhrzeit eines Anlasses: am selben Tag "17:00–22:00 Uhr" (oder "17:00 Uhr"),
// ueber mehrere Tage "ab 17:00 Uhr"; ohne Uhrzeit null.
function anlassZeitText(start, ende) {
    const s = zerlege(start);
    if (!s || !s.zeit) return null;
    const e = zerlege(ende);
    if (e && e.datum > s.datum) return `ab ${s.zeit} Uhr`;
    return `${zeitspanne(s.zeit, e && e.datum === s.datum ? e.zeit : null)} Uhr`;
}

// "Donnerstag, 15. Oktober 2026, 23:59 Uhr"
function zeitpunktText(wert) {
    const z = zerlege(wert);
    if (!z) return null;
    return z.zeit ? `${datumLang(z.datum)}, ${z.zeit} Uhr` : datumLang(z.datum);
}

function anmeldungPflicht(event) {
    return event.registration_required === true || ANMELDEPFLICHTIGE_KATEGORIEN.includes(event.category);
}

function plaetzeText(offen) {
    if (offen <= 0) return 'voll';
    return offen === 1 ? '1 Platz frei' : `${offen} Plätze frei`;
}

// Letzter Tag eines Anlasses (Ende, sonst Beginn)
function letzterTag(event) {
    const z = zerlege(event.end_date) || zerlege(event.start_date);
    return z ? z.datum : null;
}

// Laeuft der Anlass heute noch oder kommt er erst? (Ende bzw. Beginn, bis
// Ende jenes Tages, Ortszeit Zuerich)
function istAktuell(event, zeit = jetzt()) {
    const tag = letzterTag(event);
    return !tag || tag >= zuerich(zeit).datum;
}

// Gruende, aus denen am ganzen Anlass keine Anmeldung (mehr) geht — null,
// wenn nichts dagegen spricht.
// "Termin steht noch nicht fest" (Haekchen im Vorstand, Spalte datum_offen,
// seit Commit 27b473c): start_date ist nur ein Platzhalter (meist 31.12.).
// Angezeigt wird "Datum noch offen", nie das Platzhalter-Datum, und
// angemeldet werden kann noch nicht.
function istDatumOffen(event) {
    return event.datum_offen === true;
}

function sperrgrund(event, zeit) {
    if (event.status === 'cancelled') return 'Anlass abgesagt';
    if (istDatumOffen(event)) return 'Anmeldung, sobald das Datum feststeht';
    if (event.status === 'completed' || !istAktuell(event, zeit)) return 'Anlass ist vorbei';
    const frist = zerlege(event.registration_deadline);
    if (frist) {
        const schluss = `${frist.datum} ${frist.zeit || '00:00'}`;
        if (schluss < zuerich(zeit).zeitpunkt.slice(0, 16)) return 'Anmeldeschluss vorbei';
    }
    return null;
}

// app-Block einer Schicht. `shift.registrations.approvedCount` /
// `pendingCount` wie sie GET /events schon liefert.
function schichtAnsicht(shift, { gesperrt = false, zeit = jetzt() } = {}) {
    const gebraucht = Number(shift.needed) || 0;
    const besetzt = shift.registrations?.approvedCount ?? 0;
    const angefragt = shift.registrations?.pendingCount ?? 0;
    const offen = Math.max(gebraucht - besetzt, 0);
    const tag = zerlege(shift.date);
    const vorbei = tag ? tag.datum < zuerich(zeit).datum : false;
    const bereich = shift.bereich && shift.bereich !== 'Allgemein' ? bereichLesbar(shift.bereich) : null;
    const zeitText = zeitspanne(shift.start_time, shift.end_time);
    return {
        datum_text: tag ? datumLang(tag.datum) : null,
        zeit_text: zeitText ? `${zeitText} Uhr` : null,
        bereich_text: bereich || shift.name || 'Allgemein',
        belegung: { besetzt, gebraucht, offen, angefragt, text: plaetzeText(offen) },
        waehlbar: !gesperrt && !vorbei && offen > 0
    };
}

// app-Block eines Anlasses. Haengt auch an jede Schicht ihren app-Block.
//   belegtePersonen: angemeldete Personen (offen + bestaetigt), nur noetig
//                    bei max_participants
//   kannBearbeiten:  ob der Anfragende den Anlass bearbeiten darf
// Liefert den Anlass mit `app` und `shifts[].app` (neues Objekt).
function anlassAnsicht(event, { belegtePersonen = 0, kannBearbeiten = false, zeit = jetzt() } = {}) {
    const shifts = event.shifts || [];
    const pflicht = anmeldungPflicht(event);
    const art = shifts.length > 0 ? 'schicht' : (pflicht ? 'teilnahme' : null);
    const gesperrt = sperrgrund(event, zeit);
    const mitSchichten = shifts.map(s => ({ ...s, app: schichtAnsicht(s, { gesperrt: !!gesperrt, zeit }) }));

    let plaetzeFrei = null;
    if (art === 'teilnahme' && event.max_participants) {
        plaetzeFrei = Math.max(event.max_participants - belegtePersonen, 0);
    }

    // Abgesagt/vorbei zuerst — das ist auch bei Anlaessen ohne Anmeldung
    // die wichtigere Auskunft.
    let grund = null;
    if (gesperrt && gesperrt !== 'Anmeldeschluss vorbei') grund = gesperrt;
    else if (!art) grund = 'Keine Anmeldung nötig';
    else if (gesperrt) grund = gesperrt;
    else if (art === 'teilnahme' && plaetzeFrei === 0) grund = 'Ausgebucht';
    else if (art === 'schicht' && !mitSchichten.some(s => s.app.waehlbar)) grund = 'Alle Schichten sind besetzt';

    return {
        ...event,
        shifts: mitSchichten,
        app: {
            datum_text: istDatumOffen(event) ? 'Datum noch offen' : anlassDatumText(event.start_date, event.end_date),
            zeit_text: istDatumOffen(event) ? null : anlassZeitText(event.start_date, event.end_date),
            datum_offen: istDatumOffen(event),
            // Abschnitt in der Liste: anstehende Anlaesse, dann Ideen ohne Datum
            gruppe: istDatumOffen(event) ? 'datum_offen' : 'kommend',
            abgesagt: event.status === 'cancelled',
            anmeldung: {
                moeglich: grund === null,
                grund,
                art,
                pflicht,
                anmeldeschluss_text: zeitpunktText(event.registration_deadline),
                plaetze_frei: plaetzeFrei,
                plaetze_text: plaetzeFrei === null ? null : plaetzeText(plaetzeFrei)
            },
            kann_bearbeiten: !!kannBearbeiten,
            // Logo der Reihe (Fasnacht, Chilbi, ...) oder eigenes Bild; null
            // = keines (src/anlass-logo.js).
            logo: anlassLogo(event),
            reihe: anlassReihe(event)?.reihe || null
        }
    };
}

// Status einer Anmeldung, wie die App ihn zeigt
const STATUS = {
    pending: ['offen', 'gelb'],
    approved: ['bestätigt', 'gruen'],
    confirmed: ['bestätigt', 'gruen'],
    rejected: ['abgelehnt', 'rot'],
    cancelled: ['abgesagt', 'grau']
};
function anmeldungStatus(status) {
    const [text, farbe] = STATUS[status] || [status || 'unbekannt', 'grau'];
    return { status_text: text, status_farbe: farbe };
}

// "Bar – Schicht 1 · Sa 17.10. · 12:00–14:00" (Bereich Allgemein entfaellt)
function schichtBeschriftung(shift) {
    const bereich = shift.bereich && shift.bereich !== 'Allgemein' ? bereichLesbar(shift.bereich) : null;
    const kopf = [bereich, shift.name].filter(Boolean).join(' – ');
    const tag = zerlege(shift.date);
    return [kopf || null, tag ? datumKurz(tag.datum) : null, zeitspanne(shift.start_time, shift.end_time)]
        .filter(Boolean).join(' · ');
}

// Eintrag in GET /registrations/mine ergaenzen
function anmeldungAnsicht(reg) {
    return {
        ...reg,
        ...anmeldungStatus(reg.status),
        event_datum_text: anlassDatumText(reg.event_start_date, reg.event_end_date),
        shifts: (reg.shifts || []).map(s => ({ ...s, beschriftung: schichtBeschriftung(s) }))
    };
}

// Kalender: welche Eintraege Mitglieder sehen (E-Mail/Brief nur Vorstand)
const NUR_VORSTAND_IM_KALENDER = ['email', 'letter'];
function kalenderAnsicht(items, { vorstand = false } = {}) {
    return items
        .filter(i => vorstand || !NUR_VORSTAND_IM_KALENDER.includes(i.type))
        .map(i => ({ ...i, datum_text: datumLang(i.date) }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.id).localeCompare(String(b.id))));
}

module.exports = {
    ANMELDEPFLICHTIGE_KATEGORIEN, KATEGORIEN, BEREICHE,
    jetzt, zuerich, zerlege, datumLang, datumKurz, zeitspanne,
    anlassDatumText, anlassZeitText, istDatumOffen, zeitpunktText, anmeldungPflicht, plaetzeText,
    istAktuell, sperrgrund, schichtAnsicht, anlassAnsicht,
    anmeldungStatus, schichtBeschriftung, anmeldungAnsicht, kalenderAnsicht
};
