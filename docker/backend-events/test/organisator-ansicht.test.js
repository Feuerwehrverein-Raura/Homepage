// Tests fuer src/organisator-ansicht.js (Organisator-Uebersicht) und
// src/ics.js (ein Anlass als .ics). Ohne Datenbank; "jetzt" wird
// mitgegeben.

const test = require('node:test');
const assert = require('node:assert/strict');
const o = require('../src/organisator-ansicht');
const { anlassIcs, icsDateiname } = require('../src/ics');

// Sonntag, 11. Oktober 2026, 10:00 in Zuerich
const JETZT = new Date('2026-10-11T10:00:00+02:00');

const SCHICHT = { id: 's1', name: 'Schicht 1', bereich: 'Bar', date: '2026-10-17', start_time: '12:00:00', end_time: '14:00:00', needed: 2 };

test('notes: JSON, Text, leer', () => {
    assert.deepEqual(o.notizenLesen('{"participants":2}'), { json: { participants: 2 }, text: null });
    assert.deepEqual(o.notizenLesen('Bringt Schürze mit'), { json: {}, text: 'Bringt Schürze mit' });
    assert.deepEqual(o.notizenLesen(null), { json: {}, text: null });
    assert.deepEqual(o.notizenLesen('[1,2]'), { json: {}, text: '[1,2]' });
});

test('Anmeldung: alles aus dem notes-JSON, anzeigefertig', () => {
    const a = o.anmeldungFuerOrganisator({
        id: 'r1', status: 'pending', member_id: null, guest_name: 'Paar Gast', guest_email: 'paar@example.ch',
        shift_ids: null, created_at: '2026-09-15 12:00:00',
        notes: JSON.stringify({
            phone: '+41 79 111 22 33', participants: 2, allergies: 'Nüsse', meal_selection: 'Vegi',
            notes: 'Kommen später', companions: [{ name: 'Peter Gast', email: '' }, 'Alte Form', { name: ' ' }]
        })
    });
    assert.deepEqual(a, {
        id: 'r1', status: 'pending', status_text: 'offen', status_farbe: 'gelb', art: 'teilnahme',
        mitglied: false, member_id: null, name: 'Paar Gast', email: 'paar@example.ch', phone: '+41 79 111 22 33',
        personen: 2,
        begleitpersonen: [{ name: 'Peter Gast', email: null, phone: null }, { name: 'Alte Form', email: null, phone: null }],
        allergien: 'Nüsse', menue: 'Vegi', bemerkung: 'Kommen später',
        shift_ids: [], schichten: [], alternative: null, angemeldet_text: '15.09.2026'
    });
});

test('Anmeldung: Mitglied, Schichten, Text-Bemerkung, Alternative', () => {
    const a = o.anmeldungFuerOrganisator({
        id: 'r2', status: 'approved', member_id: 'm1', member_vorname: 'Erika', member_nachname: 'Muster',
        member_email: 'erika@example.ch', member_mobile: '079 000 00 00', guest_name: null,
        shift_ids: ['s1', 'weg'], notes: 'Bringt Schürze mit', created_at: '2026-09-15 12:00:00'
    }, { s1: SCHICHT });
    assert.equal(a.name, 'Erika Muster');
    assert.equal(a.email, 'erika@example.ch');
    assert.equal(a.phone, '079 000 00 00');
    assert.equal(a.art, 'schicht');
    assert.equal(a.bemerkung, 'Bringt Schürze mit');
    assert.equal(a.personen, 1);
    assert.deepEqual(a.schichten, [{ id: 's1', beschriftung: 'Bar – Schicht 1 · Sa 17.10. · 12:00–14:00' }]);

    const alt = o.anmeldungFuerOrganisator({
        id: 'r3', status: 'pending', guest_name: 'X', shift_ids: [],
        notes: JSON.stringify({ alternative_suggestion: { suggested_shift_id: 's1', suggested_at: '2026-10-01T08:00:00Z' } })
    }, { s1: SCHICHT });
    assert.deepEqual(alt.alternative, { schicht_text: 'Bar – Schicht 1 · Sa 17.10. · 12:00–14:00', vorgeschlagen_text: '01.10.2026' });
});

test('Zahlen und Reihenfolge', () => {
    const regs = [
        { id: 'a', status: 'approved', name: 'Zora', personen: 1 },
        { id: 'b', status: 'pending', name: 'Anna', personen: 3 },
        { id: 'c', status: 'rejected', name: 'Bert', personen: 2 },
        { id: 'd', status: 'approved', name: 'Ärni', personen: 1 }
    ];
    assert.deepEqual(o.zahlen(regs), {
        anmeldungen: 4, offen: 1, bestaetigt: 2, abgelehnt: 1, personen_total: 5,
        text: '2 bestätigt · 1 offen · 5 Personen'
    });
    assert.equal(o.zahlen([]).text, 'Noch keine Anmeldungen');
    assert.deepEqual(o.anmeldungenSortieren(regs).map(r => r.id), ['b', 'd', 'a', 'c']);
});

test('Aktionen: Organisator-Login nur bestaetigen/hinzufuegen', () => {
    const ev = { shifts: [SCHICHT], pdf_filename: 'aushang.pdf' };
    const voll = o.aktionen('mitglied', ev, [{ status: 'approved' }]);
    assert.equal(voll.anlass_bearbeiten, true);
    assert.equal(voll.alternative, true);
    assert.equal(voll.arbeitsplan_senden, false);
    assert.equal(voll.pdf_aushang, true);
    assert.equal(voll.einkauf, true);
    const login = o.aktionen('organisator-login', ev, []);
    assert.deepEqual(Object.entries(login).filter(([, v]) => v).map(([k]) => k),
        ['bestaetigen', 'hinzufuegen', 'arbeitsplan_senden', 'pdf_arbeitsplan', 'pdf_aushang']);
    assert.equal(o.aktionen('mitglied', { shifts: [] }, []).alternative, false);
});

test('Organisator-Login: vorbei, abgesagt, Datum offen', () => {
    const gesperrt = ev => o.organisatorLoginGesperrt(ev, JETZT);
    assert.equal(gesperrt({ start_date: '2026-10-17 10:00:00' }), null);
    assert.equal(gesperrt({ start_date: '2026-10-10 18:00:00', end_date: '2026-10-11 16:00:00' }), null, 'endet heute');
    assert.match(gesperrt({ start_date: '2026-10-10 18:00:00' }), /vorbei/);
    assert.match(gesperrt({ start_date: '2026-10-17 10:00:00', status: 'cancelled' }), /abgesagt/);
    assert.equal(gesperrt({ start_date: '2025-12-31 00:00:00', datum_offen: true }), null);
    assert.match(gesperrt(undefined), /existiert nicht/);
});

test('Anlass der Uebersicht: app-Block, Belegung, keine internen Felder', () => {
    const a = o.anlassFuerOrganisator({
        id: 'e1', title: 'Chilbi', category: 'Dorffest', start_date: '2026-10-17 10:00:00',
        end_date: '2026-10-18 20:00:00', event_password_hash: 'geheim', event_email: 'login@example.ch',
        pdf_attachment: 'AAAA', shifts: [SCHICHT]
    }, [
        { id: 'r1', status: 'approved', member_id: null, guest_name: 'A', shift_ids: ['s1'] },
        { id: 'r2', status: 'pending', member_id: null, guest_name: 'B', shift_ids: ['s1'] }
    ], { zugang: 'mitglied', zeit: JETZT });
    assert.equal(a.event_password_hash, undefined);
    assert.equal(a.event_email, undefined);
    assert.equal(a.pdf_attachment, undefined);
    assert.equal(a.app.kann_bearbeiten, true);
    assert.deepEqual(a.shifts[0].app.belegung, { besetzt: 1, gebraucht: 2, offen: 1, angefragt: 1, text: '1 Platz frei' });
    assert.equal(a.shifts[0].registrations, undefined);
    assert.equal(a.organisator.aktuell, true);
    assert.equal(a.organisator.zahlen.text, '1 bestätigt · 1 offen · 2 Personen');
    assert.deepEqual(a.organisator.anmeldungen.map(r => r.id), ['r2', 'r1']);
});

test('Uebersicht sortiert: aktuell, Ideen ohne Datum, dann vergangen (neuste zuerst)', () => {
    const anlass = (id, start, aktuell, offen = false) => ({ id, start_date: start, app: { datum_offen: offen }, organisator: { aktuell } });
    const sortiert = o.anlaesseSortieren([
        anlass('alt1', '2026-10-05', false), anlass('idee', '2026-12-31', true, true),
        anlass('spaet', '2026-11-07', true), anlass('alt2', '2026-10-08', false), anlass('bald', '2026-10-17', true)
    ]);
    assert.deepEqual(sortiert.map(a => a.id), ['bald', 'spaet', 'idee', 'alt2', 'alt1']);
});

test('ICS: Uhrzeit in Zuerich, ganztaegig, Datum offen', () => {
    const ics = anlassIcs({
        id: 'e1', title: 'Chilbi, 2026', location: 'Roter Schopf', subtitle: 'Fest',
        description: 'Zeile 1\nZeile 2', start_date: '2026-10-17 10:00:00', end_date: '2026-10-18 20:00:00'
    }, { zeit: JETZT });
    const zeilen = ics.split('\r\n');
    assert.ok(zeilen.includes('DTSTART;TZID=Europe/Zurich:20261017T100000'));
    assert.ok(zeilen.includes('DTEND;TZID=Europe/Zurich:20261018T200000'));
    assert.ok(zeilen.includes('DTSTAMP:20261011T080000Z'));
    assert.ok(zeilen.includes('SUMMARY:Chilbi\\, 2026'));
    assert.ok(zeilen.includes('DESCRIPTION:Fest\\n\\nZeile 1\\nZeile 2'));
    assert.ok(zeilen.includes('BEGIN:VTIMEZONE'));
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'));

    const ganz = anlassIcs({ id: 'e2', title: 'Ausflug', start_date: '2026-10-24 00:00:00' }, { zeit: JETZT }).split('\r\n');
    assert.ok(ganz.includes('DTSTART;VALUE=DATE:20261024'));
    assert.ok(ganz.includes('DTEND;VALUE=DATE:20261025'));
    assert.ok(!ganz.includes('BEGIN:VTIMEZONE'));

    assert.equal(anlassIcs({ id: 'e3', title: 'Idee', start_date: '2026-12-31', datum_offen: true }), null);
    assert.equal(icsDateiname({ title: 'Chilbi 2026 / Fest!' }), 'Chilbi_2026_Fest.ics');

    // lange Zeilen werden gefaltet, ohne Umlaute zu zerschneiden
    const lang = anlassIcs({ id: 'e4', title: 'ä'.repeat(60), start_date: '2026-10-24 00:00:00' }, { zeit: JETZT });
    for (const z of lang.split('\r\n')) assert.ok(Buffer.byteLength(z) <= 75);
    assert.ok(!lang.includes('�'));
});
