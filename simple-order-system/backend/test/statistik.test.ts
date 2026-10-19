// Verkaufsstatistik: Kategorien der Kasse aus der Artikelliste.

import test from 'node:test';
import assert from 'node:assert/strict';
import { kategorienZusammenfassen, OHNE_ARTIKEL, UEBRIGE } from '../src/statistik.js';

const kategorie = (id: string) => ({ '1': 'Essen', '2': 'Bar', '3': 'Essen' } as Record<string, string>)[id];

test('summiert Menge und Umsatz je Kategorie, nach Umsatz absteigend', () => {
  const k = kategorienZusammenfassen([
    { item_id: '1', name: 'Pastetli', total_sold: 71, total_revenue: 852 },
    { item_id: '2', name: 'Bier', total_sold: 186, total_revenue: 837 },
    { item_id: '3', name: 'Pommes', total_sold: 25, total_revenue: 100 },
  ], kategorie);
  assert.deepEqual(k, [
    { name: 'Essen', menge: 96, umsatz: 952 },
    { name: 'Bar', menge: 186, umsatz: 837 },
  ]);
});

test('ohne Artikel-ID (Nachbuchung) und unbekannte ID getrennt', () => {
  const k = kategorienZusammenfassen([
    { item_id: null, name: 'Nachbuchung', total_sold: 4, total_revenue: 167 },
    { item_id: '99', name: 'Alt', total_sold: 1, total_revenue: 5 },
  ], kategorie);
  assert.deepEqual(k.map((z) => z.name), [OHNE_ARTIKEL, UEBRIGE]);
});

test('Betraege aus der Datenbank kommen als Text', () => {
  const k = kategorienZusammenfassen([
    { item_id: '1', name: 'A', total_sold: '2' as any, total_revenue: '0.10' as any },
    { item_id: '1', name: 'B', total_sold: '1' as any, total_revenue: '0.20' as any },
  ], kategorie);
  assert.deepEqual(k, [{ name: 'Essen', menge: 3, umsatz: 0.3 }]);
});
