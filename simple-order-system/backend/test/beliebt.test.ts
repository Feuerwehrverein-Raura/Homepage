// Meistverkaufte Artikel (src/beliebt.ts). Laeuft ohne Datenbank: npm test.

import test from 'node:test';
import assert from 'node:assert/strict';
import { beliebtListe, BELIEBT_SQL } from '../src/beliebt.js';

test('beliebtListe: Anlass vor 30 Tagen, Zahlen aus Postgres-Text', () => {
  const liste = beliebtListe([
    { item_id: 7, anlass_menge: '0', menge_30_tage: '50' },
    { item_id: '3', anlass_menge: '12', menge_30_tage: '12' },
    { item_id: '9', anlass_menge: '12', menge_30_tage: '40' },
    { item_id: null, anlass_menge: '99', menge_30_tage: '99' },
    { item_id: '', anlass_menge: '99', menge_30_tage: '99' },
  ]);
  assert.deepEqual(liste.map((e) => e.item_id), ['9', '3', '7']);
  assert.deepEqual(liste[0], { item_id: '9', anlass: 12, tage30: 40 });
});

test('beliebtListe: leer oder Unsinn -> leere Liste', () => {
  assert.deepEqual(beliebtListe([]), []);
  assert.deepEqual(beliebtListe(null as any), []);
});

test('BELIEBT_SQL: Stornos und Sonderposten zaehlen nicht', () => {
  assert.match(BELIEBT_SQL, /<> 'cancelled'/);
  assert.match(BELIEBT_SQL, /item_id IS NOT NULL/);
});
