// Geraete-Freigabe (src/geraete.ts): welche Aufrufe gesperrt werden. npm test.

import test from 'node:test';
import assert from 'node:assert/strict';
import { istSchreibend, kennungPruefen, kurzcode } from '../src/geraete.js';

test('Buchen und Bezahlen sind schreibend', () => {
  assert.ok(istSchreibend('POST', '/orders'));
  assert.ok(istSchreibend('post', '/orders/'));
  assert.ok(istSchreibend('POST', '/orders/500012/split-payment'));
  assert.ok(istSchreibend('POST', '/orders/500012/pay-items'));
  assert.ok(istSchreibend('PUT', '/orders/7/status'));
  assert.ok(istSchreibend('DELETE', '/orders/7/items/50000001'));
  assert.ok(istSchreibend('POST', '/orders/7/cancel'));
  assert.ok(istSchreibend('POST', '/auth/kassenbon'));
});

test('Kueche, Lesen und Anmeldung bleiben offen', () => {
  assert.ok(!istSchreibend('GET', '/orders'));
  assert.ok(!istSchreibend('POST', '/orders/7/complete'));
  assert.ok(!istSchreibend('POST', '/orders/7/items/complete'));
  assert.ok(!istSchreibend('POST', '/auth/qr-login'));
  assert.ok(!istSchreibend('POST', '/internal/vor-ort/bestellungen'));
});

test('Kennung und Kurzcode', () => {
  assert.equal(kennungPruefen('abc'), null);
  assert.equal(kennungPruefen('a b c d e f g h'), null);
  assert.equal(kennungPruefen('k7Fq2-xZ91mPq'), 'k7Fq2-xZ91mPq');
  assert.equal(kurzcode('k7Fq2-xZ91mPq'), 'K7FQ-2XZ9');
});
