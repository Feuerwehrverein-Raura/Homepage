// Versandkern fuer Briefe (src/brief-versand.js) mit nachgebauten
// Abhaengigkeiten: Rendern, Pingen, Protokoll, Kostenmeldung.
const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const K = require('../src/brief-versand');

async function pdf(seiten) {
    const d = await PDFDocument.create();
    for (let i = 0; i < seiten; i++) d.addPage();
    return Buffer.from(await d.save());
}

function aufbau(pingenAntwort) {
    const log = { pingen: [], protokoll: [], kosten: [], rand: [] };
    const versenden = K.briefVersand({
        rendern: async (html, rand) => { log.rand.push(rand); return pdf(1); },
        pingen: async (b) => { log.pingen.push(b); return pingenAntwort; },
        protokollieren: async (e) => { log.protokoll.push(e); },
        kostenMelden: async (...a) => { log.kosten.push(a); },
        anlassPdfLaden: async () => ({ filename: 'Flyer.pdf', content: (await pdf(2)).toString('base64') })
    });
    return { versenden, log };
}

const CH = { name: 'Erika Muster', country: 'CH' };
const DE = { name: 'Ursula Meyer', country: 'DE' };

test('Angenommen: Fenster nach Land, Flyer angehaengt, Protokoll und Kostenmeldung', async () => {
    const { versenden, log } = aufbau({ letterId: 'L1', status: 'valid' });
    const r = await versenden({ html: '<p>x</p>', recipient: DE, memberId: 'm1', subject: 'Einladung', eventId: 'e1' });
    assert.deepEqual(r, { letterId: 'L1', status: 'valid' });
    assert.equal(log.pingen[0].links, true);
    assert.equal((await PDFDocument.load(log.pingen[0].pdf)).getPageCount(), 3, 'Brief + 2 Seiten Flyer');
    assert.equal(log.pingen[0].dateiname, 'Einladung_Ursula_Meyer.pdf');
    assert.deepEqual(log.rand[0], K.STANDARD_RAND);
    assert.equal(log.protokoll[0].status, 'sent');
    assert.equal(log.protokoll[0].eventId, 'e1');
    assert.deepEqual(log.kosten[0], ['Ursula Meyer', 'L1', 'Einladung']);
});

test('Mitteilung an Angemeldete: Anlass nur im Protokoll, kein Flyer', async () => {
    const { versenden, log } = aufbau({ letterId: 'L2', status: 'valid' });
    await versenden({ html: 'x', recipient: CH, subject: 'Info', eventId: 'e1', anlassPdfMit: false });
    assert.equal(log.pingen[0].links, false);
    assert.equal((await PDFDocument.load(log.pingen[0].pdf)).getPageCount(), 1);
    assert.equal(log.protokoll[0].eventId, 'e1');
});

test('Abgelehnt: Fehler mit Grund, Protokoll "failed", keine Kostenmeldung', async () => {
    const { versenden, log } = aufbau({ letterId: 'L3', status: 'action_required', grund: 'protected_stamp_area' });
    await assert.rejects(versenden({ html: 'x', recipient: DE, subject: 'B' }),
        (e) => e.status === 422 && /protected_stamp_area/.test(e.message) && e.letterId === 'L3');
    assert.equal(log.protokoll[0].status, 'failed');
    assert.equal(log.protokoll[0].fehler, 'protected_stamp_area');
    assert.equal(log.kosten.length, 0);
});

test('Staging ohne Kostenmeldung; ohne Empfaenger 400', async () => {
    const { versenden, log } = aufbau({ letterId: 'L4', status: 'valid' });
    await versenden({ html: 'x', recipient: CH, subject: 'B', staging: true });
    assert.equal(log.kosten.length, 0);
    await assert.rejects(versenden({ html: 'x', recipient: null }), (e) => e.status === 400);
});

test('Deckblatt: Adresse im Fenster, Hinweis auf die Beilage', () => {
    const html = K.deckblattHtml({ betreff: 'Jahresprogramm', mitglied: { vorname: 'U', nachname: 'M', strasse: 'S 1', plz: 'DE-79618', ort: 'R' }, absender: 'A' });
    assert.match(html, /top:45mm;left:22mm;/);
    assert.match(html, /Beiliegend erhalten Sie «Jahresprogramm»/);
});
