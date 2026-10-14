// Datum, Zeit und Kosten auf der Anlass-Seite
// (docker/frontend-website/scripts/anlass-format.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const sandbox = {};
vm.runInNewContext(fs.readFileSync(
    path.join(root, 'docker/frontend-website/scripts/anlass-format.js'), 'utf8'), sandbox);
const { anlassZeitraum, anlassZeiten, anlassKosten, anlassIstMehrtaegig } = sandbox;

const d = (j, m, t, h = 0, min = 0) => new Date(j, m - 1, t, h, min);

test('Chilbi ueber mehrere Tage zeigt den Zeitraum', () => {
    const start = d(2026, 10, 14, 17), ende = d(2026, 10, 19, 22);
    assert.equal(anlassIstMehrtaegig(start, ende), true);
    assert.equal(anlassZeitraum(start, ende), 'Mi 14. – Mo 19. Oktober 2026');
    assert.equal(anlassZeiten(start, ende), 'Mi 17:00 – Mo 22:00');
});

test('ueber Monats- und Jahresgrenze', () => {
    assert.equal(anlassZeitraum(d(2026, 9, 30, 10), d(2026, 10, 2, 16)), 'Mi 30. September – Fr 2. Oktober 2026');
    assert.equal(anlassZeitraum(d(2026, 12, 31, 10), d(2027, 1, 2, 16)), 'Do 31. Dezember 2026 – Sa 2. Januar 2027');
});

test('ein Tag und Nacht bis in den Morgen bleiben ein Tag', () => {
    assert.equal(anlassZeitraum(d(2026, 11, 28, 18), d(2026, 11, 28, 22)), 'Samstag, 28. November 2026');
    assert.equal(anlassZeiten(d(2026, 11, 28, 18), d(2026, 11, 28, 22)), '18:00 – 22:00');
    const start = d(2026, 2, 13, 19), ende = d(2026, 2, 14, 1);
    assert.equal(anlassIstMehrtaegig(start, ende), false);
    assert.equal(anlassZeitraum(start, ende), 'Freitag, 13. Februar 2026');
    assert.equal(anlassZeiten(start, ende), '19:00 – 01:00');
});

test('ohne gueltiges Ende nur der Beginn', () => {
    assert.equal(anlassZeitraum(d(2026, 5, 16, 17), null), 'Samstag, 16. Mai 2026');
    assert.equal(anlassZeiten(d(2026, 5, 16, 17), d(2026, 5, 16, 17)), '17:00');
    assert.equal(anlassZeitraum(new Date('x'), null), '');
});

test('Kosten in Schweizer Schreibweise', () => {
    assert.equal(anlassKosten('25'), 'CHF 25.–');
    assert.equal(anlassKosten(25), 'CHF 25.–');
    assert.equal(anlassKosten('12.5'), 'CHF 12.50');
    assert.equal(anlassKosten('12,50'), 'CHF 12.50');
    assert.equal(anlassKosten('CHF 30'), 'CHF 30.–');
    assert.equal(anlassKosten('30.-'), 'CHF 30.–');
    assert.equal(anlassKosten('Fr. 8.50'), 'CHF 8.50');
    for (const leer of [null, undefined, '', '  ', '0', '0.00']) {
        assert.equal(anlassKosten(leer), 'Kostenlos', String(leer));
    }
    // Freier Text bleibt
    assert.equal(anlassKosten('CHF 98.– pro Person'), 'CHF 98.– pro Person');
    assert.equal(anlassKosten('Kostenlos'), 'Kostenlos');
});
