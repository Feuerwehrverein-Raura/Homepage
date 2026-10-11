// Regeln der Ausleihe (src/ausleihe.ts) ohne Netz und Datenbank:
// Verfuegbarkeit, 409-Meldungen, Rueckgabe, Erinnerungen, Anzeige.
// Laeuft gegen das kompilierte dist/ — `npm test` baut vorher.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  anfragePruefen, appBlock, belegtBis, faelligeErinnerungen, heuteZuerich, istDatum,
  rueckgabePruefen, tageDazu, ueberschneidet, verfuegbarkeit, zeitraumText
} from '../dist/ausleihe.js';
import { ausleiheZugang } from '../dist/zugang.js';

test('Datum: gueltig, Zuerich, Zeitraum', () => {
  assert.ok(istDatum('2026-10-12'));
  assert.ok(!istDatum('2026-02-30'));
  assert.ok(!istDatum('12.10.2026'));
  assert.ok(!istDatum(20261012));
  // 23:30 UTC am 11.10. ist in Zuerich schon der 12.10.
  assert.equal(heuteZuerich(new Date('2026-10-11T23:30:00Z')), '2026-10-12');
  assert.equal(tageDazu('2026-12-31', 1), '2027-01-01');
  assert.equal(zeitraumText('2026-10-12', '2026-10-12'), '12.10.2026');
  assert.equal(zeitraumText('2026-10-12', '2026-10-14'), '12.10.2026 – 14.10.2026');
  assert.ok(ueberschneidet('2026-10-12', '2026-10-14', '2026-10-14', '2026-10-20'), 'gleicher Tag zaehlt');
  assert.ok(!ueberschneidet('2026-10-12', '2026-10-13', '2026-10-14', '2026-10-20'));
  assert.equal(belegtBis('ausgegeben', '2026-10-01', '2026-10-11'), '2026-10-11', 'ueberfaellig belegt bis heute');
  assert.equal(belegtBis('reserviert', '2026-10-01', '2026-10-11'), '2026-10-01');
});

test('Verfuegbarkeit: Bestand + unterwegs − belegt, Kisten', () => {
  const v = verfuegbarkeit(
    [{ id: 1, bestand: 20, unterwegs: 30 }, { id: 2, bestand: 5, unterwegs: 0 }, { id: 3, bestand: 0, unterwegs: 0 }],
    [
      { item_id: 1, menge: 30 },  // ausgegeben, ueberschneidet
      { item_id: 1, menge: 10 },  // reserviert
      { location_id: 7, menge: 1 },
      { item_id: 2, menge: 9 }    // mehr belegt als da (Bestand verbraucht)
    ]
  );
  assert.equal(v.frei.get(1), 10);
  assert.equal(v.frei.get(2), 0, 'nie unter 0');
  assert.equal(v.frei.get(3), 0);
  assert.ok(v.kistenBelegt.has(7));
});

test('Anfrage pruefen: 409-Meldungen', () => {
  const v = verfuegbarkeit([{ id: 1, bestand: 50, unterwegs: 0 }, { id: 2, bestand: 4, unterwegs: 0 }],
    [{ item_id: 1, menge: 30 }, { location_id: 9, menge: 1 }]);
  const z = '12.10.2026 – 14.10.2026';
  const teller = (menge) => ({ item_id: 1, menge, name: 'Teller', einheit: 'Stück', ausleihbar: true });
  assert.equal(anfragePruefen({ artikel: [teller(20)], kisten: [] }, v, z), null);
  assert.equal(anfragePruefen({ artikel: [teller(21)], kisten: [] }, v, z),
    'Von «Teller» sind am 12.10.2026 – 14.10.2026 nur noch 20 Stück frei.');
  // Direkt und in der Kiste zusammen gezaehlt
  const kiste = { location_id: 8, name: 'Kiste A', ausleihbar: true, inhalt: [{ item_id: 1, menge: 15, name: 'Teller', einheit: 'Stück' }] };
  assert.match(anfragePruefen({ artikel: [teller(10)], kisten: [kiste] }, v, z), /nur noch 20 Stück/);
  assert.equal(anfragePruefen({ artikel: [], kisten: [{ ...kiste, location_id: 9 }] }, v, z),
    '«Kiste A» ist am 12.10.2026 – 14.10.2026 schon ausgeliehen oder reserviert.');
  assert.equal(anfragePruefen({ artikel: [], kisten: [{ ...kiste, ausleihbar: false }] }, v, z),
    '«Kiste A» kann nicht ausgeliehen werden.');
  assert.equal(anfragePruefen({ artikel: [{ ...teller(1), ausleihbar: false }], kisten: [] }, v, z),
    '«Teller» kann nicht ausgeliehen werden.');
  const leer = verfuegbarkeit([{ id: 1, bestand: 0, unterwegs: 0 }], []);
  assert.match(anfragePruefen({ artikel: [teller(1)], kisten: [] }, leer, z), /schon ganz ausgeliehen/);
});

test('Rueckgabe pruefen', () => {
  assert.equal(rueckgabePruefen({ menge: 10, zurueck: 10, zustand: 'ok' }, 'Teller'), null);
  assert.equal(rueckgabePruefen({ menge: 10, zurueck: 7, zustand: 'beschaedigt' }, 'Teller'), null);
  assert.equal(rueckgabePruefen({ menge: 10, zurueck: 10, zustand: 'beschaedigt' }, 'Teller'), null, 'alles zurueck, mit Schaden');
  assert.equal(rueckgabePruefen({ menge: 10, zurueck: 0, zustand: 'fehlt' }, 'Teller'), null);
  assert.match(rueckgabePruefen({ menge: 10, zurueck: 9, zustand: 'ok' }, 'Teller'), /muss alles zurück/);
  assert.match(rueckgabePruefen({ menge: 10, zurueck: 10, zustand: 'fehlt' }, 'Teller'), /fehlt nichts/);
  assert.match(rueckgabePruefen({ menge: 10, zurueck: 11, zustand: 'ok' }, 'Teller'), /0 bis 10/);
  assert.match(rueckgabePruefen({ menge: 10, zurueck: 1.5, zustand: 'beschaedigt' }, 'Teller'), /ganze Zahl/);
  assert.match(rueckgabePruefen({ menge: 10, zurueck: 10, zustand: 'gut' }, 'Teller'), /Zustand fehlt/);
});

test('Erinnerungen: vorher einmal, ueberfaellig hoechstens taeglich', () => {
  const heute = '2026-10-11';
  const z = (id, bis, extra = {}) => ({ id, status: 'ausgegeben', bis, erinnert_vorher_am: null, erinnert_ueberfaellig_am: null, ...extra });
  assert.deepEqual(faelligeErinnerungen([
    z(1, '2026-10-12'),                                          // morgen -> vorher
    z(2, '2026-10-12', { erinnert_vorher_am: '2026-10-10' }),    // schon erinnert
    z(3, '2026-10-11'),                                          // heute faellig: nichts
    z(4, '2026-10-13'),                                          // uebermorgen: nichts
    z(5, '2026-10-10'),                                          // ueberfaellig, erstes Mal
    z(6, '2026-10-08', { erinnert_ueberfaellig_am: '2026-10-10' }), // gestern erinnert -> heute wieder
    z(7, '2026-10-08', { erinnert_ueberfaellig_am: '2026-10-11' }), // heute schon
    { ...z(8, '2026-10-12'), status: 'reserviert' },             // nicht ausgegeben
    { ...z(9, '2026-10-01'), status: 'zurueckgegeben' }
  ], heute), [
    { id: 1, art: 'vorher', erstes: true },
    { id: 5, art: 'ueberfaellig', erstes: true },
    { id: 6, art: 'ueberfaellig', erstes: false }
  ]);
});

test('Anzeige: Status, Hinweis, erlaubte Aktionen', () => {
  const a = { id: 1, status: 'ausgegeben', von: '2026-10-01', bis: '2026-10-09', art: 'extern',
    mitglied_email: null, mitglied_name: null, extern_name: 'Hans Muster', extern_organisation: 'Turnverein' };
  const app = appBlock(a, '2026-10-11', { lager: true, eigene: false });
  assert.equal(app.status_text, 'Überfällig');
  assert.equal(app.status_farbe, 'rot');
  assert.equal(app.hinweis, 'Seit 2 Tagen überfällig');
  assert.equal(app.ausleiher_text, 'Hans Muster, Turnverein');
  assert.equal(app.kann_zuruecknehmen, true);
  const r = { ...a, status: 'reserviert', von: '2026-10-12', bis: '2026-10-12', art: 'mitglied', mitglied_name: 'Erika' };
  assert.deepEqual(
    [appBlock(r, '2026-10-11', { lager: false, eigene: true }), appBlock(r, '2026-10-11', { lager: false, eigene: false })]
      .map((x) => [x.status_text, x.hinweis, x.kann_absagen, x.kann_ausgeben]),
    [['Reserviert', 'Abholen ab 12.10.2026', true, false], ['Reserviert', 'Abholen ab 12.10.2026', false, false]]
  );
});

test('Zugang zur Ausleihe: jedes Mitglied, verwalten nur Lager', () => {
  assert.deepEqual(ausleiheZugang('fwv-members-app', { groups: ['Mitglieder'] }), { ok: true, anwendung: 'fwv-members-app', lager: false });
  assert.deepEqual(ausleiheZugang('fwv-members', { groups: ['lager'] }), { ok: true, anwendung: 'fwv-members', lager: true });
  assert.deepEqual(ausleiheZugang('inventory-system', {}), { ok: true, anwendung: 'inventory-system', lager: true });
  assert.equal(ausleiheZugang(null, {}).ok, false);
});
