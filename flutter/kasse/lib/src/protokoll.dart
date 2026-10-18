// Geraete-Protokoll fuer die Fehlersuche im Nachhinein: sammelt Ereignisse
// (fehlgeschlagene Aufrufe, Buchungen, Zahlungen, Abbrueche, Puffer,
// Ortswechsel, Abstuerze) und schickt sie alle 20 s an
// POST /api/kasse/ereignisse (Backend src/protokoll.ts). Ohne Verbindung
// bleiben sie im Speicher des Geraets (hoechstens 1000) und gehen spaeter mit.
import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class Protokoll {
  Protokoll._();
  static final Protokoll ich = Protokoll._();

  static const _key = 'kasse_protokoll';
  SharedPreferences? _prefs;
  final List<Map<String, dynamic>> _warteschlange = [];
  Timer? _takt;
  bool _sendet = false;

  // Von KasseApi gesetzt
  String Function()? basis;
  String Function()? geraet;
  String Function()? ort;
  String version = '?';

  Future<void> starten(SharedPreferences prefs) async {
    _prefs = prefs;
    try {
      final alt = json.decode(prefs.getString(_key) ?? '[]');
      if (alt is List) _warteschlange.addAll(alt.whereType<Map<String, dynamic>>());
    } catch (_) {}
    _takt ??= Timer.periodic(const Duration(seconds: 20), (_) => senden());
  }

  /// Ereignis festhalten. [typ] kurz und maschinenlesbar (z.B. zahlung_ok).
  void merke(String typ, {String? meldung, int? bestellung, Map<String, dynamic>? daten}) {
    _warteschlange.add({
      'zeit': DateTime.now().toUtc().toIso8601String(),
      'typ': typ,
      'geraet': geraet?.call(),
      'quelle': 'app',
      'version': version,
      'ort': ort?.call(),
      'meldung': ?meldung,
      'bestellung': ?bestellung,
      'daten': ?daten,
    });
    if (_warteschlange.length > 1000) _warteschlange.removeRange(0, _warteschlange.length - 1000);
    _speichern();
  }

  void _speichern() {
    try {
      _prefs?.setString(_key, json.encode(_warteschlange));
    } catch (_) {}
  }

  Future<void> senden() async {
    final b = basis?.call();
    if (_sendet || _warteschlange.isEmpty || b == null) return;
    _sendet = true;
    final paket = _warteschlange.take(100).toList();
    try {
      final r = await http
          .post(Uri.parse('$b/api/kasse/ereignisse'),
              headers: {'Content-Type': 'application/json'}, body: json.encode({'ereignisse': paket}))
          .timeout(const Duration(seconds: 10));
      if (r.statusCode == 200) {
        _warteschlange.removeRange(0, paket.length);
        _speichern();
      }
    } catch (_) {
      // spaeter nochmals
    } finally {
      _sendet = false;
    }
  }
}

/// Kurzform: protokoll('zahlung_ok', bestellung: 12, daten: {...})
void protokoll(String typ, {String? meldung, int? bestellung, Map<String, dynamic>? daten}) =>
    Protokoll.ich.merke(typ, meldung: meldung, bestellung: bestellung, daten: daten);
