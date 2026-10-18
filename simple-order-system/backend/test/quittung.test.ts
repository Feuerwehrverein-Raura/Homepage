// Quittung (src/quittung.ts). npm test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { postenZusammenfassen, quittungXml, zeile } from '../src/quittung.js';

test('Posten zusammenfassen', () => {
  const l = postenZusammenfassen([
    { name: 'Bier Warteck 3dl', preis: 4.5, menge: 2 },
    { name: 'Pommes', preis: 4, menge: 1 },
    { name: 'Bier Warteck 3dl', preis: 4.5, menge: 3 },
  ]);
  assert.deepEqual(l.map((p) => `${p.menge}x ${p.name}`), ['5x Bier Warteck 3dl', '1x Pommes']);
});

test('Zeile auf Bonbreite', () => {
  assert.equal(zeile('TOTAL CHF', '230.00').length, 42);
  assert.equal(zeile('x'.repeat(60), '1.00').length, 42);
});

test('Quittung mit Anzahlung zeigt Offen', () => {
  const x = quittungXml({ tisch: 1, posten: [{ name: 'Pommes', preis: 4, menge: 2 }], bezahlt: 3, zeit: new Date(), logoXml: '' });
  assert.match(x, /QUITTUNG/);
  assert.match(x, /TOTAL CHF\s+8\.00/);
  assert.match(x, /OFFEN CHF\s+5\.00/);
  assert.match(x, /<cut type="feed"\/>/);
});
