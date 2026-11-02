// Beitragsbrief (src/beitrag-helpers.js): Referenz, Land, Adressfenster.
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../src/beitrag-helpers');

const SETTINGS = { year: 2026, amount: 25, gv_date: '22. März 2026' };
const KASSIER = { vorname: 'Gina', nachname: 'Kassier', strasse: 'Weg 1', plz: '4304', ort: 'Giebenach', kurzName: 'G. Kassier' };

test('Referenz: nur Nullen oder leer ist unbrauchbar', () => {
    assert.equal(H.referenzGueltig('00000'), false);
    assert.equal(H.referenzGueltig(''), false);
    assert.equal(H.referenzGueltig(null), false);
    assert.equal(H.referenzGueltig('00 123'), true);
});

test('Land und Empfaenger fuer send-post', () => {
    assert.deepEqual(H.postEmpfaenger({ vorname: 'Ursula', nachname: 'Meyer', strasse: 'Alemannenstrasse 10a', plz: 'DE-79618', ort: 'Rheinfelden' }),
        { name: 'Ursula Meyer', street: 'Alemannenstrasse 10a', zip: '79618', city: 'Rheinfelden', country: 'DE' });
    assert.equal(H.postEmpfaenger({ plz: '4303' }).country, 'CH');
    assert.equal(H.istDeutsch({ plz: '79618' }), true);
});

test('Brief: CH rechts, DE links mit "Deutschland" und kleinerem Logo', async () => {
    const payment = { reference_nr: '123', amount: 25 };
    const ch = await H.buildBeitragLetterForPayment({ member: { vorname: 'A', nachname: 'B', strasse: 'S 1', plz: '4303', ort: 'K' },
        payment, settings: SETTINGS, kassier: KASSIER });
    assert.match(ch, /top:60mm;left:118mm;/);
    assert.match(ch, /width:35mm;height:auto/);
    assert.doesNotMatch(ch, />Deutschland</);
    const de = await H.buildBeitragLetterForPayment({ member: { vorname: 'U', nachname: 'M', strasse: 'S 1', plz: 'DE-79618', ort: 'R' },
        payment, settings: SETTINGS, kassier: KASSIER });
    assert.match(de, /top:60mm;left:22mm;/);
    assert.match(de, /width:30mm;height:auto/);
    assert.match(de, />79618 R</);
    assert.match(de, />Deutschland</);
});

test('Brief nach Deutschland ohne QR-Zahlteil, mit Zahlungsangaben als Text', async () => {
    const member = { vorname: 'U', nachname: 'M', strasse: 'S 1', plz: 'DE-79618', ort: 'R' };
    const de = await H.buildBeitragLetterForPayment({ member, payment: { reference_nr: '123', amount: 25 }, settings: SETTINGS, kassier: KASSIER });
    assert.doesNotMatch(de, /Zahlteil|Empfangsschein|Vor der Einzahlung abzutrennen/);
    assert.match(de, /Zahlungsangaben/);
    assert.match(de, /CH64 3076 9442 4924 3200 1/);
    assert.match(de, /CHF 25\.00/);
    assert.match(de, /baldige Überweisung \(Zahlungsangaben unten\), Ref\. Nr\./);
    const ch = await H.buildBeitragLetterForPayment({ member: { ...member, plz: '4303' }, payment: { reference_nr: '123', amount: 25 }, settings: SETTINGS, kassier: KASSIER });
    assert.match(ch, /Zahlteil/);
    assert.match(ch, /beiliegendem\s+Einzahlungsschein/);
});
