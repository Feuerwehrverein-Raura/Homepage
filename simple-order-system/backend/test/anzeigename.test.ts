// Anzeigename "Gruppe | Variante" (src/anzeigename.ts). Laeuft ohne Datenbank.

import test from 'node:test';
import assert from 'node:assert/strict';
import { anzeigeName, anzeigeNameSql } from '../src/anzeigename.js';

test('anzeigeName: " | " wird zu einem Leerzeichen', () => {
  assert.equal(anzeigeName('Kaffee Lutz | Zwetschge'), 'Kaffee Lutz Zwetschge');
  assert.equal(anzeigeName('04 Diabley Fechy | 1dl'), '04 Diabley Fechy 1dl');
  assert.equal(anzeigeName('A|B'), 'A B');
  assert.equal(anzeigeName('A | B | C'), 'A B C');
});

test('anzeigeName: Namen ohne Trenner und leere Werte bleiben', () => {
  assert.equal(anzeigeName('Mineral Nature 3dl'), 'Mineral Nature 3dl');
  assert.equal(anzeigeName(''), '');
  assert.equal(anzeigeName(null), '');
  assert.equal(anzeigeName(undefined), '');
});

test('anzeigeNameSql', () => {
  assert.equal(anzeigeNameSql('oi.item_name'), "REPLACE(oi.item_name, ' | ', ' ')");
});
