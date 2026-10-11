// Inventar-API gegen eine echte Datenbank und ein nachgebautes Authentik:
//  - Tokens der Inventar-PWA ohne Gruppenpruefung, Tokens der Mitglieder-App
//    und -Web nur mit Gruppe Lager/Vorstand/admin (deutsche 403-Meldung).
//  - Was die Lager-Ansicht der App braucht: Lagerorte-Uebersicht, Artikel mit
//    Bestand je Kiste, Ein-/Ausbuchen mit ganzzahliger Menge.
//  - Einkauf (ueber das Events-Backend mit internem Key): Beleg hochladen,
//    Zurueckbuchen inkl. Material von Hand, handelnde Person per Kopfzeile.
//
// Startet dist/index.js (`npm test` baut vorher) gegen TEST_DATABASE_URL —
// ACHTUNG: leert das Schema public dieser Datenbank.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import jwt from 'jsonwebtoken';

const DB = process.env.TEST_DATABASE_URL;
const PORT = 55881;
const AUTH_PORT = 55882;
const BASE = `http://127.0.0.1:${PORT}/api`;
const AUTH = `http://127.0.0.1:${AUTH_PORT}`;
const KEY = 'test-interner-key';
const HIER = path.dirname(fileURLToPath(import.meta.url));
// Vertrag mit der App (flutter/fwv_lager): echte Antworten dieser API.
// Neu schreiben: FIXTURES_SCHREIBEN=1 TEST_DATABASE_URL=... npm test
const VERTRAG = path.join(HIER, '..', '..', '..', 'flutter', 'fwv_lager', 'test', 'fixtures', 'inventar-api.json');
// Zeitstempel sind je Lauf anders — im Vertrag fest.
const ZEIT = '2026-10-11T08:00:00.000Z';
function ohneZeit(wert) {
  if (Array.isArray(wert)) return wert.map(ohneZeit);
  if (wert && typeof wert === 'object') {
    return Object.fromEntries(Object.entries(wert).map(([k, v]) =>
      [k, /_at$/.test(k) && v ? ZEIT : ohneZeit(v)]));
  }
  return wert;
}

// Schluessel des nachgebauten Authentik (alle Anwendungen) und ein fremder.
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const fremd = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
const KID = 'test-kid';

function token(anwendung, claims = {}, { schluessel = privateKey, ablauf = '5m' } = {}) {
  return jwt.sign(
    { sub: 'u1', email: 'erika@example.ch', name: 'Erika', ...claims },
    schluessel,
    { algorithm: 'RS256', keyid: KID, issuer: `${AUTH}/application/o/${anwendung}/`, expiresIn: ablauf }
  );
}

test('Inventar-API', { skip: !DB && 'TEST_DATABASE_URL nicht gesetzt' }, async (t) => {
  const pool = new pg.Pool({ connectionString: DB });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');

  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };
  const jwksAbrufe = [];
  const authentik = http.createServer((req, res) => {
    const m = req.url.match(/^\/application\/o\/([^/]+)\/jwks\/$/);
    if (!m) { res.statusCode = 404; return res.end(); }
    jwksAbrufe.push(m[1]);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise((r) => authentik.listen(AUTH_PORT, '127.0.0.1', r));

  const u = new URL(DB);
  const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'inventar-test-'));
  const server = spawn('node', [path.join(HIER, '..', 'dist', 'index.js')], {
    env: {
      ...process.env, PORT: String(PORT), AUTHENTIK_URL: AUTH, ORDER_API_KEY: KEY, UPLOAD_DIR: uploads,
      DB_HOST: u.hostname, DB_PORT: u.port || '5432', DB_NAME: u.pathname.slice(1),
      DB_USER: decodeURIComponent(u.username), DB_PASSWORD: decodeURIComponent(u.password),
      LOCAL_MODE: 'false'
    },
    stdio: 'ignore'
  });
  t.after(async () => {
    server.kill();
    authentik.close();
    await pool.end();
    fs.rmSync(uploads, { recursive: true, force: true });
  });
  let bereit = false;
  for (let i = 0; i < 75 && !bereit; i++) {
    try { bereit = (await fetch(`${BASE}/health`)).ok; } catch { /* startet noch */ }
    if (!bereit) await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(bereit, 'Server gestartet');

  // Testdaten
  const q = (sql, p) => pool.query(sql, p);
  await q(`INSERT INTO categories (id, name) VALUES (1, 'Getränke'), (2, 'Geschirr')`);
  await q(`INSERT INTO locations (id, name, description) VALUES (1, 'Keller', 'Hauptlager'), (2, 'Kiste 1', NULL)`);
  await q(`INSERT INTO items (id, name, category_id, location_id, custom_barcode, ean_code, quantity, min_quantity, unit, purchase_price)
           VALUES (1, 'Mineral 1.5l', 1, 1, 'FWV000001', '7610000000001', 4, 10, 'Flasche', 0.80),
                  (2, 'Teller', 2, 2, 'FWV000002', NULL, 50, 20, 'Stück', NULL),
                  (3, 'Servietten', 2, 2, 'FWV000003', NULL, 0, 0, 'Pack', 2.50)`);
  await q(`SELECT setval('items_id_seq', 3)`);
  await q(`UPDATE barcode_counter SET last_number = 3`);
  await q(`INSERT INTO item_locations (item_id, location_id, quantity) VALUES (1, 1, 3), (1, 2, 1), (2, 2, 50)`);

  const aufruf = async (methode, pfad, { body, tok, kopf = {} } = {}) => {
    const r = await fetch(BASE + pfad, {
      method: methode,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
        ...kopf
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* kein JSON */ }
    return { status: r.status, json };
  };

  await t.test('Anmeldung: welche Tokens ins Lager duerfen', async () => {
    const neu = (n) => ({ name: `Test ${n}` });
    const pwa = await aufruf('POST', '/items', { body: neu(1), tok: token('inventory-system') });
    assert.equal(pwa.status, 200, 'Inventar-PWA ohne Gruppen wie bisher');

    const mitglied = await aufruf('POST', '/items', { body: neu(2), tok: token('fwv-members-app', { groups: ['Mitglieder'] }) });
    assert.equal(mitglied.status, 403);
    assert.match(mitglied.json.error, /Gruppe Lager/);

    const ohneClaim = await aufruf('POST', '/items', { body: neu(3), tok: token('fwv-members-app') });
    assert.equal(ohneClaim.status, 403);

    const lager = await aufruf('POST', '/items', { body: neu(4), tok: token('fwv-members-app', { groups: ['Mitglieder', 'lager'] }) });
    assert.equal(lager.status, 200, 'Gruppe klein geschrieben');

    const web = await aufruf('POST', '/items', { body: neu(5), tok: token('fwv-members', { groups: ['Vorstand'] }) });
    assert.equal(web.status, 200, 'Mitglieder-Web mit Vorstand');

    const fremderIssuer = await aufruf('POST', '/items', { body: neu(6), tok: token('vorstand-app', { groups: ['admin'] }) });
    assert.equal(fremderIssuer.status, 403);
    assert.equal(fremderIssuer.json.error, 'Invalid token');

    const falscheSignatur = await aufruf('POST', '/items', {
      body: neu(7), tok: token('fwv-members-app', { groups: ['Lager'] }, { schluessel: fremd })
    });
    assert.equal(falscheSignatur.status, 403);
    assert.equal(falscheSignatur.json.error, 'Invalid token');

    const abgelaufen = await aufruf('POST', '/items', {
      body: neu(8), tok: token('fwv-members-app', { groups: ['Lager'] }, { ablauf: '-1m' })
    });
    assert.equal(abgelaufen.status, 403);

    assert.ok(jwksAbrufe.includes('inventory-system'));
    assert.ok(jwksAbrufe.includes('fwv-members-app'));
    assert.ok(jwksAbrufe.includes('fwv-members'));
    assert.ok(!jwksAbrufe.includes('vorstand-app'), 'fremder Issuer: kein JWKS-Abruf');

    // Angelegte Testartikel wieder weg, damit die Zahlen unten stimmen.
    await q(`DELETE FROM transactions WHERE item_id > 3`);
    await q(`DELETE FROM items WHERE id > 3`);
  });

  const app = token('fwv-members-app', { groups: ['Lager'] });
  const vertrag = {};

  await t.test('Neuer Artikel ohne EAN bekommt einen FWV-Code', async () => {
    const naechster = await aufruf('GET', '/barcode/next', { tok: app });
    assert.equal(naechster.status, 200);
    const r = await aufruf('POST', '/items', {
      tok: app, body: { name: 'Becher', category_id: 2, location_id: 2, quantity: 30, min_quantity: 10, unit: 'Stück' }
    });
    assert.equal(r.status, 200);
    assert.match(r.json.custom_barcode, /^FWV\d{6}$/);
    vertrag.item_neu = r.json;
    vertrag.barcode_next = naechster.json;
    assert.equal(r.json.custom_barcode, naechster.json.next_code);
    const mitEan = await aufruf('POST', '/items', { tok: app, body: { name: 'Cola', ean_code: '5449000000996' } });
    assert.equal(mitEan.json.custom_barcode, null, 'mit EAN kein eigener Code');
  });

  await t.test('Lagerorte-Uebersicht (stand frueher hinter /:id und lieferte 500)', async () => {
    const r = await aufruf('GET', '/locations/overview');
    assert.equal(r.status, 200);
    const kiste = r.json.find((l) => l.name === 'Kiste 1');
    assert.equal(Number(kiste.item_count), 2);
    assert.equal(Number(kiste.total_quantity), 51);
    const inhalt = await aufruf('GET', '/locations/2');
    assert.equal(inhalt.status, 200);
    assert.deepEqual(inhalt.json.contents.map((c) => c.name).sort(), ['Mineral 1.5l', 'Teller']);
  });

  await t.test('Artikel mit Bestand je Lagerort', async () => {
    const r = await aufruf('GET', '/items/1');
    assert.equal(r.status, 200);
    assert.equal(r.json.location_name, 'Keller');
    assert.deepEqual(
      r.json.locations.map((l) => [l.location_name, l.quantity]),
      [['Keller', 3], ['Kiste 1', 1]]
    );
    const s = await aufruf('GET', '/items/barcode/7610000000001');
    assert.equal(s.json.id, 1);
  });

  await t.test('Ein- und Ausbuchen', async () => {
    const ein = await aufruf('POST', '/items/1/stock', { tok: app, body: { type: 'in', quantity: '3', reason: 'Lieferung' } });
    assert.equal(ein.status, 200);
    assert.equal(ein.json.new_quantity, 7, 'Menge als Text wird gerechnet, nicht angehaengt');
    const zuViel = await aufruf('POST', '/items/1/stock', { tok: app, body: { type: 'out', quantity: 8 } });
    assert.equal(zuViel.status, 400);
    assert.equal(zuViel.json.error, 'Nicht genug an Lager (Bestand: 7).');
    const halb = await aufruf('POST', '/items/1/stock', { tok: app, body: { type: 'out', quantity: 1.5 } });
    assert.equal(halb.status, 400);
    const null_ = await aufruf('POST', '/items/1/stock', { tok: app, body: { type: 'in', quantity: 0 } });
    assert.equal(null_.status, 400);
    const aus = await aufruf('POST', '/items/1/stock', { tok: app, body: { type: 'out', quantity: 2, reason: 'Fest' } });
    assert.equal(aus.json.new_quantity, 5);
    // Verlauf enthaelt E-Mails: nur angemeldet (bis Oktober 2026 offen)
    assert.equal((await aufruf('GET', '/transactions?item_id=1&limit=5')).status, 401);
    const verlauf = await aufruf('GET', '/transactions?item_id=1&limit=5', { tok: app });
    assert.deepEqual(verlauf.json.map((v) => [v.type, v.quantity, v.reason, v.user_email]), [
      ['out', 2, 'Fest', 'erika@example.ch'],
      ['in', 3, 'Lieferung', 'erika@example.ch']
    ]);
    const ohne = await aufruf('POST', '/items/1/stock', { body: { type: 'in', quantity: 1 } });
    assert.equal(ohne.status, 401);
  });

  await t.test('Nachbestellen: Bestand auf oder unter Mindestbestand', async () => {
    for (const bericht of ['/reports/low-stock', '/reports/inventory-value', '/reports/sales']) {
      assert.equal((await aufruf('GET', bericht)).status, 401, `${bericht} nur angemeldet`);
    }
    const r = await aufruf('GET', '/reports/low-stock', { tok: app });
    assert.ok(r.json.some((i) => i.name === 'Mineral 1.5l'));
    assert.ok(!r.json.some((i) => i.name === 'Teller'));
  });

  await t.test('Einkauf: Beleg und Zurueckbuchen ueber den internen Key', async () => {
    const intern = { 'x-order-api-key': KEY, 'x-fwv-user-email': 'org@example.ch' };
    await q(`INSERT INTO recipes (id, name) VALUES (1, 'Apéro')`);
    await q(`INSERT INTO recipe_ingredients (recipe_id, item_id, quantity) VALUES (1, 1, 1)`);
    await q(`INSERT INTO event_recipes (event_slug, recipe_id, servings) VALUES ('chilbi', 1, 12)`);
    await q(`INSERT INTO event_manual_items (event_slug, item_id, quantity) VALUES ('chilbi', 3, 4)`);

    // Abhaken (wie der Proxy: PATCH mit Key und Person)
    for (const [id, body] of [[1, { purchased: true }], [3, { purchased: true, actual_quantity: 2.5 }]]) {
      const r = await aufruf('PATCH', `/events/chilbi/shopping-list/${id}`, { body, kopf: intern });
      assert.equal(r.status, 200);
      assert.equal(r.json.purchased_by, 'org@example.ch');
    }

    const form = new FormData();
    form.append('image', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), 'beleg.jpg');
    const hoch = await fetch(`${BASE}/events/chilbi/receipts`, { method: 'POST', headers: intern, body: form });
    assert.equal(hoch.status, 201);
    const beleg = await hoch.json();
    assert.equal(beleg.uploaded_by, 'org@example.ch');
    assert.match(beleg.image_url, /^\/api\/uploads\/item-.+\.jpg$/);
    const bild = await fetch(`http://127.0.0.1:${PORT}${beleg.image_url}`);
    assert.equal(bild.status, 200);

    const zurueck = await aufruf('POST', '/events/chilbi/shopping-list/restock', { kopf: intern });
    assert.equal(zurueck.status, 200);
    // Mineral: Bedarf 12 - Bestand 5 = 7; Servietten (von Hand): Ist 2.5 -> 3
    assert.deepEqual(
      zurueck.json.items.map((i) => [i.name, i.quantity]).sort(),
      [['Mineral 1.5l', 7], ['Servietten', 3]]
    );
    const nochmal = await aufruf('POST', '/events/chilbi/shopping-list/restock', { kopf: intern });
    assert.equal(nochmal.json.restocked, 0, 'nichts doppelt');
    const t1 = await pool.query(`SELECT user_email, reason FROM transactions WHERE item_id = 3`);
    assert.deepEqual(t1.rows, [{ user_email: 'org@example.ch', reason: 'Einkauf eingebucht: chilbi' }]);

    const weg = await aufruf('DELETE', `/events/chilbi/receipts/${beleg.id}`, { kopf: intern });
    assert.equal(weg.status, 200);
    const ohneKey = await aufruf('GET', '/events/chilbi/receipts', { kopf: { 'x-fwv-user-email': 'x@example.ch' } });
    assert.equal(ohneKey.status, 401, 'Kopfzeile allein reicht nicht');
  });

  await t.test('Vertrag mit der App: test/fixtures/inventar-api.json in fwv_lager', async () => {
    const get = async (pfad) => {
      const r = await aufruf('GET', pfad, { tok: app });
      assert.equal(r.status, 200, pfad);
      return r.json;
    };
    // Mineral unter den Mindestbestand (10) bringen: steht dann in low_stock.
    const buchung = await aufruf('POST', '/items/1/stock', { tok: app, body: { type: 'out', quantity: 4, reason: 'Apéro Vorstand' } });
    assert.equal(buchung.status, 200);
    vertrag.stock = buchung.json;
    vertrag.items = await get('/items');
    vertrag.item = await get('/items/1');
    vertrag.transactions = await get('/transactions?item_id=1&limit=10');
    vertrag.locations_overview = await get('/locations/overview');
    vertrag.location = await get('/locations/2');
    vertrag.low_stock = await get('/reports/low-stock');
    vertrag.categories = await get('/categories');
    vertrag.lookup_lokal = await get('/barcode/lookup/FWV000002');
    const zuordnen = await aufruf('PATCH', '/items/2/barcode', { tok: app, body: { ean_code: '7611111111111' } });
    assert.equal(zuordnen.status, 200);
    vertrag.barcode_zuordnen = zuordnen.json;
    const doppelt = await aufruf('PATCH', '/items/3/barcode', { tok: app, body: { ean_code: '7611111111111' } });
    assert.equal(doppelt.status, 409);
    vertrag.barcode_zuordnen_doppelt = doppelt.json;

    const echt = ohneZeit(vertrag);
    const bisher = fs.existsSync(VERTRAG) ? JSON.parse(fs.readFileSync(VERTRAG, 'utf8')) : {};
    // Von Hand (brauchen Internet: Open Food Facts, OpenGTINDB) — nur die
    // Form steht in src/index.ts, deshalb hier nicht verglichen.
    const vonHand = { lookup_extern: bisher.lookup_extern, lookup_unbekannt: bisher.lookup_unbekannt };
    if (process.env.FIXTURES_SCHREIBEN) {
      fs.mkdirSync(path.dirname(VERTRAG), { recursive: true });
      fs.writeFileSync(VERTRAG, JSON.stringify({
        _hinweis: 'Antworten der Inventar-API (simple-inventory-system/backend/test/api.test.mjs). lookup_extern und lookup_unbekannt von Hand.',
        ...echt, ...vonHand
      }, null, 2) + '\n');
      return;
    }
    for (const [k, v] of Object.entries(echt)) {
      assert.deepEqual(bisher[k], v, `${k} weicht vom Vertrag ab — gewollt? FIXTURES_SCHREIBEN=1 und fwv_lager anpassen`);
    }
  });
});
