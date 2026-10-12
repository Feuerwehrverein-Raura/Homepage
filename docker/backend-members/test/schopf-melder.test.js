// Schopf-Musik als Benachrichtigung: wer was bekommt, nur bei Aenderungen,
// "weg" nach der Schicht oder wenn der Laptop aus ist; Freigabe der Knoepfe.

const test = require('node:test');
const assert = require('node:assert/strict');
const { schopfMelder, fernFreigabe, fernFreigabePruefen } = require('../src/schopf-melder');

const GEHEIM = 'test-geheimnis';
const bis = new Date(Date.now() + 3 * 3600e3);

function aufbau() {
    const welt = {
        leute: [{ memberId: 'm1', schicht: { bis } }],
        musik: { erreichbar: true, laeuft: true, titel: 'Louenesee', interpret: 'Span' },
        laptopWeg: false
    };
    const gesendet = [];
    let zustandAbfragen = 0;
    const melder = schopfMelder({
        aktive: async () => welt.leute,
        zustand: async () => {
            zustandAbfragen++;
            return welt.laptopWeg ? { ok: false, grund: 'weg' } : { ok: true, daten: { musik: welt.musik } };
        },
        senden: async (ids, daten) => gesendet.push({ ids, ...daten }),
        geheimnis: GEHEIM,
        protokoll: { error() {} }
    });
    return { welt, gesendet, melder, abfragen: () => zustandAbfragen };
}

test('Zeigen, nur bei Aenderung erneut, Pause, Titelwechsel', async () => {
    const { welt, gesendet, melder } = aufbau();
    await melder.takt();
    assert.equal(gesendet.length, 1);
    assert.deepEqual(gesendet[0].ids, ['m1']);
    assert.equal(gesendet[0].art, 'zeigen');
    assert.equal(gesendet[0].titel, 'Louenesee');
    assert.equal(gesendet[0].laeuft, '1');
    assert.equal(gesendet[0].bis, bis.toISOString());
    assert.equal(fernFreigabePruefen(GEHEIM, gesendet[0].t), 'm1');

    await melder.takt();
    assert.equal(gesendet.length, 1, 'unveraendert: nichts senden');

    welt.musik = { ...welt.musik, laeuft: false };
    await melder.takt();
    assert.equal(gesendet.at(-1).laeuft, '0');

    welt.musik = { ...welt.musik, titel: 'Manhattan', interpret: 'Bligg' };
    await melder.takt();
    assert.equal(gesendet.at(-1).titel, 'Manhattan');
    assert.equal(gesendet.length, 3);
});

test('Weg: Laptop aus, Schicht vorbei; ohne Schichtleute kein Laptop-Abruf', async () => {
    const { welt, gesendet, melder, abfragen } = aufbau();
    await melder.takt();
    welt.laptopWeg = true;
    await melder.takt();
    assert.equal(gesendet.at(-1).art, 'weg');
    await melder.takt();
    assert.equal(gesendet.length, 2, '"weg" nur einmal');

    welt.laptopWeg = false;
    await melder.takt();
    assert.equal(gesendet.at(-1).art, 'zeigen');

    welt.leute = [];
    const vorher = abfragen();
    await melder.takt();
    assert.equal(gesendet.at(-1).art, 'weg');
    assert.deepEqual(gesendet.at(-1).ids, ['m1']);
    assert.equal(abfragen(), vorher, 'niemand in der Schicht: Laptop nicht fragen');
});

test('Freigabe der Knoepfe: nur mit eigenem Schluessel, laeuft ab', () => {
    const t = fernFreigabe(GEHEIM, 'm1', Date.now() + 3600e3);
    assert.equal(fernFreigabePruefen(GEHEIM, t), 'm1');
    assert.equal(fernFreigabePruefen('anderes', t), null);
    assert.equal(fernFreigabePruefen(GEHEIM, ''), null);
    // Ein Anmelde-Token (JWT_SECRET direkt) taugt nicht als Freigabe.
    const jwt = require('jsonwebtoken');
    assert.equal(fernFreigabePruefen(GEHEIM, jwt.sign({ zweck: 'schopf-musik', wer: 'm1' }, GEHEIM)), null);
});
