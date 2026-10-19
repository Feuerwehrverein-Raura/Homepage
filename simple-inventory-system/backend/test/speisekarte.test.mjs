// Speisekarte (src/speisekarte.ts) ohne Datenbank: Namen zerlegen,
// Preise zusammenfassen, Reihenfolge der Abschnitte.
// Laeuft gegen das kompilierte dist/ — `npm test` baut vorher.

import test from 'node:test';
import assert from 'node:assert/strict';
import { karteAufbauen, nameZerlegen, speisekarteHtml } from '../dist/speisekarte.js';

test('Namen: Groesse, Zwischentitel, Nummer', () => {
  assert.deepEqual(nameZerlegen('01 Epesses | 1dl'), { gruppe: null, basis: '01 Epesses', groesse: '1dl' });
  assert.deepEqual(nameZerlegen('01 Epesses | Flasche 50cl'), { gruppe: null, basis: '01 Epesses', groesse: 'Flasche 50cl' });
  assert.deepEqual(nameZerlegen('Softdrinks | Cola 3dl'), { gruppe: 'Softdrinks', basis: 'Cola', groesse: '3dl' });
  assert.deepEqual(nameZerlegen('Bier alkoholfrei 3.3dl'), { gruppe: null, basis: 'Bier alkoholfrei', groesse: '3.3dl' });
  assert.deepEqual(nameZerlegen('05 G. Metral Heida Flasche'), { gruppe: null, basis: '05 G. Metral Heida', groesse: 'Flasche' });
  assert.deepEqual(nameZerlegen('Gin Tonic'), { gruppe: null, basis: 'Gin Tonic', groesse: null });
});

test('Karte: Preise je Zeile, Glaeser weg, Reihenfolge', () => {
  const karte = karteAufbauen([
    { name: 'Gin Tonic', price: '8.00', category: 'Bar' },
    { name: '01 Epesses | Flasche 50cl', price: '16.00', category: 'Weinkarte', description: 'Frisch' },
    { name: '01 Epesses | 1dl', price: '4.00', category: 'Weinkarte' },
    { name: '10 Rosel', price: '20.00', category: 'Weinkarte' },
    { name: '9 Fechy', price: '28.00', category: 'Weinkarte' },
    { name: 'Gläser | Rugeli', price: '0.00', category: 'Getränke' },
    { name: 'Softdrinks | Cola 1.5l', price: '6.00', category: 'Getränke' },
    { name: 'Softdrinks | Cola 3dl', price: '3.00', category: 'Getränke' },
    { name: 'Bier Warteck 3dl', price: '4.50', category: 'Getränke' },
    { name: 'Zuckerwatte', price: '3.00', category: 'Chilbi' }
  ]);
  assert.deepEqual(karte.map((a) => a.kategorie), ['Getränke', 'Weinkarte', 'Bar', 'Chilbi']);
  const getraenke = karte[0];
  assert.deepEqual(getraenke.gruppen.map((g) => g.titel), [null, 'Softdrinks'], 'Glaeser zu 0.00 fehlen');
  assert.deepEqual(getraenke.gruppen[1].zeilen[0].preise, [
    { groesse: '3 dl', preis: 3 }, { groesse: '1.5 l', preis: 6 }
  ]);
  const wein = karte[1].gruppen[0].zeilen;
  assert.deepEqual(wein.map((z) => z.nummer), ['01', '9', '10'], 'numerisch sortiert');
  assert.equal(wein[0].name, 'Epesses');
  assert.equal(wein[0].beschreibung, 'Frisch');
  assert.deepEqual(wein[0].preise.map((p) => p.groesse), ['1 dl', 'Flasche 50 cl']);
});

test('HTML: Text wird maskiert', () => {
  const html = speisekarteHtml(karteAufbauen([{ name: '<b>X</b>', price: 1, category: 'Bar' }]),
    { titel: 'A & B', hintergrund: 'h.jpg', logo: 'l.jpg', stand: '19.10.2026' });
  assert.ok(html.includes('&lt;b&gt;X&lt;/b&gt;'));
  assert.ok(html.includes('A &amp; B'));
  assert.ok(!html.includes('<b>X</b>'));
});
