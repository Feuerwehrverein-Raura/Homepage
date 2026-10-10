// Prueft, dass die Website den Arbeitsplan aus dem Backend-Vertrag richtig
// zeichnet (docker/frontend-website/scripts/arbeitsplan.js).
//
// Liegt bewusst nicht im Website-Ordner: der wird als Ganzes in den
// nginx-Container kopiert und waere oeffentlich abrufbar.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const plan = JSON.parse(fs.readFileSync(
    path.join(root, 'docker/backend-events/test/fixtures/arbeitsplan.json'), 'utf8'));

// Das Skript ist ein klassisches Browser-Skript mit globalen Funktionen.
const sandbox = {};
vm.runInNewContext(fs.readFileSync(
    path.join(root, 'docker/frontend-website/scripts/arbeitsplan.js'), 'utf8'), sandbox);
const { zeichneArbeitsplan } = sandbox;

const zeilenVon = html => [...html.matchAll(/<tr class="border-b border-gray-300">(.*?)<\/tr>/gs)].map(m => m[1]);
const zellenVon = zeile => [...zeile.matchAll(/<td([^>]*)>(.*?)<\/td>/gs)].map(m => ({ attr: m[1], inhalt: m[2] }));

test('Kopf mit Verein und Titel', () => {
    const html = zeichneArbeitsplan(plan);
    assert.match(html, /Feuerwehrverein Raura, Kaiseraugst/);
    assert.match(html, /Arbeitsplan Chilbi/);
});

test('pro Tag eine Tabelle mit Zeit + allen Bereichen als Spalten', () => {
    const html = zeichneArbeitsplan(plan);
    assert.equal((html.match(/<table/g) || []).length, plan.tage.length);
    for (const tag of plan.tage) assert.ok(html.includes(tag.bezeichnung));
    const kopf = [...html.matchAll(/<th\b[^>]*>(.*?)<\/th>/g)].map(m => m[1]).slice(0, 4);
    assert.deepEqual(kopf, ['Zeit', ...plan.bereiche]);
});

test('Zellen: null schwarz, Namen mit Strich, offene Plaetze als graue Striche', () => {
    const zeilen = zeilenVon(zeichneArbeitsplan(plan));
    const alle = plan.tage.flatMap(t => t.zeilen);
    assert.equal(zeilen.length, alle.length);

    zeilen.forEach((zeile, z) => {
        const [zeit, ...zellen] = zellenVon(zeile);
        assert.equal(zeit.inhalt, alle[z].zeit);
        zellen.forEach((zelle, i) => {
            const soll = alle[z].zellen[i];
            if (soll === null) {
                assert.match(zelle.attr, /bg-gray-900/);
                return;
            }
            const namen = [...zelle.inhalt.matchAll(/<div>-(.*?)<\/div>/g)].map(m => m[1]);
            const striche = (zelle.inhalt.match(/text-gray-400">-</g) || []).length;
            assert.deepEqual(namen, soll.besetzt);
            assert.equal(striche, soll.offen);
        });
    });
});

test('Namen werden maskiert', () => {
    const boese = structuredClone(plan);
    boese.tage[0].zeilen[1].zellen[1].besetzt = ['<img src=x onerror=alert(1)>'];
    const html = zeichneArbeitsplan(boese);
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('&lt;img'));
});

test('ohne Tage: Hinweis statt leerer Tabelle', () => {
    assert.match(zeichneArbeitsplan({ ...plan, tage: [] }), /Keine Schichten/);
    assert.match(zeichneArbeitsplan(null), /Keine Schichten/);
});

// Handy-Ansicht: keine breite Tabelle, sondern Karten pro Zeitfenster.

test('Handy: Tabelle nur ab md, Liste nur darunter', () => {
    const html = zeichneArbeitsplan(plan);
    assert.equal((html.match(/hidden md:block overflow-x-auto/g) || []).length, plan.tage.length);
    assert.equal((html.match(/class="md:hidden space-y-3"/g) || []).length, plan.tage.length);
});

test('Handy: eine Karte pro Zeitfenster, nur Bereiche mit Schicht', () => {
    const html = zeichneArbeitsplan(plan);
    const karten = (html.match(/class="arbeitsplan-karte/g) || []).length;
    assert.equal(karten, plan.tage.flatMap(t => t.zeilen).filter(z => z.zellen.some(Boolean)).length);

    // 17.10. 10:00-14:00: nur Grill, leer mit 1 freien Platz
    assert.match(html, /10:00–14:00 Uhr<\/div><div class="mb-2 last:mb-0"><div[^>]*>Grill<\/div><div><span class="text-gray-400">noch niemand<\/span> · <span class="text-orange-600">1 Platz frei<\/span>/);
    // 17.10. 18:00-22:00: Bar mit Anna, 1 frei — die leeren Bereiche erscheinen nicht
    assert.match(html, /18:00–22:00 Uhr<\/div><div class="mb-2 last:mb-0"><div[^>]*>Bar<\/div><div>Anna A · <span class="text-orange-600">1 Platz frei<\/span>/);
    // 18.10.: ueberbucht — Namen, kein "frei"
    assert.match(html, />Allgemein<\/div><div>Bea B, Cem C<\/div>/);
});
