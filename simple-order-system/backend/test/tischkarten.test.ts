// Tischkarten (src/tischkarten.ts). npm test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nummerBild, tischkartenBereich, tischkarteXml } from '../src/tischkarten.js';

test('Bereich', () => {
  assert.deepEqual(tischkartenBereich(1, 20), { von: 1, bis: 20 });
  assert.deepEqual(tischkartenBereich('5', undefined), { von: 5, bis: 5 });
  assert.equal(typeof tischkartenBereich(0, 3), 'string');
  assert.equal(typeof tischkartenBereich(10, 3), 'string');
  assert.equal(typeof tischkartenBereich(1, 100), 'string');
  assert.equal(typeof tischkartenBereich(1.5, 3), 'string');
});

test('Nummer als Bild: 4 cm hoch, dreistellig kleiner und in 72 mm', () => {
  const zwei = nummerBild(12)!;
  assert.equal(zwei.height, 320);
  assert.equal(Buffer.from(zwei.raster, 'base64').length, Math.ceil(zwei.width / 8) * zwei.height);
  const drei = nummerBild(123)!;
  assert.ok(drei.height < 320);
  assert.ok(drei.width <= 576);
  assert.ok(Buffer.from(drei.raster, 'base64').some((b) => b !== 0));
});

test('Karte: grosse Nummer, Schnitt, kein QR', () => {
  const x = tischkarteXml(12, '', 'Chilbi <2026>');
  assert.match(x, /<image width="\d+" height="320" color="color_1" mode="mono">/);
  assert.match(x, /<cut type="feed"\/>/);
  assert.doesNotMatch(x, /qrcode|symbol/);
  assert.doesNotMatch(x, /<2026>/);
});
