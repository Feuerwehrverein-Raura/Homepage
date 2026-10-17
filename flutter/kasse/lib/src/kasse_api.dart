// Verbindung der nativen Kasse zum order-backend (Oktober 2026).
//
// Zwei Server mit derselben API:
//  - T400 im Roten Schopf: https://kasse-lokal.fwv-raura.ch (Bons direkt,
//    auch ohne Internet; der Router loest den Namen selbst auf)
//  - Cloud: https://order.fwv-raura.ch
// Die App fragt alle 20 s, ob der T400 antwortet ("vor_ort": true) - hin
// sofort, zurueck in die Cloud erst nach zwei Fehlschlaegen.
//
// Anmeldung: Kassen-Token (HS256) aus /api/auth/qr-login (Kassen-QR,
// Anmeldebon, Datenblatt) oder /api/auth/login (Kassen-Passwort). Es gilt auf
// beiden Servern (gleiches JWT_SECRET) und wird taeglich erneuert.
import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'kacheln.dart';

const cloudBasis = 'https://order.fwv-raura.ch';
const lokalBasis = 'https://kasse-lokal.fwv-raura.ch';

class KasseFehler implements Exception {
  KasseFehler(this.meldung, {this.status});
  final String meldung;
  final int? status;
  bool get keinNetz => status == null;
  @override
  String toString() => meldung;
}

class Anlass {
  const Anlass(this.id, this.titel);
  final String id;
  final String titel;
}

class Position {
  Position(this.artikel, {this.menge = 1, this.notiz = '', this.sonderPreis});
  final Artikel artikel;
  int menge;
  String notiz;
  final double? sonderPreis;
  double get preis => sonderPreis ?? artikel.preis;
  double get summe => preis * menge;

  Map<String, dynamic> alsJson() => {
        'id': sonderPreis != null ? null : artikel.id,
        'quantity': menge,
        'price': preis,
        'notes': notiz.isEmpty ? null : notiz,
        'item_name': artikel.anzeige,
        'printer_station': artikel.station,
        'is_custom': sonderPreis != null,
      };
}

class AngelegteBestellung {
  AngelegteBestellung(this.id, this.total, this.druckfehler);
  final int id;
  final double total;
  final List<String> druckfehler;
}

class KasseApi {
  KasseApi._(this._prefs);

  static Future<KasseApi> laden() async => KasseApi._(await SharedPreferences.getInstance());

  final SharedPreferences _prefs;
  final _client = http.Client();
  String basis = cloudBasis;
  int _fehlschlaege = 0;
  final ortGeaendert = StreamController<bool>.broadcast();

  bool get lokal => basis == lokalBasis;
  String? get token => _prefs.getString('kasse_token');
  String? get name => _prefs.getString('kasse_name');
  bool get angemeldet => token != null && !_abgelaufen(token!);

  static bool _abgelaufen(String jwt) {
    try {
      final teil = jwt.split('.')[1];
      final daten = json.decode(utf8.decode(base64Url.decode(base64Url.normalize(teil)))) as Map;
      final exp = (daten['exp'] as num?)?.toInt();
      return exp != null && DateTime.fromMillisecondsSinceEpoch(exp * 1000).isBefore(DateTime.now());
    } catch (_) {
      return true;
    }
  }

  Future<void> _anmeldungMerken(Map<String, dynamic> d) async {
    final t = d['token'];
    if (t is! String || t.isEmpty) throw KasseFehler('Antwort ohne Zugang');
    await _prefs.setString('kasse_token', t);
    await _prefs.setString('kasse_name', '${d['name'] ?? 'Kasse'}');
  }

  Future<void> abmelden() async {
    await _prefs.remove('kasse_token');
    await _prefs.remove('kasse_name');
  }

  // ---- HTTP ---------------------------------------------------------------
  Future<dynamic> _anfrage(String methode, String pfad, {Object? daten, Duration zeit = const Duration(seconds: 15), String? an}) async {
    final uri = Uri.parse('${an ?? basis}/api$pfad');
    final kopf = <String, String>{
      'Accept': 'application/json',
      if (daten != null) 'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
    http.Response r;
    try {
      final req = http.Request(methode, uri)..headers.addAll(kopf);
      if (daten != null) req.body = json.encode(daten);
      r = await http.Response.fromStream(await _client.send(req).timeout(zeit)).timeout(zeit);
    } on TimeoutException {
      throw KasseFehler('Keine Antwort vom Server');
    } catch (_) {
      throw KasseFehler('Keine Verbindung');
    }
    dynamic d;
    try {
      d = r.body.isEmpty ? null : json.decode(utf8.decode(r.bodyBytes));
    } catch (_) {
      d = null;
    }
    if (r.statusCode >= 400) {
      final text = d is Map && d['error'] is String ? d['error'] as String : 'Fehler ${r.statusCode}';
      throw KasseFehler(text, status: r.statusCode);
    }
    return d;
  }

  // ---- Ort: T400 oder Cloud ----------------------------------------------
  Future<bool> _lokalErreichbar() async {
    try {
      final r = await _client.get(Uri.parse('$lokalBasis/api/health')).timeout(const Duration(milliseconds: 2500));
      return r.statusCode == 200 && (json.decode(r.body) as Map)['vor_ort'] == true;
    } catch (_) {
      return false;
    }
  }

  Future<void> ortPruefen() async {
    final da = await _lokalErreichbar();
    final vorher = basis;
    if (da) {
      _fehlschlaege = 0;
      basis = lokalBasis;
    } else {
      _fehlschlaege++;
      if (basis == lokalBasis && _fehlschlaege >= 2) basis = cloudBasis;
    }
    if (basis != vorher) ortGeaendert.add(lokal);
  }

  // ---- Anmeldung -----------------------------------------------------------
  /// QR-Code: Kassen-QR, Anmeldebon oder Datenblatt (Server prueft).
  Future<void> mitQrAnmelden(String code) async =>
      _anmeldungMerken(await _anfrage('POST', '/auth/qr-login', daten: {'code': code}) as Map<String, dynamic>);

  Future<void> mitPasswortAnmelden(String passwort) async =>
      _anmeldungMerken(await _anfrage('POST', '/auth/login', daten: {'password': passwort}) as Map<String, dynamic>);

  /// Kassen-Token erneuern (taeglich, 30 Tage gueltig).
  Future<void> erneuern() async {
    if (token == null) return;
    try {
      final d = await _anfrage('POST', '/auth/refresh') as Map<String, dynamic>;
      if (d['token'] is String) await _prefs.setString('kasse_token', d['token'] as String);
    } catch (_) {
      // spaeter nochmals
    }
  }

  // ---- Daten -----------------------------------------------------------------
  Future<List<Artikel>> artikel() async {
    final d = await _anfrage('GET', '/items') as List;
    return d.whereType<Map<String, dynamic>>().map(Artikel.ausJson).toList();
  }

  Future<Map<String, String>> einstellungen() async {
    try {
      final d = await _anfrage('GET', '/settings') as Map<String, dynamic>;
      return d.map((k, v) => MapEntry(k, '${v ?? ''}'));
    } catch (_) {
      return {};
    }
  }

  Future<Anlass?> anlass() async {
    try {
      final d = await _anfrage('GET', '/anlass') as Map<String, dynamic>;
      final a = d['anlass'];
      return a is Map ? Anlass('${a['id']}', '${a['titel']}') : null;
    } catch (_) {
      return null;
    }
  }

  /// Bild-Adresse des TWINT-QR (Anlass oder Standard).
  Future<String?> twintQrAdresse() async {
    try {
      final d = await _anfrage('GET', '/twint-qr') as Map<String, dynamic>;
      final url = d['url'];
      if (url is! String || url.isEmpty) return null;
      if (url.startsWith('http')) return url;
      // relative Adressen ("/api/twint-qr/bild/..." oder "/twint-qr.png") gelten
      // fuer die Cloud-Oberflaeche
      return '$cloudBasis$url';
    } catch (_) {
      return null;
    }
  }

  // ---- Bestellen und bezahlen ----------------------------------------------
  static String neueRef() {
    final z = Random.secure();
    return 'k${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}-${List.generate(10, (_) => z.nextInt(36).toRadixString(36)).join()}';
  }

  /// Bestellung anlegen (Bar: tisch 0). clientRef macht doppeltes Senden
  /// harmlos (der Server bucht nur einmal).
  Future<AngelegteBestellung> bestellen(List<Position> positionen, {int tisch = 0, String? clientRef}) async {
    final d = await _anfrage('POST', '/orders', zeit: const Duration(seconds: 20), daten: {
      'table_number': tisch,
      'client_ref': clientRef ?? neueRef(),
      'erfasst_um': DateTime.now().toUtc().toIso8601String(),
      'items': positionen.map((p) => p.alsJson()).toList(),
    }) as Map<String, dynamic>;
    final fehler = (d['druckfehler'] as List? ?? const [])
        .whereType<Map>()
        .map((f) => '${f['station'] == 'kitchen' ? 'Küche' : f['station'] == 'bar' ? 'Bar' : f['station']}: ${f['meldung']}')
        .toList();
    return AngelegteBestellung((d['id'] as num).toInt(), positionen.fold(0.0, (s, p) => s + p.summe), fehler);
  }

  /// zahlung: 'cash' | 'twint' | 'card'
  Future<void> bezahlt(int bestellung, String zahlung) =>
      _anfrage('PUT', '/orders/$bestellung/status', daten: {'status': 'paid', 'payment_method': zahlung});
}
