const { test } = require('node:test');
const assert = require('node:assert');
const Q = require('../src/qr-zahlung');
const { zahlteilMail } = require('../src/pingen-spesen');

const z = {
    iban: 'CH93 0076 2011 6238 5295 7', name: 'Pia Muster', strasse: 'Hauptstrasse 12a', plz: '4303',
    ort: 'Kaiseraugst', betrag: 22.3, mitteilung: 'Spesen: Porto – Pingen',
};

test('Inhalt nach SIX: 31 Zeilen wie in der App (qr_zahlung_test.dart)', () => {
    assert.equal(Q.fehlt(z), null);
    const zeilen = Q.inhalt(z).split('\n');
    assert.equal(zeilen.length, 31);
    assert.deepEqual(zeilen.slice(0, 11), ['SPC', '0200', '1', 'CH9300762011623852957',
        'S', 'Pia Muster', 'Hauptstrasse', '12a', '4303', 'Kaiseraugst', 'CH']);
    assert.deepEqual(zeilen.slice(11, 18), Array(7).fill(''));
    assert.deepEqual(zeilen.slice(18, 20), ['22.30', 'CHF']);
    assert.deepEqual(zeilen.slice(20, 27), Array(7).fill(''));
    assert.deepEqual(zeilen.slice(27), ['NON', '', 'Spesen: Porto - Pingen', 'EPD']);
});

test('kein QR-Code: Ausland, ohne Adresse, falsche Pruefziffer', async () => {
    assert.match(Q.fehlt({ ...z, iban: 'DE89370400440532013000' }), /Schweizer/);
    assert.match(Q.fehlt({ ...z, plz: null }), /PLZ/);
    assert.match(Q.fehlt({ ...z, iban: 'CH9300762011623852958' }), /IBAN/);
    assert.equal(await Q.anhang({ ...z, ort: '' }), null);
});

test('Zahlteil: Ueberschriften nach SIX, Betrag mit Tausender-Leerzeichen', () => {
    const h = Q.zahlteilHtml({ ...z, betrag: 1590 });
    for (const t of ['Zahlteil', 'Währung', 'Betrag', 'Konto / Zahlbar an', 'Zusätzliche Informationen',
        'Zahlbar durch (Name/Adresse)']) assert.ok(h.includes(t), t);
    assert.ok(h.includes('1 590.00'));
    assert.ok(h.includes('CH93 0076 2011 6238 5295 7'));
    assert.ok(h.includes('Hauptstrasse 12a'));
    // Ohne Betrag: Feld zum Ausfuellen (Ecken) bei Betrag und Zahlbar durch.
    assert.equal(Q.zahlteilHtml({ ...z, betrag: null }).split('<path d="M0 3V0H3').length - 1, 2);
});

test('Strasse, PLZ und Land', () => {
    assert.deepEqual(Q.strasseTeilen('Im Kleinen Feld 3 b'), { strasse: 'Im Kleinen Feld', nummer: '3b' });
    assert.deepEqual(Q.strasseTeilen('Postfach'), { strasse: 'Postfach', nummer: '' });
    assert.deepEqual(Q.plzUndLand('DE-79618'), { plz: '79618', land: 'DE' });
    assert.deepEqual(Q.plzUndLand('9490'), { plz: '9490', land: 'LI' });
    assert.equal(Q.plzUndLand('79618'), null);
});

test('Anhang: ganzer Zahlteil als PNG mit cid fuer die Mail', async () => {
    const a = await Q.anhang(z);
    assert.equal(a.cid, 'qr-zahlteil');
    assert.equal(a.contentType, 'image/png');
    assert.deepEqual([...a.content.subarray(1, 4)].map(c => String.fromCharCode(c)).join(''), 'PNG');
    if (process.env.QR_BILD) require('fs').writeFileSync(process.env.QR_BILD, a.content);
});

test('Pingen-Abrechnung: Zahlteil an den Aktuar, ohne IBAN keiner', async () => {
    const mail = { subject: 'Spesenabrechnung Pingen 05.11.2026: 2 Briefe, CHF 3.26', text: 'Hallo <Kassier>\nTotal', summe: 3.26 };
    const aktuar = { vorname: 'Pia', nachname: 'Muster', iban: 'CH9300762011623852957', strasse: 'Weg 1', plz: '4303', ort: 'K' };
    const m = await zahlteilMail(mail, aktuar);
    assert.equal(m.attachments.length, 1);
    assert.match(m.html, /Hallo &lt;Kassier&gt;<br>Total/);
    assert.match(m.html, /cid:qr-zahlteil/);
    assert.equal(m.attachments[0].zahlteil, undefined);
    assert.deepEqual(await zahlteilMail(mail, { ...aktuar, iban: null }), {});
});
