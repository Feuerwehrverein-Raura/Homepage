// Modelle so, wie die Inventar-API sie liefert (simple-inventory-system/
// backend/src/index.ts). Die Zeilen kommen direkt aus Postgres: DECIMAL und
// COUNT/SUM kommen als Text ("0.80", "2"), INTEGER als Zahl. Fehlende
// Felder, null und falsche Typen fuehren nie zum Absturz.

import 'package:fwv_core/fwv_core.dart';

/// Zahl mit Nachkommastellen aus Zahl oder Text ("0.80").
double? _dezimal(Object? wert) {
  if (wert is num) return wert.toDouble();
  if (wert is String) return double.tryParse(wert.trim());
  return null;
}

/// Ganze Zahl; auch aus "2" oder 2.0.
int? _ganz(Object? wert) => jsonZahl(wert);

/// Menge zur Anzeige: "12 Flasche", "1 Stück".
String mengeMitEinheit(int menge, String? einheit) =>
    einheit == null || einheit.isEmpty ? '$menge' : '$menge $einheit';

/// Bestand eines Artikels in einem Lagerort bzw. einer Kiste
/// (`item_locations`, in `GET items/:id` als `locations`).
class ArtikelOrt {
  const ArtikelOrt({required this.lagerortId, this.name, this.menge = 0, this.notiz});

  factory ArtikelOrt.ausJson(Map<String, dynamic> m) => ArtikelOrt(
    lagerortId: _ganz(m['location_id']) ?? 0,
    name: jsonText(m['location_name']),
    menge: _ganz(m['quantity']) ?? 0,
    notiz: jsonText(m['notes']),
  );

  final int lagerortId;
  final String? name;
  final int menge;
  final String? notiz;
}

/// Ein Artikel (`items`, mit `category_name` und `location_name`).
class Artikel {
  const Artikel({
    required this.id,
    required this.name,
    this.beschreibung,
    this.kategorieId,
    this.kategorie,
    this.lagerortId,
    this.lagerort,
    this.ean,
    this.eigenerCode,
    this.bestand = 0,
    this.mindestbestand = 0,
    this.einheit,
    this.einkaufspreis,
    this.lieferant,
    this.notizen,
    this.bild,
    this.orte = const [],
    this.ausleihbar = false,
  });

  factory Artikel.ausJson(Map<String, dynamic> m) => Artikel(
    id: _ganz(m['id']) ?? 0,
    name: jsonText(m['name']) ?? 'Ohne Namen',
    beschreibung: jsonText(m['description']),
    kategorieId: _ganz(m['category_id']),
    kategorie: jsonText(m['category_name']),
    lagerortId: _ganz(m['location_id']),
    lagerort: jsonText(m['location_name']),
    ean: jsonText(m['ean_code']),
    eigenerCode: jsonText(m['custom_barcode']),
    bestand: _ganz(m['quantity']) ?? 0,
    mindestbestand: _ganz(m['min_quantity']) ?? 0,
    einheit: jsonText(m['unit']),
    einkaufspreis: _dezimal(m['purchase_price']),
    lieferant: jsonText(m['supplier']),
    notizen: jsonText(m['notes']),
    bild: jsonText(m['image_url']),
    orte: jsonListe(m['locations'], ArtikelOrt.ausJson),
    ausleihbar: jsonWahr(m['ausleihbar']) ?? false,
  );

  final int id;
  final String name;
  final String? beschreibung;
  final int? kategorieId;
  final String? kategorie;

  /// Hauptlagerort (`location_id`).
  final int? lagerortId;
  final String? lagerort;

  /// EAN des Herstellers bzw. eigener Code (`FWV000123`).
  final String? ean;
  final String? eigenerCode;

  final int bestand;
  final int mindestbestand;
  final String? einheit;
  final double? einkaufspreis;
  final String? lieferant;
  final String? notizen;

  /// Pfad (`/api/uploads/…`) oder Adresse des Bilds.
  final String? bild;

  /// Bestand je Lagerort/Kiste — nur in der Detailansicht (`GET items/:id`).
  final List<ArtikelOrt> orte;

  /// Darf ausgeliehen werden (setzt das Lager).
  final bool ausleihbar;

  /// Der Code, der auf dem Etikett steht: eigener Code, sonst EAN.
  String? get code => eigenerCode ?? ean;

  /// Gleiche Regel wie die Inventar-API (`reports/low-stock`) und die
  /// Inventar-PWA: Bestand auf oder unter dem Mindestbestand (also auch
  /// "leer" bei Mindestbestand 0).
  bool get nachbestellen => bestand <= mindestbestand;

  Artikel mitBestand(int neu) => _kopie(bestand: neu);

  Artikel mitAusleihbar(bool neu) => _kopie(ausleihbar: neu);

  Artikel _kopie({int? bestand, bool? ausleihbar}) => Artikel(
    id: id,
    name: name,
    beschreibung: beschreibung,
    kategorieId: kategorieId,
    kategorie: kategorie,
    lagerortId: lagerortId,
    lagerort: lagerort,
    ean: ean,
    eigenerCode: eigenerCode,
    bestand: bestand ?? this.bestand,
    mindestbestand: mindestbestand,
    einheit: einheit,
    einkaufspreis: einkaufspreis,
    lieferant: lieferant,
    notizen: notizen,
    bild: bild,
    orte: orte,
    ausleihbar: ausleihbar ?? this.ausleihbar,
  );
}

/// Lagerort mit Zahlen (`GET locations/overview`).
class Lagerort {
  const Lagerort({
    required this.id,
    required this.name,
    this.beschreibung,
    this.artikel = 0,
    this.stueckTotal = 0,
    this.ausleihbar = false,
  });

  factory Lagerort.ausJson(Map<String, dynamic> m) => Lagerort(
    id: _ganz(m['id']) ?? 0,
    name: jsonText(m['name']) ?? 'Lagerort',
    beschreibung: jsonText(m['description']),
    artikel: _ganz(m['item_count']) ?? 0,
    stueckTotal: _ganz(m['total_quantity']) ?? 0,
    ausleihbar: jsonWahr(m['ausleihbar']) ?? false,
  );

  final int id;
  final String name;
  final String? beschreibung;

  /// Verschiedene Artikel in diesem Lagerort.
  final int artikel;

  /// Summe der Mengen aller Artikel hier.
  final int stueckTotal;

  /// Als ganze Kiste ausleihbar (setzt das Lager).
  final bool ausleihbar;
}

/// Ein Artikel im Inhalt eines Lagerorts (`GET locations/:id` → `contents`).
class LagerortPosten {
  const LagerortPosten({
    required this.artikelId,
    required this.name,
    this.menge = 0,
    this.einheit,
    this.kategorie,
    this.code,
    this.notiz,
  });

  factory LagerortPosten.ausJson(Map<String, dynamic> m) => LagerortPosten(
    artikelId: _ganz(m['id']) ?? 0,
    name: jsonText(m['name']) ?? 'Ohne Namen',
    menge: _ganz(m['box_quantity']) ?? 0,
    einheit: jsonText(m['unit']),
    kategorie: jsonText(m['category_name']),
    code: jsonText(m['custom_barcode']) ?? jsonText(m['ean_code']),
    notiz: jsonText(m['box_notes']),
  );

  final int artikelId;
  final String name;
  final int menge;
  final String? einheit;
  final String? kategorie;
  final String? code;
  final String? notiz;
}

class LagerortInhalt {
  const LagerortInhalt({
    required this.id,
    required this.name,
    this.beschreibung,
    this.posten = const [],
    this.ausleihbar = false,
  });

  factory LagerortInhalt.ausJson(Object? json) {
    final m = json is Map ? Map<String, dynamic>.from(json) : const <String, dynamic>{};
    return LagerortInhalt(
      id: _ganz(m['id']) ?? 0,
      name: jsonText(m['name']) ?? 'Lagerort',
      beschreibung: jsonText(m['description']),
      posten: jsonListe(m['contents'], LagerortPosten.ausJson),
      ausleihbar: jsonWahr(m['ausleihbar']) ?? false,
    );
  }

  final int id;
  final String name;
  final String? beschreibung;
  final List<LagerortPosten> posten;

  /// Als ganze Kiste ausleihbar.
  final bool ausleihbar;
}

class Kategorie {
  const Kategorie({required this.id, required this.name});

  factory Kategorie.ausJson(Map<String, dynamic> m) =>
      Kategorie(id: _ganz(m['id']) ?? 0, name: jsonText(m['name']) ?? 'Kategorie');

  final int id;
  final String name;
}

/// Art einer Lager-Buchung, wie die API sie nennt.
enum BuchungsArt {
  eingang('in', 'Eingang'),
  ausgang('out', 'Ausgang'),
  korrektur('correction', 'Korrektur'),
  inventur('inventory', 'Inventur');

  const BuchungsArt(this.wert, this.text);

  final String wert;
  final String text;

  static BuchungsArt? aus(Object? wert) {
    for (final a in values) {
      if (a.wert == wert) return a;
    }
    return null;
  }
}

/// Eine Buchung im Verlauf (`GET transactions?item_id=…`).
class Buchung {
  const Buchung({
    required this.id,
    this.art,
    this.menge = 0,
    this.vorher,
    this.nachher,
    this.grund,
    this.von,
    this.zeitpunkt,
  });

  factory Buchung.ausJson(Map<String, dynamic> m) => Buchung(
    id: _ganz(m['id']) ?? 0,
    art: BuchungsArt.aus(m['type']),
    menge: _ganz(m['quantity']) ?? 0,
    vorher: _ganz(m['previous_quantity']),
    nachher: _ganz(m['new_quantity']),
    grund: jsonText(m['reason']),
    von: jsonText(m['user_email']),
    zeitpunkt: jsonZeitpunkt(m['created_at']),
  );

  final int id;
  final BuchungsArt? art;
  final int menge;
  final int? vorher;
  final int? nachher;
  final String? grund;
  final String? von;
  final DateTime? zeitpunkt;

  /// "+3", "−2", "= 12".
  String get mengeText => switch (art) {
    BuchungsArt.eingang => '+$menge',
    BuchungsArt.ausgang => '−$menge',
    _ => '= ${nachher ?? menge}',
  };
}

/// Ergebnis von `POST items/:id/stock`.
class BuchungsErgebnis {
  const BuchungsErgebnis({required this.neuerBestand});

  factory BuchungsErgebnis.ausJson(Object? json) {
    final m = json is Map ? json : const {};
    final neu = _ganz(m['new_quantity']);
    if (neu == null) throw const FormatException('Die Antwort enthält keinen neuen Bestand.');
    return BuchungsErgebnis(neuerBestand: neu);
  }

  final int neuerBestand;
}

/// Angaben eines fremden Verzeichnisses (Open Food Facts, OpenGTINDB) zu
/// einem unbekannten Barcode — zum Vorbelegen beim Anlegen.
class ProduktVorschlag {
  const ProduktVorschlag({this.name, this.marke, this.beschreibung, this.kategorie});

  factory ProduktVorschlag.ausJson(Object? json) {
    final m = json is Map ? json : const {};
    return ProduktVorschlag(
      name: jsonText(m['name']),
      marke: jsonText(m['brand']),
      beschreibung: jsonText(m['description']),
      kategorie: jsonText(m['category']),
    );
  }

  final String? name;
  final String? marke;
  final String? beschreibung;
  final String? kategorie;
}

/// Was ein gescannter Code ist (`GET barcode/lookup/:code`).
sealed class ScanTreffer {
  const ScanTreffer(this.code);

  final String code;

  factory ScanTreffer.ausJson(String code, Object? json) {
    final m = json is Map ? json : const {};
    final gefunden = jsonWahr(m['found']) ?? false;
    final quelle = jsonText(m['source']);
    if (gefunden && quelle == 'local' && m['item'] is Map) {
      return ImLager(code, Artikel.ausJson(Map<String, dynamic>.from(m['item'] as Map)));
    }
    if (gefunden && m['product'] is Map) {
      return Unbekannt(code, vorschlag: ProduktVorschlag.ausJson(m['product']), quelle: quelle);
    }
    return Unbekannt(
      jsonText(m['ean_code']) ?? code,
      geprueft: [
        if (m['checked'] is List)
          for (final c in m['checked'] as List)
            if (c is Map && jsonText(c['source']) != null) jsonText(c['source'])!,
      ],
    );
  }
}

/// Der Code gehoert zu einem Artikel im Lager.
class ImLager extends ScanTreffer {
  const ImLager(super.code, this.artikel);

  final Artikel artikel;
}

/// Nicht im Lager — evtl. mit Angaben aus einem fremden Verzeichnis.
class Unbekannt extends ScanTreffer {
  const Unbekannt(super.code, {this.vorschlag, this.quelle, this.geprueft = const []});

  final ProduktVorschlag? vorschlag;

  /// `openfoodfacts` / `opengtindb`.
  final String? quelle;

  /// Gepruefte Quellen, wenn nirgends gefunden.
  final List<String> geprueft;
}

/// Ein neuer Artikel. Ohne EAN vergibt die Inventar-API selbst einen
/// eigenen Code (`FWV000123`).
class NeuerArtikel {
  const NeuerArtikel({
    required this.name,
    this.beschreibung,
    this.kategorieId,
    this.lagerortId,
    this.ean,
    this.einheit = 'Stück',
    this.bestand = 0,
    this.mindestbestand = 0,
  });

  final String name;
  final String? beschreibung;
  final int? kategorieId;
  final int? lagerortId;
  final String? ean;
  final String einheit;
  final int bestand;
  final int mindestbestand;

  Map<String, Object?> alsJson() => {
    'name': name.trim(),
    if (beschreibung != null && beschreibung!.trim().isNotEmpty)
      'description': beschreibung!.trim(),
    'category_id': ?kategorieId,
    'location_id': ?lagerortId,
    if (ean != null && ean!.trim().isNotEmpty) 'ean_code': ean!.trim(),
    'unit': einheit.trim().isEmpty ? 'Stück' : einheit.trim(),
    'quantity': bestand,
    'min_quantity': mindestbestand,
  };
}
