// Datenschutz: die oeffentlichen Anlass-Listen duerfen keine Kontaktdaten der
// Angemeldeten enthalten (E-Mail, Telefon, Bemerkungen). Bis Oktober 2026
// lieferte GET /events sie an jeden aus. Der Vorstand bekommt sie weiterhin.
//
// Startet das echte src/index.js gegen die Test-Datenbank (TEST_DATABASE_URL;
// das Schema wird hier frisch aus init.sql + Migrationen aufgebaut).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DB = process.env.TEST_DATABASE_URL;
const PORT = 55871;
const BASE = `http://127.0.0.1:${PORT}`;
const EVENT = '00000000-0000-0000-0000-0000000000d5';

test('oeffentliche Anlass-Listen ohne Kontaktdaten', { skip: !DB && 'TEST_DATABASE_URL nicht gesetzt' }, async (t) => {
    const { Pool } = require('pg');
    const jwt = require('jsonwebtoken');
    const { schemaAufbauen } = require('./datenbank');
    const pool = new Pool({ connectionString: DB });

    await schemaAufbauen(pool);
    await pool.query(
        `INSERT INTO events (id, slug, title, start_date) VALUES ($1, 'test-datenschutz', 'Datenschutz-Test', NOW() + INTERVAL '30 days')`,
        [EVENT]);
    const shift = (await pool.query(
        `INSERT INTO shifts (event_id, name, date, start_time, end_time, needed, bereich)
         VALUES ($1, 'Bar', CURRENT_DATE + 30, '18:00', '22:00', 2, 'Bar') RETURNING id`, [EVENT])).rows[0].id;
    await pool.query(
        `INSERT INTO registrations (event_id, guest_name, guest_email, shift_ids, notes, status)
         VALUES ($1, 'Gast Helfer', 'gast@example.ch', $2, 'Allergie: Nüsse', 'approved'),
                ($1, 'Teilnehmer Direkt', 'direkt@example.ch', NULL, 'vegetarisch', 'pending')`,
        [EVENT, [shift]]);

    const server = spawn('node', [path.join(__dirname, '..', 'src', 'index.js')], {
        env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: 'test-geheim',
               DISPATCH_API_URL: 'http://127.0.0.1:9', ARBEITSPLAN_REMINDER_ENABLED: 'false' },
        stdio: 'ignore'
    });
    t.after(async () => { server.kill(); await pool.end(); });

    // warten, bis der Server antwortet
    for (let i = 0; i < 50; i++) {
        try { if ((await fetch(`${BASE}/events/${EVENT}`)).ok) break; } catch (_) { /* startet noch */ }
        await new Promise(r => setTimeout(r, 200));
    }

    const kontaktdaten = text => /gast@example\.ch|direkt@example\.ch|Nüsse|vegetarisch/.test(text);

    for (const url of [`${BASE}/events`, `${BASE}/events/${EVENT}`, `${BASE}/events/test-datenschutz`]) {
        const ohne = await (await fetch(url)).text();
        assert.ok(ohne.includes('Gast Helfer'), `${url}: Namen muessen bleiben`);
        assert.ok(!kontaktdaten(ohne), `${url}: ohne Anmeldung keine Kontaktdaten`);

        const falsch = await fetch(url, { headers: { Authorization: 'Bearer kaputt' } });
        assert.equal(falsch.status, 200, `${url}: ungueltiges Token -> trotzdem oeffentliche Liste`);
        assert.ok(!kontaktdaten(await falsch.text()), `${url}: ungueltiges Token -> keine Kontaktdaten`);

        const vorstand = jwt.sign({ type: 'vorstand', email: 'aktuar@example.ch', groups: ['vorstand'] }, 'test-geheim');
        const mit = await (await fetch(url, { headers: { Authorization: `Bearer ${vorstand}` } })).text();
        assert.ok(kontaktdaten(mit), `${url}: Vorstand bekommt die Kontaktdaten weiterhin`);
    }
});
