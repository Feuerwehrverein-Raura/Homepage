// Spesen (src/spesen.js): IBAN, Eingabe pruefen, Mails an Kassier und Mitglied.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/spesen');

const IBAN = 'CH93 0076 2011 6238 5295 7';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');
const HEUTE = new Date('2026-11-03T12:00:00Z');

const gut = (anders = {}) => ({
    betrag: '23,50', datum: '2026-11-02', zweck: 'Einkauf Chilbi Brot', kategorie: 'Einkauf',
    beleg_base64: PNG, beleg_typ: 'image/png', beleg_name: 'Quittung Coop.png', ...anders
});

test('IBAN: Pruefziffer, Leerzeichen, Anzeige', () => {
    assert.ok(S.ibanGueltig(IBAN));
    assert.ok(S.ibanGueltig('de89370400440532013000'));
    assert.ok(!S.ibanGueltig('CH93 0076 2011 6238 5295 8'));
    assert.ok(!S.ibanGueltig(''));
    assert.equal(S.ibanText('ch9300762011623852957'), 'CH93 0076 2011 6238 5295 7');
});

test('Eingabe: gueltig, Betrag mit Komma, Beleg als Buffer', () => {
    const p = S.eingabePruefen(gut(), { iban: IBAN, heute: HEUTE });
    assert.equal(p.fehler, undefined);
    assert.equal(p.wert.betrag, 23.5);
    assert.equal(p.wert.iban, 'CH9300762011623852957');
    assert.ok(Buffer.isBuffer(p.wert.beleg));
    assert.equal(p.wert.event_id, null);
});

test('Eingabe: Fehler mit verstaendlichem Text', () => {
    const f = (body, iban = IBAN) => S.eingabePruefen(body, { iban, heute: HEUTE }).fehler;
    assert.match(f(gut(), null), /IBAN im Profil/);
    assert.match(f(gut({ betrag: '0' })), /Betrag/);
    assert.match(f(gut({ datum: '2026-12-24' })), /Zukunft/);
    assert.match(f(gut({ zweck: 'x' })), /wofür/);
    assert.match(f(gut({ kategorie: 'Bier' })), /Kategorie/);
    assert.match(f(gut({ beleg_base64: '' })), /Beleg fehlt/);
    assert.match(f(gut({ beleg_typ: 'image/gif' })), /PDF, JPG oder PNG/);
    assert.match(f(gut({ event_id: 'abc' })), /Anlass/);
});

test('Mail an den Kassier nennt Betrag, Zweck, Anlass und IBAN', () => {
    const m = S.kassierMail({ betrag: '23.50', datum: '2026-11-02', zweck: 'Brot', kategorie: 'Einkauf', iban: 'CH9300762011623852957' },
        { mitglied: { vorname: 'Anna', nachname: 'Muster' }, anlass: 'Chilbi 2026' });
    assert.equal(m.to, 'kassier@fwv-raura.ch');
    assert.equal(m.subject, 'Spesen CHF 23.50: Anna Muster – Brot');
    assert.match(m.body, /Anlass:\s+Chilbi 2026/);
    assert.match(m.body, /CH93 0076 2011 6238 5295 7 \(Anna Muster\)/);
});

test('Mail an den Kassier: Angaben fuer den QR-Code (api-dispatch)', () => {
    const m = S.kassierMail({ betrag: '23.50', datum: '2026-11-02', zweck: 'Brot', kategorie: 'Einkauf', iban: 'CH9300762011623852957' },
        { mitglied: { vorname: 'Anna', nachname: 'Muster', strasse: 'Hauptstrasse 12', plz: '4303', ort: 'Kaiseraugst' } });
    assert.deepEqual(m.zahlteil, {
        iban: 'CH9300762011623852957', name: 'Anna Muster', strasse: 'Hauptstrasse 12', plz: '4303',
        ort: 'Kaiseraugst', betrag: 23.5, mitteilung: 'Spesen: Brot',
    });
});

test('Mail ans Mitglied: bezahlt mit IBAN, abgelehnt mit Begruendung, an versand_email', () => {
    const s = { betrag: 23.5, datum: '2026-11-02', zweck: 'Brot', iban: 'CH9300762011623852957' };
    const mitglied = { vorname: 'Anna', email: 'a@x.ch', versand_email: 'anna@x.ch' };
    const b = S.erledigtMail({ ...s, status: 'bezahlt' }, { mitglied });
    assert.equal(b.to, 'anna@x.ch');
    assert.match(b.subject, /^Spesen ausbezahlt: CHF 23.50/);
    assert.match(b.body, /CH93 0076/);
    const a = S.erledigtMail({ ...s, status: 'abgelehnt', grund: 'Kein Vereinseinkauf' }, { mitglied: { vorname: 'Anna', email: 'a@x.ch' } });
    assert.equal(a.to, 'a@x.ch');
    assert.match(a.body, /Begründung: Kein Vereinseinkauf/);
});
