// Niemand zweimal als Teilnehmer am selben Anlass (src/doppelte-anmeldung.js).
//
// Reine Logik ohne Datenbank; mit TEST_DATABASE_URL zusaetzlich gegen ein
// echtes Postgres und den echten Server (src/index.js): vier gleichzeitige
// Klicks ergeben eine Zeile, Paare mit gemeinsamer Adresse duerfen sich je
// selbst anmelden. ACHTUNG: die Datenbank wird geleert.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const d = require('../src/doppelte-anmeldung');

const DB = process.env.TEST_DATABASE_URL;

test('normalName: Gross/klein, Leerzeichen, "Nachname, Vorname"', () => {
    assert.equal(d.normalName('  Degen,   Heinz '), d.normalName('heinz degen'));
    assert.equal(d.normalName('Degen Heinz'), 'degen heinz');
    assert.ok(d.gleicherName('Degen, Heinz', 'Heinz  Degen'));
    assert.ok(!d.gleicherName('Verena Degen', 'Heinz Degen'));
    assert.ok(!d.gleicherName('', ''), 'leere Namen sind nie gleich');
    assert.ok(!d.gleicherName(null, undefined));
});

test('istTeilnahme: ohne Schicht', () => {
    assert.ok(d.istTeilnahme(null));
    assert.ok(d.istTeilnahme(undefined));
    assert.ok(d.istTeilnahme([]));
    assert.ok(d.istTeilnahme([null]));
    assert.ok(!d.istTeilnahme(['s1']));
});

test('gleichePerson: Mitglied oder Adresse, immer mit Name', () => {
    const alt = { member_id: 'm1', guest_email: 'Familie@Degen.ch', person_name: 'Degen, Heinz' };
    // dasselbe Mitglied, gleicher Name
    assert.ok(d.gleichePerson({ memberId: 'm1', name: 'Heinz Degen' }, alt));
    // dasselbe Mitglied meldet ausdruecklich eine andere Person an
    assert.ok(!d.gleichePerson({ memberId: 'm1', name: 'Verena Degen' }, alt));
    // gemeinsame Adresse, anderer Name: Partnerin darf
    assert.ok(!d.gleichePerson({ email: 'familie@degen.ch', name: 'Verena Degen' }, alt));
    // gleiche Adresse, gleicher Name, ohne Mitglied
    assert.ok(d.gleichePerson({ email: ' familie@degen.ch ', name: 'heinz degen' }, alt));
    // zwei verschiedene Mitglieder mit gleichem Namen bleiben verschieden (Vater/Sohn)
    assert.ok(!d.gleichePerson({ memberId: 'm2', email: 'familie@degen.ch', name: 'Heinz Degen' }, alt));
    // ohne Adresse und ohne Mitglied: keine Aussage
    assert.ok(!d.gleichePerson({ name: 'Heinz Degen' }, { ...alt, member_id: null }));
});

test('personenZahl', () => {
    assert.equal(d.personenZahl({ notes: '{"participants":3}' }), 3);
    assert.equal(d.personenZahl({ notes: { participants: '2' } }), 2);
    assert.equal(d.personenZahl({ notes: 'alter Text' }), 1);
    assert.equal(d.personenZahl({}), 1);
});

test('hinweisSelbst: Personenzahl nie still ueberschrieben', () => {
    const reg = { notes: '{"participants":2}' };
    assert.equal(d.hinweisSelbst(reg, 2),
        'Du bist schon angemeldet (2 Personen). Eine zweite Anmeldung ist nicht nötig.');
    assert.equal(d.hinweisSelbst(reg, null),
        'Du bist schon angemeldet (2 Personen). Eine zweite Anmeldung ist nicht nötig.');
    const mehr = d.hinweisSelbst(reg, 3);
    assert.match(mehr, /^Du bist schon angemeldet \(2 Personen\)\./);
    assert.match(mehr, /3 Personen angegeben – die Anzahl haben wir nicht geändert/);
    assert.match(mehr, /melde dich beim Organisator oder beim Vorstand/);
    assert.match(d.hinweisSelbst({ notes: null }, 1), /\(1 Person\)/);
});

test('hinweisVorstand nennt Person, Anzahl und Status', () => {
    const t = d.hinweisVorstand({ person_name: 'Degen, Heinz', status: 'approved', notes: '{"participants":1}' });
    assert.equal(t, 'Degen, Heinz ist für diesen Anlass schon angemeldet (1 Person, bestätigt). '
        + 'Es wurde keine zweite Anmeldung angelegt. Um die Personenzahl zu ändern, bearbeite die bestehende Anmeldung.');
});

test('bestehendeTeilnahme fragt nicht ohne Anlass oder ohne Person', async () => {
    const db = { query: async () => { throw new Error('darf nicht fragen'); } };
    assert.equal(await d.bestehendeTeilnahme(db, { memberId: null, email: 'a@b.ch', name: 'A' }), null);
    assert.equal(await d.bestehendeTeilnahme(db, { eventId: 'e', email: 'a@b.ch', name: '' }), null);
    assert.equal(await d.bestehendeTeilnahme(db, { eventId: 'e', name: 'Anna' }), null);
});

// ---------------------------------------------------------------------------
// Mit Datenbank

const id = (praefix, n) => `00000000-0000-0000-0000-${praefix}${String(n).padStart(12 - praefix.length, '0')}`;
const HEINZ = id('a', 1), VERENA = id('a', 2), ERIKA = id('a', 3), PETER = id('a', 4);
const E = n => id('e', n);

async function seed(pool) {
    await pool.query(`INSERT INTO members (id, vorname, nachname, email) VALUES
        ($1, 'Heinz', 'Degen', 'heinz@example.ch'), ($2, 'Verena', 'Degen', 'verena@example.ch'),
        ($3, 'Erika', 'Muster', 'familie@example.ch'), ($4, 'Peter', 'Muster', 'familie@example.ch')`,
    [HEINZ, VERENA, ERIKA, PETER]);
    for (const [n, slug] of [[1, 'spaghetti'], [2, 'chilbi'], [3, 'grillen'], [4, 'lotto']]) {
        await pool.query(
            `INSERT INTO events (id, slug, title, category, start_date, status, registration_required)
             VALUES ($1, $2, $3, 'Sonstiges', '2026-11-20 18:00', 'planned', true)`,
            [E(n), slug, `Anlass ${n}`]);
    }
}

test('Echte Datenbank: bestehendeTeilnahme', { skip: !DB && 'TEST_DATABASE_URL nicht gesetzt' }, async () => {
    const { Pool } = require('pg');
    const { schemaAufbauen } = require('./datenbank');
    const pool = new Pool({ connectionString: DB });
    try {
        await schemaAufbauen(pool);
        await seed(pool);
        const ins = (werte) => pool.query(
            `INSERT INTO registrations (event_id, member_id, guest_name, guest_email, shift_ids, status)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, werte);
        const heinz = (await ins([E(4), HEINZ, 'Degen, Heinz', 'heinz@example.ch', null, 'approved'])).rows[0].id;
        await ins([E(4), null, 'Gast Gross', 'gast@example.ch', null, 'pending']);
        await ins([E(4), null, 'Alt Abgelehnt', 'alt@example.ch', null, 'rejected']);
        const schicht = (await pool.query(
            `INSERT INTO shifts (event_id, name, date, start_time, end_time, needed)
             VALUES ($1, 'Bar', '2026-11-20', '18:00', '22:00', 2) RETURNING id`, [E(4)])).rows[0].id;
        await ins([E(4), VERENA, '', 'verena@example.ch', [schicht], 'approved']);

        // Mitglied ohne Name in der Anfrage: Name vom Mitglied
        assert.equal((await d.bestehendeTeilnahme(pool, { eventId: E(4), memberId: HEINZ }))?.id, heinz);
        // "Heinz Degen" == "Degen, Heinz"
        assert.equal((await d.bestehendeTeilnahme(pool, { eventId: E(4), email: 'HEINZ@example.ch', name: 'Heinz Degen' }))?.id, heinz);
        // Gast ueber Adresse + Name; andere Person mit derselben Adresse nicht
        assert.ok(await d.bestehendeTeilnahme(pool, { eventId: E(4), email: 'gast@example.ch', name: 'gross gast' }));
        assert.equal(await d.bestehendeTeilnahme(pool, { eventId: E(4), email: 'gast@example.ch', name: 'Klein Gast' }), null);
        // abgelehnt zaehlt nicht
        assert.equal(await d.bestehendeTeilnahme(pool, { eventId: E(4), email: 'alt@example.ch', name: 'Alt Abgelehnt' }), null);
        // Schicht-Anmeldung zaehlt nicht als Teilnahme
        assert.equal(await d.bestehendeTeilnahme(pool, { eventId: E(4), memberId: VERENA }), null);
        // die bearbeitete Anmeldung zaehlt nicht gegen sich selbst
        assert.equal(await d.bestehendeTeilnahme(pool, { eventId: E(4), memberId: HEINZ, ausser: heinz }), null);
        // anderer Anlass
        assert.equal(await d.bestehendeTeilnahme(pool, { eventId: E(3), memberId: HEINZ }), null);
    } finally {
        await pool.end();
    }
});

test('Echter Server: Doppelklicks ergeben eine Zeile, Paare duerfen', { skip: !DB && 'TEST_DATABASE_URL nicht gesetzt' }, async (t) => {
    const { Pool } = require('pg');
    const jwt = require('jsonwebtoken');
    const { schemaAufbauen } = require('./datenbank');
    const PORT = 61895, DISPATCH_PORT = 61896, SECRET = 'test-geheim';
    const BASE = `http://127.0.0.1:${PORT}`;
    const pool = new Pool({ connectionString: DB });
    await schemaAufbauen(pool);
    await seed(pool);

    const dispatch = http.createServer((req, res) => {
        req.resume();
        req.on('end', () => { res.setHeader('Content-Type', 'application/json'); res.end('{"success":true}'); });
    });
    await new Promise(r => dispatch.listen(DISPATCH_PORT, '127.0.0.1', r));
    const server = spawn('node', [path.join(__dirname, '..', 'src', 'index.js')], {
        env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: SECRET,
               TEST_JETZT: '2026-10-15T10:00:00+02:00',
               DISPATCH_API_URL: `http://127.0.0.1:${DISPATCH_PORT}`, CONTACT_EMAIL: 'kontakt-test@example.ch',
               MEMBERS_API_URL: 'http://127.0.0.1:9', ARBEITSPLAN_REMINDER_ENABLED: 'false' },
        stdio: 'ignore'
    });
    t.after(async () => { server.kill(); dispatch.close(); await pool.end(); });
    for (let i = 0; i < 50; i++) {
        try { if ((await fetch(`${BASE}/health`)).ok) break; } catch (_) { /* startet noch */ }
        await new Promise(r => setTimeout(r, 200));
    }

    const senden = async (pfad, body, token) => {
        const r = await fetch(BASE + pfad, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(body)
        });
        return { status: r.status, json: await r.json() };
    };
    const zeilen = async (eventId) => (await pool.query(
        `SELECT member_id, guest_name, guest_email, status FROM registrations WHERE event_id = $1 ORDER BY created_at`,
        [eventId])).rows;
    const heinz = jwt.sign({ type: 'member', sub: HEINZ, email: 'heinz@example.ch' }, SECRET);
    const verena = jwt.sign({ type: 'member', sub: VERENA, email: 'verena@example.ch' }, SECRET);
    const vorstand = jwt.sign({ type: 'vorstand', email: 'aktuar@example.ch', groups: ['vorstand'] }, SECRET);

    await t.test('Mitglied: 4 gleichzeitige Anmeldungen -> 1 Zeile, alle 200', async () => {
        const body = { type: 'participant', eventId: E(1), name: 'Heinz Degen', email: 'heinz@example.ch', participants: 1 };
        const antworten = await Promise.all([1, 2, 3, 4].map(() => senden('/registrations/public', body, heinz)));
        for (const a of antworten) assert.equal(a.status, 200, JSON.stringify(a.json));
        assert.equal(antworten.filter(a => a.json.bereits_angemeldet).length, 3);
        assert.equal(new Set(antworten.map(a => a.json.registrationId)).size, 1, 'alle zeigen auf dieselbe Anmeldung');
        assert.equal((await zeilen(E(1))).length, 1);

        // mehr Personen: nicht still ueberschrieben, Hinweis im Text
        const mehr = await senden('/registrations/public', { ...body, participants: 3 }, heinz);
        assert.equal(mehr.status, 200);
        assert.equal(mehr.json.bereits_angemeldet, true);
        assert.match(mehr.json.message, /schon angemeldet \(1 Person\).*3 Personen angegeben/);
        const notes = JSON.parse((await pool.query('SELECT notes FROM registrations WHERE event_id = $1', [E(1)])).rows[0].notes);
        assert.equal(notes.participants, 1);

        // Verena (anderes Mitglied) darf sich anmelden
        const v = await senden('/registrations/public', { type: 'participant', eventId: E(1), name: 'Verena Degen', email: 'verena@example.ch' }, verena);
        assert.equal(v.status, 200);
        assert.equal(v.json.bereits_angemeldet, undefined);
        assert.equal((await zeilen(E(1))).length, 2);
    });

    await t.test('Paar mit gemeinsamer Adresse ohne Token: je eine Anmeldung, je richtig verknuepft', async () => {
        const erika = await senden('/registrations/public', { type: 'participant', eventId: E(2), name: 'Erika Muster', email: 'familie@example.ch' });
        const peter = await senden('/registrations/public', { type: 'participant', eventId: E(2), name: 'Muster, Peter', email: 'Familie@example.ch' });
        assert.equal(erika.status, 200, JSON.stringify(erika.json));
        assert.equal(peter.status, 200, JSON.stringify(peter.json));
        assert.equal(peter.json.bereits_angemeldet, undefined);
        const z = await zeilen(E(2));
        assert.deepEqual(z.map(r => r.member_id).sort(), [ERIKA, PETER].sort());
        // Erika nochmals: dieselbe Anmeldung
        const nochmal = await senden('/registrations/public', { type: 'participant', eventId: E(2), name: 'erika muster', email: 'familie@example.ch' });
        assert.equal(nochmal.json.bereits_angemeldet, true);
        assert.equal((await zeilen(E(2))).length, 2);
    });

    await t.test('Vorstand (vorstand.html "Person hinzufuegen"): 4 Klicks -> 1 Zeile, Rest 409', async () => {
        const body = { event_id: E(3), shift_ids: null, status: 'approved', member_id: HEINZ,
                       guest_name: 'Degen, Heinz', guest_email: 'heinz@example.ch' };
        const antworten = await Promise.all([1, 2, 3, 4].map(() => senden('/registrations', body, vorstand)));
        assert.deepEqual(antworten.map(a => a.status).sort(), [201, 409, 409, 409]);
        const abgewiesen = antworten.find(a => a.status === 409).json;
        assert.equal(abgewiesen.code, 'bereits_angemeldet');
        assert.match(abgewiesen.error, /Degen, Heinz ist für diesen Anlass schon angemeldet \(1 Person, bestätigt\)/);
        assert.equal((await zeilen(E(3))).length, 1);

        // Mitglied selbst ueber dieselbe Route: 200 mit der bestehenden Anmeldung
        const selbst = await senden('/registrations', { event_id: E(3), member_id: HEINZ }, heinz);
        assert.equal(selbst.status, 200);
        assert.equal(selbst.json.bereits_angemeldet, true);

        // Vorstand traegt ausdruecklich eine andere Person ueber Heinz ein: erlaubt
        const gast = await senden('/registrations', { event_id: E(3), member_id: HEINZ, guest_name: 'Gast von Heinz', status: 'approved' }, vorstand);
        assert.equal(gast.status, 201);
        // Abgelehnte Anmeldung zaehlt nicht
        await pool.query(`UPDATE registrations SET status = 'rejected' WHERE event_id = $1 AND guest_name = 'Degen, Heinz'`, [E(3)]);
        const neu = await senden('/registrations', body, vorstand);
        assert.equal(neu.status, 201);
    });

    await t.test('Organisator-Routen: 409 bei derselben Person', async () => {
        const org = jwt.sign({ type: 'event-organizer', event_id: E(4) }, SECRET);
        const body = { guest_name: 'Hans Gast', guest_email: 'hans@gast.ch', participants: 2 };
        const antworten = await Promise.all([1, 2].map(() => senden('/events/my-event/registrations', body, org)));
        assert.deepEqual(antworten.map(a => a.status).sort(), [200, 409]);
        const viaVorstand = await senden(`/events/${E(4)}/registrations-as-organizer`,
            { guest_name: 'Gast, Hans', guest_email: 'HANS@gast.ch' }, vorstand);
        assert.equal(viaVorstand.status, 409);
        assert.equal(viaVorstand.json.code, 'bereits_angemeldet');
        const partnerin = await senden(`/events/${E(4)}/registrations-as-organizer`,
            { guest_name: 'Hanna Gast', guest_email: 'hans@gast.ch' }, vorstand);
        assert.equal(partnerin.status, 200, 'gleiche Adresse, andere Person');
        assert.equal((await zeilen(E(4))).length, 2);
    });
});
