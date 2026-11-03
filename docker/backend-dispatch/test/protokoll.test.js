// Brief-Protokoll (briefProtokollieren) gegen eine echte Datenbank: vom 01.
// bis 03.11.2026 lehnte PostgreSQL jeden Eintrag ab (Parameter $6 einmal
// varchar, einmal text) - und niemand merkte es. Laeuft mit TEST_DATABASE_URL.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { briefProtokollieren } = require('../src/nachricht-routen');

const DB = process.env.TEST_DATABASE_URL;
test('Brief-Protokoll: gesendet mit sent_at, abgelehnt mit Fehler', { skip: !DB && 'TEST_DATABASE_URL nicht gesetzt' }, async (t) => {
    const pool = new Pool({ connectionString: DB });
    t.after(() => pool.end());
    await pool.query('DROP TABLE IF EXISTS dispatch_log');
    await pool.query(`CREATE TABLE dispatch_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type varchar(50),
        member_id uuid, recipient_address text, subject varchar(500), status varchar(50), external_id varchar(255),
        event_id uuid, error_message text, sent_at timestamp, created_at timestamp DEFAULT now())`);
    const fehler = [];
    const alt = console.error;
    console.error = (...a) => fehler.push(a.join(' '));
    try {
        await briefProtokollieren(pool, { recipient: { name: 'Anna Muster' }, subject: 'Einladung', letterId: 'L1' });
        await briefProtokollieren(pool, { recipient: { name: 'Beat' }, subject: 'Einladung', letterId: 'L2',
            status: 'failed', fehler: 'protected_stamp_area' });
        await briefProtokollieren(pool, { recipient: { name: 'C' }, subject: 'Test', letterId: 'L3', staging: true });
    } finally {
        console.error = alt;
    }
    assert.deepEqual(fehler, []);
    const r = (await pool.query(
        'SELECT external_id, status, subject, error_message, sent_at IS NOT NULL AS gesendet FROM dispatch_log ORDER BY external_id')).rows;
    assert.deepEqual(r, [
        { external_id: 'L1', status: 'sent', subject: 'Einladung', error_message: null, gesendet: true },
        { external_id: 'L2', status: 'failed', subject: 'Einladung', error_message: 'protected_stamp_area', gesendet: false },
        { external_id: 'L3', status: 'sent', subject: '[Staging] Test', error_message: null, gesendet: true },
    ]);
});
