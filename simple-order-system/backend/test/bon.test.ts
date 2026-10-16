// Rezept-Bon (src/bon.ts). Laeuft ohne Drucker und Datenbank: npm test.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bonUmbruch, escapeXml, faktorPruefen, mengeText, zahlText, textUmbruch,
  rezeptAusInventar, rezeptBonXml, rezeptBonText, rezeptListe, TEXT_MAX,
} from '../src/bon.js';

// So liefert das Inventar GET /api/recipes/:id (Zahlen aus Postgres als Text).
const roh = {
  id: 12, name: 'Älplermagronen nach Grossmutters Art mit Apfelmus', active: true,
  category_name: 'Hauptgerichte', servings: 4, prep_time_minutes: 30,
  description: 'Klassiker fuer die Chilbi.',
  instructions: 'Kartoffeln schaelen & wuerfeln.\n\nMagronen kochen, mit Kaese und Rahm mischen. Zwiebeln goldbraun anbraten <nicht anbrennen>.',
  ingredients: [
    { item_name: 'Apfelmus', quantity: '0.250', unit: 'kg', notes: null, optional: true },
    { item_name: 'Magronen', quantity: '500.000', unit: 'g', notes: null, optional: false },
    { item_name: 'Kaese', quantity: '0.333', unit: null, item_unit: 'kg', notes: 'Raclette oder Greyerzer', optional: false },
    { item_name: 'Zwiebeln', quantity: '2.000', unit: 'Stk', notes: '', optional: false },
  ],
};
const JETZT = new Date('2026-10-24T17:45:00Z'); // 19:45 Ortszeit

test('bonUmbruch: zwischen Woertern, eingerueckt', () => {
  assert.deepEqual(bonUmbruch('- ', 'Raclette Kaese gerieben fein', 16), ['- Raclette Kaese', '  gerieben fein']);
  assert.deepEqual(bonUmbruch('', 'abcdefghij', 4), ['abcd', 'efgh', 'ij']);
});

test('zahlText/mengeText: sinnvoll gerundet, mal Faktor', () => {
  assert.equal(zahlText(500), '500');
  assert.equal(zahlText(1.5), '1.5');
  assert.equal(zahlText(0.333), '0.33');
  assert.equal(zahlText(12.345), '12.3');
  assert.equal(zahlText(166.66), '167');
  assert.equal(mengeText(250, 'g', 2), '500 g');
  assert.equal(mengeText(0.333, 'kg', 3), '1 kg');
  assert.equal(mengeText(2, 'Stk', 1.5), '3 Stk');
  assert.equal(mengeText(null, 'Prise', 2), 'Prise');
});

test('faktorPruefen: Standard 1, Grenzen', () => {
  assert.equal(faktorPruefen(undefined), 1);
  assert.equal(faktorPruefen('2'), 2);
  assert.equal(faktorPruefen(0.5), 0.5);
  assert.equal(faktorPruefen(0), null);
  assert.equal(faktorPruefen(-1), null);
  assert.equal(faktorPruefen(101), null);
  assert.equal(faktorPruefen('abc'), null);
});

test('rezeptAusInventar: Felder, Einheit vom Artikel, optionale zuletzt', () => {
  const r = rezeptAusInventar(roh)!;
  assert.equal(r.name, roh.name);
  assert.equal(r.kategorie, 'Hauptgerichte');
  assert.equal(r.portionen, 4);
  assert.deepEqual(r.zutaten.map((z) => z.name), ['Magronen', 'Kaese', 'Zwiebeln', 'Apfelmus']);
  assert.equal(r.zutaten[1].einheit, 'kg');
  assert.equal(r.zutaten[2].notiz, null);
  assert.equal(rezeptAusInventar({ id: 1 }), null);
  assert.equal(rezeptAusInventar(null), null);
});

test('rezeptBonText: Aufbau, Mengen x Faktor, Umbruch auf 48', () => {
  const zeilen = rezeptBonText(rezeptAusInventar(roh)!, 2, { anlass: 'Chilbi 2026', jetzt: JETZT });
  assert.equal(zeilen[0], 'REZEPT');
  assert.ok(zeilen.every((z) => z.length <= 48), 'keine Zeile breiter als 48');
  assert.ok(zeilen.includes('Menge: 2x Rezept = 8 Portionen'));
  assert.ok(zeilen.includes('- 1000 g Magronen'));
  assert.ok(zeilen.includes('- 0.67 kg Kaese (Raclette oder Greyerzer)'));
  assert.ok(zeilen.includes('- 4 Stk Zwiebeln'));
  assert.ok(zeilen.includes('- 0.5 kg Apfelmus (optional)'));
  assert.ok(zeilen.includes('Anleitung'));
  assert.ok(zeilen.includes('Zubereitung: 30 Min.'));
  assert.ok(zeilen.includes('24.10.2026 19:45'));
  assert.equal(zeilen[zeilen.length - 1], 'Chilbi 2026');
  // Titel in doppelter Breite: 24 Zeichen
  assert.deepEqual(zeilen.slice(1, 4), ['Älplermagronen nach', 'Grossmutters Art mit', 'Apfelmus']);
  // Absatz bleibt als eine Leerzeile
  const i = zeilen.indexOf('Kartoffeln schaelen & wuerfeln.');
  assert.equal(zeilen[i + 1], '');
});

test('rezeptBonText: Faktor 1 zeigt Portionen, ohne Zutaten/Text kein Leerblock', () => {
  const z = rezeptBonText({ id: 1, name: 'Tee', kategorie: null, portionen: 1, zubereitung_min: null,
    beschreibung: null, anleitung: null, zutaten: [] }, 1, { jetzt: JETZT });
  assert.deepEqual(z, ['REZEPT', 'Tee', 'Portionen: 1', '='.repeat(48), '='.repeat(48), '24.10.2026 19:45']);
});

test('textUmbruch: lange Texte gekuerzt', () => {
  const lang = 'Wort '.repeat(2000);
  const zeilen = textUmbruch(lang);
  const gesamt = zeilen.join(' ');
  assert.ok(gesamt.length <= TEXT_MAX + 10);
  assert.ok(gesamt.endsWith('...'));
});

test('rezeptBonXml: escaped, Logo, gross REZEPT, Schnitt', () => {
  const xml = rezeptBonXml(rezeptAusInventar(roh)!, 1, { anlass: 'Chilbi <2026>', jetzt: JETZT, logoXml: '<image/>' });
  assert.ok(xml.startsWith('<image/>'));
  assert.match(xml, /width="3" height="3"\/><text>REZEPT&#10;<\/text>/);
  assert.match(xml, /width="2" height="2"\/><text>Älplermagronen nach&#10;Grossmutters Art mit&#10;Apfelmus&#10;/);
  assert.match(xml, /- 500 g Magronen/);
  assert.match(xml, /&lt;nicht anbrennen&gt;/);
  assert.match(xml, /schaelen &amp; wuerfeln/);
  assert.match(xml, /Chilbi &lt;2026&gt;/);
  assert.ok(!/<nicht/.test(xml));
  assert.match(xml, /<cut type="feed"\/>$/);
  assert.equal(escapeXml('"a"'), '&quot;a&quot;');
});

test('rezeptListe: aus der Event-Rezeptliste des Inventars', () => {
  assert.deepEqual(rezeptListe([
    { id: 3, name: 'Kuerbissuppe', category_name: 'Vorspeisen', ingredient_count: 5 },
    { id: '3', name: 'doppelt' },
    { id: 4, name: 'Glühwein', category_name: null },
    { id: null, name: 'kaputt' },
  ]), [
    { id: 3, name: 'Kuerbissuppe', kategorie: 'Vorspeisen', anzahl_zutaten: 5 },
    { id: 4, name: 'Glühwein', kategorie: null, anzahl_zutaten: null },
  ]);
  assert.deepEqual(rezeptListe({ error: 'x' }), []);
});
