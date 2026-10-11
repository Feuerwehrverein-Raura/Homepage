// Einkauf im Organisator-Bereich: die Proxy-Routen zur Inventar-API
// (abhaken, Belege, Belegbild, ins Lager zurueckbuchen).
//  - Nur Vorstand/Admin oder Organisator des Anlasses (requireEventRecipeAccess).
//  - Weiter geht es mit dem internen Key und der handelnden Person
//    (x-fwv-user-email); der Beleg (multipart) wird unveraendert durchgereicht.
//  - Das Belegbild kommt nur von /api/uploads/ der Inventar-API.
//
// Startet src/index.js gegen die Test-Datenbank (TEST_DATABASE_URL, Schema
// frisch; ACHTUNG: leert sie) und eine nachgebaute Inventar-API, die jede
// Anfrage mitschreibt.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DB = process.env.TEST_DATABASE_URL;
const PORT = 55877;
const INVENTAR_PORT = 55878;
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = 'test-geheim';
const KEY = 'interner-test-key';
const JETZT = '2026-10-11T10:00:00+02:00';
const ANLASS = '00000000-0000-0000-0000-e00000000001';
const BILD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

test('Einkauf ueber den Inventar-Proxy', { skip: !DB && 'TEST_DATABASE_URL nicht gesetzt' }, async (t) => {
    const { Pool } = require('pg');
    const jwt = require('jsonwebtoken');
    const { schemaAufbauen } = require('./datenbank');
    const pool = new Pool({ connectionString: DB });
    await schemaAufbauen(pool);
    await pool.query(`INSERT INTO members (id, vorname, nachname, email) VALUES
        ('00000000-0000-0000-0000-a00000000001', 'Erika', 'Muster', 'erika@example.ch'),
        ('00000000-0000-0000-0000-a00000000002', 'Hans', 'Helfer', 'hans@example.ch')`);
    await pool.query(
        `INSERT INTO events (id, slug, title, category, start_date, status, organizer_email)
         VALUES ($1, 'chilbi', 'Chilbi', 'Dorffest', '2026-10-24 18:00', 'planned', 'erika@example.ch')`,
        [ANLASS]);

    // Nachgebaute Inventar-API
    const anfragen = [];
    const inventar = http.createServer((req, res) => {
        const teile = [];
        req.on('data', (c) => teile.push(c));
        req.on('end', () => {
            const body = Buffer.concat(teile);
            anfragen.push({ methode: req.method, url: req.url, kopf: req.headers, body });
            const json = (status, daten) => {
                res.statusCode = status;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(daten));
            };
            const route = `${req.method} ${req.url}`;
            switch (route) {
                case 'GET /api/events/chilbi/receipts':
                    return json(200, [
                        { id: 7, image_url: '/api/uploads/item-abc.jpg', amount: '42.50', paid_by: 'erika@example.ch', note: null, uploaded_by: 'erika@example.ch', created_at: '2026-10-10T08:00:00.000Z' },
                        { id: 8, image_url: 'http://169.254.169.254/latest', amount: null, paid_by: null, note: null, uploaded_by: null, created_at: '2026-10-09T08:00:00.000Z' }
                    ]);
                case 'GET /api/uploads/item-abc.jpg':
                    res.setHeader('Content-Type', 'image/jpeg');
                    return res.end(BILD);
                case 'POST /api/events/chilbi/receipts':
                    return json(201, { id: 9, event_slug: 'chilbi', image_url: '/api/uploads/item-neu.jpg', amount: null, paid_by: 'erika@example.ch', note: null, uploaded_by: 'erika@example.ch', created_at: '2026-10-11T08:00:00.000Z' });
                case 'DELETE /api/events/chilbi/receipts/7':
                    return json(200, { success: true });
                case 'DELETE /api/events/chilbi/receipts/99':
                    return json(404, { error: 'Beleg nicht gefunden' });
                case 'PATCH /api/events/chilbi/shopping-list/3':
                    return json(200, { item_id: 3, ...JSON.parse(body.toString() || '{}'), purchased_by: req.headers['x-fwv-user-email'] || null });
                case 'POST /api/events/chilbi/shopping-list/restock':
                    return json(200, { restocked: 1, items: [{ item_id: 3, name: 'Servietten', quantity: 4 }] });
                default:
                    return json(404, { error: `unbekannt: ${route}` });
            }
        });
    });
    await new Promise((r) => inventar.listen(INVENTAR_PORT, '127.0.0.1', r));

    const server = spawn('node', [path.join(__dirname, '..', 'src', 'index.js')], {
        env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: SECRET, TEST_JETZT: JETZT,
               INVENTORY_URL: `http://127.0.0.1:${INVENTAR_PORT}`, INVENTORY_KEY: KEY,
               DISPATCH_API_URL: 'http://127.0.0.1:9', MEMBERS_API_URL: 'http://127.0.0.1:9',
               ARBEITSPLAN_REMINDER_ENABLED: 'false' },
        stdio: 'ignore'
    });
    t.after(async () => { server.kill(); inventar.close(); await pool.end(); });
    for (let i = 0; i < 50; i++) {
        try { if ((await fetch(`${BASE}/health`)).ok) break; } catch (_) { /* startet noch */ }
        await new Promise(r => setTimeout(r, 200));
    }

    const erika = jwt.sign({ type: 'member', sub: '00000000-0000-0000-0000-a00000000001', email: 'erika@example.ch' }, SECRET);
    const hans = jwt.sign({ type: 'member', sub: '00000000-0000-0000-0000-a00000000002', email: 'hans@example.ch' }, SECRET);
    const vorstand = jwt.sign({ type: 'vorstand', email: 'praesident@fwv-raura.ch', role: 'praesident' }, SECRET);
    const aufruf = async (methode, pfad, token, body) => {
        const r = await fetch(BASE + pfad, {
            method: methode,
            headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            body: body ? JSON.stringify(body) : undefined
        });
        return { status: r.status, json: await r.json() };
    };
    const letzte = () => anfragen[anfragen.length - 1];

    await t.test('nur Organisator oder Vorstand', async () => {
        anfragen.length = 0;
        for (const [m, p] of [['GET', '/events/chilbi/receipts'], ['POST', '/events/chilbi/shopping-list/restock'],
            ['PATCH', '/events/chilbi/shopping-list/3'], ['DELETE', '/events/chilbi/receipts/7'],
            ['GET', '/events/chilbi/receipts/7/image']]) {
            const r = await aufruf(m, p, hans, m === 'PATCH' ? { purchased: true } : undefined);
            assert.equal(r.status, 403, `${m} ${p}`);
        }
        const ohne = await fetch(`${BASE}/events/chilbi/receipts`);
        assert.equal(ohne.status, 401);
        assert.equal(anfragen.length, 0, 'Inventar nie gefragt');
        const v = await aufruf('GET', '/events/chilbi/receipts', vorstand);
        assert.equal(v.status, 200);
    });

    await t.test('Belege: Liste per UUID oder Slug, mit Key und Person', async () => {
        anfragen.length = 0;
        const r = await aufruf('GET', `/events/${ANLASS}/receipts`, erika);
        assert.equal(r.status, 200);
        assert.equal(r.json[0].id, 7);
        assert.equal(letzte().url, '/api/events/chilbi/receipts', 'Slug statt UUID');
        assert.equal(letzte().kopf['x-order-api-key'], KEY);
        assert.equal(letzte().kopf['x-fwv-user-email'], 'erika@example.ch');
    });

    await t.test('Beleg hochladen: multipart wird durchgereicht', async () => {
        anfragen.length = 0;
        const form = new FormData();
        form.append('image', new Blob([BILD], { type: 'image/jpeg' }), 'beleg.jpg');
        form.append('note', 'Volg');
        const r = await fetch(`${BASE}/events/chilbi/receipts`, {
            method: 'POST', headers: { Authorization: `Bearer ${erika}` }, body: form
        });
        assert.equal(r.status, 201);
        assert.equal((await r.json()).id, 9);
        const a = letzte();
        assert.equal(a.methode, 'POST');
        assert.match(a.kopf['content-type'], /^multipart\/form-data; boundary=/);
        assert.ok(a.body.includes(BILD), 'Bild unveraendert');
        assert.ok(a.body.includes(Buffer.from('name="image"; filename="beleg.jpg"')));
        assert.ok(a.body.includes(Buffer.from('Volg')));
        assert.equal(a.kopf['x-fwv-user-email'], 'erika@example.ch');

        const json = await aufruf('POST', '/events/chilbi/receipts', erika, { image: 'base64' });
        assert.equal(json.status, 400);
        assert.match(json.json.error, /multipart/);
    });

    await t.test('Belegbild nur aus /api/uploads/', async () => {
        const r = await fetch(`${BASE}/events/chilbi/receipts/7/image`, { headers: { Authorization: `Bearer ${erika}` } });
        assert.equal(r.status, 200);
        assert.equal(r.headers.get('content-type'), 'image/jpeg');
        assert.deepEqual(Buffer.from(await r.arrayBuffer()), BILD);
        anfragen.length = 0;
        const fremd = await aufruf('GET', '/events/chilbi/receipts/8/image', erika);
        assert.equal(fremd.status, 404);
        assert.ok(anfragen.every((a) => a.url === '/api/events/chilbi/receipts'), 'keine fremde Adresse abgerufen');
        const fehlt = await aufruf('GET', '/events/chilbi/receipts/123/image', erika);
        assert.equal(fehlt.status, 404);
    });

    await t.test('Beleg loeschen, Fehler des Inventars kommen durch', async () => {
        const ok = await aufruf('DELETE', '/events/chilbi/receipts/7', erika);
        assert.equal(ok.status, 200);
        assert.equal(letzte().methode, 'DELETE');
        const fehlt = await aufruf('DELETE', '/events/chilbi/receipts/99', erika);
        assert.equal(fehlt.status, 404);
        assert.equal(fehlt.json.error, 'Beleg nicht gefunden');
    });

    await t.test('Abhaken und ins Lager zurueckbuchen', async () => {
        const haken = await aufruf('PATCH', '/events/chilbi/shopping-list/3', erika, { purchased: true, actual_quantity: 4 });
        assert.equal(haken.status, 200);
        assert.deepEqual(JSON.parse(letzte().body.toString()), { purchased: true, actual_quantity: 4 });
        assert.equal(haken.json.purchased_by, 'erika@example.ch');
        const zurueck = await aufruf('POST', '/events/chilbi/shopping-list/restock', erika);
        assert.equal(zurueck.status, 200);
        assert.equal(zurueck.json.restocked, 1);
        assert.equal(letzte().url, '/api/events/chilbi/shopping-list/restock');
    });

    await t.test('Organisator-Uebersicht erlaubt den Einkauf', async () => {
        const r = await aufruf('GET', '/events/organisator-uebersicht', erika);
        assert.equal(r.status, 200);
        assert.equal(r.json.anlaesse[0].organisator.aktionen.einkauf, true);
    });
});
