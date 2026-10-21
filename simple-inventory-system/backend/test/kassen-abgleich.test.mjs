// Lagerbuchung der Kasse (PUT /api/kasse/bestellungen/:id) gegen eine echte
// Datenbank:
//  - Soll-Stand je Bestellung, gebucht wird nur die Differenz
//  - dieselbe Meldung zweimal bucht nichts, Storno bucht zurueck
//  - Rezepte (negative id) buchen Zutaten, Bruchteile aufgerundet
//  - unbekannter Artikel: Rest wird trotzdem gebucht; Bestand darf unter 0
//  - parallele Meldungen verlieren keine Buchung
//  - alte Buchungen (POST /items/sell, Nummer nur im Grund) zaehlen mit
//
// Startet dist/index.js (`npm test` baut vorher) gegen TEST_DATABASE_URL —
// ACHTUNG: leert das Schema public dieser Datenbank.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const DB = process.env.TEST_DATABASE_URL;
const PORT = 62001;
const BASE = `http://127.0.0.1:${PORT}/api`;
const KEY = 'test-interner-key';
const HIER = path.dirname(fileURLToPath(import.meta.url));

test('Kassen-Abgleich', { skip: !DB && 'TEST_DATABASE_URL nicht gesetzt' }, async (t) => {
  const pool = new pg.Pool({ connectionString: DB });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  // Buchungen aus der Zeit vor transactions.order_id (alte Kasse)
  await pool.query(`CREATE TABLE transactions (id SERIAL PRIMARY KEY, item_id INTEGER, type VARCHAR(20) NOT NULL,
    quantity INTEGER NOT NULL, previous_quantity INTEGER, new_quantity INTEGER, reason TEXT, user_email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query(`INSERT INTO transactions (item_id, type, quantity, reason)
    VALUES (1, 'out', 2, 'Verkauf - Bestellung #500 (kasse)'), (1, 'in', 1, 'Rueckbuchung Testbestellungen L-1/L-2')`);

  const u = new URL(DB);
  const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'inventar-test-'));
  const server = spawn('node', [path.join(HIER, '..', 'dist', 'index.js')], {
    env: {
      ...process.env, PORT: String(PORT), AUTHENTIK_URL: 'http://127.0.0.1:9', ORDER_API_KEY: KEY, UPLOAD_DIR: uploads,
      DB_HOST: u.hostname, DB_PORT: u.port || '5432', DB_NAME: u.pathname.slice(1),
      DB_USER: decodeURIComponent(u.username), DB_PASSWORD: decodeURIComponent(u.password),
      LOCAL_MODE: 'false'
    },
    stdio: 'ignore'
  });
  t.after(async () => {
    server.kill();
    await pool.end();
    fs.rmSync(uploads, { recursive: true, force: true });
  });
  let bereit = false;
  for (let i = 0; i < 75 && !bereit; i++) {
    try { bereit = (await fetch(`${BASE}/health`)).ok; } catch { /* startet noch */ }
    if (!bereit) await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(bereit, 'Server gestartet');

  const q = (sql, p) => pool.query(sql, p);
  await q(`INSERT INTO items (id, name, quantity, unit, sellable) VALUES
    (1, 'Bier', 100, 'Stück', true), (2, 'Cola', 50, 'Stück', true),
    (3, 'Hackfleisch', 10, 'kg', false), (4, 'Tortilla', 200, 'Stück', false)`);
  await q(`INSERT INTO recipes (id, name, sellable, sale_price) VALUES (7, 'Taco', true, 5)`);
  await q(`INSERT INTO recipe_ingredients (recipe_id, item_id, quantity) VALUES (7, 3, 0.15), (7, 4, 2)`);

  const melden = async (id, positionen, key = KEY) => {
    const r = await fetch(`${BASE}/kasse/bestellungen/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-order-api-key': key },
      body: JSON.stringify({ positionen })
    });
    return { status: r.status, json: await r.json() };
  };
  const bestand = async (id) => (await q('SELECT quantity FROM items WHERE id = $1', [id])).rows[0].quantity;

  await t.test('alte Buchungen bekommen ihre Bestellnummer', async () => {
    const r = await q('SELECT order_id FROM transactions ORDER BY id');
    assert.deepEqual(r.rows.map((z) => z.order_id), [500, null]);
  });

  await t.test('ohne Key oder mit falschen Positionen abgelehnt', async () => {
    assert.equal((await melden(1, [], 'falsch')).status, 401);
    assert.equal((await melden(1, [{ id: 1, menge: -1 }])).status, 400);
    assert.equal((await melden(1, [{ id: 1, menge: 1.5 }])).status, 400);
    assert.equal((await melden(1, 'x')).status, 400);
  });

  await t.test('Verkauf, Wiederholung, Nachbestellung, Storno', async () => {
    let r = await melden(1, [{ id: 1, menge: 3 }, { id: 2, menge: 1 }]);
    assert.equal(r.status, 200);
    assert.equal(await bestand(1), 97);
    assert.equal(await bestand(2), 49);

    r = await melden(1, [{ id: 1, menge: 3 }, { id: 2, menge: 1 }]);
    assert.deepEqual(r.json.gebucht, [], 'dieselbe Meldung bucht nichts');
    assert.equal(await bestand(1), 97);

    await melden(1, [{ id: 1, menge: 3 }, { id: 2, menge: 1 }, { id: 1, menge: 2 }]);
    assert.equal(await bestand(1), 95, 'gleicher Artikel in zwei Positionen');

    r = await melden(1, [{ id: 1, menge: 5 }]);
    assert.equal(await bestand(2), 50, 'Cola storniert');
    const storno = await q(`SELECT type, quantity, previous_quantity, new_quantity, reason, order_id
      FROM transactions WHERE item_id = 2 ORDER BY id DESC LIMIT 1`);
    assert.deepEqual(storno.rows[0], { type: 'in', quantity: 1, previous_quantity: 49, new_quantity: 50,
      reason: 'Storno - Bestellung #1 (kasse)', order_id: 1 });

    await melden(1, []);
    assert.equal(await bestand(1), 100, 'ganze Bestellung storniert');
  });

  await t.test('alte Buchung derselben Bestellung zaehlt mit', async () => {
    await melden(500, [{ id: 1, menge: 2 }]);
    assert.equal(await bestand(1), 100, 'schon von POST /items/sell gebucht');
  });

  await t.test('Rezept: Zutaten, Bruchteile aufgerundet', async () => {
    await melden(2, [{ id: -7, menge: 3 }]);
    assert.equal(await bestand(3), 9, '3 x 0.15 kg = 0.45 -> 1');
    assert.equal(await bestand(4), 194);
    await melden(2, [{ id: 7, art: 'rezept', menge: 10 }]);
    assert.equal(await bestand(3), 8, '1.5 -> 2');
    assert.equal(await bestand(4), 180);
  });

  await t.test('unbekannter Artikel: Rest gebucht; Bestand darf unter 0', async () => {
    const r = await melden(3, [{ id: 999, menge: 1 }, { id: -998, menge: 1 }, { id: 2, menge: 60 }]);
    assert.equal(r.status, 200);
    assert.equal(await bestand(2), -10);
    assert.deepEqual(r.json.warnungen, ['Artikel 999 unbekannt', 'Rezept 998 unbekannt', 'Cola: Bestand -10']);
    await melden(3, []);
    assert.equal(await bestand(2), 50);
  });

  await t.test('parallele Meldungen verlieren nichts', async () => {
    const vorher = await bestand(1);
    await Promise.all(Array.from({ length: 20 }, (_, i) => melden(100 + i, [{ id: 1, menge: 1 }])));
    // dieselbe Bestellung mehrfach gleichzeitig: nur einmal
    await Promise.all(Array.from({ length: 5 }, () => melden(200, [{ id: 1, menge: 4 }])));
    assert.equal(await bestand(1), vorher - 24);
  });
});
