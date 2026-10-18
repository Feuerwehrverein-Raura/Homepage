// Tischkarten (src/tischkarten.ts). npm test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tischkartenBereich, tischkarteXml } from '../src/tischkarten.js';

test('Bereich', () => {
  assert.deepEqual(tischkartenBereich(1, 20), { von: 1, bis: 20 });
  assert.deepEqual(tischkartenBereich('5', undefined), { von: 5, bis: 5 });
  assert.equal(typeof tischkartenBereich(0, 3), 'string');
  assert.equal(typeof tischkartenBereich(10, 3), 'string');
  assert.equal(typeof tischkartenBereich(1, 100), 'string');
  assert.equal(typeof tischkartenBereich(1.5, 3), 'string');
});

test('Karte: grosse Nummer, Schnitt, kein QR', () => {
  const x = tischkarteXml(12, '', 'Chilbi <2026>');
  assert.match(x, /width="8" height="8"\/>\s*<text>12&#10;/);
  assert.match(x, /<cut type="feed"\/>/);
  assert.doesNotMatch(x, /qrcode|symbol/);
  assert.doesNotMatch(x, /<2026>/);
});
