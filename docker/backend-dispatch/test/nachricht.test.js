// Nachricht-Versand: Brief-/E-Mail-Layout im Backend und POST /dispatch/brief
// (ohne Datenbank und Puppeteer - beides wird nachgebaut).
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/nachricht-layout');
const { briefErstellen, briefProtokollieren, variablenEinsetzen } = require('../src/nachricht-routen');

const ERIKA = {
    id: '11111111-2222-3333-4444-555555555555',
    anrede: 'Frau',
    vorname: 'Erika',
    nachname: 'Muster',
    strasse: 'Hauptstrasse 5',
    adresszusatz: null,
    plz: '4303',
    ort: 'Kaiseraugst',
    email: 'erika@example.ch'
};
const AKTUAR = { vorname: 'Anna', nachname: 'Aktuar', strasse: 'Weg 1', plz: '4302', ort: 'Augst' };

test('Platzhalter: bekannte ersetzt, unbekannte bleiben, $& unschaedlich', () => {
    assert.equal(L.platzhalterErsetzen('Liebe {{vorname}} {{ nachname }}', ERIKA), 'Liebe Erika Muster');
    assert.equal(L.platzhalterErsetzen('{{event_title}}', ERIKA), '{{event_title}}');
    assert.equal(L.platzhalterErsetzen('{{vorname}}', { vorname: '$&x' }), '$&x');
    assert.equal(L.platzhalterErsetzen('{{ort}}', {}), '');
});

test('Text -> Absaetze, HTML escaped, Links klickbar', () => {
    assert.equal(L.textZuHtml('a <b>\n\nhttps://fwv-raura.ch'),
        '<p>a &lt;b&gt;</p><p>&nbsp;</p><p><a href="https://fwv-raura.ch">https://fwv-raura.ch</a></p>');
});

test('Adresse: CH rechts, DE mit Laenderzeile und PLZ ohne Praefix', () => {
    assert.deepEqual(L.adressZeilen(ERIKA), ['Erika Muster', 'Hauptstrasse 5', '4303 Kaiseraugst']);
    const de = { ...ERIKA, plz: 'DE-79618', ort: 'Rheinfelden', adresszusatz: 'c/o Meier' };
    assert.deepEqual(L.adressZeilen(de),
        ['Erika Muster', 'Hauptstrasse 5', 'c/o Meier', '79618 Rheinfelden', 'Deutschland']);
    assert.deepEqual(L.empfaenger(de),
        { name: 'Erika Muster', street: 'Hauptstrasse 5', zip: '79618', city: 'Rheinfelden', country: 'DE' });
    assert.equal(L.empfaenger(ERIKA).country, 'CH');
    assert.equal(L.hatPostadresse({ ...ERIKA, ort: ' ' }), false);
});

test('Absender aus dem Aktuar, sonst Vereinszeile', () => {
    assert.equal(L.absenderZeile(AKTUAR), 'A. Aktuar, Weg 1, 4302 Augst');
    assert.equal(L.absenderZeile(null), 'Aktuar des Feuerwehrverein Raura');
});

test('Brief: Kopf, Fenster, Betreff, Text mit Platzhaltern, escaped', () => {
    const html = L.briefHtml({
        betreff: 'GV für {{vorname}}',
        text: 'Liebe {{vorname}}\n<script>',
        mitglied: { ...ERIKA, vorname: 'Eri<ka>' },
        absender: 'A. Aktuar, Weg 1, 4302 Augst',
        datum: new Date(2026, 9, 14)
    });
    assert.match(html, /top:45mm;left:118mm;/);
    assert.match(html, /Kaiseraugst, 14\.10\.2026/);
    assert.match(html, /GV für Eri&lt;ka&gt;/);
    assert.match(html, /<p>Liebe Eri&lt;ka&gt;<\/p><p>&lt;script&gt;<\/p>/);
    assert.match(html, /<div>Eri&lt;ka&gt; Muster<\/div>/);
    assert.doesNotMatch(html, /<script>/);
    const de = L.briefHtml({ betreff: '', text: 'x', mitglied: { ...ERIKA, plz: '79618' }, absender: '' });
    assert.match(de, /top:40mm;left:20mm;/);
});

test('E-Mail: Layout mit Betreff und Text', () => {
    const html = L.emailHtml({ betreff: 'Hallo {{vorname}}', text: 'Text', mitglied: ERIKA, absender: 'X' });
    assert.match(html, /Hallo Erika/);
    assert.match(html, /<p>Text<\/p>/);
    assert.match(html, /Der Vorstand/);
});

test('variablenEinsetzen: Text roh, HTML escaped, fehlende bleiben', () => {
    assert.equal(variablenEinsetzen('Hi {{vorname}} {{x}}', { vorname: 'A&B' }), 'Hi A&B {{x}}');
    assert.equal(variablenEinsetzen('<p>{{vorname}}</p>', { vorname: '<A>' }, true), '<p>&lt;A&gt;</p>');
    assert.equal(variablenEinsetzen(undefined, { a: 1 }), undefined);
});

// --- POST /dispatch/brief ---------------------------------------------------

function falschePool(mitglieder) {
    const abfragen = [];
    return {
        abfragen,
        query: async (sql, params) => {
            abfragen.push({ sql, params });
            if (/funktion ILIKE '%aktuar%'/.test(sql)) return { rows: [AKTUAR] };
            if (/FROM members WHERE id/.test(sql)) return { rows: mitglieder.filter(m => m.id === params[0]) };
            return { rows: [] };
        }
    };
}

async function aufrufen(handler, body) {
    let status = 200;
    let json;
    const res = {
        status(s) { status = s; return this; },
        json(j) { json = j; return this; }
    };
    await handler({ body }, res);
    return { status, json };
}

test('POST /dispatch/brief: HTML, Rand und Empfaenger fuer send-post', async () => {
    const pool = falschePool([ERIKA]);
    let gerendert = 0;
    const handler = briefErstellen({ pool, vorschauPdf: async () => { gerendert++; return Buffer.from('%PDF'); } });

    const { status, json } = await aufrufen(handler, { subject: 'Info {{nachname}}', body: 'Hallo {{vorname}}', member_id: ERIKA.id });
    assert.equal(status, 200);
    assert.deepEqual(json.pdf_margin, L.BRIEF_RAND);
    assert.deepEqual(json.recipient, L.empfaenger(ERIKA));
    assert.equal(json.subject, 'Info Muster');
    assert.match(json.html, /<p>Hallo Erika<\/p>/);
    assert.match(json.html, /A\. Aktuar, Weg 1, 4302 Augst/);
    assert.equal(json.pdf_base64, undefined);
    assert.equal(gerendert, 0);

    const mitVorschau = await aufrufen(handler, { subject: '', body: 'x', member_id: ERIKA.id, vorschau: true, zonen: true });
    assert.equal(mitVorschau.json.pdf_base64, Buffer.from('%PDF').toString('base64'));
    assert.equal(mitVorschau.json.subject, 'Brief');
    assert.equal(gerendert, 1);
});

test('POST /dispatch/brief: Fehlerfaelle', async () => {
    const ohneAdresse = { ...ERIKA, id: '99999999-2222-3333-4444-555555555555', strasse: '' };
    const handler = briefErstellen({ pool: falschePool([ERIKA, ohneAdresse]), vorschauPdf: async () => Buffer.alloc(0) });
    assert.equal((await aufrufen(handler, { body: 'x', member_id: 'abc' })).status, 400);
    assert.equal((await aufrufen(handler, { body: ' ', member_id: ERIKA.id })).status, 400);
    assert.equal((await aufrufen(handler, { body: 'x', member_id: '00000000-0000-0000-0000-000000000000' })).status, 404);
    const r = await aufrufen(handler, { body: 'x', member_id: ohneAdresse.id });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'Mitglied hat keine vollständige Adresse');
});

test('briefProtokollieren: Eintrag pingen, Staging markiert, Fehler still', async () => {
    const pool = falschePool([]);
    await briefProtokollieren(pool, {
        memberId: ERIKA.id, recipient: L.empfaenger(ERIKA), subject: 'GV', letterId: 'L1', staging: true
    });
    const { sql, params } = pool.abfragen[0];
    assert.match(sql, /INSERT INTO dispatch_log/);
    assert.match(sql, /'pingen'/);
    assert.equal(params[0], ERIKA.id);
    assert.equal(params[2], '[Staging] GV');
    assert.equal(params[3], 'L1');

    await briefProtokollieren({ query: async () => { throw new Error('weg'); } }, { subject: 'x' });
});
