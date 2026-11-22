// Offene Beitraege (src/beitraege.js): Referenz, QR-Inhalt, Ausgabe fuer die App.
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../src/beitraege');

const PIA = { vorname: 'Pia', nachname: 'Muster', strasse: 'Hauptstrasse 12a', plz: '4303', ort: 'Kaiseraugst' };

test('Referenz: gueltig, 27 Stellen, formatiert', () => {
    assert.ok(B.referenzGueltig('12345'));
    assert.ok(!B.referenzGueltig(''));
    assert.ok(!B.referenzGueltig('0000'));
    assert.equal(B.referenz27('12 345'), '000000000000000000000012345');
    assert.equal(B.referenzFormatiert(B.referenz27('12345')), '00 00000 00000 00000 00000 12345');
});

test('QR-Inhalt wie auf dem Beitragsbrief: 31 Zeilen, QRR, EPD', () => {
    const z = B.qrInhalt({ betrag: 50, r27: B.referenz27('12345'), jahr: 2026, mitglied: PIA }).split('\n');
    assert.equal(z.length, 31);
    assert.deepEqual(z.slice(0, 11), ['SPC', '0200', '1', B.BEITRAG_IBAN,
        'S', 'Feuerwehrverein Raura', 'Marksteinweg 12', '', '4304', 'Giebenach', 'CH']);
    assert.deepEqual(z.slice(18, 20), ['50.00', 'CHF']);
    assert.deepEqual(z.slice(20, 27), ['S', 'Muster Pia', 'Hauptstrasse 12a', '', '4303', 'Kaiseraugst', 'CH']);
    assert.deepEqual(z.slice(27), ['QRR', '000000000000000000000012345',
        'Mitgliederbeitrag 2026//Ref. 12345 - Muster Pia', 'EPD']);
});

test('fuer die App: mit Referenz QR-Code, ohne nur Hinweis', () => {
    const mit = B.beitragFuerApp({ id: 'p1', year: 2026, amount: '50.00', reference_nr: '12345',
        due_date: new Date('2026-12-31T00:00:00Z') }, PIA);
    assert.equal(mit.jahr, 2026);
    assert.equal(mit.betrag, 50);
    assert.equal(mit.faellig, '2026-12-31');
    assert.equal(mit.iban, 'CH64 3076 9442 4924 3200 1');
    assert.equal(mit.referenz, '00 00000 00000 00000 00000 12345');
    assert.ok(mit.qr_inhalt.startsWith('SPC\n'));

    const ohne = B.beitragFuerApp({ id: 'p2', year: 2025, amount: '50', reference_nr: '' }, PIA);
    assert.equal(ohne.referenz, null);
    assert.equal(ohne.qr_inhalt, null);
    assert.equal(ohne.faellig, null);
    assert.equal(ohne.mitteilung, 'Mitgliederbeitrag 2025');
});

test('Route: nur eigene offene, Ehrenmitglied nichts, fehlende Tabelle leer', async () => {
    const routen = {};
    const app = { get: (pfad, _auth, f) => { routen[pfad] = f; } };
    let mitglied = { id: 'm1', status: 'Aktivmitglied', ...PIA };
    let abfrage = async (_sql, werte) => {
        assert.deepEqual(werte, ['m1']);
        return { rows: [{ id: 'p1', year: 2026, amount: '50.00', reference_nr: '12345', due_date: null }] };
    };
    B.beitraegeRouten(app, {
        pool: { query: (...a) => abfrage(...a) },
        mitgliedAuth: () => {},
        mitgliedZurAnmeldung: async () => mitglied
    });
    const aufruf = async () => {
        let antwort;
        await routen['/members/me/beitraege']({}, {
            status() { return this; },
            json(d) { antwort = d; }
        });
        return antwort;
    };

    assert.equal((await aufruf()).length, 1);

    mitglied = { ...mitglied, status: 'Ehrenmitglied' };
    assert.deepEqual(await aufruf(), []);

    mitglied = { ...mitglied, status: 'Passivmitglied' };
    abfrage = async () => { throw Object.assign(new Error('fehlt'), { code: '42P01' }); };
    assert.deepEqual(await aufruf(), []);
});
