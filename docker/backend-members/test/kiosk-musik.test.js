// Musik im Roten Schopf: Hoer-Freigabe und Fernbedienung des Laptops,
// gegen einen nachgebauten Kiosk-Dienst.
//
// Schreibt ausserdem die Vertragsdatei test/fixtures/kiosk-musik-app.json,
// gegen die die Flutter-App testet:
//
//     FIXTURES_SCHREIBEN=1 node --test test/kiosk-musik.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const {
    hoerFreigabe, hoerFreigabeGueltig, befehlPruefen, kioskFernbedienung, HOER_DAUER_S
} = require('../src/kiosk-musik');

const GEHEIM = 'test-geheimnis';
const ZEIT = Date.parse('2026-10-12T21:00:00Z');

test('Hoer-Freigabe gilt 12 Stunden und nur zum Hoeren', () => {
    const f = hoerFreigabe(GEHEIM, 'erika@example.ch', ZEIT);
    assert.equal(f.gueltig_bis, new Date(ZEIT + HOER_DAUER_S * 1000).toISOString());
    assert.ok(hoerFreigabeGueltig(GEHEIM, f.token, ZEIT + 3600e3));
    assert.ok(!hoerFreigabeGueltig(GEHEIM, f.token, ZEIT + HOER_DAUER_S * 1000 + 1000));
    assert.ok(!hoerFreigabeGueltig('anderes-geheimnis', f.token, ZEIT));
    assert.ok(!hoerFreigabeGueltig(GEHEIM, '', ZEIT));

    // Mit dem Anmelde-Geheimnis selbst ist sie wertlos - und umgekehrt
    // taugt ein Anmelde-Token nicht als Freigabe.
    assert.throws(() => jwt.verify(f.token, GEHEIM));
    const anmeldung = jwt.sign({ zweck: 'hoeren', iat: Math.floor(ZEIT / 1000) }, GEHEIM);
    assert.ok(!hoerFreigabeGueltig(GEHEIM, anmeldung, ZEIT));
});

test('Befehle werden geprueft und bereinigt', () => {
    assert.deepEqual(befehlPruefen('lautstaerke', { wert: 140 }), { daten: { wert: 100 } });
    assert.deepEqual(befehlPruefen('lautstaerke', { wert: '55.4' }), { daten: { wert: 55 } });
    assert.ok(befehlPruefen('lautstaerke', {}).fehler);
    assert.ok(befehlPruefen('radio', { url: 'file:///etc/passwd' }).fehler);
    assert.ok(befehlPruefen('playlist', { name: '  ' }).fehler);
    assert.ok(befehlPruefen('licht', {}).fehler);
    assert.deepEqual(befehlPruefen('weiter', { egal: 1 }), { daten: {} });
});

const ZUSTAND = {
    musik: {
        erreichbar: true,
        naechste: [{ name: 'Baschi — Gib mer e chance', dauer: '206' }],
        laeuft: true,
        titel: 'Louenesee',
        interpret: 'Span',
        position: 61.3,
        dauer: 255.0,
        lautstaerke: 60,
        zufall: true
    },
    playlists: ['Alle Titel', 'Chilbi Abend'],
    sender: [{ name: 'SRF 3', url: 'https://stream.srg-ssr.ch/m/drs3/mp3_128' }]
};

function fakeLaptop({ weg = false } = {}) {
    const aufrufe = [];
    async function abrufen(url, opt) {
        aufrufe.push({ url, methode: opt.method, schluessel: opt.headers['X-Kiosk-Key'],
            daten: opt.body ? JSON.parse(opt.body) : null });
        if (weg) throw new Error('ETIMEDOUT');
        const antwort = (d, status = 200) => ({ ok: status < 400, status, json: async () => d });
        if (url.endsWith('/musik')) return antwort(ZUSTAND);
        return antwort({ ok: true, musik: ZUSTAND.musik });
    }
    return { abrufen, aufrufe };
}

test('Fernbedienung: Zustand und Befehle mit Schluessel', async () => {
    const l = fakeLaptop();
    const f = kioskFernbedienung({ adresse: 'http://t400:8081', schluessel: 'k', abrufen: l.abrufen });

    const z = await f.zustand();
    assert.equal(z.ok, true);
    assert.deepEqual(z.daten, ZUSTAND);

    assert.equal((await f.befehl('lautstaerke', { wert: 70 })).ok, true);
    assert.equal((await f.befehl('playlist', { name: 'Chilbi Abend' })).ok, true);
    assert.deepEqual(l.aufrufe.map(a => [a.methode, a.url, a.schluessel, a.daten]), [
        ['GET', 'http://t400:8081/musik', 'k', null],
        ['POST', 'http://t400:8081/musik/lautstaerke', 'k', { wert: 70 }],
        ['POST', 'http://t400:8081/musik/playlist', 'k', { name: 'Chilbi Abend' }]
    ]);

    // Ungueltiges geht gar nicht erst an den Laptop.
    const falsch = await f.befehl('licht', { an: true });
    assert.equal(falsch.ungueltig, true);
    assert.equal(l.aufrufe.length, 3);

    if (process.env.FIXTURES_SCHREIBEN) {
        fs.writeFileSync(path.join(__dirname, 'fixtures', 'kiosk-musik-app.json'),
            JSON.stringify({ zustand: ZUSTAND }, null, 2) + '\n');
    }
});

test('Fernbedienung: Laptop aus oder nicht eingerichtet', async () => {
    const aus = kioskFernbedienung({ schluessel: 'k', abrufen: fakeLaptop({ weg: true }).abrufen });
    assert.deepEqual(await aus.zustand(),
        { ok: false, grund: 'Der Laptop im Roten Schopf antwortet nicht' });
    const ohne = kioskFernbedienung({ schluessel: '', abrufen: fakeLaptop().abrufen });
    assert.equal((await ohne.zustand()).grund, 'Fernbedienung ist nicht eingerichtet');
});

test('Vertragsdatei passt zum nachgebauten Laptop', () => {
    const datei = path.join(__dirname, 'fixtures', 'kiosk-musik-app.json');
    assert.deepEqual(JSON.parse(fs.readFileSync(datei, 'utf8')), { zustand: ZUSTAND });
});
