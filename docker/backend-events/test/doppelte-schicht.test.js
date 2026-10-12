// Niemand zweimal auf derselben Schicht (src/doppelte-schicht.js).
//
// Mit TEST_DATABASE_URL gegen ein echtes Postgres (Schema aus init.sql und
// allen Migrationen). ACHTUNG: die Datenbank wird geleert.

const test = require('node:test');
const assert = require('node:assert/strict');
const { schichtKonflikte, eindeutig, konfliktText } = require('../src/doppelte-schicht');
const { schemaAufbauen } = require('./datenbank');

test('eindeutig: doppelte Ids in einer Anfrage fallen weg', () => {
    assert.deepEqual(eindeutig(['a', 'b', 'a', null, 'b']), ['a', 'b']);
    assert.equal(eindeutig(undefined), undefined);
});

test('ohne Person oder ohne Schichten keine Abfrage', async () => {
    const pool = { query: async () => { throw new Error('darf nicht fragen'); } };
    assert.deepEqual(await schichtKonflikte(pool, { eventId: 'e', shiftIds: ['s'] }), []);
    assert.deepEqual(await schichtKonflikte(pool, { eventId: 'e', memberId: 'm', shiftIds: [] }), []);
});

test('konfliktText', () => {
    assert.equal(konfliktText([{ name: 'Bar', date: '2026-10-17', start_time: '18:00:00' }]), 'Bar (2026-10-17 18:00)');
});

test('Echte Datenbank: gleiche Schicht doppelt erkannt, andere Schicht erlaubt',
    { skip: !process.env.TEST_DATABASE_URL && 'TEST_DATABASE_URL nicht gesetzt' }, async () => {
        const { Pool, types } = require('pg');
        for (const oid of [1082, 1083, 1114, 1184]) types.setTypeParser(oid, v => v);
        const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
        try {
            await schemaAufbauen(pool);
            const ev = (await pool.query(
                `INSERT INTO events (slug, title, start_date) VALUES ('t', 'Chilbi', '2026-10-17 10:00') RETURNING id`)).rows[0].id;
            const s = async name => (await pool.query(
                `INSERT INTO shifts (event_id, name, date, start_time, end_time, needed)
                 VALUES ($1, $2, '2026-10-17', '18:00', '22:00', 3) RETURNING id`, [ev, name])).rows[0].id;
            const bar = await s('Bar');
            const kueche = await s('Küche');
            const mitglied = (await pool.query(
                `INSERT INTO members (vorname, nachname, email) VALUES ('Erika', 'Muster', 'e@x.ch') RETURNING id`)).rows[0].id;
            const reg = (await pool.query(
                `INSERT INTO registrations (event_id, member_id, shift_ids, status) VALUES ($1, $2, $3, 'approved') RETURNING id`,
                [ev, mitglied, [bar]])).rows[0].id;
            await pool.query(
                `INSERT INTO registrations (event_id, guest_name, guest_email, shift_ids, status) VALUES ($1, 'Gast', 'Gast@Y.ch', $2, 'pending')`,
                [ev, [kueche]]);
            await pool.query(
                `INSERT INTO registrations (event_id, guest_name, guest_email, shift_ids, status) VALUES ($1, 'Alt', 'alt@y.ch', $2, 'rejected')`,
                [ev, [bar]]);

            // Mitglied: Bar doppelt, Kueche frei
            const k1 = await schichtKonflikte(pool, { eventId: ev, memberId: mitglied, shiftIds: [bar, kueche] });
            assert.deepEqual(k1.map(k => k.name), ['Bar']);
            // Gast per Adresse, ohne Gross/klein
            const k2 = await schichtKonflikte(pool, { eventId: ev, email: ' gast@y.ch ', shiftIds: [kueche] });
            assert.deepEqual(k2.map(k => k.name), ['Küche']);
            // abgelehnte Anmeldung zaehlt nicht
            assert.deepEqual(await schichtKonflikte(pool, { eventId: ev, email: 'alt@y.ch', shiftIds: [bar] }), []);
            // die gerade bearbeitete Anmeldung zaehlt nicht gegen sich selbst
            assert.deepEqual(await schichtKonflikte(pool, { eventId: ev, memberId: mitglied, shiftIds: [bar], ausser: reg }), []);
        } finally {
            await pool.end();
        }
    });
