// Ausleihe gegen eine echte Datenbank, ein nachgebautes Authentik und einen
// nachgebauten Versand (api-dispatch /email/send, api-members Push) — es
// geht nichts ins Netz:
//  - Rechte: jedes Mitglied leiht fuer sich aus, Lager verwaltet
//  - Verfuegbarkeit inkl. Reservierungen und Kisten, 409 bei Ueberbuchung
//  - Ausgeben/Zuruecknehmen bucht im Lager, Schaeden und Fehlendes
//  - Benachrichtigungen beim Anlegen, Erinnerungen (ein Lauf)
//  - Vertrag mit der App: flutter/fwv_lager/test/fixtures/ausleihe-api.json
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
import { heuteZuerich, tageDazu } from '../dist/ausleihe.js';

const DB = process.env.TEST_DATABASE_URL;
const PORT = 61991;
const AUTH_PORT = 61992;
const DIENSTE_PORT = 61993;
const BASE = `http://127.0.0.1:${PORT}/api`;
const AUTH = `http://127.0.0.1:${AUTH_PORT}`;
const KEY = 'test-interner-key';
const HIER = path.dirname(fileURLToPath(import.meta.url));
// Neu schreiben: FIXTURES_SCHREIBEN=1 TEST_DATABASE_URL=... npm test
const VERTRAG = path.join(HIER, '..', '..', '..', 'flutter', 'fwv_lager', 'test', 'fixtures', 'ausleihe-api.json');

const heute = heuteZuerich();
const tag = (n) => tageDazu(heute, n);

// Im Vertrag ist "heute" immer der 11.10.2026 — Daten und Texte werden
// umgerechnet, Zeitstempel und Dateinamen festgesetzt.
const VERTRAG_HEUTE = '2026-10-11';
function festschreiben(wert) {
  let text = JSON.stringify(wert);
  const ch = (d) => d.split('-').reverse().join('.');
  // Erst Platzhalter, dann einsetzen — sonst koennte ein eingesetztes
  // Datum nochmals ersetzt werden.
  for (let n = -10; n <= 10; n++) {
    text = text.split(tag(n)).join(`§iso${n}§`).split(ch(tag(n))).join(`§ch${n}§`);
  }
  text = text.replace(/§(iso|ch)(-?\d+)§/g, (_, art, n) => {
    const fest = tageDazu(VERTRAG_HEUTE, Number(n));
    return art === 'iso' ? fest : ch(fest);
  });
  text = text.replace(/\/api\/uploads\/item-[0-9a-f-]+\.jpg/g, '/api/uploads/item-foto.jpg');
  const ohneZeit = (w) => {
    if (Array.isArray(w)) return w.map(ohneZeit);
    if (w && typeof w === 'object') {
      return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, /_at$/.test(k) && v ? '2026-10-11T08:00:00.000Z' : ohneZeit(v)]));
    }
    return w;
  };
  return ohneZeit(JSON.parse(text));
}

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-kid';
// Mitglieder-Tokens von api-members (QR-Code usw.): HS256, Schluessel nur
// beim nachgebauten api-members, das sie ueber /auth/member/pruefen prueft.
const MEMBERS_SECRET = 'members-geheim';
const mitgliedToken = (claims) => jwt.sign({ type: 'member', ...claims }, MEMBERS_SECRET, { expiresIn: '8h' });

function token(claims) {
  return jwt.sign(claims, privateKey, {
    algorithm: 'RS256', keyid: KID, issuer: `${AUTH}/application/o/fwv-members-app/`, expiresIn: '10m'
  });
}

test('Ausleihe', { skip: !DB && 'TEST_DATABASE_URL nicht gesetzt' }, async (t) => {
  const pool = new pg.Pool({ connectionString: DB });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');

  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };
  const authentik = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise((r) => authentik.listen(AUTH_PORT, '127.0.0.1', r));

  // Nachgebauter Versand: api-dispatch und api-members in einem.
  const mails = [];
  const pushes = [];
  const dienste = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/email/send' && req.method === 'POST') {
        assert.equal(req.headers['x-api-key'], 'dispatch-key');
        mails.push(JSON.parse(body));
        return res.end('{"success":true}');
      }
      if (req.url.startsWith('/internal/member-id-by-email')) {
        assert.equal(req.headers['x-internal-key'], 'intern-key');
        const email = new URL(req.url, 'http://x').searchParams.get('email');
        return res.end(JSON.stringify({ memberId: email === 'erika@example.ch' ? 42 : null }));
      }
      if (req.url === '/auth/member/pruefen') {
        let d = null;
        try { d = jwt.verify((req.headers.authorization || '').replace(/^Bearer /, ''), MEMBERS_SECRET); } catch { /* ungueltig */ }
        if (!d || d.type !== 'member') { res.statusCode = 401; return res.end('{"valid":false}'); }
        return res.end(JSON.stringify({ valid: true, member_id: d.sub, email: d.email, name: d.name, groups: d.groups || [], exp: d.exp }));
      }
      if (req.url === '/internal/push-to-member') {
        pushes.push(JSON.parse(body));
        return res.end('{"success":true}');
      }
      res.statusCode = 404;
      res.end('{}');
    });
  });
  await new Promise((r) => dienste.listen(DIENSTE_PORT, '127.0.0.1', r));

  const u = new URL(DB);
  const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'ausleihe-test-'));
  const server = spawn('node', [path.join(HIER, '..', 'dist', 'index.js')], {
    env: {
      ...process.env, PORT: String(PORT), AUTHENTIK_URL: AUTH, ORDER_API_KEY: KEY, UPLOAD_DIR: uploads,
      DB_HOST: u.hostname, DB_PORT: u.port || '5432', DB_NAME: u.pathname.slice(1),
      DB_USER: decodeURIComponent(u.username), DB_PASSWORD: decodeURIComponent(u.password),
      LOCAL_MODE: 'false',
      DISPATCH_API_URL: `http://127.0.0.1:${DIENSTE_PORT}`, DISPATCH_API_KEY: 'dispatch-key',
      MEMBERS_API_URL: `http://127.0.0.1:${DIENSTE_PORT}`, INTERNAL_API_KEY: 'intern-key',
      LAGER_EMAIL: 'lager@example.ch', AUSLEIHE_ERINNERUNG_ENABLED: 'true'
    },
    stdio: 'ignore'
  });
  t.after(async () => {
    server.kill();
    authentik.close();
    dienste.close();
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
  await q(`INSERT INTO categories (id, name) VALUES (1, 'Mobiliar'), (2, 'Geschirr'), (3, 'Getränke')`);
  await q(`INSERT INTO locations (id, name, description) VALUES (1, 'Keller', NULL), (2, 'Festkiste', 'Teller und Mineral fürs Fest')`);
  await q(`INSERT INTO items (id, name, category_id, location_id, quantity, unit)
           VALUES (1, 'Festbank', 1, 1, 10, 'Stück'), (2, 'Teller', 2, 1, 50, 'Stück'), (3, 'Mineral', 3, 1, 20, 'Flasche')`);
  await q(`SELECT setval('items_id_seq', 3)`);
  await q(`INSERT INTO item_locations (item_id, location_id, quantity) VALUES (2, 2, 20), (3, 2, 6), (1, 1, 10)`);

  const erika = token({ sub: 'u1', email: 'erika@example.ch', name: 'Erika Muster', groups: ['Mitglieder'] });
  const max = token({ sub: 'u2', email: 'max@example.ch', name: 'Max Beispiel', groups: [] });
  const lager = token({ sub: 'u3', email: 'lager-person@example.ch', name: 'Lea Lager', groups: ['Lager'] });
  const qr = jwt.sign({ type: 'member', email: 'erika@example.ch' }, 'irgendwas');
  const erikaQr = mitgliedToken({ sub: 'm-erika', email: 'erika@example.ch', name: 'Erika Muster', groups: ['Mitglieder'] });
  const lagerQr = mitgliedToken({ sub: 'm-lea', email: 'lager-person@example.ch', name: 'Lea Lager', groups: ['Mitglieder', 'Lager'] });

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
  const warten = async (bedingung, was) => {
    for (let i = 0; i < 50; i++) {
      if (bedingung()) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.fail(`Zeitueberschreitung: ${was}`);
  };
  const bestand = async (id) => (await q('SELECT quantity FROM items WHERE id = $1', [id])).rows[0].quantity;
  const vertrag = {};
  const ids = {};

  await t.test('Anmeldung: jedes Mitglied, Authentik oder QR-Code gleich', async () => {
    const z = `?von=${tag(2)}&bis=${tag(4)}`;
    assert.equal((await aufruf('GET', `/ausleihe/angebot${z}`)).status, 401);
    const mitQr = await aufruf('GET', `/ausleihe/angebot${z}`, { tok: qr });
    assert.equal(mitQr.status, 403, 'Mitglieder-Token, das api-members nicht bestaetigt');
    assert.equal((await aufruf('GET', `/ausleihe/angebot${z}`, { tok: erikaQr })).status, 200,
      'QR-Login ohne Lager-Gruppe darf ausleihen wie mit Authentik');
    assert.equal((await aufruf('GET', '/ausleihe', { tok: erikaQr })).status, 403, 'verwalten nur mit Gruppe Lager');
    assert.equal((await aufruf('GET', '/ausleihe', { tok: lagerQr })).status, 200, 'QR-Login mit Gruppe Lager verwaltet');
    assert.equal((await aufruf('GET', '/ausleihe/meine', { tok: erikaQr })).status, 200);
    const r = await aufruf('GET', `/ausleihe/angebot${z}`, { tok: erika });
    assert.equal(r.status, 200, 'Mitglied ohne Lager-Gruppe darf ausleihen');
    assert.deepEqual([r.json.artikel, r.json.kisten], [[], []], 'noch nichts ausleihbar');
    const falsch = await aufruf('GET', `/ausleihe/angebot?von=${tag(4)}&bis=${tag(2)}`, { tok: erika });
    assert.equal(falsch.status, 400);
    assert.equal(falsch.json.error, 'Das Rückgabedatum liegt vor dem Abholdatum.');
    assert.equal((await aufruf('GET', `/ausleihe/angebot?von=${tag(-1)}&bis=${tag(1)}`, { tok: erika })).status, 400);
  });

  await t.test('Lager markiert, was ausleihbar ist', async () => {
    const mitglied = await aufruf('PATCH', '/items/1/ausleihbar', { tok: erika, body: { ausleihbar: true } });
    assert.equal(mitglied.status, 403);
    assert.match(mitglied.json.error, /Gruppe Lager/);
    for (const pfad of ['/items/1/ausleihbar', '/items/2/ausleihbar', '/locations/2/ausleihbar']) {
      const r = await aufruf('PATCH', pfad, { tok: lager, body: { ausleihbar: true } });
      assert.equal(r.status, 200, pfad);
      assert.equal(r.json.ausleihbar, true);
    }
    vertrag.ausleihbar_artikel = (await aufruf('PATCH', '/items/2/ausleihbar', { tok: lager, body: { ausleihbar: true } })).json;
    vertrag.ausleihbar_lagerort = (await aufruf('PATCH', '/locations/2/ausleihbar', { tok: lager, body: { ausleihbar: true } })).json;
    assert.equal((await aufruf('PATCH', '/items/1/ausleihbar', { tok: lager, body: { ausleihbar: 'ja' } })).status, 400);
    assert.equal((await aufruf('PATCH', '/items/99/ausleihbar', { tok: lager, body: { ausleihbar: true } })).status, 404);
    // Artikel und Lagerorte liefern das Feld mit
    assert.equal((await aufruf('GET', '/items/1')).json.ausleihbar, true);
    assert.equal((await aufruf('GET', '/items/3')).json.ausleihbar, false);
  });

  await t.test('Angebot fuer einen Zeitraum', async () => {
    const r = await aufruf('GET', `/ausleihe/angebot?von=${tag(2)}&bis=${tag(4)}`, { tok: erika });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.artikel.map((a) => [a.name, a.frei, a.frei_text]),
      [['Teller', 50, '50 Stück frei'], ['Festbank', 10, '10 Stück frei']]);
    assert.deepEqual(r.json.kisten.map((k) => [k.name, k.frei, k.inhalt.map((i) => i.menge_text)]),
      [['Festkiste', true, ['6 Flasche Mineral', '20 Stück Teller']]]);
    vertrag.angebot = r.json;
  });

  await t.test('Mitglied leiht aus: ohne Freigabe, Lager und Mitglied bekommen Bescheid', async () => {
    const r = await aufruf('POST', '/ausleihe', {
      tok: erika, body: { von: tag(2), bis: tag(4), positionen: [{ item_id: 2, menge: 20 }, { item_id: 2, menge: 10 }], notizen: 'Geburtstag' }
    });
    assert.equal(r.status, 201);
    ids.a = r.json.id;
    assert.equal(r.json.status, 'reserviert');
    assert.equal(r.json.art, 'mitglied');
    assert.equal(r.json.mitglied_name, 'Erika Muster');
    assert.deepEqual(r.json.positionen.map((p) => [p.art, p.menge, p.menge_text]), [['artikel', 30, '30 Stück Teller']], 'zusammengefasst');
    assert.equal(r.json.app.kann_absagen, true);
    assert.equal(r.json.app.kann_ausgeben, false);
    assert.equal(r.json.app.status_text, 'Reserviert');
    vertrag.ausleihe_neu = r.json;

    await warten(() => mails.length >= 2 && pushes.length >= 1, 'Mails und Push');
    const anLager = mails.find((m) => m.to === 'lager@example.ch');
    assert.match(anLager.subject, new RegExp(`^Neue Ausleihe #${ids.a}: Erika Muster`));
    assert.match(anLager.body, /30 Stück Teller/);
    assert.match(anLager.body, /Notiz: Geburtstag/);
    const bestaetigung = mails.find((m) => m.to === 'erika@example.ch');
    assert.match(bestaetigung.subject, /^Bestätigung: Ausleihe #\d+ reserviert$/);
    assert.equal(pushes[0].memberId, 42);
    assert.equal(pushes[0].notificationType, 'general');
    mails.length = 0;
    pushes.length = 0;
  });

  await t.test('Ueberbuchen: 409; anderer Zeitraum geht', async () => {
    const zuViel = await aufruf('POST', '/ausleihe', { tok: max, body: { von: tag(3), bis: tag(3), positionen: [{ item_id: 2, menge: 25 }] } });
    assert.equal(zuViel.status, 409);
    assert.equal(zuViel.json.error, `Von «Teller» sind am ${tag(3).split('-').reverse().join('.')} nur noch 20 Stück frei.`);
    vertrag.ausleihe_409 = zuViel.json;
    const nichtAusleihbar = await aufruf('POST', '/ausleihe', { tok: max, body: { von: tag(3), bis: tag(3), positionen: [{ item_id: 3, menge: 1 }] } });
    assert.equal(nichtAusleihbar.status, 409);
    assert.equal(nichtAusleihbar.json.error, '«Mineral» kann nicht ausgeliehen werden.');
    const leer = await aufruf('POST', '/ausleihe', { tok: max, body: { von: tag(3), bis: tag(3), positionen: [] } });
    assert.equal(leer.status, 400);
    const danach = await aufruf('POST', '/ausleihe', { tok: max, body: { von: tag(5), bis: tag(6), positionen: [{ item_id: 2, menge: 50 }] } });
    assert.equal(danach.status, 201, 'nach der ersten Ausleihe ist wieder alles frei');
    ids.b = danach.json.id;
    await warten(() => mails.length >= 2, 'Mails zur zweiten Ausleihe');
    assert.equal(pushes.length, 0, 'ohne Mitglieder-Nummer kein Push');
    mails.length = 0;
  });

  await t.test('Kisten und Externe (nur Lager)', async () => {
    const extern = { name: 'Hans Muster', organisation: 'Turnverein', telefon: '079 123 45 67', email: 'hans@example.ch' };
    const mitglied = await aufruf('POST', '/ausleihe', { tok: erika, body: { von: tag(3), bis: tag(3), positionen: [{ location_id: 2 }], extern } });
    assert.equal(mitglied.status, 403);
    assert.equal(mitglied.json.error, 'Ausleihen für Externe erfasst die Gruppe Lager.');
    // Die Kiste hat 20 Teller — genau so viele sind neben der ersten Ausleihe frei.
    const r = await aufruf('POST', '/ausleihe', { tok: lager, body: { von: tag(3), bis: tag(3), positionen: [{ location_id: 2 }], extern } });
    assert.equal(r.status, 201);
    ids.c = r.json.id;
    assert.equal(r.json.art, 'extern');
    assert.equal(r.json.app.ausleiher_text, 'Hans Muster, Turnverein');
    assert.deepEqual(r.json.positionen[0].inhalt.map((i) => i.menge_text), ['6 Flasche Mineral', '20 Stück Teller'], 'heutiger Inhalt');
    assert.equal(r.json.app.kann_ausgeben, true);
    vertrag.ausleihe_extern = r.json;

    const nochmal = await aufruf('POST', '/ausleihe', { tok: lager, body: { von: tag(1), bis: tag(3), positionen: [{ location_id: 2 }] } });
    assert.equal(nochmal.status, 409);
    assert.match(nochmal.json.error, /^«Festkiste» ist am .* schon ausgeliehen oder reserviert\.$/);

    const angebot = await aufruf('GET', `/ausleihe/angebot?von=${tag(3)}&bis=${tag(3)}`, { tok: erika });
    assert.deepEqual(angebot.json.artikel.map((a) => [a.name, a.frei, a.frei_text]),
      [['Teller', 0, 'Ausgebucht'], ['Festbank', 10, '10 Stück frei']]);
    assert.deepEqual(angebot.json.kisten.map((k) => [k.frei, k.frei_text]), [[false, 'Schon ausgeliehen']]);
    vertrag.angebot_belegt = angebot.json;
    assert.equal(mails.length, 0, 'Lager erfasst: keine Meldung');
  });

  await t.test('Wer sieht was', async () => {
    const meine = await aufruf('GET', '/ausleihe/meine', { tok: erika });
    assert.deepEqual(meine.json.map((a) => a.id), [ids.a]);
    vertrag.meine = meine.json;
    assert.deepEqual((await aufruf('GET', '/ausleihe/meine', { tok: max })).json.map((a) => a.id), [ids.b]);
    assert.equal((await aufruf('GET', '/ausleihe', { tok: erika })).status, 403);
    assert.equal((await aufruf('GET', `/ausleihe/${ids.b}`, { tok: erika })).status, 404, 'fremde Ausleihe');
    assert.equal((await aufruf('GET', `/ausleihe/${ids.a}`, { tok: erika })).status, 200);
    const kommend = await aufruf('GET', '/ausleihe?filter=kommend', { tok: lager });
    assert.deepEqual(kommend.json.map((a) => a.id), [ids.a, ids.c, ids.b], 'nach Abholdatum');
    assert.equal(kommend.json[0].app.kann_ausgeben, true);
    assert.equal(kommend.json[0].app.kann_absagen, true);
    assert.equal((await aufruf('GET', '/ausleihe?filter=quatsch', { tok: lager })).status, 400);
  });

  await t.test('Absagen: eigene solange reserviert, Lager alle', async () => {
    assert.equal((await aufruf('POST', `/ausleihe/${ids.c}/absagen`, { tok: erika })).status, 404);
    const r = await aufruf('POST', `/ausleihe/${ids.b}/absagen`, { tok: max });
    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'abgesagt');
    assert.equal(r.json.app.kann_absagen, false);
    vertrag.ausleihe_abgesagt = r.json;
    const nochmal = await aufruf('POST', `/ausleihe/${ids.b}/absagen`, { tok: max });
    assert.equal(nochmal.status, 409);
    await warten(() => mails.length >= 1, 'Absage ans Lager');
    assert.match(mails[0].subject, new RegExp(`^Ausleihe #${ids.b} abgesagt`));
    mails.length = 0;
  });

  await t.test('Ausgeben bucht aus, Kisten-Inhalt wird festgehalten', async () => {
    assert.equal((await aufruf('POST', `/ausleihe/${ids.a}/ausgeben`, { tok: erika })).status, 403);
    const a = await aufruf('POST', `/ausleihe/${ids.a}/ausgeben`, { tok: lager });
    assert.equal(a.status, 200);
    assert.equal(a.json.status, 'ausgegeben');
    assert.equal(a.json.app.kann_zuruecknehmen, true);
    assert.equal(await bestand(2), 20);
    const c = await aufruf('POST', `/ausleihe/${ids.c}/ausgeben`, { tok: lager });
    assert.equal(c.status, 200);
    vertrag.ausleihe_ausgegeben = c.json;
    assert.deepEqual(c.json.positionen[0].inhalt.map((i) => [typeof i.id, i.menge_text]),
      [['number', '6 Flasche Mineral'], ['number', '20 Stück Teller']]);
    assert.equal(await bestand(2), 0);
    assert.equal(await bestand(3), 14);
    const tx = await q(`SELECT type, quantity, reason, user_email FROM transactions WHERE item_id = 2 ORDER BY id`);
    assert.deepEqual(tx.rows, [
      { type: 'out', quantity: 30, reason: `Ausleihe #${ids.a}`, user_email: 'lager-person@example.ch' },
      { type: 'out', quantity: 20, reason: `Ausleihe #${ids.c}`, user_email: 'lager-person@example.ch' }
    ]);
    assert.equal((await aufruf('POST', `/ausleihe/${ids.a}/ausgeben`, { tok: lager })).status, 409);
    assert.equal((await aufruf('POST', `/ausleihe/${ids.a}/absagen`, { tok: erika })).status, 409, 'ausgegeben: nicht mehr absagen');
    // Ausgegebenes zaehlt weiter zum Besitz: im Zeitraum ist nichts frei, danach alles.
    const waehrend = await aufruf('GET', `/ausleihe/angebot?von=${tag(3)}&bis=${tag(3)}`, { tok: erika });
    assert.equal(waehrend.json.artikel.find((x) => x.name === 'Teller').frei, 0);
    const spaeter = await aufruf('GET', `/ausleihe/angebot?von=${tag(8)}&bis=${tag(9)}`, { tok: erika });
    assert.equal(spaeter.json.artikel.find((x) => x.name === 'Teller').frei, 50);
  });

  await t.test('Zuruecknehmen: Zurueckgekommenes ein, Kaputtes/Fehlendes bleibt aus', async () => {
    const posA = vertrag.ausleihe_neu.positionen[0].id;
    const falsch = await aufruf('POST', `/ausleihe/${ids.a}/zuruecknehmen`, {
      tok: lager, body: { positionen: [{ id: posA, zurueck: 27, zustand: 'ok' }] }
    });
    assert.equal(falsch.status, 400);
    assert.equal(falsch.json.error, '«Teller»: Bei «In Ordnung» muss alles zurück sein.');

    const form = new FormData();
    form.append('image', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), 'schaden.jpg');
    form.append('position_id', String(posA));
    const mitglied = await fetch(`${BASE}/ausleihe/${ids.a}/fotos`, { method: 'POST', headers: { Authorization: `Bearer ${erika}` }, body: form });
    assert.equal(mitglied.status, 403);
    const hoch = await fetch(`${BASE}/ausleihe/${ids.a}/fotos`, { method: 'POST', headers: { Authorization: `Bearer ${lager}` }, body: form });
    assert.equal(hoch.status, 201);
    const foto = await hoch.json();
    assert.equal(foto.position_id, posA);
    assert.match(foto.image_url, /^\/api\/uploads\/item-.+\.jpg$/);
    vertrag.foto = foto;

    const r = await aufruf('POST', `/ausleihe/${ids.a}/zuruecknehmen`, {
      tok: lager, body: { positionen: [{ id: posA, zurueck: 27, zustand: 'beschaedigt', schaden: '3 Teller zerbrochen' }], notiz: 'Sonst sauber' }
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'zurueckgegeben');
    assert.equal(r.json.rueckgabe_notiz, 'Sonst sauber');
    assert.deepEqual(r.json.positionen.map((p) => [p.zurueck_menge, p.zustand, p.zustand_text, p.schaden]),
      [[27, 'beschaedigt', 'Beschädigt', '3 Teller zerbrochen']]);
    assert.equal(r.json.fotos.length, 1);
    vertrag.ausleihe_zurueck = r.json;
    assert.equal(await bestand(2), 27);

    const c = vertrag.ausleihe_ausgegeben.positionen[0];
    const mineral = c.inhalt.find((i) => i.name === 'Mineral');
    const rc = await aufruf('POST', `/ausleihe/${ids.c}/zuruecknehmen`, {
      tok: lager, body: { positionen: [{ id: c.id, inhalt: [{ id: mineral.id, zurueck: 4, zustand: 'fehlt' }] }] }
    });
    assert.equal(rc.status, 200, 'Teller ohne Angabe: alles zurueck');
    assert.equal(rc.json.positionen[0].zustand, 'fehlt', 'Kiste: schlimmster Zustand des Inhalts');
    assert.deepEqual(rc.json.positionen[0].inhalt.map((i) => [i.name, i.zurueck_menge, i.zustand]),
      [['Mineral', 4, 'fehlt'], ['Teller', 20, 'ok']]);
    vertrag.ausleihe_zurueck_kiste = rc.json;
    assert.equal(await bestand(2), 47, '50 − 3 zerbrochen');
    assert.equal(await bestand(3), 18, '20 − 2 fehlen');
    const kiste = await q(`SELECT item_id, quantity FROM item_locations WHERE location_id = 2 ORDER BY item_id`);
    assert.deepEqual(kiste.rows, [{ item_id: 2, quantity: 20 }, { item_id: 3, quantity: 4 }], 'Fehlendes ist nicht mehr in der Kiste');
    const tx = await q(`SELECT type, quantity, previous_quantity, new_quantity, reason FROM transactions WHERE item_id = 3 ORDER BY id`);
    assert.deepEqual(tx.rows.slice(-2), [
      { type: 'in', quantity: 4, previous_quantity: 14, new_quantity: 18, reason: `Rückgabe Ausleihe #${ids.c}` },
      { type: 'correction', quantity: 18, previous_quantity: 18, new_quantity: 18, reason: `Ausleihe #${ids.c}: 2 fehlt — bleibt ausgebucht` }
    ]);
    assert.equal((await aufruf('POST', `/ausleihe/${ids.c}/zuruecknehmen`, { tok: lager, body: {} })).status, 409);
    const erledigt = await aufruf('GET', '/ausleihe?filter=erledigt', { tok: lager });
    assert.deepEqual(erledigt.json.map((a) => a.status).sort(), ['abgesagt', 'zurueckgegeben', 'zurueckgegeben']);
  });

  await t.test('Erinnerungen: morgen zurueck und ueberfaellig, hoechstens taeglich', async () => {
    const neu = async (von, bis) => {
      const r = await aufruf('POST', '/ausleihe', { tok: erika, body: { von, bis, positionen: [{ item_id: 1, menge: 2 }] } });
      assert.equal(r.status, 201);
      assert.equal((await aufruf('POST', `/ausleihe/${r.json.id}/ausgeben`, { tok: lager })).status, 200);
      return r.json.id;
    };
    const d = await neu(tag(0), tag(1));
    const e = await neu(tag(0), tag(0));
    await q(`UPDATE ausleihen SET von = $2, bis = $3 WHERE id = $1`, [e, tag(-4), tag(-2)]);
    await warten(() => mails.length >= 4, 'Bestaetigungen');
    mails.length = 0;
    pushes.length = 0;

    assert.equal((await aufruf('POST', '/ausleihe/erinnerungen')).status, 401);
    const lauf = await aufruf('POST', '/ausleihe/erinnerungen', { kopf: { 'x-order-api-key': KEY } });
    assert.equal(lauf.status, 200);
    assert.deepEqual(lauf.json, { aktiv: true, gesendet: [{ id: d, art: 'vorher' }, { id: e, art: 'ueberfaellig' }] });
    assert.deepEqual(mails.map((m) => [m.to, m.subject]), [
      ['erika@example.ch', `Erinnerung: Ausleihe #${d} morgen zurückbringen`],
      ['erika@example.ch', `Ausleihe #${e} ist überfällig`],
      ['lager@example.ch', `Überfällig: Ausleihe #${e} (Erika Muster)`]
    ]);
    assert.equal(pushes.length, 2);

    const zweiter = await aufruf('POST', '/ausleihe/erinnerungen', { kopf: { 'x-order-api-key': KEY } });
    assert.deepEqual(zweiter.json.gesendet, [], 'am selben Tag nichts doppelt');

    // Naechster Tag (gestern erinnert): wieder ans Mitglied, nicht mehr ans Lager.
    await q(`UPDATE ausleihen SET erinnert_ueberfaellig_am = $2 WHERE id = $1`, [e, tag(-1)]);
    mails.length = 0;
    const dritter = await aufruf('POST', '/ausleihe/erinnerungen', { kopf: { 'x-order-api-key': KEY } });
    assert.deepEqual(dritter.json.gesendet, [{ id: e, art: 'ueberfaellig' }]);
    assert.deepEqual(mails.map((m) => m.to), ['erika@example.ch']);

    const ueber = await aufruf('GET', '/ausleihe/ueberfaellig', { tok: lager });
    assert.deepEqual(ueber.json.map((a) => [a.id, a.app.status_text, a.app.hinweis, a.app.ueberfaellig]),
      [[e, 'Überfällig', 'Seit 2 Tagen überfällig', true]]);
    assert.equal((await aufruf('GET', '/ausleihe/ueberfaellig', { tok: erika })).status, 403);
    vertrag.ueberfaellig = ueber.json;
    vertrag.ausgegeben = (await aufruf('GET', '/ausleihe?filter=ausgegeben', { tok: lager })).json;
    // Festbank: 10 − 2 − 2 ausgegeben; die ueberfaellige belegt bis zur Rueckgabe
    const angebot = await aufruf('GET', `/ausleihe/angebot?von=${tag(0)}&bis=${tag(0)}`, { tok: erika });
    assert.equal(angebot.json.artikel.find((x) => x.name === 'Festbank').frei, 6);
  });

  await t.test('Vertrag mit der App: test/fixtures/ausleihe-api.json in fwv_lager', async () => {
    const echt = festschreiben(vertrag);
    if (process.env.FIXTURES_SCHREIBEN) {
      fs.mkdirSync(path.dirname(VERTRAG), { recursive: true });
      fs.writeFileSync(VERTRAG, JSON.stringify({
        _hinweis: 'Antworten der Inventar-API zur Ausleihe (simple-inventory-system/backend/test/ausleihe.test.mjs). "Heute" ist hier immer der 11.10.2026.',
        ...echt
      }, null, 2) + '\n');
      return;
    }
    const bisher = fs.existsSync(VERTRAG) ? JSON.parse(fs.readFileSync(VERTRAG, 'utf8')) : {};
    for (const [k, v] of Object.entries(echt)) {
      assert.deepEqual(bisher[k], v, `${k} weicht vom Vertrag ab — gewollt? FIXTURES_SCHREIBEN=1 und fwv_lager anpassen`);
    }
  });
});
