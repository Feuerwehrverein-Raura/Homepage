// Kisten-Etiketten (src/etikett.ts). npm test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { etikettBreite, etikettPruefen, etikettXml, ETIKETT_MAX } from '../src/etikett.js';

test('Pruefen', () => {
  assert.deepEqual(etikettPruefen('  29   Rugeli ', ''), { text: '29 Rugeli', unten: '' });
  assert.equal(typeof etikettPruefen('', ''), 'string');
  assert.equal(typeof etikettPruefen('x'.repeat(ETIKETT_MAX + 1), ''), 'string');
});

test('Breite: kurz breit, lang schmal', () => {
  assert.equal(etikettBreite(9), 7);   // "29 Rugeli" wie die Probe
  assert.ok(etikettBreite(25) < 7);
  assert.equal(etikettBreite(40), 3);
});

test('Quer im Seitenmodus, escaped, mit Schnitt', () => {
  const x = etikettXml('29 <Rugeli>', 'Kiste S8');
  assert.match(x, /<page>[\s\S]*<direction dir="bottom_to_top"\/>[\s\S]*<\/page>/);
  assert.match(x, /width="\d" height="8">29 &lt;Rugeli&gt;<\/text>/);
  assert.match(x, />Kiste S8<\/text>/);
  assert.match(x, /<cut type="feed"\/>/);
  assert.doesNotMatch(etikettXml('29 Rugeli'), /width="2" height="2"/);
});
