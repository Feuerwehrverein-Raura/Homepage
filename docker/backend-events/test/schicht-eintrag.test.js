// Person in eine Schicht eintragen (src/schicht-eintrag.js) ueber die
// Organisator-Routen:
//  - POST /events/:id/registrations-as-organizer (Vorstand, Organisatoren)
//  - POST /events/my-event/registrations (externer Event-Login)
//  - PUT  /events/:eventId/registrations/:regId/as-organizer
//
// Ohne Datenbank: die Pruefung mit einer nachgebauten Datenbank. Mit
// TEST_DATABASE_URL (Schema frisch; ACHTUNG: leert die Datenbank) gegen den
// echten Server.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { schichtenPruefen } = require('../src/schicht-eintrag');

const S1 = '00000000-0000-0000-0000-5000000000a1';
const S2 = '00000000-0000-0000-0000-5000000000a2';
const FREMD = '00000000-0000-0000-0000-5000000000f1';

// Nachgebaute Datenbank: kennt die Schichten des Anlasses und die
// Doppel-Abfrage (doppelte-schicht.js).
function fakeDb({ schichten = [], doppelt = [], gleichzeitig = [] } = {}) {
    const anfragen = [];
    return {
        anfragen,
        query: async (sql, params) => {
            anfragen.push({ sql, params });
            if (/FROM shifts s\s+WHERE s\.event_id/.test(sql)) {
                return { rows: schichten.filter(s => params[1].includes(s.id)) };
            }
            // Zeitpruefung (zeitKonflikte): die angefragten Schichten mit Zeiten ...
            if (/FROM shifts s LEFT JOIN events/.test(sql)) {
                return { rows: schichten.filter(s => params[0].includes(s.id))
                    .map(s => ({ shift_id: s.id, name: s.name, bereich: s.bereich || null, date: s.date,
                        start_time: s.start_time, end_time: s.end_time || null, anlass: 'Chilbi' })) };
            }
            // ... und die bestehenden Schichten der Person.
            if (/SELECT DISTINCT s\.id AS shift_id, s\.name, s\.bereich/.test(sql)) return { rows: gleichzeitig };
            if (/JOIN shifts s ON s\.id = ANY\(r\.shift_ids\)/.test(sql)) return { rows: doppelt };
            throw new Error('unerwartete Abfrage: ' + sql);
        }
    };
}

test('ohne shift_ids: nichts geprueft, nichts gefragt', async () => {
    const db = fakeDb();
    assert.deepEqual(await schichtenPruefen(db, { eventId: 'e', shiftIds: undefined }), { angegeben: false });
    assert.equal(db.anfragen.length, 0);
});

test('leere Liste oder null: Anmeldung ohne Schicht', async () => {
    const db = fakeDb();
    for (const leer of [[], null, [null, '']]) {
        assert.deepEqual(await schichtenPruefen(db, { eventId: 'e', shiftIds: leer }),
            { angegeben: true, shiftIds: null, warnung: null });
    }
    assert.equal(db.anfragen.length, 0);
});

test('keine Liste oder keine UUID: 400', async () => {
    const db = fakeDb();
    assert.equal((await schichtenPruefen(db, { eventId: 'e', shiftIds: S1 })).fehler.status, 400);
    assert.equal((await schichtenPruefen(db, { eventId: 'e', shiftIds: ['abc'] })).fehler.status, 400);
    assert.equal(db.anfragen.length, 0);
});

test('Schicht eines anderen Anlasses: 400', async () => {
    const db = fakeDb({ schichten: [{ id: S1, name: 'Bar', needed: 3, belegt: 0 }] });
    const r = await schichtenPruefen(db, { eventId: 'e', shiftIds: [S1, FREMD], memberId: 'm' });
    assert.equal(r.fehler.status, 400);
    assert.equal(r.fehler.body.code, 'schicht_fremd');
});

test('Doppelte fallen weg, Reihenfolge bleibt; freie Schicht ohne Warnung', async () => {
    const db = fakeDb({ schichten: [
        { id: S1, name: 'Bar', needed: 3, belegt: 1 },
        { id: S2, name: 'Kasse', needed: 2, belegt: 0 }
    ] });
    const r = await schichtenPruefen(db, { eventId: 'e', shiftIds: [S2, S1, S2], memberId: 'm' });
    assert.deepEqual(r, { angegeben: true, shiftIds: [S2, S1], warnung: null });
    assert.deepEqual(db.anfragen[0].params[1], [S2, S1]);
});

test('volle Schicht: eingetragen, aber mit Warnung', async () => {
    const db = fakeDb({ schichten: [
        { id: S1, name: 'Bar', date: '2026-10-17', start_time: '18:00:00', needed: 2, belegt: 2 },
        { id: S2, name: 'Kasse', needed: 0, belegt: 4 }
    ] });
    const r = await schichtenPruefen(db, { eventId: 'e', shiftIds: [S1, S2], email: 'a@x.ch' });
    assert.deepEqual(r.shiftIds, [S1, S2]);
    assert.equal(r.warnung, 'Schicht bereits voll, trotzdem eingetragen: Bar (2026-10-17 18:00) 2/2');
});

test('dieselbe Person schon auf der Schicht: 409', async () => {
    const db = fakeDb({
        schichten: [{ id: S1, name: 'Bar', needed: 3, belegt: 1 }],
        doppelt: [{ shift_id: S1, name: 'Bar', date: '2026-10-17', start_time: '18:00:00' }]
    });
    const r = await schichtenPruefen(db, { eventId: 'e', shiftIds: [S1], memberId: 'm', ausser: 'r1' });
    assert.equal(r.fehler.status, 409);
    assert.equal(r.fehler.body.code, 'schicht_doppelt');
    // die bearbeitete Anmeldung zaehlt weder zur Belegung noch als Doppel
    assert.equal(db.anfragen[0].params[2], 'r1');
    assert.equal(db.anfragen[1].params[3], 'r1');
});

// ---------------------------------------------------------------------------

const DB = process.env.TEST_DATABASE_URL;
const PORT = 55880;
const DISPATCH_PORT = 55881;
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = 'test-geheim';
const JETZT = '2026-10-11T10:00:00+02:00';
const PASSWORT = 'chilbi-passwort-1';

const id = (praefix, n) => `00000000-0000-0000-0000-${praefix}${String(n).padStart(12 - praefix.length, '0')}`;
const ERIKA = id('a', 1), HANS = id('a', 2), OTTO = id('a', 3);
const E1 = id('e', 1), E2 = id('e', 2);
const BAR = id('b', 1), KASSE = id('b', 2), VOLL = id('b', 3), ANDERS = id('b', 9);

async function seed(pool) {
    const q = (sql, p) => pool.query(sql, p);
    await q(`INSERT INTO members (id, vorname, nachname, email) VALUES
        ($1, 'Erika', 'Muster', 'erika@example.ch'), ($2, 'Hans', 'Helfer', 'hans@example.ch'),
        ($3, 'Otto', 'Andere', 'otto@example.ch')`, [ERIKA, HANS, OTTO]);
    // Chilbi: Erika organisiert, dazu ein Event-Login fuer externe Organisatoren
    await q(`INSERT INTO events (id, slug, title, category, start_date, status, organizer_id, organizer_name,
                                 event_email, event_password_hash, registration_required)
             VALUES ($1, 'chilbi', 'Chilbi', 'Sonstiges', '2026-10-24 18:00', 'planned', $2, 'Erika Muster',
                     'chilbi@fwv-raura.ch', $3, true)`,
    [E1, ERIKA, crypto.createHash('sha256').update(PASSWORT).digest('hex')]);
    await q(`INSERT INTO events (id, slug, title, category, start_date, status)
             VALUES ($1, 'anders', 'Anderer Anlass', 'Sonstiges', '2026-11-24 18:00', 'planned')`, [E2]);
    await q(`INSERT INTO shifts (id, event_id, name, date, start_time, end_time, needed) VALUES
        ($1, $5, 'Bar', '2026-10-24', '18:00', '22:00', 3),
        ($2, $5, 'Kasse', '2026-10-24', '18:00', '22:00', 2),
        ($3, $5, 'Abbau', '2026-10-25', '10:00', '12:00', 1),
        ($4, $6, 'Fremd', '2026-11-24', '18:00', '22:00', 2)`, [BAR, KASSE, VOLL, ANDERS, E1, E2]);
    // Abbau ist schon voll
    await q(`INSERT INTO registrations (event_id, guest_name, guest_email, shift_ids, status)
             VALUES ($1, 'Voll', 'voll@example.ch', $2, 'approved')`, [E1, [VOLL]]);
}

test('Person in Schicht eintragen gegen den echten Server', { skip: !DB && 'TEST_DATABASE_URL nicht gesetzt' }, async (t) => {
    const { Pool } = require('pg');
    const jwt = require('jsonwebtoken');
    const { schemaAufbauen } = require('./datenbank');
    const pool = new Pool({ connectionString: DB });
    await schemaAufbauen(pool);
    await seed(pool);

    const mails = [];
    const dispatch = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
            if (req.url === '/email/send') mails.push(JSON.parse(body || '{}'));
            res.setHeader('Content-Type', 'application/json');
            res.end('{"success":true}');
        });
    });
    await new Promise(r => dispatch.listen(DISPATCH_PORT, '127.0.0.1', r));

    const server = spawn('node', [path.join(__dirname, '..', 'src', 'index.js')], {
        env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: SECRET, TEST_JETZT: JETZT,
               DISPATCH_API_URL: `http://127.0.0.1:${DISPATCH_PORT}`, CONTACT_EMAIL: 'kontakt@example.ch',
               MEMBERS_API_URL: 'http://127.0.0.1:9', INTERNAL_API_KEY: '', ARBEITSPLAN_REMINDER_ENABLED: 'false' },
        stdio: 'ignore'
    });
    t.after(async () => { server.kill(); dispatch.close(); await pool.end(); });
    for (let i = 0; i < 50; i++) {
        try { if ((await fetch(`${BASE}/health`)).ok) break; } catch (_) { /* startet noch */ }
        await new Promise(r => setTimeout(r, 200));
    }

    const token = {
        erika: jwt.sign({ type: 'member', sub: ERIKA, email: 'erika@example.ch' }, SECRET),
        otto: jwt.sign({ type: 'member', sub: OTTO, email: 'otto@example.ch' }, SECRET),
        vorstand: jwt.sign({ type: 'vorstand', email: 'praesident@fwv-raura.ch', role: 'praesident',
            groups: ['vorstand'] }, SECRET)
    };
    const anfrage = async (methode, pfad, wer, body) => {
        const tok = token[wer] || wer;
        const r = await fetch(BASE + pfad, {
            method: methode,
            headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const text = await r.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) { /* kein JSON */ }
        return { status: r.status, json };
    };
    const zeile = async regId => (await pool.query('SELECT * FROM registrations WHERE id = $1', [regId])).rows[0];
    const eintragen = (wer, body) => anfrage('POST', `/events/${E1}/registrations-as-organizer`, wer, body);
    let hansReg, gastReg;

    await t.test('ohne shift_ids wie bisher: direkte Anmeldung ohne Schicht', async () => {
        const r = await eintragen('erika', { guest_name: 'Ohne Schicht', guest_email: 'ohne@example.ch' });
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(r.json.registration.status, 'approved');
        assert.equal(r.json.registration.shift_ids, null);
        assert.equal(r.json.warnung, null);
    });

    await t.test('Organisatorin traegt Mitglied in Schichten ein (Doppelte entfernt)', async () => {
        mails.length = 0;
        const r = await eintragen('erika', { member_id: HANS, shift_ids: [BAR, KASSE, BAR] });
        assert.equal(r.status, 200, JSON.stringify(r.json));
        hansReg = r.json.registration.id;
        assert.deepEqual(r.json.registration.shift_ids, [BAR, KASSE]);
        assert.equal(r.json.registration.status, 'approved');
        assert.equal(r.json.warnung, null);
        // Mail an die Person mit den Schichten
        await new Promise(res => setTimeout(res, 300));
        const an = mails.filter(m => m.to === 'hans@example.ch');
        assert.equal(an.length, 1);
        assert.match(an[0].body, /Bar/);
        assert.match(an[0].body, /Kasse/);
        // zaehlt fuer die Belegung in der Uebersicht
        const u = await anfrage('GET', '/events/organisator-uebersicht', 'erika');
        const bar = u.json.anlaesse.find(a => a.id === E1).shifts.find(s => s.id === BAR);
        assert.equal(bar.app.belegung.besetzt, 1);
    });

    await t.test('dieselbe Person nochmals auf dieselbe Schicht: 409', async () => {
        const r = await eintragen('erika', { member_id: HANS, shift_ids: [BAR] });
        assert.equal(r.status, 409);
        assert.equal(r.json.code, 'schicht_doppelt');
    });

    await t.test('Schicht eines anderen Anlasses: 400, nichts gespeichert', async () => {
        const vorher = (await pool.query('SELECT COUNT(*)::int AS n FROM registrations')).rows[0].n;
        const r = await eintragen('vorstand', { guest_name: 'Falsch', shift_ids: [BAR, ANDERS] });
        assert.equal(r.status, 400);
        assert.equal(r.json.code, 'schicht_fremd');
        assert.equal((await eintragen('vorstand', { guest_name: 'Falsch', shift_ids: 'x' })).status, 400);
        assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM registrations')).rows[0].n, vorher);
    });

    await t.test('volle Schicht: Vorstand traegt trotzdem ein, mit Warnung', async () => {
        const r = await eintragen('vorstand', { guest_name: 'Gast Gross', guest_email: 'gast@example.ch',
            shift_ids: [VOLL] });
        assert.equal(r.status, 200, JSON.stringify(r.json));
        gastReg = r.json.registration.id;
        assert.deepEqual(r.json.registration.shift_ids, [VOLL]);
        assert.match(r.json.warnung, /voll.*Abbau.*1\/1/);
    });

    await t.test('fremdes Mitglied darf nicht eintragen', async () => {
        assert.equal((await eintragen('otto', { guest_name: 'X', shift_ids: [BAR] })).status, 403);
    });

    await t.test('PUT: Schichten ersetzen, entfernen; andere Felder bleiben', async () => {
        const put = (body, wer = 'erika', reg = hansReg) =>
            anfrage('PUT', `/events/${E1}/registrations/${reg}/as-organizer`, wer, body);
        let r = await put({ shift_ids: [KASSE, VOLL] });
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.deepEqual((await zeile(hansReg)).shift_ids, [KASSE, VOLL]);
        assert.match(r.json.warnung, /Abbau/);
        // eigene Schicht beim Bearbeiten ist kein Doppel und keine Warnung
        r = await put({ shift_ids: [KASSE] });
        assert.equal(r.json.warnung, null);
        assert.deepEqual((await zeile(hansReg)).shift_ids, [KASSE]);
        // ohne shift_ids bleiben die Schichten
        r = await put({ notes: 'kommt spaeter' });
        assert.equal(r.status, 200);
        assert.deepEqual((await zeile(hansReg)).shift_ids, [KASSE]);
        // fremde Schicht
        r = await put({ shift_ids: [ANDERS] });
        assert.equal(r.status, 400);
        assert.deepEqual((await zeile(hansReg)).shift_ids, [KASSE]);
        // Gast auf eine Schicht, auf der er schon steht? Nein: andere Anmeldung derselben Adresse
        await pool.query(`INSERT INTO registrations (event_id, guest_name, guest_email, shift_ids, status)
                          VALUES ($1, 'Gast Gross', 'gast@example.ch', $2, 'pending')`, [E1, [BAR]]);
        r = await put({ shift_ids: [VOLL, BAR] }, 'vorstand', gastReg);
        assert.equal(r.status, 409);
        // leere Liste: ohne Schicht
        r = await put({ shift_ids: [] });
        assert.equal(r.status, 200);
        assert.equal((await zeile(hansReg)).shift_ids, null);
    });

    await t.test('externer Event-Login: POST my-event/registrations mit Schicht', async () => {
        const login = await anfrage('POST', '/events/login', null, { email: 'chilbi@fwv-raura.ch', password: PASSWORT });
        assert.equal(login.status, 200, JSON.stringify(login.json));
        token.extern = login.json.token;
        let r = await anfrage('POST', '/events/my-event/registrations', 'extern',
            { guest_name: 'Muendlich', guest_phone: '079 000 00 00', shift_ids: [BAR] });
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.deepEqual(r.json.registration.shift_ids, [BAR]);
        assert.equal(r.json.registration.status, 'approved');
        r = await anfrage('POST', '/events/my-event/registrations', 'extern',
            { guest_name: 'Falsch', shift_ids: [ANDERS] });
        assert.equal(r.status, 400);
        r = await anfrage('POST', '/events/my-event/registrations', 'extern', { guest_name: 'Ohne' });
        assert.equal(r.status, 200);
        assert.equal(r.json.registration.shift_ids, null);
    });
});

test('gleichzeitig auf einer anderen Schicht: 409 schicht_gleichzeitig', async () => {
    const db = fakeDb({
        schichten: [{ id: S1, name: 'Schicht 6', bereich: 'Kueche', date: '2026-10-17',
            start_time: '22:00:00', end_time: '02:00:00', needed: 2, belegt: 0 }],
        gleichzeitig: [{ shift_id: S2, name: 'Schicht 6', bereich: 'Bar', date: '2026-10-17',
            start_time: '22:00:00', end_time: '02:00:00', anlass: 'Chilbi' }]
    });
    const r = await schichtenPruefen(db, { eventId: 'e', shiftIds: [S1], memberId: '11111111-1111-1111-1111-111111111111' });
    assert.equal(r.fehler.status, 409);
    assert.equal(r.fehler.body.code, 'schicht_gleichzeitig');
    assert.match(r.fehler.body.error, /Kueche Schicht 6 am 17\.10\.2026 22:00–02:00 überschneidet sich mit Bar Schicht 6/);
});
