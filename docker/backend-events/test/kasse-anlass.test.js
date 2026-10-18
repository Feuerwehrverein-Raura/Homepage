// TWINT-QR pro Anlass und "aktueller Anlass" fuer die Kasse
// (src/kasse-anlass.js, /events/kasse/*, /events/:id/twint-qr):
//  - reine Regel: Beginn - 2 h bis Ende + 2 h (Ortszeit), ohne Ende der
//    Starttag, Ausschluesse, bei mehreren der zuletzt begonnene
//  - Bildpruefung: nur PNG/JPEG/WebP/GIF nach Inhalt, kein SVG, max 2 MB
//  - gegen den echten Server: Kassen-Schluessel, Hochladen/Entfernen durch
//    Organisator und Vorstand, Abruf des Bildes.
//
// Der Server-Teil braucht TEST_DATABASE_URL (Schema frisch; ACHTUNG: leert
// die Datenbank).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const k = require('../src/kasse-anlass');

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const anlass = (id, start, ende, mehr = {}) => ({ id, title: id, start_date: start, end_date: ende, status: 'planned', ...mehr });

test('laeuft: zwei Stunden Puffer vor Beginn und nach Ende', () => {
    const chilbi = anlass('c', '2026-10-24 18:00:00', '2026-10-25 02:00:00');
    assert.equal(k.laeuft(chilbi, '2026-10-24 15:59:59'), false);
    assert.equal(k.laeuft(chilbi, '2026-10-24 16:00:00'), true);
    assert.equal(k.laeuft(chilbi, '2026-10-24 23:00:00'), true);
    assert.equal(k.laeuft(chilbi, '2026-10-25 04:00:00'), true);
    assert.equal(k.laeuft(chilbi, '2026-10-25 04:00:01'), false);
});

test('laeuft: ohne Ende gilt der Starttag bis 23:59:59 (+2 h)', () => {
    const gv = anlass('g', '2026-11-20 19:00', null);
    assert.equal(k.laeuft(gv, '2026-11-20 17:00:00'), true);
    assert.equal(k.laeuft(gv, '2026-11-21 01:59:59'), true);
    assert.equal(k.laeuft(gv, '2026-11-21 02:00:00'), false);
});

test('laeuft nicht: abgesagt, Entwurf, Vorschlag, abgelehnt, Datum offen', () => {
    const zeit = '2026-10-24 19:00:00';
    for (const status of ['cancelled', 'draft', 'proposed', 'rejected']) {
        assert.equal(k.laeuft(anlass('x', '2026-10-24 18:00', null, { status }), zeit), false, status);
    }
    assert.equal(k.laeuft(anlass('x', '2026-10-24 18:00', null, { datum_offen: true }), zeit), false);
    for (const status of [null, 'planned', 'confirmed', 'completed']) {
        assert.equal(k.laeuft(anlass('x', '2026-10-24 18:00', null, { status }), zeit), true, String(status));
    }
});

test('aktuellerAnlass: bei mehreren der zuletzt begonnene, sonst null', () => {
    const aufbau = anlass('aufbau', '2026-10-24 08:00', '2026-10-24 17:30');
    const chilbi = anlass('chilbi', '2026-10-24 18:00', '2026-10-25 02:00');
    assert.equal(k.aktuellerAnlass([chilbi, aufbau], '2026-10-24 19:00:00').id, 'chilbi');
    assert.equal(k.aktuellerAnlass([chilbi, aufbau], '2026-10-24 12:00:00').id, 'aufbau');
    assert.equal(k.aktuellerAnlass([chilbi, aufbau], '2026-10-25 09:00:00'), null);
    assert.equal(k.aktuellerAnlass([], '2026-10-24 19:00:00'), null);
});

test('kommendeAnlaesse: laufende und kommende, aelteste zuerst', () => {
    const liste = k.kommendeAnlaesse([
        anlass('gv', '2026-11-20 19:00', null),
        anlass('vorbei', '2026-10-20 18:00', null),
        anlass('chilbi', '2026-10-24 18:00', '2026-10-25 02:00'),
        anlass('abgesagt', '2026-10-30 18:00', null, { status: 'cancelled' })
    ], '2026-10-24 19:00:00');
    assert.deepEqual(liste.map(a => a.id), ['chilbi', 'gv']);
});

test('bildPruefen: Typ aus dem Inhalt, data:-Adresse, Grenzen', () => {
    const ok = k.bildPruefen({ data: PNG_B64, content_type: 'image/jpeg' });
    assert.equal(ok.contentType, 'image/png', 'Inhalt zaehlt, nicht die Angabe');
    assert.equal(k.bildPruefen({ data: `data:image/png;base64,${PNG_B64}` }).contentType, 'image/png');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
    assert.equal(k.bildPruefen({ data: svg, content_type: 'image/svg+xml' }).status, 400);
    assert.equal(k.bildPruefen({}).status, 400);
    const gross = Buffer.alloc(k.MAX_BILD_BYTES + 1, 0);
    gross[0] = 0x89; gross[1] = 0x50; gross[2] = 0x4e; gross[3] = 0x47;
    assert.equal(k.bildPruefen({ data: gross.toString('base64') }).status, 413);
});

test('hatService: Bereich "Service" oder das Wort Service im Namen', () => {
    assert.equal(k.hatService([{ bereich: 'Bar', name: 'Bar Abend' }, { bereich: ' service ', name: 'Schicht 1' }]), true);
    assert.equal(k.hatService([{ bereich: 'SERVICE', name: null }]), true);
    assert.equal(k.hatService([{ bereich: 'Allgemein', name: 'Service Abend' }]), true);
    assert.equal(k.hatService([{ bereich: 'Allgemein', name: '  service  ' }]), true);
    assert.equal(k.hatService([{ bereich: 'Allgemein', name: 'Service-Team 2' }]), true);
    assert.equal(k.hatService([{ bereich: 'Bar', name: 'Bar' }, { bereich: 'Kueche', name: 'Kueche' },
        { bereich: 'Aufbau', name: 'Aufbau' }, { bereich: 'Abbau', name: 'Abbau' }]), false);
    assert.equal(k.hatService([{ bereich: 'Allgemein', name: 'Servicewagen putzen' }]), false, 'nur das ganze Wort');
    assert.equal(k.hatService([]), false);
    assert.equal(k.hatService(null), false);
    assert.equal(k.hatService(undefined), false);
});

test('kassenAnsicht: hat_service aus den Schichten, ohne Schichten false', () => {
    assert.equal(k.kassenAnsicht(anlass('c', '2026-10-24 18:00', null, { schichten: [{ bereich: 'Service', name: 'S' }] })).hat_service, true);
    assert.equal(k.kassenAnsicht(anlass('c', '2026-10-24 18:00', null, { schichten: [{ bereich: 'Bar', name: 'B' }] })).hat_service, false);
    assert.equal(k.kassenAnsicht(anlass('c', '2026-10-24 18:00', null)).hat_service, false);
    assert.equal(k.kassenAnsicht(anlass('c', '2026-10-24 18:00', null, { slug: 'chilbi-2026' })).slug, 'chilbi-2026');
    assert.equal(k.kassenAnsicht(anlass('c', '2026-10-24 18:00', null)).slug, null);
    assert.ok(!('schichten' in k.kassenAnsicht(anlass('c', '2026-10-24 18:00', null, { schichten: [] }))), 'Schichten selbst gehen nicht an die Kasse');
});

const DB = process.env.TEST_DATABASE_URL;
const PORT = 61885;
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = 'test-geheim';
const ORDER_KEY = 'kassen-schluessel-test';
const API_KEY = 'interner-schluessel-test';
// Samstag der Chilbi, 19 Uhr Ortszeit (Sommerzeit bis 25.10.2026)
const JETZT = '2026-10-24T19:00:00+02:00';

const id = (praefix, n) => `00000000-0000-0000-0000-${praefix}${String(n).padStart(12 - praefix.length, '0')}`;
const ERIKA = id('a', 1), OTTO = id('a', 2);
const E = n => id('e', n);

async function seed(pool) {
    await pool.query(`INSERT INTO members (id, vorname, nachname, email) VALUES
        ($1, 'Erika', 'Muster', 'erika@example.ch'), ($2, 'Otto', 'Andere', 'otto@example.ch')`, [ERIKA, OTTO]);
    const ev = (n, slug, titel, start, ende, status, mehr = '') => pool.query(
        `INSERT INTO events (id, slug, title, category, start_date, end_date, status, organizer_id ${mehr ? ', datum_offen' : ''})
         VALUES ($1, $2, $3, 'Sonstiges', $4, $5, $6, $7 ${mehr ? ', true' : ''})`,
        [E(n), slug, titel, start, ende, status, ERIKA]);
    await ev(1, 'chilbi', 'Chilbi 2026', '2026-10-24 18:00', '2026-10-25 02:00', 'planned');
    await ev(2, 'aufbau', 'Aufbau Chilbi', '2026-10-24 08:00', '2026-10-24 17:30', 'confirmed');
    await ev(3, 'abgesagt', 'Abgesagt', '2026-10-24 18:30', null, 'cancelled');
    await ev(4, 'entwurf', 'Entwurf', '2026-10-24 18:45', null, 'draft');
    await ev(5, 'offen', 'Datum offen', '2026-10-24 18:50', null, 'planned', 'offen');
    await ev(6, 'gv', 'GV 2026', '2026-11-20 19:00', null, 'planned');
    await ev(7, 'vorbei', 'Vorbei', '2026-10-20 18:00', null, 'planned');
    // Chilbi mit Service (Bereich), GV mit Service nur im Namen, Aufbau ohne.
    const schicht = (n, name, bereich) => pool.query(
        `INSERT INTO shifts (event_id, name, date, bereich) VALUES ($1, $2, '2026-10-24', $3)`, [E(n), name, bereich]);
    await schicht(1, 'Bar Abend', 'Bar');
    await schicht(1, 'Tische bedienen', 'Service');
    await schicht(2, 'Aufbau Zelt', 'Aufbau');
    await schicht(6, 'Service GV', 'Allgemein');
}

test('Kasse und TWINT-QR gegen den echten Server', { skip: !DB && 'TEST_DATABASE_URL nicht gesetzt' }, async (t) => {
    const { Pool } = require('pg');
    const jwt = require('jsonwebtoken');
    const { schemaAufbauen } = require('./datenbank');
    const pool = new Pool({ connectionString: DB });
    await schemaAufbauen(pool);
    await seed(pool);

    const server = spawn('node', [path.join(__dirname, '..', 'src', 'index.js')], {
        env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: SECRET, TEST_JETZT: JETZT,
               ORDER_API_KEY: ORDER_KEY, API_KEY, DISPATCH_API_URL: 'http://127.0.0.1:9',
               MEMBERS_API_URL: 'http://127.0.0.1:9', INTERNAL_API_KEY: '', ARBEITSPLAN_REMINDER_ENABLED: 'false' },
        stdio: 'ignore'
    });
    t.after(async () => { server.kill(); await pool.end(); });
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
    const anfrage = async (methode, pfad, { wer, kopf = {}, body } = {}) => {
        const r = await fetch(BASE + pfad, {
            method: methode,
            headers: { 'Content-Type': 'application/json', ...(wer ? { Authorization: `Bearer ${token[wer]}` } : {}), ...kopf },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const text = await r.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) { /* kein JSON */ }
        return { status: r.status, json };
    };
    const kasse = pfad => anfrage('GET', pfad, { kopf: { 'X-Order-API-Key': ORDER_KEY } });

    await t.test('Kassen-Routen nur mit Schluessel', async () => {
        assert.equal((await anfrage('GET', '/events/kasse/aktuell')).status, 401);
        assert.equal((await anfrage('GET', '/events/kasse/aktuell', { kopf: { 'X-Order-API-Key': 'falsch' } })).status, 401);
        assert.equal((await anfrage('GET', '/events/kasse/aktuell', { wer: 'vorstand' })).status, 401, 'Benutzer-Token reicht nicht');
        assert.equal((await anfrage('GET', '/events/kasse/aktuell', { kopf: { 'x-api-key': API_KEY } })).status, 200);
        assert.equal((await anfrage('GET', '/events/kasse/anlaesse')).status, 401);
    });

    await t.test('aktueller Anlass: die Chilbi (zuletzt begonnen), noch ohne eigenen QR', async () => {
        const r = await kasse('/events/kasse/aktuell');
        assert.equal(r.status, 200);
        assert.equal(r.json.zeitpunkt, '2026-10-24 19:00:00');
        assert.deepEqual(r.json.anlass, {
            id: E(1), title: 'Chilbi 2026', start_date: '2026-10-24 18:00:00', end_date: '2026-10-25 02:00:00',
            location: null, status: 'planned', twint_qr_url: null, hat_service: true, slug: 'chilbi'
        });
    });

    await t.test('Liste: laufende und kommende ohne Ausschluesse', async () => {
        const r = await kasse('/events/kasse/anlaesse');
        assert.equal(r.status, 200);
        assert.deepEqual(r.json.anlaesse.map(a => a.title), ['Aufbau Chilbi', 'Chilbi 2026', 'GV 2026']);
        assert.deepEqual(r.json.anlaesse.map(a => a.hat_service), [false, true, true]);
        const einer = await kasse(`/events/kasse/anlaesse/${E(6)}`);
        assert.equal(einer.json.anlass.title, 'GV 2026');
        assert.equal(einer.json.anlass.hat_service, true);
        const ohne = await kasse(`/events/kasse/anlaesse/${E(7)}`);
        assert.equal(ohne.json.anlass.hat_service, false, 'Anlass ohne Schichten');
        assert.equal((await kasse(`/events/kasse/anlaesse/${E(99)}`)).status, 404);
        assert.equal((await kasse('/events/kasse/anlaesse/kein-uuid')).status, 404);
    });

    await t.test('Hochladen: Organisatorin ja, anderes Mitglied nein, SVG nein', async () => {
        assert.equal((await anfrage('PUT', `/events/${E(1)}/twint-qr`, { body: { data: PNG_B64 } })).status, 401);
        assert.equal((await anfrage('PUT', `/events/${E(1)}/twint-qr`, { wer: 'otto', body: { data: PNG_B64 } })).status, 403);
        const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64');
        assert.equal((await anfrage('PUT', `/events/${E(1)}/twint-qr`, { wer: 'erika', body: { data: svg } })).status, 400);
        const r = await anfrage('PUT', `/events/${E(1)}/twint-qr`, { wer: 'erika',
            body: { data: `data:image/png;base64,${PNG_B64}` } });
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.match(r.json.twint_qr_url, new RegExp(`^/events/${E(1)}/twint-qr\\?v=\\d+$`));

        const aktuell = await kasse('/events/kasse/aktuell');
        assert.equal(aktuell.json.anlass.twint_qr_url, r.json.twint_qr_url);

        const bild = await fetch(BASE + r.json.twint_qr_url);
        assert.equal(bild.status, 200);
        assert.equal(bild.headers.get('content-type'), 'image/png');
        assert.equal(bild.headers.get('cross-origin-resource-policy'), 'cross-origin');
        assert.deepEqual(Buffer.from(await bild.arrayBuffer()), Buffer.from(PNG_B64, 'base64'));

        // Das Bild steckt nicht in den Anlass-Listen, nur die Adresse.
        const liste = await anfrage('GET', '/events', { wer: 'vorstand' });
        const chilbi = liste.json.find(e => e.id === E(1));
        assert.equal(chilbi.twint_qr_url, r.json.twint_qr_url);
        assert.ok(!('data' in chilbi));
    });

    await t.test('Externer Organisator-Login: eigener Anlass ueber my-event', async () => {
        token.extern = jwt.sign({ type: 'event-organizer', event_id: E(6), email: 'gv@fwv-raura.ch' }, SECRET);
        const r = await anfrage('PUT', '/events/my-event/twint-qr', { wer: 'extern', body: { data: PNG_B64 } });
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.match(r.json.twint_qr_url, new RegExp(`^/events/${E(6)}/twint-qr\\?v=`));
        assert.equal((await kasse(`/events/kasse/anlaesse/${E(6)}`)).json.anlass.twint_qr_url, r.json.twint_qr_url);
        // Mit dem Event-Login nicht an einen fremden Anlass
        assert.notEqual((await anfrage('PUT', `/events/${E(1)}/twint-qr`, { wer: 'extern', body: { data: PNG_B64 } })).status, 200);
        assert.equal((await anfrage('DELETE', '/events/my-event/twint-qr', { wer: 'extern' })).status, 200);
        assert.equal((await kasse(`/events/kasse/anlaesse/${E(6)}`)).json.anlass.twint_qr_url, null);
    });

    await t.test('Entfernen: Vorstand darf, danach 404 und null', async () => {
        assert.equal((await anfrage('DELETE', `/events/${E(1)}/twint-qr`, { wer: 'otto' })).status, 403);
        const r = await anfrage('DELETE', `/events/${E(1)}/twint-qr`, { wer: 'vorstand' });
        assert.equal(r.status, 200);
        assert.equal(r.json.twint_qr_url, null);
        assert.equal((await fetch(`${BASE}/events/${E(1)}/twint-qr`)).status, 404);
        assert.equal((await kasse('/events/kasse/aktuell')).json.anlass.twint_qr_url, null);
    });
});
