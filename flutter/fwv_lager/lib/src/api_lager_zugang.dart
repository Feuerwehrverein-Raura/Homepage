// Zugang ueber die Inventar-API (https://inventar.fwv-raura.ch/api/,
// simple-inventory-system/backend). Angemeldet mit dem Authentik-Token der
// App; das Inventar nimmt es nur mit Gruppe Lager, Vorstand oder admin an.
//
// Routen:
//   GET  items?search=          Artikel
//   GET  items/:id              Artikel mit `locations` (Bestand je Kiste)
//   GET  transactions?item_id=&limit=
//   POST items/:id/stock        {type: in|out, quantity, reason}
//   GET  barcode/lookup/:code   lokal, Open Food Facts, OpenGTINDB
//   PATCH items/:id/barcode     {ean_code}
//   GET  locations/overview, locations/:id
//   GET  reports/low-stock
//   GET  categories, barcode/next
//   POST items                  ohne EAN vergibt das Backend FWV000123
//   PATCH items/:id/ausleihbar, locations/:id/ausleihbar  {ausleihbar}

import 'package:fwv_core/fwv_core.dart';

import 'modelle.dart';
import 'zugang.dart';

/// Basis der Inventar-API.
final Uri inventarApiBasis = Uri.parse('https://inventar.fwv-raura.ch/api/');

class ApiLagerZugang extends LagerZugang {
  const ApiLagerZugang(this.api);

  /// Am besten `SitzungsVerwaltung.apiFuer(inventarApiBasis)`.
  final ApiClient api;

  static String _e(String s) => Uri.encodeComponent(s);

  @override
  Future<List<Artikel>> artikel({String? suche}) async {
    final s = suche?.trim();
    return jsonListe(
      await api.get('items', abfrage: s == null || s.isEmpty ? null : {'search': s}),
      Artikel.ausJson,
    );
  }

  @override
  Future<Artikel> artikelDetail(int id) async {
    final json = await api.get('items/$id');
    if (json is! Map) throw const ApiFehler('Der Artikel wurde nicht gefunden.', status: 404);
    return Artikel.ausJson(Map<String, dynamic>.from(json));
  }

  @override
  Future<List<Buchung>> verlauf(int artikelId, {int anzahl = 10}) async => jsonListe(
    await api.get('transactions', abfrage: {'item_id': '$artikelId', 'limit': '$anzahl'}),
    Buchung.ausJson,
  );

  @override
  Future<int> buchen(int artikelId, BuchungsArt art, int menge, {String? notiz}) async {
    final n = notiz?.trim();
    final antwort = await api.post(
      'items/$artikelId/stock',
      daten: {
        'type': art.wert,
        'quantity': menge,
        'reason': (n == null || n.isEmpty) ? '${art.text} (App)' : n,
      },
    );
    return BuchungsErgebnis.ausJson(antwort).neuerBestand;
  }

  @override
  Future<ScanTreffer> codeSuchen(String code) async =>
      ScanTreffer.ausJson(code, await api.get('barcode/lookup/${_e(code)}'));

  @override
  Future<Artikel> codeZuordnen(int artikelId, String code) async {
    final json = await api.patch('items/$artikelId/barcode', daten: {'ean_code': code.trim()});
    return Artikel.ausJson(json is Map ? Map<String, dynamic>.from(json) : const {});
  }

  @override
  Future<List<Lagerort>> lagerorte() async =>
      jsonListe(await api.get('locations/overview'), Lagerort.ausJson);

  @override
  Future<LagerortInhalt> lagerort(int id) async =>
      LagerortInhalt.ausJson(await api.get('locations/$id'));

  @override
  Future<List<Artikel>> nachbestellen() async =>
      jsonListe(await api.get('reports/low-stock'), Artikel.ausJson);

  @override
  Future<List<Kategorie>> kategorien() async =>
      jsonListe(await api.get('categories'), Kategorie.ausJson);

  @override
  Future<String?> naechsterCode() async {
    final json = await api.get('barcode/next');
    return json is Map ? jsonText(json['next_code']) : null;
  }

  @override
  Future<Artikel> anlegen(NeuerArtikel artikel) async {
    final json = await api.post('items', daten: artikel.alsJson());
    if (json is! Map) throw const ApiFehler('Der Artikel wurde nicht angelegt.');
    return Artikel.ausJson(Map<String, dynamic>.from(json));
  }

  @override
  Future<void> artikelAusleihbar(int artikelId, bool ausleihbar) async {
    await api.patch('items/$artikelId/ausleihbar', daten: {'ausleihbar': ausleihbar});
  }

  @override
  Future<void> lagerortAusleihbar(int lagerortId, bool ausleihbar) async {
    await api.patch('locations/$lagerortId/ausleihbar', daten: {'ausleihbar': ausleihbar});
  }

  /// Bilder liegen unter `/api/uploads/…` auf dem Inventar-Server.
  @override
  Uri? bildAdresse(String? pfad) {
    if (pfad == null || pfad.isEmpty) return null;
    final ziel = api.basis.resolve(pfad);
    return ziel.scheme == 'https' || ziel.host == api.basis.host ? ziel : null;
  }

  @override
  Map<String, String> bildKopfzeilen(Uri adresse) => api.kopfzeilenFuer(adresse);
}
