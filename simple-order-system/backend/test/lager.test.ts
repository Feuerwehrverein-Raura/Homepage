import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lagerSoll, wartezeitMs } from '../src/lager.js';

test('lagerSoll: Positionen zusammengezaehlt, Sonderposten nie', () => {
  assert.deepEqual(lagerSoll('paid', [
    { item_id: '100', quantity: 2 },
    { item_id: '96', quantity: 1 },
    { item_id: '100', quantity: 1 },
    { item_id: null, quantity: 3 },   // Sonderposten
    { item_id: '', quantity: 1 },
    { item_id: 'abc', quantity: 1 },
  ]), [{ id: 100, menge: 3 }, { id: 96, menge: 1 }]);
});

test('lagerSoll: Rezepte behalten ihre negative Nummer', () => {
  assert.deepEqual(lagerSoll('pending', [{ item_id: '-7', quantity: 2 }]), [{ id: -7, menge: 2 }]);
});

test('lagerSoll: stornierte Bestellung zaehlt nur Erledigtes (Ware ist draussen)', () => {
  const pos = [
    { item_id: '100', quantity: 2, completed: true },
    { item_id: '96', quantity: 1, completed: false },
    { item_id: '97', quantity: 1, completed: null },
  ];
  assert.deepEqual(lagerSoll('cancelled', pos), [{ id: 100, menge: 2 }]);
  assert.deepEqual(lagerSoll('completed', pos).length, 3);
  assert.deepEqual(lagerSoll('cancelled', []), []);
});

test('wartezeitMs: 0, 1, 2, 4 ... hoechstens 30 Minuten', () => {
  assert.equal(wartezeitMs(0), 0);
  assert.equal(wartezeitMs(1), 60000);
  assert.equal(wartezeitMs(3), 4 * 60000);
  assert.equal(wartezeitMs(20), 30 * 60000);
});
