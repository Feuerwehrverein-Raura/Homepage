// Einladung zu einem Anlass (src/einladung-layout.js) und ihr Weg in Brief
// und E-Mail (nachricht-layout.js inhaltHtml, POST /dispatch/brief).
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/einladung-layout');
const L = require('../src/nachricht-layout');
const { briefErstellen, einladungInhalt } = require('../src/nachricht-routen');

const JASS = {
    id: 'b6b49b1c-376f-4566-ad4b-d6f2981d533f', slug: 'preisjassen2026', title: 'Preisjassen 2026',
    subtitle: null, description: 'Minimum 8 Teilnehmer.', location: 'Roter Schopf', category: 'Sonstiges',
    cost: '25', datum_offen: false, registration_required: true,
    start_date: '2026-11-28T18:00', end_date: '2026-11-28T22:00', registration_deadline: '2026-11-22T23:59'
};
const ERIKA = { id: '11111111-2222-3333-4444-555555555555', vorname: 'Erika', nachname: 'Muster',
    strasse: 'Hauptstrasse 5', plz: '4303', ort: 'Kaiseraugst' };

test('Wann: Ortszeit ohne Umrechnung, gleicher Tag mit Spanne, offenes Datum', () => {
    assert.equal(E.wannText(JASS), 'Samstag, 28. November 2026, 18:00–22:00 Uhr');
    assert.equal(E.wannText({ ...JASS, end_date: null }), 'Samstag, 28. November 2026, 18:00 Uhr');
    assert.equal(E.wannText({ ...JASS, end_date: '2026-11-29T02:00' }),
        'Samstag, 28. November 2026, 18:00 Uhr – Sonntag, 29. November 2026, 02:00 Uhr');
    assert.equal(E.wannText({ ...JASS, datum_offen: true }), 'Datum noch offen');
    assert.equal(E.schlussText(JASS), '22. November 2026');
});

test('Inhalt: Tabelle, Beschreibung, Link, Unterschriften, QR; escaped', () => {
    const html = E.einladungHtml({ anlass: { ...JASS, title: 'Jass <b>' }, introHtml: '<p>Hallo</p>',
        praesident: 'Pia Präsi', aktuar: 'Anna Aktuar', qr: 'data:image/png;base64,AA' });
    assert.match(html, /Jass &lt;b&gt;/);
    assert.match(html, /<p>Hallo<\/p>/);
    assert.match(html, /Minimum 8 Teilnehmer\./);
    assert.match(html, /Wann:<\/td><td style="font-weight:bold;">Samstag, 28\. November 2026, 18:00–22:00 Uhr/);
    assert.match(html, /Anmeldeschluss:<\/td><td[^>]*>22\. November 2026/);
    assert.match(html, /events\.html\?event=preisjassen2026/);
    assert.match(html, /Pia Präsi<\/div><div>Präsident/);
    assert.match(html, /<img src="data:image\/png;base64,AA"/);
    assert.match(html, /Wir freuen uns über zahlreiches Erscheinen/);
});

test('Helferaufruf nur bei Dorffest mit Schichten, nach Tag sortiert', () => {
    const schichten = [
        { date: '2026-08-02', start_time: '10:00:00', end_time: '12:00:00', bereich: 'Bar', needed: 2 },
        { date: '2026-08-01', start_time: '18:00:00', end_time: '20:00:00', bereich: 'Grill', needed: 3 }
    ];
    assert.equal(E.schichtBlock({ category: 'Sonstiges' }, schichten), '');
    const block = E.schichtBlock({ category: 'Dorffest' }, schichten);
    assert.match(block, /2 verschiedene Schichten<\/strong> mit zusammen\s+<strong>5 Helferschichten/);
    assert.ok(block.indexOf('Samstag, 01.08.2026') < block.indexOf('Sonntag, 02.08.2026'));
    assert.match(block, /Grill 18:00–20:00 \(3\)/);
    const html = E.einladungHtml({ anlass: { ...JASS, category: 'Dorffest' }, schichten });
    assert.match(html, /herzlichen Dank fürs Mitmachen/);
});

test('Platzhalter von Mitglied und Anlass in der Einleitung', async () => {
    const inhalt = await einladungInhalt(null, JASS.id, 'Hallo {{vorname}}, «{{event_title}}» am {{event_date}}',
        ERIKA, async () => ({ anlass: JASS, schichten: [], praesident: 'P', aktuar: 'A', qr: '' }));
    assert.match(inhalt, /Hallo Erika, «Preisjassen 2026» am Samstag, 28\. November 2026, 18:00–22:00 Uhr/);
    await assert.rejects(einladungInhalt(null, 'x', 't', ERIKA, async () => null), /Anlass nicht gefunden/);
});

test('Brief und E-Mail mit Einladung: eigener Titel und Gruss, kein Standard-Schluss', async () => {
    const brief = L.briefHtml({ betreff: 'Einladung', text: 'x', mitglied: ERIKA, absender: 'A', inhaltHtml: '<div>EINLADUNG</div>' });
    assert.match(brief, /EINLADUNG/);
    assert.doesNotMatch(brief, /Der Vorstand/);
    assert.doesNotMatch(brief, /font-size:13pt;">Einladung</);
    const mail = L.emailHtml({ betreff: 'Einladung', text: 'x', mitglied: ERIKA, absender: 'A', inhaltHtml: '<div>EINLADUNG</div>' });
    assert.match(mail, /EINLADUNG/);
    assert.doesNotMatch(mail, /Der Vorstand/);

    const pool = { query: async (sql, p) => (/FROM members WHERE id/.test(sql) ? { rows: [ERIKA] } : { rows: [] }) };
    const handler = briefErstellen({ pool, vorschauPdf: async () => Buffer.alloc(0),
        einladungDaten: async () => ({ anlass: JASS, schichten: [], praesident: 'P', aktuar: 'A', qr: '' }) });
    let json;
    await handler({ body: { member_id: ERIKA.id, subject: 'Einladung: Preisjassen 2026', body: 'Hallo {{vorname}}',
        vorlage: 'einladung', event_id: JASS.id } }, { status() { return this; }, json(j) { json = j; } });
    assert.match(json.html, /Preisjassen 2026<\/div>/);
    assert.match(json.html, /<p>Hallo Erika<\/p>/);
    assert.equal(json.subject, 'Einladung: Preisjassen 2026');
});

test('Editor-Text der Website: Formatierung bleibt, Skripte und Ereignisse weg, Platzhalter escaped', () => {
    const roh = '<h2>Hallo {{vorname}}</h2><p><strong>fett</strong> <a href="https://x.ch" onclick="boese()">Link</a></p>'
        + '<script>alert(1)</script><a href="javascript:alert(1)">x</a><iframe src="https://y"></iframe><ul><li>eins</li></ul>';
    const html = L.editorHtml(roh, { vorname: '<b>Eri</b>' });
    assert.match(html, /<h2>Hallo &lt;b&gt;Eri&lt;\/b&gt;<\/h2>/);
    assert.match(html, /<strong>fett<\/strong>/);
    assert.match(html, /<a href="https:\/\/x\.ch">Link<\/a>/);
    assert.match(html, /<ul><li>eins<\/li><\/ul>/);
    assert.doesNotMatch(html, /script|onclick|iframe|javascript:/i);
    const brief = L.briefHtml({ betreff: 'B', text: '', textHtml: '<p><em>schoen</em></p>', mitglied: ERIKA, absender: 'A' });
    assert.match(brief, /<p><em>schoen<\/em><\/p>/);
});

test('Einladung mit Editor-Einleitung: Anlass-Platzhalter escaped eingesetzt', async () => {
    const inhalt = await einladungInhalt(null, JASS.id, 'egal', ERIKA,
        async () => ({ anlass: { ...JASS, title: 'A & B' }, schichten: [], qr: '' }), '<p>Zum {{event_title}}, {{vorname}}</p>');
    assert.match(inhalt, /<p>Zum A &amp; B, Erika<\/p>/);
});

test('E-Mail-Vorschau: wie /email/bulk, Einladung mit Editor-Text', async () => {
    const { emailVorschau } = require('../src/nachricht-routen');
    const pool = { query: async (sql) => (/FROM members WHERE id/.test(sql) ? { rows: [{ ...ERIKA, email: 'e@x.ch' }] } : { rows: [] }) };
    const handler = emailVorschau({ pool, einladungDaten: async () => ({ anlass: JASS, schichten: [], qr: '' }) });
    let json;
    const res = { status() { return this; }, json(j) { json = j; } };
    await handler({ body: { member_id: ERIKA.id, subject: 'Hallo {{vorname}}', body: 'x', body_html: '<p><b>Hi</b> {{vorname}}</p>' } }, res);
    assert.equal(json.subject, 'Hallo Erika');
    assert.equal(json.to, 'e@x.ch');
    assert.match(json.html, /<p><b>Hi<\/b> Erika<\/p>/);
    await handler({ body: { member_id: ERIKA.id, subject: 'E', body: 'x', layout: 'einladung', event_id: JASS.id } }, res);
    assert.match(json.html, /Preisjassen 2026<\/div>/);
});
