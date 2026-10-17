import 'package:flutter_test/flutter_test.dart';
import 'package:kasse/src/kacheln.dart';

Artikel a(int id, String name, double preis, [String kat = 'Bar']) =>
    Artikel(id: id, name: name, preis: preis, kategorie: kat, station: 'bar');

void main() {
  test('anzeigeName ohne Trenner', () {
    expect(anzeigeName('Kaffee Lutz | Zwetschge'), 'Kaffee Lutz Zwetschge');
    expect(anzeigeName('Cola'), 'Cola');
  });

  test('Kategorien: feste Reihenfolge, Rest alphabetisch', () {
    expect(kategorienSortieren(['Zzz', 'Bar', 'Essen', 'Aaa', 'Softdrinks'], null),
        ['Softdrinks', 'Essen', 'Bar', 'Aaa', 'Zzz']);
  });

  test('natuerliche Sortierung', () {
    expect(nameVergleich('03A Prosecco', '03 Dole') > 0, isTrue);
    expect(nameVergleich('10 Terrasses', '09 Fechy') > 0, isTrue);
  });

  test('Gruppen werden eine Kachel, Einzelgruppe bleibt Artikel', () {
    final k = kachelnBilden([
      a(1, 'Kaffee Lutz | Kirsch', 6),
      a(2, 'Kaffee Lutz | Zwetschge', 6),
      a(3, 'Cola', 3),
      a(4, 'Wein | rot', 5),
    ]);
    expect(k.map((x) => x.titel).toList(), ['Cola', 'Kaffee Lutz', 'Wein rot']);
    expect(k[1].istGruppe, isTrue);
    expect(k[1].varianten.length, 2);
  });

  test('Bestellnummer', () {
    expect(bestellNr(7), 'S-7');
    expect(bestellNr(500012), 'L-12');
  });
}
