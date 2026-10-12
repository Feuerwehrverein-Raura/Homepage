// Roter Schopf fuer die Schicht: Zeitfenster, Mitternacht, Zeitumstellung,
// wer "ich" bin - gegen eine nachgebaute Datenbank.
//
// Schreibt ausserdem die Vertragsdatei test/fixtures/schopf-zugang-app.json
// (Antwort von GET /kiosk/roter-schopf/zugang), gegen die die App testet:
//
//     FIXTURES_SCHREIBEN=1 node --test test/schicht-zugang.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { aktiveSchicht, ortszeit, schichtZugang, wer } = require('../src/schicht-zugang');

const bar = { datum: '2026-10-14', beginn: '17:00:00', ende: '23:00:00', schicht: 'Bar', anlass: 'Chilbi 2026' };
const nacht = { datum: '2026-10-14', beginn: '22:00:00', ende: '02:00:00', schicht: 'Nachtschicht', anlass: 'Chilbi 2026' };

test('Ortszeit: Sommer- und Winterzeit', () => {
    assert.equal(ortszeit('2026-10-14', '17:00:00').toISOString(), '2026-10-14T15:00:00.000Z');
    assert.equal(ortszeit('2026-12-31', '19:00:00').toISOString(), '2026-12-31T18:00:00.000Z');
    // Umstellung am 25.10.2026 um 03:00 -> 02:00
    assert.equal(ortszeit('2026-10-25', '12:00:00').toISOString(), '2026-10-25T11:00:00.000Z');
    // 01:00 ist noch Sommerzeit, der Folgetag (plusTage) schon Winterzeit.
    assert.equal(ortszeit('2026-10-25', '01:00:00').toISOString(), '2026-10-24T23:00:00.000Z');
    assert.equal(ortszeit('2026-10-24', '23:00:00', 1).toISOString(), '2026-10-25T22:00:00.000Z');
});

test('Fenster: 1 h vorher bis 1 h nachher', () => {
    const z = (iso) => aktiveSchicht([bar], new Date(iso));
    assert.equal(z('2026-10-14T13:59:00Z'), null); // 15:59 Ortszeit
    assert.equal(z('2026-10-14T14:00:00Z').schicht, 'Bar'); // 16:00
    assert.equal(z('2026-10-14T21:59:00Z').bis.toISOString(), '2026-10-14T22:00:00.000Z'); // bis 24:00
    assert.equal(z('2026-10-14T22:01:00Z'), null);
});

test('Ueber Mitternacht endet am Folgetag; die laengere Schicht zaehlt', () => {
    const s = aktiveSchicht([bar, nacht], new Date('2026-10-14T21:30:00Z')); // 23:30
    assert.equal(s.schicht, 'Nachtschicht');
    assert.equal(s.ende.toISOString(), '2026-10-15T00:00:00.000Z'); // 02:00
    assert.equal(aktiveSchicht([nacht], new Date('2026-10-15T00:59:00Z')).schicht, 'Nachtschicht');
    assert.equal(aktiveSchicht([nacht], new Date('2026-10-15T01:01:00Z')), null);
});

// Nachgebaute Datenbank: Mitglieder und die Schicht-Abfrage.
function fakeDb({ members, schichten }) {
    const abfragen = [];
    return {
        abfragen,
        async query(sql, werte) {
            abfragen.push({ sql: sql.replace(/\s+/g, ' ').trim(), werte });
            if (sql.includes('FROM members WHERE id =')) {
                return { rows: members.filter(m => m.id === werte[0]) };
            }
            if (sql.includes('LOWER(benutzername)')) {
                return { rows: members.filter(m => m.benutzername?.toLowerCase() === werte[0].toLowerCase()) };
            }
            if (sql.includes('COUNT(*)')) {
                return { rows: [{ n: members.filter(m => m.email?.toLowerCase() === werte[0].toLowerCase()).length }] };
            }
            if (sql.includes('FROM members WHERE LOWER(email)')) {
                return { rows: members.filter(m => m.email?.toLowerCase() === werte[0].toLowerCase()) };
            }
            if (sql.includes('FROM registrations')) {
                return { rows: schichten.filter(s => s.memberId === werte[0] || (werte[1] && s.gastEmail === werte[1])) };
            }
            throw new Error('unerwartet: ' + sql);
        }
    };
}

const UUID_ERIKA = '11111111-1111-4111-8111-111111111111';
const UUID_HANS = '22222222-2222-4222-8222-222222222222';
const UUID_ANNA = '33333333-3333-4333-8333-333333333333';
const members = [
    { id: UUID_ERIKA, benutzername: 'erika.muster', email: 'erika@example.ch' },
    // Paar mit gemeinsamer Adresse
    { id: UUID_HANS, benutzername: 'hans.paar', email: 'paar@example.ch' },
    { id: UUID_ANNA, benutzername: 'anna.paar', email: 'paar@example.ch' }
];

test('Wer: UUID, Benutzername, E-Mail nur wenn eindeutig', async () => {
    const db = fakeDb({ members, schichten: [] });
    assert.equal((await wer(db, { id: UUID_ERIKA })).id, UUID_ERIKA);
    assert.equal((await wer(db, { id: 'authentik-sub', preferred_username: 'Anna.Paar', email: 'paar@example.ch' })).id, UUID_ANNA);
    assert.equal((await wer(db, { id: 'x', email: 'erika@example.ch' })).id, UUID_ERIKA);
    // Geteilte Adresse ohne Benutzername: niemand - lieber kein Zugang als der falsche.
    assert.equal(await wer(db, { id: 'x', email: 'paar@example.ch' }), null);
});

test('Zugang: eigene Schicht, Gast-Anmeldung, geteilte Adresse, Cache', async () => {
    let jetzt = new Date('2026-10-14T16:00:00Z'); // 18:00 Ortszeit
    const db = fakeDb({
        members,
        schichten: [
            { ...bar, memberId: UUID_HANS },
            // Erika hat sich ueber das oeffentliche Formular angemeldet
            { ...nacht, memberId: null, gastEmail: 'erika@example.ch' },
            // Gast mit der Paar-Adresse: gehoert keinem eindeutig
            { ...bar, memberId: null, gastEmail: 'paar@example.ch' }
        ]
    });
    const z = schichtZugang(db, { jetzt: () => jetzt });

    assert.equal((await z.pruefen({ id: 'sub', preferred_username: 'hans.paar' })).schicht, 'Bar');
    assert.equal(await z.pruefen({ id: 'sub2', preferred_username: 'anna.paar' }), null);
    assert.equal(await z.pruefen({ id: UUID_ERIKA }), null); // Nachtschicht erst ab 21:00

    // Cache: 30 s gleiche Antwort ohne Datenbank.
    const vorher = db.abfragen.length;
    jetzt = new Date('2026-10-14T16:00:20Z');
    assert.equal((await z.pruefen({ id: 'sub', preferred_username: 'hans.paar' })).schicht, 'Bar');
    assert.equal(db.abfragen.length, vorher);

    jetzt = new Date('2026-10-14T19:30:00Z'); // 21:30
    const s = await z.pruefen({ id: UUID_ERIKA });
    assert.equal(s.schicht, 'Nachtschicht');

    if (process.env.FIXTURES_SCHREIBEN) {
        fs.writeFileSync(path.join(__dirname, 'fixtures', 'schopf-zugang-app.json'), JSON.stringify({
            gruppe: { zugang: true, grund: 'gruppe', schicht: null },
            schicht: { zugang: true, grund: 'schicht',
                schicht: JSON.parse(JSON.stringify({ name: s.schicht, anlass: s.anlass, beginn: s.beginn, ende: s.ende, bis: s.bis })) },
            kein: { zugang: false, grund: null, schicht: null }
        }, null, 2) + '\n');
    }
});

test('Vertragsdatei vorhanden', () => {
    const f = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'schopf-zugang-app.json'), 'utf8'));
    assert.equal(f.schicht.schicht.bis, '2026-10-15T01:00:00.000Z');
});
