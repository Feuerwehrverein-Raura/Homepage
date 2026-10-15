// Kasse <-> Anlass (src/anlass.ts): Reihenfolge des TWINT-QR, Merken,
// Ausfaelle von api-events. Laeuft ohne Datenbank: npm test.

import test from 'node:test';
import assert from 'node:assert/strict';
import { VEREINS_QR_URL, AnlassErmittler, AnlassQuelle, KassenAnlass, eventsQuelle, twintAntwort, bildVersion, hatService, ausEvents } from '../src/anlass.js';

const ID = '00000000-0000-0000-0000-e00000000001';
const ID2 = '00000000-0000-0000-0000-e00000000002';
const chilbi: KassenAnlass = {
  id: ID, titel: 'Chilbi 2026', beginn: '2026-10-24 18:00:00', ende: null, ort: 'Rheinufer',
  twint_qr_url: `/events/${ID}/twint-qr?v=1729790000000`, hat_service: true,
};
const gv: KassenAnlass = { id: ID2, titel: 'GV 2026', beginn: '2026-11-20 19:00:00', ende: null, ort: null, twint_qr_url: null, hat_service: false };

function quelle(werte: { aktuell?: KassenAnlass | null; einer?: Record<string, KassenAnlass>; fehler?: boolean }) {
  const aufrufe = { aktuell: 0, einer: 0 };
  const q: AnlassQuelle = {
    async aktuell() { aufrufe.aktuell++; if (werte.fehler) throw new Error('weg'); return werte.aktuell ?? null; },
    async einer(id) { aufrufe.einer++; if (werte.fehler) throw new Error('weg'); return werte.einer?.[id] ?? null; },
    async liste() { return []; },
  };
  return { q, aufrufe };
}

test('twintAntwort: eigener QR des Anlasses ueber den Durchreicher der Kasse', () => {
  assert.deepEqual(twintAntwort({ anlass: chilbi, modus: 'automatisch' }, '/api/uploads/twint-qr.png'), {
    url: `/api/twint-qr/bild/${ID}?v=1729790000000`,
    anlass: { id: ID, titel: 'Chilbi 2026' },
    quelle: 'anlass',
    modus: 'automatisch',
  });
});

test('twintAntwort: Anlass ohne eigenen QR oder kein Anlass -> Vereins-Standard /twint-qr.png', () => {
  assert.deepEqual(twintAntwort({ anlass: gv, modus: 'manuell' }, null), {
    url: '/twint-qr.png', anlass: { id: ID2, titel: 'GV 2026' }, quelle: 'standard', modus: 'manuell',
  });
  assert.deepEqual(twintAntwort({ anlass: null, modus: 'automatisch' }, ''), {
    url: '/twint-qr.png', anlass: null, quelle: 'standard', modus: 'automatisch',
  });
  assert.equal(bildVersion('/events/x/twint-qr'), null);
});

test('twintAntwort: altes Bild aus den Einstellungen nur, wenn gesetzt - nach dem Anlass', () => {
  assert.equal(twintAntwort({ anlass: gv, modus: 'automatisch' }, '/api/uploads/twint-qr.png').quelle, 'einstellung');
  assert.equal(twintAntwort({ anlass: gv, modus: 'automatisch' }, '/api/uploads/twint-qr.png').url, '/api/uploads/twint-qr.png');
  assert.equal(twintAntwort({ anlass: chilbi, modus: 'automatisch' }, '/api/uploads/twint-qr.png').quelle, 'anlass');
});

test('Vereins-Standard liegt im Frontend unter /twint-qr.png', () => {
  assert.equal(VEREINS_QR_URL, '/twint-qr.png');
});

test('Ermittler: automatisch, 60 s gemerkt, danach neu', async () => {
  let jetzt = 1_000_000;
  const { q, aufrufe } = quelle({ aktuell: chilbi });
  const e = new AnlassErmittler(q, async () => null, 60_000, () => jetzt);
  assert.equal(e.gemerkt(), null);
  assert.deepEqual(await e.ermitteln(), { anlass: chilbi, modus: 'automatisch' });
  await e.ermitteln();
  assert.equal(aufrufe.aktuell, 1);
  jetzt += 60_001;
  await e.ermitteln();
  assert.equal(aufrufe.aktuell, 2);
  assert.equal(e.gemerkt()?.anlass?.id, ID);
});

test('Ermittler: gewaehlter Anlass geht vor dem automatischen', async () => {
  const { q, aufrufe } = quelle({ aktuell: chilbi, einer: { [ID2]: gv } });
  const e = new AnlassErmittler(q, async () => ID2);
  const stand = await e.ermitteln();
  assert.equal(stand.modus, 'manuell');
  assert.equal(stand.anlass?.titel, 'GV 2026');
  assert.equal(aufrufe.aktuell, 0);
});

test('Ermittler: api-events weg -> letzter bekannter Stand, nie ein Fehler', async () => {
  let jetzt = 0;
  const werte: { aktuell: KassenAnlass; fehler?: boolean } = { aktuell: chilbi };
  const { q } = quelle(werte);
  const e = new AnlassErmittler(q, async () => null, 60_000, () => jetzt);
  await e.ermitteln();
  werte.fehler = true;
  jetzt += 61_000;
  const stand = await e.ermitteln();
  assert.equal(stand.anlass?.id, ID);
  assert.equal(stand.fehler, 'weg');

  const leer = new AnlassErmittler(quelle({ fehler: true }).q, async () => null);
  assert.deepEqual(await leer.ermitteln(), { anlass: null, modus: 'automatisch', fehler: 'weg' });
});

test('Ermittler: gleichzeitige Abfragen holen nur einmal', async () => {
  const { q, aufrufe } = quelle({ aktuell: chilbi });
  const e = new AnlassErmittler(q, async () => null);
  await Promise.all([e.ermitteln(), e.ermitteln(), e.ermitteln()]);
  assert.equal(aufrufe.aktuell, 1);
});

test('eventsQuelle: Schluessel im Kopf, Felder uebersetzt, 404 -> null', async () => {
  const gesehen: { url: string; key: string }[] = [];
  const fetchFn = async (url: string, init: any) => {
    gesehen.push({ url, key: init.headers['X-Order-API-Key'] });
    if (url.endsWith('/aktuell')) {
      return { ok: true, status: 200, json: async () => ({ anlass: { id: ID, title: 'Chilbi 2026', start_date: 's',
        end_date: null, location: 'Rheinufer', twint_qr_url: null } }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const q = eventsQuelle({ baseUrl: 'http://events:3000/', schluessel: 'k', fetchFn });
  assert.deepEqual(await q.aktuell(), { id: ID, titel: 'Chilbi 2026', beginn: 's', ende: null, ort: 'Rheinufer', twint_qr_url: null, hat_service: false });
  assert.equal(await q.einer(ID2), null);
  assert.equal(await q.einer('kein-uuid'), null);
  assert.deepEqual(gesehen, [
    { url: 'http://events:3000/events/kasse/aktuell', key: 'k' },
    { url: `http://events:3000/events/kasse/anlaesse/${ID2}`, key: 'k' },
  ]);
  const kaputt = eventsQuelle({ baseUrl: 'http://x', schluessel: 'k',
    fetchFn: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
  await assert.rejects(kaputt.aktuell(), /500/);
});

test('hat_service: von api-events uebernommen, nur true zaehlt', () => {
  assert.equal(ausEvents({ id: ID, title: 'C', hat_service: true })?.hat_service, true);
  assert.equal(ausEvents({ id: ID, title: 'C', hat_service: false })?.hat_service, false);
  assert.equal(ausEvents({ id: ID, title: 'C' })?.hat_service, false, 'alte api-events ohne Feld');
  assert.equal(ausEvents({ id: ID, title: 'C', hat_service: 'true' })?.hat_service, false);
});

test('hatService: kein Anlass oder Fehler ohne gemerkten Stand -> false', async () => {
  assert.equal(hatService({ anlass: chilbi, modus: 'automatisch' }), true);
  assert.equal(hatService({ anlass: gv, modus: 'manuell' }), false);
  assert.equal(hatService({ anlass: null, modus: 'automatisch' }), false);
  assert.equal(hatService(null), false);
  assert.equal(hatService(undefined), false);
  const leer = new AnlassErmittler(quelle({ fehler: true }).q, async () => null);
  assert.equal(hatService(await leer.ermitteln()), false);
});

test('hatService: kurzer Ausfall von api-events -> Service des letzten Anlasses bleibt', async () => {
  let jetzt = 0;
  const werte: { aktuell: KassenAnlass; fehler?: boolean } = { aktuell: chilbi };
  const e = new AnlassErmittler(quelle(werte).q, async () => null, 60_000, () => jetzt);
  assert.equal(hatService(await e.ermitteln()), true);
  werte.fehler = true;
  jetzt += 61_000;
  assert.equal(hatService(await e.ermitteln()), true);
});
