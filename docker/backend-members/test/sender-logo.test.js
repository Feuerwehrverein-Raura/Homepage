// Senderlogos aus radio-browser.info, gegen ein nachgebautes fetch.

const test = require('node:test');
const assert = require('node:assert/strict');
const { senderLogoSuchen, logoNachtrag, RADIO_BROWSER } = require('../src/sender-logo');

// Nachgebautes fetch: Antworten je Adresse, merkt sich die Aufrufe.
function netz(antworten) {
    const aufrufe = [];
    const fetchFn = async (url) => {
        aufrufe.push(url);
        const a = antworten[url];
        if (a === undefined) throw new Error('nicht erreichbar: ' + url);
        if (Array.isArray(a)) {
            return { ok: true, headers: new Map(), json: async () => a };
        }
        return {
            ok: (a.status ?? 200) < 400,
            headers: new Map([['content-type', a.typ]]),
            body: { cancel: async () => {} },
        };
    };
    return { fetchFn, aufrufe };
}

const STREAM = 'https://stream.srg-ssr.ch/srgssr/srf3/mp3/128';
const BYURL = RADIO_BROWSER + '/json/stations/byurl?url=' + encodeURIComponent(STREAM);
const byname = (n) => RADIO_BROWSER + '/json/stations/byname/' + encodeURIComponent(n) +
    '?order=votes&reverse=true&hidebroken=true&limit=20';

test('Logo ueber die Stream-Adresse', async () => {
    const { fetchFn } = netz({
        [BYURL]: [{ name: 'SRF 3', favicon: 'https://srf.ch/srf3.png' }],
        [byname('SRF 3')]: [],
        'https://srf.ch/srf3.png': { typ: 'image/png' },
    });
    assert.equal(await senderLogoSuchen({ name: 'SRF 3', url: STREAM }, { fetchFn }),
        'https://srf.ch/srf3.png');
});

test('Rueckfall ueber den Namen, Gleichnamige zuerst', async () => {
    const { fetchFn } = netz({
        [BYURL]: [],
        [byname('SRF 3')]: [
            { name: 'SRF 3 Regionaljournal', favicon: 'https://srf.ch/regio.png' },
            { name: 'srf  3', favicon: 'https://srf.ch/srf3.png' },
        ],
        'https://srf.ch/regio.png': { typ: 'image/png' },
        'https://srf.ch/srf3.png': { typ: 'image/jpeg' },
    });
    assert.equal(await senderLogoSuchen({ name: 'SRF 3', url: STREAM }, { fetchFn }),
        'https://srf.ch/srf3.png');
});

test('Nur https und nur brauchbare Bilder (kein SVG, kein ico, kein HTML, kein Fehler)', async () => {
    const { fetchFn, aufrufe } = netz({
        [BYURL]: [
            { favicon: 'http://basilisk.ch/logo.png' },
            { favicon: 'https://a.ch/seite' },
            { favicon: 'https://a.ch/logo.svg' },
            { favicon: 'https://a.ch/favicon.ico' },
            { favicon: 'https://a.ch/weg.png' },
            { favicon: '' },
        ],
        [byname('Basilisk')]: [{ name: 'Basilisk', favicon: 'https://a.ch/gut.webp' }],
        'https://a.ch/seite': { typ: 'text/html' },
        'https://a.ch/logo.svg': { typ: 'image/svg+xml' },
        'https://a.ch/favicon.ico': { typ: 'image/x-icon' },
        'https://a.ch/weg.png': { status: 404, typ: 'image/png' },
        'https://a.ch/gut.webp': { typ: 'image/webp' },
    });
    assert.equal(await senderLogoSuchen({ name: 'Basilisk', url: STREAM }, { fetchFn }),
        'https://a.ch/gut.webp');
    // Die http-Adresse wird gar nicht erst abgerufen.
    assert.ok(!aufrufe.includes('http://basilisk.ch/logo.png'));
});

test('Nichts gefunden oder Verzeichnis weg: null statt Fehler', async () => {
    assert.equal(await senderLogoSuchen({ name: 'X', url: STREAM }, { fetchFn: netz({}).fetchFn }),
        null);
    const { fetchFn } = netz({
        [BYURL]: [{ favicon: 'https://a.ch/kaputt.png' }],
        [byname('X')]: [],
    });
    // Das Logo selbst ist nicht erreichbar.
    assert.equal(await senderLogoSuchen({ name: 'X', url: STREAM }, { fetchFn }), null);
});

test('Nachtrag: hoechstens einmal pro Sender, nur fehlende, speichert Treffer', async () => {
    const gesucht = [];
    const gespeichert = [];
    const nachtragen = logoNachtrag({
        suchen: async (s) => { gesucht.push(s.id); return s.id === 'a' ? 'https://a.ch/a.png' : null; },
        speichern: async (id, logo) => { gespeichert.push([id, logo]); },
    });

    await Promise.all([
        nachtragen({ id: 'a', name: 'A' }),
        nachtragen({ id: 'b', name: 'B' }),
        nachtragen({ id: 'c', name: 'C', logo_url: 'https://c.ch/c.png' }),
    ]);
    // Zweiter Aufruf der Liste: niemand wird nochmals gesucht.
    assert.equal(nachtragen({ id: 'a', name: 'A' }), null);
    assert.equal(nachtragen({ id: 'b', name: 'B' }), null);

    assert.deepEqual(gesucht, ['a', 'b']);
    assert.deepEqual(gespeichert, [['a', 'https://a.ch/a.png']]);
});

test('Nachtrag: Fehler werden gemeldet, nicht geworfen', async () => {
    const meldungen = [];
    const nachtragen = logoNachtrag({
        suchen: async () => 'https://a.ch/a.png',
        speichern: async () => { throw new Error('DB weg'); },
        melden: (f) => meldungen.push(f.message),
    });
    await nachtragen({ id: 'a' });
    assert.deepEqual(meldungen, ['DB weg']);
});
