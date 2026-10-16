import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusMischen } from '../src/vorort.js';

test('statusMischen: Cloud-Abschluss der Kueche bleibt, T400 stuft nicht zurueck', () => {
  assert.equal(statusMischen('completed', 'paid'), 'completed');
  assert.equal(statusMischen('pending', 'paid'), 'paid');
  assert.equal(statusMischen('paid', 'cancelled'), 'cancelled');
  assert.equal(statusMischen('completed', 'cancelled'), 'cancelled');
  assert.equal(statusMischen(null, undefined), 'pending');
});

test('bonMischen: gedruckt gewinnt, sonst gemeinsame Fehler', async () => {
  const { bonMischen } = await import('../src/vorort.js');
  assert.equal(bonMischen('', 'kitchen'), '');
  assert.equal(bonMischen(null, 'kitchen'), 'kitchen');
  assert.equal(bonMischen('kitchen', null), 'kitchen');
  assert.equal(bonMischen(null, null), null);
  assert.equal(bonMischen('bar,kitchen', 'kitchen'), 'kitchen');
  assert.equal(bonMischen('bar', 'kitchen'), '');
});
