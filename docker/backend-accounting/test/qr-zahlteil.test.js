// Zahlteil des Beitragsbriefs: Schweizerkreuz im QR, strukturierte Adressen,
// gedruckter Zahler stimmt mit dem QR-Inhalt ueberein.
const test = require('node:test');
const assert = require('node:assert');
const h = require('../src/beitrag-helpers');

const basis = {
    iban: h.BEITRAG_IBAN, amount: '25.00', reference: h.buildQRReference('1134'),
    message: 'Mitgliederbeitrag 2026//Ref. 01134 - Aerni Steve',
};

test('Kreditor strukturiert: Strasse und Hausnummer getrennt', () => {
    const z = h.buildSwissQRPayload({ ...basis }).split('\n');
    assert.strictEqual(z.length, 31);
    assert.deepStrictEqual(z.slice(4, 11), ['S', 'Feuerwehrverein Raura', 'Marksteinweg', '12', '4304', 'Giebenach', 'CH']);
});

test('Zahler vollstaendig: im QR, Hausnummer getrennt', () => {
    const z = h.buildSwissQRPayload({ ...basis, debtorName: 'Aerni Steve', debtorStreet: 'Rosenweg 9a',
        debtorPlz: '4303', debtorOrt: 'Kaiseraugst' }).split('\n');
    assert.deepStrictEqual(z.slice(20, 27), ['S', 'Aerni Steve', 'Rosenweg', '9a', '4303', 'Kaiseraugst', 'CH']);
});

test('Zahler unvollstaendig: im QR leer, gedruckt das Feld zum Ausfuellen', () => {
    const z = h.buildSwissQRPayload({ ...basis, debtorName: 'Aerni Steve', debtorStreet: '', debtorPlz: '', debtorOrt: '' }).split('\n');
    assert.deepStrictEqual(z.slice(20, 27), ['', '', '', '', '', '', '']);
    assert.strictEqual(h.zahlerHtml({ nachname: 'Aerni', vorname: 'Steve' }), '');
});

test('Gedruckter Zahler', () => {
    assert.strictEqual(h.zahlerHtml({ nachname: 'Aerni', vorname: 'Steve', strasse: 'Rosenweg 9', plz: '4303', ort: 'Kaiseraugst' }),
        'Aerni Steve<br>Rosenweg 9<br>4303 Kaiseraugst');
});

test('QR-Bild mit Schweizerkreuz (SVG)', async () => {
    const uri = await h.renderQRDataUri(h.buildSwissQRPayload({ ...basis }));
    assert.match(uri, /^data:image\/svg\+xml;base64,/);
    const svg = Buffer.from(uri.split(',')[1], 'base64').toString();
    // weisses Quadrat, schwarzes Feld, zwei weisse Balken = Kreuz
    assert.strictEqual((svg.match(/<rect /g) || []).length, 5);
});
