// Login-QR-Codes (src/qrcode.ts): Datenblatt, Anmeldebon, fremde Codes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrCodeLesen as lesen } from '../src/qrcode.js';

test('qrCodeLesen: Datenblatt, Bon-Adresse, fremde Codes', () => {
  assert.deepEqual(lesen('fwv-member-abc'), { art: 'datenblatt', token: 'fwv-member-abc' });
  assert.deepEqual(lesen('{"v":1,"type":"fwv-member-login","token":"fwv-member-xyz"}'), { art: 'datenblatt', token: 'fwv-member-xyz' });
  assert.deepEqual(lesen('https://www.fwv-raura.ch/anmelden.html?code=AbCdEfGhIjKlMnOpQrStUvWx'), { art: 'bon', code: 'AbCdEfGhIjKlMnOpQrStUvWx' });
  assert.equal(lesen('https://evil.ch/anmelden.html?code=AbCdEfGhIjKlMnOpQrStUvWx'), null);
  assert.equal(lesen('https://www.fwv-raura.ch.evil.ch/anmelden.html?code=AbCdEfGhIjKlMnOpQrStUvWx'), null);
  assert.deepEqual(lesen('{"v":1,"type":"fwv-kasse-login","passwort":"abcd-efgh"}'), { art: 'kasse', passwort: 'abcd-efgh' });
  assert.deepEqual(lesen('{"v":1,"type":"fwv-kasse-bon","code":"AbCdEfGhIjKlMnOpQrStUvWx"}'), { art: 'kassenbon', code: 'AbCdEfGhIjKlMnOpQrStUvWx' });
  assert.equal(lesen('{"type":"fwv-kasse-bon","code":"kurz"}'), null);
  assert.equal(lesen('hallo'), null);
  assert.equal(lesen(42), null);
});
