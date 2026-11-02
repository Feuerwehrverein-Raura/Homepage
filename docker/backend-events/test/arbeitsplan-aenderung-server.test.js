// Arbeitsplan nach dem Versand geaendert - gegen den echten Server mit
// Datenbank und nachgebautem api-dispatch (schreibt Mails und Briefe mit).
// Braucht TEST_DATABASE_URL (ACHTUNG: leert die Datenbank).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DB = process.env.TEST_DATABASE_URL;
const PORT = 61881;
const DISPATCH_PORT = 61882;
const BASE = `http://127.0.0.1:${PORT}`;
const id = (p, n) => `00000000-0000-0000-0000-${p}${String(n).padStart(12 - p.length, '0')}`;
const ANNA = id('a', 1), PAUL = id('a', 2), EV = id('e', 1), BAR = id('5', 1);

test('Arbeitsplan-Aenderung: merken, buendeln, verschicken, kurz vorher anrufen', { skip: !DB && 'TEST_DATABASE_URL nicht gesetzt' }, async (t) => {
    const { Pool } = require('pg');
    const { schemaAufbauen } = require('./datenbank');
    const pool = new Pool({ connectionString: DB });
    await schemaAufbauen(pool);
    const q = (sql, p) => pool.query(sql, p);
    await q(`INSERT INTO members (id, vorname, nachname, email, zustellung_email) VALUES
        ($1, 'Anna', 'Mail', 'anna@example.ch', true), ($2, 'Paul', 'Post', 'paul@example.ch', false)`, [ANNA, PAUL]);
    await q(`INSERT INTO events (id, slug, title, category, start_date, status, organizer_name, organizer_email, registration_required, arbeitsplan_sent_at)
             VALUES ($1, 'chilbi', 'Chilbi', 'Dorffest', NOW() + INTERVAL '30 days', 'planned', 'Olga', 'olga@example.ch', true, NOW())`, [EV]);
    await q(`INSERT INTO shifts (id, event_id, name, bereich, date, start_time, end_time, needed)
             VALUES ($1, $2, 'Bar', 'Bar', (NOW() + INTERVAL '30 days')::date, '18:00', '20:00', 2)`, [BAR, EV]);
    await q(`INSERT INTO registrations (event_id, member_id, shift_ids, status) VALUES ($1, $2, ARRAY[$3]::uuid[], 'approved')`, [EV, ANNA, BAR]);

    const mails = []; const briefe = [];
    const dispatch = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
            if (req.url === '/email/send') mails.push(JSON.parse(body || '{}'));
            if (req.url === '/pingen/send-arbeitsplan') briefe.push(JSON.parse(body || '{}'));
            res.setHeader('Content-Type', 'application/json');
            res.end('{"success":true,"letterId":"L1"}');
        });
    });
    await new Promise(r => dispatch.listen(DISPATCH_PORT, '127.0.0.1', r));
    const server = spawn('node', [path.join(__dirname, '..', 'src', 'index.js')], {
        env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: 's', API_KEY: 'k',
               DISPATCH_API_URL: `http://127.0.0.1:${DISPATCH_PORT}`, MEMBERS_API_URL: 'http://127.0.0.1:9',
               INTERNAL_API_KEY: '', ARBEITSPLAN_REMINDER_ENABLED: 'false', ARBEITSPLAN_UPDATE_ENABLED: 'false' },
        stdio: 'ignore'
    });
    t.after(async () => { server.kill(); dispatch.close(); await pool.end(); });
    for (let i = 0; i < 50; i++) {
        try { if ((await fetch(`${BASE}/health`)).ok) break; } catch (_) { /* startet noch */ }
        await new Promise(r => setTimeout(r, 200));
    }
    for (let i = 0; i < 50; i++) {
        const c = await q(`SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'arbeitsplan_neu_seit'`);
        if (c.rows.length) break;
        await new Promise(r => setTimeout(r, 100));
    }
    const pruefen = async () => {
        const r = await fetch(`${BASE}/reminders/arbeitsplan-aenderungen`, { method: 'POST', headers: { 'x-api-key': 'k' } });
        assert.equal(r.status, 200);
    };
    const ev = async () => (await q('SELECT arbeitsplan_stand_json, arbeitsplan_neu_stand, arbeitsplan_neu_seit FROM events WHERE id = $1', [EV])).rows[0];

    // Ohne Schluessel abgewiesen
    assert.equal((await fetch(`${BASE}/reminders/arbeitsplan-aenderungen`, { method: 'POST' })).status, 401);

    // 1. Erstlauf: Stand merken, nichts verschicken
    await pruefen();
    assert.ok((await ev()).arbeitsplan_stand_json, 'Stand gemerkt');
    assert.equal(mails.length + briefe.length, 0);

    // 2. Paul kommt dazu: gemerkt, noch nicht verschickt (Ruhezeit 60 min)
    await q(`INSERT INTO registrations (event_id, member_id, shift_ids, status) VALUES ($1, $2, ARRAY[$3]::uuid[], 'approved')`, [EV, PAUL, BAR]);
    await pruefen();
    assert.ok((await ev()).arbeitsplan_neu_seit, 'Aenderung gemerkt');
    assert.equal(mails.length + briefe.length, 0);

    // 3. Eine Stunde Ruhe: an alle - Mail an Anna, Brief an Paul, Meldung an Olga
    await q(`UPDATE events SET arbeitsplan_neu_seit = NOW() - INTERVAL '61 minutes' WHERE id = $1`, [EV]);
    await pruefen();
    const anAnna = mails.filter(m => m.to === 'anna@example.ch');
    assert.equal(anAnna.length, 1);
    assert.match(anAnna[0].subject, /^Arbeitsplan geändert - Chilbi/);
    assert.match(anAnna[0].body, /neu Paul Post/);
    assert.equal(anAnna[0].attachments[0].contentType, 'application/pdf');
    assert.equal(briefe.length, 1);
    assert.equal(briefe[0].member_id, PAUL);
    assert.match(briefe[0].aenderungen.join(' '), /neu Paul Post/);
    const anOlga = mails.filter(m => m.to === 'olga@example.ch');
    assert.equal(anOlga.length, 1);
    assert.doesNotMatch(anOlga[0].body, /ANRUFEN/);
    assert.equal((await ev()).arbeitsplan_neu_seit, null);

    // 4. Nichts Neues: nichts verschicken
    const vorher = mails.length;
    await pruefen();
    assert.equal(mails.length, vorher);

    // 5. Morgen ist der Anlass: 10 Minuten Ruhe genuegen, kein Brief mehr -
    //    Olga soll Paul anrufen
    await q(`UPDATE events SET start_date = NOW() + INTERVAL '1 day' WHERE id = $1`, [EV]);
    await q(`UPDATE registrations SET status = 'rejected' WHERE member_id = $1`, [ANNA]);
    await pruefen();
    await q(`UPDATE events SET arbeitsplan_neu_seit = NOW() - INTERVAL '11 minutes' WHERE id = $1`, [EV]);
    await pruefen();
    assert.equal(briefe.length, 1, 'kein zweiter Brief so kurz vorher');
    const olga2 = mails.filter(m => m.to === 'olga@example.ch').at(-1);
    assert.match(olga2.body, /nicht mehr Anna Mail/);
    assert.match(olga2.body, /BITTE ANRUFEN[\s\S]*Paul Post/);
});
