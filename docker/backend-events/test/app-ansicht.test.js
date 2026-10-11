// Tests fuer src/app-ansicht.js — die fertigen Anzeige-Werte fuer die Apps.
// Ohne Datenbank; "jetzt" wird jeweils mitgegeben.

const test = require('node:test');
const assert = require('node:assert/strict');
const a = require('../src/app-ansicht');

// Sonntag, 11. Oktober 2026, 10:00 in Zuerich
const JETZT = new Date('2026-10-11T10:00:00+02:00');

test('Datumstexte', () => {
    assert.equal(a.datumLang('2026-10-17'), 'Samstag, 17. Oktober 2026');
    assert.equal(a.datumKurz('2026-10-17'), 'Sa 17.10.');
    assert.equal(a.datumKurz('2026-10-18', true), 'So 18.10.2026');
    assert.equal(a.anlassDatumText('2026-10-17 17:00:00', '2026-10-17 22:00:00'), 'Samstag, 17. Oktober 2026');
    assert.equal(a.anlassDatumText('2026-10-17 10:00:00', '2026-10-18 20:00:00'), 'Sa 17.10. – So 18.10.2026');
    assert.equal(a.anlassDatumText('2026-12-31 18:00:00', '2027-01-01 02:00:00'), 'Do 31.12.2026 – Fr 01.01.2027');
    assert.equal(a.anlassDatumText('2026-03-01T00:00:00', null), 'Sonntag, 1. März 2026');
    assert.equal(a.anlassDatumText(null, null), null);
});

test('Zeittexte', () => {
    assert.equal(a.anlassZeitText('2026-10-17 17:00:00', '2026-10-17 22:00:00'), '17:00–22:00 Uhr');
    assert.equal(a.anlassZeitText('2026-10-17 17:00:00', null), '17:00 Uhr');
    assert.equal(a.anlassZeitText('2026-10-17 00:00:00', null), null);
    assert.equal(a.anlassZeitText('2026-10-17 10:00:00', '2026-10-18 20:00:00'), 'ab 10:00 Uhr');
    assert.equal(a.zeitspanne('12:00:00', '14:00:00'), '12:00–14:00');
    assert.equal(a.zeitspanne('08:00:00', null), '08:00');
    assert.equal(a.zeitspanne(null, null), null);
    assert.equal(a.zeitpunktText('2026-10-15 23:59:00'), 'Donnerstag, 15. Oktober 2026, 23:59 Uhr');
    assert.equal(a.zeitpunktText('2026-10-15 00:00:00'), 'Donnerstag, 15. Oktober 2026');
});

test('Zuerich-Zeit und "aktuell"', () => {
    assert.deepEqual(a.zuerich(new Date('2026-10-11T22:30:00Z')), { datum: '2026-10-12', zeitpunkt: '2026-10-12 00:30:00' });
    assert.equal(a.istAktuell({ start_date: '2026-10-11 08:00:00' }, JETZT), true, 'heute: bis Ende Tag');
    assert.equal(a.istAktuell({ start_date: '2026-10-10 08:00:00' }, JETZT), false);
    assert.equal(a.istAktuell({ start_date: '2026-10-09 08:00:00', end_date: '2026-10-11 02:00:00' }, JETZT), true);
});

test('Belegungstext', () => {
    assert.equal(a.plaetzeText(0), 'voll');
    assert.equal(a.plaetzeText(1), '1 Platz frei');
    assert.equal(a.plaetzeText(3), '3 Plätze frei');
});

test('Anmeldepflicht kommt aus der Kategorie', () => {
    assert.equal(a.anmeldungPflicht({ category: 'Ausflug mit Anmeldung', registration_required: false }), true);
    assert.equal(a.anmeldungPflicht({ category: 'Ausflug', registration_required: false }), false);
    assert.equal(a.anmeldungPflicht({ category: 'Sonstiges', registration_required: true }), true);
});

const schicht = (extra = {}) => ({
    name: 'Schicht 1', bereich: 'Bar', date: '2026-10-17', start_time: '12:00:00', end_time: '14:00:00',
    needed: 2, registrations: { approvedCount: 1, pendingCount: 1 }, ...extra
});

test('Schicht: Texte, Belegung, waehlbar', () => {
    assert.deepEqual(a.schichtAnsicht(schicht(), { zeit: JETZT }), {
        datum_text: 'Samstag, 17. Oktober 2026',
        zeit_text: '12:00–14:00 Uhr',
        bereich_text: 'Bar',
        belegung: { besetzt: 1, gebraucht: 2, offen: 1, angefragt: 1, text: '1 Platz frei' },
        waehlbar: true
    });
    assert.equal(a.schichtAnsicht(schicht({ bereich: 'Kueche' }), { zeit: JETZT }).bereich_text, 'Küche');
    assert.equal(a.schichtAnsicht(schicht({ bereich: 'Allgemein', name: 'Aufbau' }), { zeit: JETZT }).bereich_text, 'Aufbau');
    const voll = a.schichtAnsicht(schicht({ registrations: { approvedCount: 3, pendingCount: 0 } }), { zeit: JETZT });
    assert.deepEqual([voll.belegung.offen, voll.belegung.text, voll.waehlbar], [0, 'voll', false]);
    assert.equal(a.schichtAnsicht(schicht(), { gesperrt: true, zeit: JETZT }).waehlbar, false);
    assert.equal(a.schichtAnsicht(schicht({ date: '2026-10-10' }), { zeit: JETZT }).waehlbar, false, 'vorbei');
});

const anlass = (extra = {}) => ({
    id: 'e1', title: 'X', category: 'Sonstiges', registration_required: false, status: 'planned',
    start_date: '2026-10-24 09:00:00', end_date: null, registration_deadline: null, max_participants: null,
    shifts: [], ...extra
});
const anmeldung = (extra, opt = {}) => a.anlassAnsicht(anlass(extra), { zeit: JETZT, ...opt }).app.anmeldung;

test('Anlass: ob und warum man sich anmelden kann', () => {
    assert.deepEqual(anmeldung({}), {
        moeglich: false, grund: 'Keine Anmeldung nötig', art: null, pflicht: false,
        anmeldeschluss_text: null, plaetze_frei: null, plaetze_text: null
    });
    assert.equal(anmeldung({ category: 'GV' }).art, 'teilnahme');
    assert.equal(anmeldung({ category: 'GV' }).moeglich, true);
    assert.equal(anmeldung({ shifts: [schicht()] }).art, 'schicht');
    assert.equal(anmeldung({ category: 'GV', status: 'cancelled' }).grund, 'Anlass abgesagt');
    assert.equal(anmeldung({ category: 'GV', start_date: '2026-10-01 10:00:00' }).grund, 'Anlass ist vorbei');
    assert.equal(anmeldung({ category: 'GV', registration_deadline: '2026-10-11 09:59:00' }).grund, 'Anmeldeschluss vorbei');
    assert.equal(anmeldung({ category: 'GV', registration_deadline: '2026-10-11 10:01:00' }).moeglich, true);
    const voll = anmeldung({ category: 'GV', max_participants: 2 }, { belegtePersonen: 2 });
    assert.deepEqual([voll.moeglich, voll.grund, voll.plaetze_frei, voll.plaetze_text], [false, 'Ausgebucht', 0, 'voll']);
    assert.equal(anmeldung({ category: 'GV', max_participants: 5 }, { belegtePersonen: 2 }).plaetze_text, '3 Plätze frei');
    const besetzt = anmeldung({ shifts: [schicht({ registrations: { approvedCount: 2, pendingCount: 0 } })] });
    assert.deepEqual([besetzt.moeglich, besetzt.grund], [false, 'Alle Schichten sind besetzt']);
});

test('Anlass: Gesperrt -> keine Schicht waehlbar; kann_bearbeiten durchgereicht', () => {
    const e = a.anlassAnsicht(anlass({ status: 'cancelled', shifts: [schicht()] }), { zeit: JETZT, kannBearbeiten: true });
    assert.equal(e.shifts[0].app.waehlbar, false);
    assert.equal(e.app.abgesagt, true);
    assert.equal(e.app.kann_bearbeiten, true);
    assert.equal(e.shifts[0].name, 'Schicht 1', 'bestehende Felder bleiben');
});

test('Meine Anmeldungen: Status und Schicht-Beschriftung', () => {
    assert.deepEqual(a.anmeldungStatus('pending'), { status_text: 'offen', status_farbe: 'gelb' });
    assert.deepEqual(a.anmeldungStatus('approved'), { status_text: 'bestätigt', status_farbe: 'gruen' });
    assert.deepEqual(a.anmeldungStatus('rejected'), { status_text: 'abgelehnt', status_farbe: 'rot' });
    assert.equal(a.schichtBeschriftung(schicht()), 'Bar – Schicht 1 · Sa 17.10. · 12:00–14:00');
    assert.equal(a.schichtBeschriftung(schicht({ bereich: 'Kueche' })), 'Küche – Schicht 1 · Sa 17.10. · 12:00–14:00');
    assert.equal(a.schichtBeschriftung(schicht({ bereich: 'Allgemein', name: 'Aufbau', end_time: null })), 'Aufbau · Sa 17.10. · 12:00');
    const reg = a.anmeldungAnsicht({ status: 'approved', event_start_date: '2026-10-17 10:00:00', event_end_date: '2026-10-18 20:00:00', shifts: [schicht()] });
    assert.equal(reg.event_datum_text, 'Sa 17.10. – So 18.10.2026');
    assert.equal(reg.shifts[0].beschriftung, 'Bar – Schicht 1 · Sa 17.10. · 12:00–14:00');
});

test('Kalender: E-Mail/Brief nur fuer den Vorstand, datum_text, sortiert', () => {
    const items = [
        { id: 'event:b', type: 'event', date: '2026-10-17' },
        { id: 'dispatch:1', type: 'email', date: '2026-10-01' },
        { id: 'dispatch:2', type: 'letter', date: '2026-10-02' },
        { id: 'event:a', type: 'event', date: '2026-10-17' }
    ];
    assert.deepEqual(a.kalenderAnsicht(items).map(i => i.id), ['event:a', 'event:b']);
    assert.equal(a.kalenderAnsicht(items)[0].datum_text, 'Samstag, 17. Oktober 2026');
    assert.deepEqual(a.kalenderAnsicht(items, { vorstand: true }).map(i => i.id),
        ['dispatch:1', 'dispatch:2', 'event:a', 'event:b']);
});

test('Datum offen: "Datum noch offen" statt Platzhalter-Datum, keine Anmeldung', () => {
    const idee = a.anlassAnsicht({ status: 'draft', datum_offen: true, category: 'Ausflug', start_date: '2026-12-31 00:00:00', shifts: [] },
        { zeit: new Date('2026-10-11T10:00:00+02:00') });
    assert.equal(idee.app.datum_text, 'Datum noch offen');
    assert.equal(idee.app.zeit_text, null);
    assert.equal(idee.app.datum_offen, true);
    assert.equal(idee.app.gruppe, 'datum_offen');
    assert.equal(idee.app.anmeldung.moeglich, false);
    assert.equal(idee.app.anmeldung.grund, 'Anmeldung, sobald das Datum feststeht');
    // ein echter Anlass am 31.12. bleibt ein echter Anlass
    const silvester = a.anlassAnsicht({ status: 'planned', category: 'Sonstiges', start_date: '2026-12-31 19:00:00', shifts: [] },
        { zeit: new Date('2026-10-11T10:00:00+02:00') });
    assert.equal(silvester.app.datum_text, 'Donnerstag, 31. Dezember 2026');
    assert.equal(silvester.app.gruppe, 'kommend');
});
