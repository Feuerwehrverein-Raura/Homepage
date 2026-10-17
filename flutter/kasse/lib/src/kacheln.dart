// Kacheln der Kasse - gleiche Regeln wie die Web-Kasse
// (simple-order-system/frontend/src/kacheln.ts):
// 1. Kategorien: feste Reihenfolge (Einstellung "kategorien_reihenfolge"
//    oder Standard), danach alle anderen alphabetisch.
// 2. Artikel einer Kategorie natuerlich sortiert ("03A" nach "03", "10" nach "09").
// 3. Untermenues per Name "Gruppe | Variante": gleiche Gruppe -> eine Kachel.
//    Angezeigt/gedruckt wird der Name ohne " | ".

const trenner = ' | ';
const standardKategorien = ['Softdrinks', 'Bier', 'Essen', 'Kaffee', 'Offenwein', 'Weinkarte', 'Bar'];

class Artikel {
  const Artikel({required this.id, required this.name, required this.preis, required this.kategorie, required this.station});

  factory Artikel.ausJson(Map<String, dynamic> m) => Artikel(
        id: (m['id'] as num).toInt(),
        name: '${m['name'] ?? ''}',
        preis: double.tryParse('${m['price']}') ?? 0,
        kategorie: '${m['category'] ?? 'Sonstiges'}',
        station: '${m['printer_station'] ?? 'bar'}',
      );

  final int id;
  final String name;
  final double preis;
  final String kategorie;
  /// 'bar' oder 'kitchen'
  final String station;

  String get anzeige => anzeigeName(name);
}

String anzeigeName(String name) {
  if (!name.contains('|')) return name;
  return name.split('|').map((t) => t.trim()).where((t) => t.isNotEmpty).join(' ');
}

({String gruppe, String variante})? nameTeilen(String name) {
  final i = name.indexOf(trenner);
  if (i < 0) return null;
  final gruppe = name.substring(0, i).trim();
  final variante = name.substring(i + trenner.length).trim();
  if (gruppe.isEmpty || variante.isEmpty) return null;
  return (gruppe: gruppe, variante: variante);
}

/// Natuerlicher Vergleich ohne Gross/Klein: Zahlenfolgen als Zahl.
int nameVergleich(String a, String b) {
  final re = RegExp(r'(\d+)|(\D+)');
  final ta = re.allMatches(a.toLowerCase()).map((m) => m.group(0)!).toList();
  final tb = re.allMatches(b.toLowerCase()).map((m) => m.group(0)!).toList();
  for (var i = 0; i < ta.length && i < tb.length; i++) {
    final na = int.tryParse(ta[i]);
    final nb = int.tryParse(tb[i]);
    final c = (na != null && nb != null) ? na.compareTo(nb) : ta[i].compareTo(tb[i]);
    if (c != 0) return c;
  }
  return ta.length.compareTo(tb.length);
}

List<String> reihenfolgeLesen(String? text) {
  final liste = (text ?? '').split(RegExp(r'[\n,;]')).map((t) => t.trim()).where((t) => t.isNotEmpty).toList();
  return liste.isEmpty ? standardKategorien : liste;
}

List<String> kategorienSortieren(Iterable<String> kategorien, String? reihenfolgeText) {
  final reihenfolge = reihenfolgeLesen(reihenfolgeText).map((k) => k.toLowerCase()).toList();
  int rang(String k) {
    final i = reihenfolge.indexOf(k.trim().toLowerCase());
    return i < 0 ? 1 << 30 : i;
  }

  final liste = kategorien.toSet().toList();
  liste.sort((a, b) {
    final r = rang(a) - rang(b);
    return r != 0 ? r : nameVergleich(a, b);
  });
  return liste;
}

/// Eine Kachel: ein Artikel oder eine Gruppe mit Varianten.
class Kachel {
  Kachel.einzel(Artikel this.artikel) : gruppe = null, varianten = const [];
  Kachel.gruppe(String this.gruppe, this.varianten) : artikel = null;

  final Artikel? artikel;
  final String? gruppe;
  final List<Artikel> varianten;

  bool get istGruppe => gruppe != null;
  String get titel => artikel?.anzeige ?? gruppe!;
  String get sortName => artikel?.name ?? gruppe!;

  /// "CHF 4.50" oder "ab CHF 4.00"
  String get preisText {
    if (artikel != null) return 'CHF ${artikel!.preis.toStringAsFixed(2)}';
    final preise = varianten.map((v) => v.preis).toSet();
    final min = preise.reduce((a, b) => a < b ? a : b);
    return preise.length == 1 ? 'CHF ${min.toStringAsFixed(2)}' : 'ab CHF ${min.toStringAsFixed(2)}';
  }
}

List<Kachel> kachelnBilden(List<Artikel> artikel) {
  final gruppen = <String, List<Artikel>>{};
  final einzel = <Artikel>[];
  for (final a in artikel) {
    final t = nameTeilen(a.name);
    if (t == null) {
      einzel.add(a);
    } else {
      gruppen.putIfAbsent(t.gruppe, () => []).add(a);
    }
  }
  final kacheln = <Kachel>[
    for (final a in einzel) Kachel.einzel(a),
    for (final e in gruppen.entries)
      e.value.length == 1 ? Kachel.einzel(e.value.first) : Kachel.gruppe(e.key, e.value..sort((a, b) => nameVergleich(a.name, b.name))),
  ];
  kacheln.sort((a, b) => nameVergleich(a.sortName, b.sortName));
  return kacheln;
}

/// Bestellnummer fuer Menschen: T400 ab 500000 -> "L-12", Server -> "S-7".
String bestellNr(int id) => id <= 0 ? '(wartet auf Verbindung)' : (id >= 500000 ? 'L-${id - 500000}' : 'S-$id');
