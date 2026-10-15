// Kacheln der Kasse (src/kacheln.ts): Kategorien, Sortierung, Untermenues.
// Ausfuehren: npx tsx --test test/kacheln.test.ts (im Ordner frontend)

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  anzeigeName, nameTeilen, kategorienSortieren, reihenfolgeLesen, kachelnBilden,
  gruppenPreis, variantenName, STANDARD_KATEGORIEN, type Kachel, type KachelArtikel,
} from '../src/kacheln.ts';

let naechsteId = 1;
const a = (name: string, price = 5, category = 'X'): KachelArtikel =>
  ({ id: naechsteId++, name, price, category });

const namen = (kacheln: Kachel<KachelArtikel>[]) =>
  kacheln.map(k => k.art === 'gruppe' ? `[${k.gruppe}: ${k.varianten.map(v => variantenName(v.name)).join(', ')}]` : k.artikel.name);

test('Kategorien: Standard zuerst, Rest alphabetisch', () => {
  assert.deepEqual(
    kategorienSortieren(['Bar', 'Aperitif', 'Weinkarte', 'Essen', 'Zigaretten', 'Bier', 'Softdrinks', 'Kaffee', 'Offenwein', 'Bier']),
    ['Softdrinks', 'Bier', 'Essen', 'Kaffee', 'Offenwein', 'Weinkarte', 'Bar', 'Aperitif', 'Zigaretten'],
  );
});

test('Kategorien: eigene Reihenfolge (Zeilen oder Komma, Gross/Klein egal)', () => {
  assert.deepEqual(kategorienSortieren(['Bier', 'Essen', 'Softdrinks', 'Bar'], 'essen\n  Bar \n'), ['Essen', 'Bar', 'Bier', 'Softdrinks']);
  assert.deepEqual(kategorienSortieren(['Bier', 'Essen', 'Softdrinks'], 'Bier, Softdrinks'), ['Bier', 'Softdrinks', 'Essen']);
  assert.deepEqual(reihenfolgeLesen('  \n , '), STANDARD_KATEGORIEN);
});

test('Artikel: natuerlich nach Name (03A nach 03, 10 nach 09)', () => {
  const artikel = [a('10 Merlot'), a('04 Fechy'), a('03A Rose'), a('09 Pinot'), a('03 Chasselas'), a('01 Weiss')];
  assert.deepEqual(namen(kachelnBilden(artikel)), ['01 Weiss', '03 Chasselas', '03A Rose', '04 Fechy', '09 Pinot', '10 Merlot']);
});

test('Meistverkaufte zuerst nur, wenn eingeschaltet', () => {
  const x = a('01 A'), y = a('02 B'), z = a('03 C');
  const rang = { [String(z.id)]: 0, [String(y.id)]: 1 };
  assert.deepEqual(namen(kachelnBilden([x, y, z], rang)), ['01 A', '02 B', '03 C']);
  assert.deepEqual(namen(kachelnBilden([x, y, z], rang, true)), ['03 C', '02 B', '01 A']);
});

test('Gruppen: "Gruppe | Variante" wird eine Kachel, Rest bleibt einzeln', () => {
  const artikel = [
    a('Orangensaft 2dl'), a('Mineral süss | Orange'), a('Mineral Nature 3dl'),
    a('Mineral süss | Cola'), a('Mineral süss | Citro'),
  ];
  assert.deepEqual(namen(kachelnBilden(artikel)), [
    'Mineral Nature 3dl', '[Mineral süss: Citro, Cola, Orange]', 'Orangensaft 2dl',
  ]);
});

test('Gruppen: Wein mit Glas/Flasche bleibt an seiner Nummer', () => {
  const artikel = [
    a('05 G. Metral Heida Flasche', 48), a('04 Diabley Fechy | Flasche', 38),
    a('04 Diabley Fechy | 1dl', 5), a('03 Chasselas', 30),
  ];
  const k = kachelnBilden(artikel);
  assert.deepEqual(namen(k), ['03 Chasselas', '[04 Diabley Fechy: 1dl, Flasche]', '05 G. Metral Heida Flasche']);
  assert.equal(k[1].art, 'gruppe');
  if (k[1].art === 'gruppe') assert.equal(gruppenPreis(k[1].varianten), 'ab CHF 5.00');
});

test('Gruppen: Rang der besten Variante, wenn meistverkaufte zuerst', () => {
  const p = a('A Einzel'), q = a('B | eins'), r = a('B | zwei');
  const k = kachelnBilden([p, q, r], { [String(r.id)]: 0 }, true);
  assert.deepEqual(namen(k), ['[B: zwei, eins]', 'A Einzel']);
});

test('gruppenPreis: gleicher Preis ohne "ab"', () => {
  assert.equal(gruppenPreis([a('K | 1', 4), a('K | 2', 4)]), 'CHF 4.00');
  assert.equal(gruppenPreis([a('K | 1', 6), a('K | 2', 4.5)]), 'ab CHF 4.50');
});

test('Namen: Anzeige und Teilen', () => {
  assert.equal(anzeigeName('Kaffee Lutz | Zwetschge'), 'Kaffee Lutz Zwetschge');
  assert.equal(anzeigeName('Bier 3dl'), 'Bier 3dl');
  assert.deepEqual(nameTeilen('Kaffee Lutz | Zwetschge'), { gruppe: 'Kaffee Lutz', variante: 'Zwetschge' });
  assert.equal(nameTeilen('Bier|Gross'), null); // ohne Leerzeichen keine Gruppe
  assert.equal(nameTeilen('Bier | '), null);
});
