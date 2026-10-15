// Token-Erneuerung fuer das Kuechendisplay (src/auth.ts: renewPosToken).
// Laeuft ohne Datenbank: npm test.

import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

// auth.ts bricht ohne ausreichend langes JWT_SECRET ab — vor dem Import setzen.
process.env.JWT_SECRET = 'test-geheimnis-fuer-die-tests-0123456789';
const { renewPosToken } = await import('../src/auth.js');
const SECRET = process.env.JWT_SECRET;

const posToken = (extra: object = {}, opts: jwt.SignOptions = { expiresIn: '30d' }) =>
  jwt.sign({ id: 'pos-shared', email: 'kasse@fwv-raura.ch', name: 'Kasse/Kueche', groups: ['pos'], ...extra }, SECRET, opts);

test('gueltiges POS-Token wird gegen ein frisches getauscht', () => {
  const alt = posToken({}, { expiresIn: '2d' });
  const neu = renewPosToken(alt);
  assert.ok(neu);
  const d = jwt.verify(neu!, SECRET) as any;
  assert.equal(d.id, 'pos-shared');
  assert.deepEqual(d.groups, ['pos']);
  // neues Token lebt wieder ~30 Tage
  assert.ok(d.exp - Math.floor(Date.now() / 1000) > 29 * 86400);
});

test('abgelaufenes Token wird nicht erneuert', () => {
  const alt = posToken({ exp: Math.floor(Date.now() / 1000) - 10 }, {});
  assert.equal(renewPosToken(alt), null);
});

test('fremd signiertes oder fehlendes Token wird abgelehnt', () => {
  const fremd = jwt.sign({ id: 'pos-shared' }, 'ein-anderes-geheimnis-xxxxxxxx', { expiresIn: '1d' });
  assert.equal(renewPosToken(fremd), null);
  assert.equal(renewPosToken(undefined), null);
  assert.equal(renewPosToken('kein-token'), null);
});

test('nur POS-Tokens, keine anderen Konten', () => {
  const anderes = jwt.sign({ id: 'jemand', groups: ['admin'] }, SECRET, { expiresIn: '1d' });
  assert.equal(renewPosToken(anderes), null);
});
