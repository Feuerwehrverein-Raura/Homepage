// Schweizer Zeit (src/zeit.ts). npm test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { geschaeftstag, uhrzeit, schweizZeitpunkt } from '../src/zeit.js';

test('Uhrzeit auf dem Bon in Schweizer Zeit (Sommer und Winter)', () => {
  assert.equal(uhrzeit(new Date('2026-10-18T20:10:00Z')), '22:10');
  assert.equal(uhrzeit(new Date('2026-12-18T20:10:00Z')), '21:10');
});

test('Geschaeftstag 12-12 Uhr Schweizer Zeit', () => {
  // So 18.10. 22:10 MESZ -> Tag vom 18.10. 12:00 MESZ (10:00 UTC)
  let g = geschaeftstag(new Date('2026-10-18T20:10:00Z'));
  assert.equal(g.tag, '2026-10-18');
  assert.equal(g.start.toISOString(), '2026-10-18T10:00:00.000Z');
  assert.equal(g.ende.toISOString(), '2026-10-19T10:00:00.000Z');
  // Mo 19.10. 01:30 MESZ (23:30 UTC am 18.) -> noch Tag vom 18.
  g = geschaeftstag(new Date('2026-10-18T23:30:00Z'));
  assert.equal(g.tag, '2026-10-18');
  // ueber den Wechsel auf Winterzeit (25.10.): Ende 12:00 MEZ = 11:00 UTC
  g = geschaeftstag(new Date('2026-10-24T15:00:00Z'));
  assert.equal(g.start.toISOString(), '2026-10-24T10:00:00.000Z');
  assert.equal(g.ende.toISOString(), '2026-10-25T11:00:00.000Z');
  assert.equal(schweizZeitpunkt(2026, 1, 5, 12).toISOString(), '2026-01-05T11:00:00.000Z');
});
