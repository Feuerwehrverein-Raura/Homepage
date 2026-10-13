// E-Mails zu Anlaessen: HTML-Fassung mit Logo nur, wenn der Anlass eines hat;
// alle Werte escaped, Textfassung bleibt erhalten.

const test = require('node:test');
const assert = require('node:assert/strict');
const { escapeHtml, textZuHtml, anlassMailHtml, mitAnlassLogo } = require('../src/anlass-mail');

test('escapeHtml escaped alle heiklen Zeichen', () => {
    assert.equal(escapeHtml(`<b>"A" & 'B'</b>`), '&lt;b&gt;&quot;A&quot; &amp; &#39;B&#39;&lt;/b&gt;');
    assert.equal(escapeHtml(null), '');
});

test('textZuHtml: Links klickbar, Zeilenumbrueche, kein <br> in der URL', () => {
    assert.equal(textZuHtml('Hallo\nhttps://fwv-raura.ch/x?a=1&b=2\nEnde'),
        'Hallo<br><a href="https://fwv-raura.ch/x?a=1&amp;b=2">https://fwv-raura.ch/x?a=1&amp;b=2</a><br>Ende');
});

test('Anlass mit Reihen-Logo: Bild oben, 96 px, alt = Anlassname', () => {
    const html = anlassMailHtml({ title: 'Chilbi 2026' }, 'Guten Tag\nBis bald');
    assert.match(html, /<img src="https:\/\/www\.fwv-raura\.ch\/images\/anlaesse\/chilbi\.png" alt="Chilbi 2026" width="96" height="96"/);
    assert.ok(html.indexOf('<img') < html.indexOf('Guten Tag'));
    assert.match(html, /Guten Tag<br>Bis bald/);
});

test('Anlass ohne Logo: kein HTML', () => {
    assert.equal(anlassMailHtml({ title: 'Rega Basel' }, 'Text'), null);
    assert.equal(anlassMailHtml(null, 'Text'), null);
});

test('Titel und Text werden escaped', () => {
    const html = anlassMailHtml({ title: 'Chilbi <script>alert(1)</script>' },
        'Name: <img src=x onerror=alert(1)>\nNotiz: "a" & b');
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img src=x'));
    assert.match(html, /alt="Chilbi &lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
    assert.match(html, /Notiz: &quot;a&quot; &amp; b/);
});

test('Eigenes Bild geht vor und landet escaped im src', () => {
    const html = anlassMailHtml({ title: 'Grillabend', image_url: 'https://x.ch/a.png?q="1"' }, 'T');
    assert.match(html, /src="https:\/\/x\.ch\/a\.png\?q=&quot;1&quot;"/);
});

test('mitAnlassLogo: ergaenzt html, laesst Text und Rest unveraendert', () => {
    const nutzlast = { to: 'a@b.ch', subject: 'S', body: 'Hallo', event_id: 7 };
    const mit = mitAnlassLogo({ title: 'Weihnachtshock 2026' }, nutzlast);
    assert.equal(mit.body, 'Hallo');
    assert.equal(mit.to, 'a@b.ch');
    assert.equal(mit.event_id, 7);
    assert.match(mit.html, /weihnachtshock\.png/);
    assert.equal(nutzlast.html, undefined, 'Original nicht veraendert');
});

test('mitAnlassLogo: ohne Logo oder mit vorhandenem html unveraendert', () => {
    const ohne = { to: 'a@b.ch', subject: 'S', body: 'Hallo' };
    assert.equal(mitAnlassLogo({ title: 'Rega Basel' }, ohne), ohne);
    const schon = { to: 'a@b.ch', subject: 'S', body: 'Hallo', html: '<p>x</p>' };
    assert.equal(mitAnlassLogo({ title: 'Chilbi' }, schon), schon);
});
