// Vertrag mit der Inventar-API: test/fixtures/inventar-api.json enthaelt
// echte Antworten (geschrieben und geprueft von
// simple-inventory-system/backend/test/api.test.mjs). Aendert das Backend
// ein Feld, das die App liest, wird dort die CI rot; hier wird geprueft,
// dass die App jede Antwort versteht.

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_lager/fwv_lager.dart';

import 'vertrag.dart';

Map<String, dynamic> _m(Object? o) => Map<String, dynamic>.from(o as Map);

void main() {
  final v = vertrag();

  test('Artikel mit Bestand je Lagerort (GET items/:id)', () {
    final a = Artikel.ausJson(_m(v['item']));
    expect(a.id, 1);
    expect(a.name, 'Mineral 1.5l');
    expect(a.bestand, 8);
    expect(a.mindestbestand, 10);
    expect(a.nachbestellen, isTrue);
    expect(a.einheit, 'Flasche');
    expect(a.einkaufspreis, 0.8, reason: 'DECIMAL kommt als Text "0.80"');
    expect(a.kategorie, 'Getränke');
    expect(a.lagerort, 'Keller');
    expect(a.eigenerCode, 'FWV000001');
    expect(a.ean, '7610000000001');
    expect(a.code, 'FWV000001');
    expect([for (final o in a.orte) (o.name, o.menge)], [('Keller', 3), ('Kiste 1', 1)]);
  });

  test('Artikelliste (GET items) und Nachbestellen (GET reports/low-stock)', () {
    final liste = [for (final e in v['items'] as List) Artikel.ausJson(_m(e))];
    expect(liste.map((a) => a.name), containsAll(['Mineral 1.5l', 'Teller', 'Becher', 'Cola']));
    expect(liste.every((a) => a.orte.isEmpty), isTrue, reason: 'locations nur im Detail');
    final teller = liste.firstWhere((a) => a.name == 'Teller');
    expect(teller.nachbestellen, isFalse);
    expect(teller.einkaufspreis, isNull);

    final nach = [for (final e in v['low_stock'] as List) Artikel.ausJson(_m(e))];
    expect(nach.map((a) => a.name), ['Mineral 1.5l', 'Cola']);
    expect(nach.every((a) => a.nachbestellen), isTrue, reason: 'gleiche Regel wie das Backend');
  });

  test('Neuer Artikel bekommt einen eigenen Code', () {
    final a = Artikel.ausJson(_m(v['item_neu']));
    expect(a.eigenerCode, matches(RegExp(r'^FWV\d{6}$')));
    expect(a.eigenerCode, _m(v['barcode_next'])['next_code']);
  });

  test('Lagerorte: COUNT/SUM kommen als Text', () {
    final orte = [for (final e in v['locations_overview'] as List) Lagerort.ausJson(_m(e))];
    expect(
      [for (final o in orte) (o.name, o.artikel, o.stueckTotal)],
      [('Keller', 1, 3), ('Kiste 1', 2, 51)],
    );
    expect(orte.first.beschreibung, 'Hauptlager');

    final inhalt = LagerortInhalt.ausJson(v['location']);
    expect(inhalt.name, 'Kiste 1');
    // Nach Kategorie, dann Name (Geschirr vor Getraenke).
    expect(
      [for (final p in inhalt.posten) (p.artikelId, p.name, p.menge)],
      [(2, 'Teller', 50), (1, 'Mineral 1.5l', 1)],
    );
    expect(inhalt.posten.first.code, 'FWV000002');
    expect(inhalt.posten.first.einheit, 'Stück');
  });

  test('Buchungen und Buchungsergebnis', () {
    final verlauf = [for (final e in v['transactions'] as List) Buchung.ausJson(_m(e))];
    expect(verlauf.first.art, BuchungsArt.ausgang);
    expect(verlauf.first.menge, 4);
    expect(verlauf.first.mengeText, '−4');
    expect(verlauf.first.grund, 'Apéro Vorstand');
    expect(verlauf.first.von, 'erika@example.ch');
    expect(verlauf.first.zeitpunkt, isNotNull);
    expect(verlauf.any((b) => b.art == BuchungsArt.eingang && b.mengeText.startsWith('+')), isTrue);
    expect(BuchungsErgebnis.ausJson(v['stock']).neuerBestand, 8);
    expect(() => BuchungsErgebnis.ausJson({'error': 'x'}), throwsFormatException);
  });

  test('Barcode-Suche: im Lager, fremdes Verzeichnis, unbekannt', () {
    final lokal = ScanTreffer.ausJson('FWV000002', v['lookup_lokal']);
    expect(lokal, isA<ImLager>().having((t) => t.artikel.name, 'name', 'Teller'));

    final extern = ScanTreffer.ausJson('7610044000179', v['lookup_extern']);
    expect(extern, isA<Unbekannt>());
    final e = extern as Unbekannt;
    expect(e.quelle, 'openfoodfacts');
    expect(e.vorschlag?.name, 'Rivella Rot');
    expect(e.vorschlag?.marke, 'Rivella');

    final nix = ScanTreffer.ausJson('4000000000006', v['lookup_unbekannt']) as Unbekannt;
    expect(nix.vorschlag, isNull);
    expect(nix.geprueft, ['Lokales Inventar', 'Open Food Facts', 'OpenGTINDB']);
  });

  test('Kategorien und Code zuordnen', () {
    final k = [for (final e in v['categories'] as List) Kategorie.ausJson(_m(e))];
    expect(k.map((x) => x.name), ['Geschirr', 'Getränke']);
    expect(Artikel.ausJson(_m(v['barcode_zuordnen'])).ean, '7611111111111');
    expect(_m(v['barcode_zuordnen_doppelt'])['error'], contains('gehört bereits'));
  });

  test('kaputte Antworten fuehren nicht zum Absturz', () {
    final a = Artikel.ausJson({
      'id': '5',
      'quantity': null,
      'purchase_price': 'abc',
      'locations': 'x',
    });
    expect(a.id, 5);
    expect(a.name, 'Ohne Namen');
    expect(a.bestand, 0);
    expect(a.einkaufspreis, isNull);
    expect(a.orte, isEmpty);
    expect(LagerortInhalt.ausJson(null).posten, isEmpty);
    expect(ScanTreffer.ausJson('x', null), isA<Unbekannt>());
  });
}
