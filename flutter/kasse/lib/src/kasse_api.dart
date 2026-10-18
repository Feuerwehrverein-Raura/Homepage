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
import 'dart:io' show WebSocket;
import 'dart:math';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'kacheln.dart';
import 'protokoll.dart';

// Zum Testen gegen ein lokales Backend: --dart-define=KASSE_CLOUD=http://localhost:3999
const cloudBasis = String.fromEnvironment('KASSE_CLOUD', defaultValue: 'https://order.fwv-raura.ch');
const lokalBasis = String.fromEnvironment('KASSE_LOKAL', defaultValue: 'https://kasse-lokal.fwv-raura.ch');

class KasseFehler implements Exception {
  KasseFehler(this.meldung, {this.status});
  final String meldung;
  final int? status;
  bool get keinNetz => status == null;
  @override
  String toString() => meldung;
}

class Anlass {
  const Anlass(this.id, this.titel, {this.hatService = false});
  final String id;
  final String titel;
  /// Tische nur bei Anlaessen mit Service (wie die Web-Kasse)
  final bool hatService;
}

/// Position einer offenen Tisch-Bestellung
class TischPosition {
  TischPosition.ausJson(Map<String, dynamic> m)
      : id = (m['id'] as num).toInt(),
        name = '${m['item_name'] ?? ''}',
        menge = (m['quantity'] as num?)?.toInt() ?? 1,
        preis = double.tryParse('${m['price']}') ?? 0,
        bezahlt = m['paid'] == true,
        fertig = m['completed'] == true;
  final int id;
  final String name;
  final int menge;
  final double preis;
  final bool bezahlt;
  final bool fertig;
}

/// Offene Tisch-Bestellung (GET /api/orders)
class TischBestellung {
  TischBestellung.ausJson(Map<String, dynamic> m)
      : id = (m['id'] as num).toInt(),
        tisch = (m['table_number'] as num?)?.toInt() ?? 0,
        status = '${m['status'] ?? ''}',
        total = double.tryParse('${m['total']}') ?? 0,
        bezahltBetrag = double.tryParse('${m['paid_amount'] ?? 0}') ?? 0,
        direktBezahlt = m['payment_method'] != null,
        erstellt = DateTime.tryParse('${m['created_at']}'),
        positionen = (m['items'] as List? ?? const []).whereType<Map<String, dynamic>>().map(TischPosition.ausJson).toList();
  final int id;
  final int tisch;
  final String status;
  final double total;
  final double bezahltBetrag;
  final bool direktBezahlt;
  final DateTime? erstellt;
  final List<TischPosition> positionen;

  /// Was noch offen ist. Direkt (Bar/TWINT/Karte) bezahlte Bestellungen haben
  /// payment_method, aber keine Teilzahlungen - die zaehlen als bezahlt.
  double get offen => status == 'cancelled' || direktBezahlt ? 0 : total - bezahltBetrag;
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

  static Future<KasseApi> laden() async {
    final api = KasseApi._(await SharedPreferences.getInstance());
    final p = Protokoll.ich
      ..basis = (() => api.basis)
      ..geraet = (() => api.geraet)
      ..ort = (() => api.lokal ? 'schopf' : 'cloud');
    await p.starten(api._prefs);
    return api;
  }

  final SharedPreferences _prefs;
  final _client = http.Client();
  String basis = cloudBasis;
  int _fehlschlaege = 0;
  final ortGeaendert = StreamController<bool>.broadcast();

  // ---- Live-Meldungen (WebSocket /ws wie die Web-Kasse) --------------------
  // new_order, order_updated, order_completed, items_completed, print_failed.
  // Haelt die Verbindung zum aktuellen Ort (Schopf/Cloud), verbindet nach
  // Abbruch oder Ortswechsel neu.
  final live = StreamController<Map<String, dynamic>>.broadcast();
  WebSocket? _ws;
  String? _wsBasis;
  Timer? _wsTakt;

  void liveStarten() {
    _wsTakt ??= Timer.periodic(const Duration(seconds: 10), (_) => _wsPruefen());
    _wsPruefen();
  }

  Future<void> _wsPruefen() async {
    final t = token;
    if (t == null) return;
    if (_ws != null && _wsBasis == basis && _ws!.readyState == WebSocket.open) return;
    try {
      await _ws?.close();
    } catch (_) {}
    _ws = null;
    final ziel = basis;
    try {
      final ws = await WebSocket.connect('${ziel.replaceFirst('https:', 'wss:').replaceFirst('http:', 'ws:')}/ws',
              headers: {'Authorization': 'Bearer $t'})
          .timeout(const Duration(seconds: 8));
      ws.pingInterval = const Duration(seconds: 25);
      _ws = ws;
      _wsBasis = ziel;
      ws.listen(
        (n) {
          try {
            final d = json.decode('$n');
            if (d is Map<String, dynamic>) live.add(d);
          } catch (_) {}
        },
        onDone: () => _ws = null,
        onError: (_) => _ws = null,
        cancelOnError: true,
      );
      live.add({'type': 'verbunden'});
    } catch (e) {
      protokoll('live_fehler', meldung: '$e', daten: {'basis': ziel});
    }
  }

  bool get lokal => basis == lokalBasis;

  /// Geraete-Freigabe (backend src/geraete.ts): feste Kennung dieses Geraets,
  /// geht mit jeder Anfrage mit; der Vorstand gibt sie per Kurzcode frei.
  String get geraet {
    final alt = _prefs.getString('kasse_geraet');
    if (alt != null && RegExp(r'^[A-Za-z0-9_-]{8,64}$').hasMatch(alt)) return alt;
    final z = Random.secure();
    const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
    final neu = 'a${List.generate(19, (_) => abc[z.nextInt(abc.length)]).join()}';
    _prefs.setString('kasse_geraet', neu);
    return neu;
  }

  String get geraetCode {
    final s = geraet.replaceAll(RegExp(r'[^A-Za-z0-9]'), '').toUpperCase();
    return '${s.substring(0, 4)}-${s.substring(4, 8)}';
  }

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
    protokoll('anmeldung', meldung: '${d['name'] ?? 'Kasse'}');
  }

  Future<void> abmelden() async {
    protokoll('abmeldung');
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
      'X-Kasse-Geraet': geraet,
      'X-Kasse-Geraet-Name': 'Kassen-App',
      'X-Kasse-Geraet-Typ': 'app',
    };
    http.Response r;
    try {
      final req = http.Request(methode, uri)..headers.addAll(kopf);
      if (daten != null) req.body = json.encode(daten);
      r = await http.Response.fromStream(await _client.send(req).timeout(zeit)).timeout(zeit);
    } on TimeoutException {
      protokoll('anfrage_fehler', meldung: 'Keine Antwort vom Server', daten: {'methode': methode, 'pfad': pfad, 'basis': an ?? basis});
      throw KasseFehler('Keine Antwort vom Server');
    } catch (e) {
      protokoll('anfrage_fehler', meldung: 'Keine Verbindung: $e', daten: {'methode': methode, 'pfad': pfad, 'basis': an ?? basis});
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
      protokoll('anfrage_fehler', meldung: text, daten: {'methode': methode, 'pfad': pfad, 'status': r.statusCode, 'basis': an ?? basis});
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
    if (basis != vorher) {
      protokoll('ort_wechsel', meldung: lokal ? 'Schopf (T400)' : 'Cloud');
      ortGeaendert.add(lokal);
    }
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
  /// Artikel; ohne Verbindung die zuletzt geladene Liste (auch nach Neustart).
  Future<List<Artikel>> artikel() async {
    List d;
    try {
      d = await _anfrage('GET', '/items') as List;
      if (d.isNotEmpty) await _prefs.setString('kasse_artikel', json.encode(d));
    } on KasseFehler catch (e) {
      final alt = _prefs.getString('kasse_artikel');
      if (alt == null || !_nachsenden(e)) rethrow;
      d = json.decode(alt) as List;
    }
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

  // ---- Einstellungen (wie die Web-Kasse) -----------------------------------
  Future<void> einstellungenSpeichern(Map<String, String> werte) => _anfrage('PUT', '/settings', daten: werte);

  /// Testdruck an einen Bondrucker; liefert die Meldung des Servers.
  Future<void> testdruck(String station, String ip, String port, String protokoll) => _anfrage('POST', '/settings/test-printer',
      daten: {'station': station, 'ip': ip, 'port': port, 'protocol': protokoll}, zeit: const Duration(seconds: 40));

  /// Kassen-Anmeldebon am Bar-Drucker; liefert "gilt bis" (lokale Zeit).
  Future<DateTime?> kassenbonDrucken() async {
    final d = await _anfrage('POST', '/auth/kassenbon', zeit: const Duration(seconds: 40));
    return d is Map ? DateTime.tryParse('${d['gilt_bis']}')?.toLocal() : null;
  }

  /// Anlass-Stand: ({id, titel} | null, modus, auswahl) und die waehlbaren Anlaesse.
  Future<(Map<String, dynamic>, List<Map<String, dynamic>>)> anlassStand() async {
    final stand = await _anfrage('GET', '/anlass') as Map<String, dynamic>;
    List<Map<String, dynamic>> liste = [];
    try {
      final l = await _anfrage('GET', '/anlass/liste') as Map<String, dynamic>;
      liste = (l['anlaesse'] as List? ?? const []).whereType<Map<String, dynamic>>().toList();
    } catch (_) {}
    return (stand, liste);
  }

  /// Anlass waehlen (null = automatisch).
  Future<void> anlassWaehlen(String? id) => _anfrage('PUT', '/anlass/auswahl', daten: {'event_id': id});

  Future<Anlass?> anlass() async {
    try {
      final d = await _anfrage('GET', '/anlass') as Map<String, dynamic>;
      final a = d['anlass'];
      return a is Map ? Anlass('${a['id']}', '${a['titel']}', hatService: d['hat_service'] == true) : null;
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

  // ---- Tische ---------------------------------------------------------------
  /// Offene Tisch-Bestellungen (Tisch > 0, noch etwas zu bezahlen)
  Future<List<TischBestellung>> offeneTische() async {
    final d = await _anfrage('GET', '/orders') as List;
    return d
        .whereType<Map<String, dynamic>>()
        .map(TischBestellung.ausJson)
        .where((b) => b.tisch > 0 && b.offen > 0.009)
        .toList();
  }

  /// Betrag auf die Bestellungen eines Tisches verteilen (aelteste zuerst).
  /// Liefert true, wenn danach alles bezahlt ist.
  Future<bool> tischBezahlen(List<TischBestellung> bestellungen, double betrag, String zahlung, String beschreibung) async {
    var rest = betrag;
    var allesBezahlt = true;
    final sortiert = [...bestellungen]..sort((a, b) => a.id.compareTo(b.id));
    for (final b in sortiert) {
      if (rest <= 0.009) break;
      final teil = rest < b.offen ? rest : b.offen;
      if (teil <= 0.009) continue;
      final d = await _anfrage('POST', '/orders/${b.id}/split-payment',
          daten: {'amount': double.parse(teil.toStringAsFixed(2)), 'payment_method': zahlung, 'description': beschreibung}) as Map<String, dynamic>;
      if (d['all_paid'] != true) allesBezahlt = false;
      rest -= teil;
    }
    return allesBezahlt && rest <= 0.009;
  }

  /// Nach Posten bezahlen (ganze Zeilen): je Bestellung pay-items, das die
  /// Posten als bezahlt markiert und die Zahlung bucht.
  /// [nachBestellung]: Bestellung -> (Posten-IDs, Text fuer diese Zahlung)
  Future<void> postenBezahlen(Map<int, (List<int>, String)> nachBestellung, String zahlung) async {
    for (final e in nachBestellung.entries) {
      await _anfrage('POST', '/orders/${e.key}/pay-items',
          daten: {'item_ids': e.value.$1, 'payment_method': zahlung, 'description': e.value.$2});
    }
  }

  /// Quittung fuer einen Tisch am Bar-Drucker (backend src/quittung.ts).
  Future<void> quittungDrucken(int tisch, List<int> bestellungen) =>
      _anfrage('POST', '/quittung', daten: {'tisch': tisch, 'bestellungen': bestellungen}, zeit: const Duration(seconds: 40));

  /// Bar-Licht (Spot 1 + Girlande blinken bei Bar-Bestellungen) ein/aus.
  Future<bool> barlichtLesen() async => ((await _anfrage('GET', '/barlicht')) as Map)['an'] == true;
  Future<void> barlichtSetzen(bool an) => _anfrage('PUT', '/barlicht', daten: {'an': an});

  /// Tischkarten am Bar-Drucker (nur am T400). Liefert die Anzahl.
  Future<int> tischkartenDrucken(int von, int bis) async {
    final d = await _anfrage('POST', '/tischkarten/drucken', daten: {'von': von, 'bis': bis}, zeit: const Duration(seconds: 60));
    return d is Map ? (d['gedruckt'] as num?)?.toInt() ?? 0 : 0;
  }

  /// Position stornieren; von der Kueche bestaetigte nur mit trotzKueche.
  Future<void> stornieren(int bestellung, int position, {bool trotzKueche = false}) =>
      _anfrage('DELETE', '/orders/$bestellung/items/$position${trotzKueche ? '?trotz_kueche=1' : ''}');

  /// Bestellung stornieren (Tisch aufloesen); Teilzahlungen bleiben verbucht.
  Future<void> bestellungStornieren(int bestellung) => _anfrage('POST', '/orders/$bestellung/cancel');

  // ---- Zwischenspeicher bei schlechter Verbindung --------------------------
  // Wie die Web-Kasse: Bar-Bestellung ohne Antwort (kein Netz, Zeitlimit,
  // Server 5xx) wird gemerkt und die Kasse arbeitet weiter (lokale Nummer
  // < 0). Ein Takt sendet nach; client_ref verhindert doppeltes Buchen.
  // Zahlungen, die nicht ankamen, werden ebenso nachgereicht.
  static const _pufferKey = 'kasse_puffer';
  final pufferGeaendert = StreamController<int>.broadcast();
  bool _pufferLaeuft = false;

  List<Map<String, dynamic>> _pufferLesen() {
    try {
      final l = json.decode(_prefs.getString(_pufferKey) ?? '[]');
      return l is List ? l.whereType<Map<String, dynamic>>().toList() : [];
    } catch (_) {
      return [];
    }
  }

  Future<void> _pufferSchreiben(List<Map<String, dynamic>> l) async {
    await _prefs.setString(_pufferKey, json.encode(l));
    pufferGeaendert.add(pufferOffen);
  }

  /// Noch nicht ganz beim Server (Bestellung ohne Server-Nummer oder Zahlung offen).
  int get pufferOffen => _pufferLesen().where((e) => e['art'] == 'zahlung' || e['serverId'] == null || e['zahlung'] != null).length;

  static bool _nachsenden(KasseFehler e) => e.keinNetz || (e.status ?? 0) >= 500;

  /// Bestellen; ohne Verbindung (nur Bar, tisch 0) in den Puffer.
  Future<AngelegteBestellung> bestellenOderPuffern(List<Position> positionen) async {
    final ref = neueRef();
    try {
      return await bestellen(positionen, clientRef: ref);
    } on KasseFehler catch (e) {
      if (!_nachsenden(e)) rethrow;
      final lokaleId = -DateTime.now().millisecondsSinceEpoch;
      final l = _pufferLesen()
        ..add({
          'art': 'bestellung',
          'ref': ref,
          'lokaleId': lokaleId,
          'erstellt': DateTime.now().millisecondsSinceEpoch,
          'body': {
            'table_number': 0,
            'client_ref': ref,
            'erfasst_um': DateTime.now().toUtc().toIso8601String(),
            'items': positionen.map((p) => p.alsJson()).toList(),
          },
        });
      await _pufferSchreiben(l);
      protokoll('puffer_bestellung', meldung: e.meldung, daten: {'ref': ref, 'lokaleId': lokaleId, 'positionen': positionen.length});
      return AngelegteBestellung(lokaleId, positionen.fold(0.0, (s, p) => s + p.summe), const []);
    }
  }

  /// Zahlung melden; lokale Bestellung -> am Puffer-Eintrag merken; ohne
  /// Verbindung -> als Zahlung puffern. false nur bei klarer Ablehnung.
  Future<bool> bezahltOderPuffern(int bestellung, String zahlung) async {
    if (bestellung < 0) {
      final l = _pufferLesen();
      for (final e in l) {
        if (e['lokaleId'] == bestellung) e['zahlung'] = zahlung;
      }
      await _pufferSchreiben(l);
      unawaited(pufferSenden());
      return true;
    }
    try {
      await bezahlt(bestellung, zahlung);
      return true;
    } on KasseFehler catch (e) {
      if (!_nachsenden(e)) return false;
      protokoll('puffer_zahlung', meldung: e.meldung, bestellung: bestellung, daten: {'zahlung': zahlung});
      await _pufferSchreiben(_pufferLesen()..add({'art': 'zahlung', 'ref': neueRef(), 'orderId': bestellung, 'zahlung': zahlung, 'erstellt': DateTime.now().millisecondsSinceEpoch}));
      return true;
    }
  }

  /// Puffer nachsenden (Takt, nach jeder Zahlung).
  Future<void> pufferSenden() async {
    if (_pufferLaeuft || token == null) return;
    _pufferLaeuft = true;
    try {
      for (final e in _pufferLesen()) {
        var fertig = false;
        final neu = <String, dynamic>{};
        try {
          if (e['art'] == 'bestellung') {
            var serverId = e['serverId'] as int?;
            if (serverId == null) {
              final d = await _anfrage('POST', '/orders', daten: e['body'], zeit: const Duration(seconds: 20)) as Map<String, dynamic>;
              serverId = (d['id'] as num).toInt();
              neu['serverId'] = serverId;
            }
            if (e['zahlung'] != null) {
              await bezahlt(serverId, e['zahlung'] as String);
              fertig = true;
            } else if (DateTime.now().millisecondsSinceEpoch - (e['erstellt'] as int) > 12 * 3600 * 1000) {
              fertig = true;
            }
          } else {
            await bezahlt(e['orderId'] as int, e['zahlung'] as String);
            fertig = true;
          }
        } on KasseFehler catch (f) {
          if (_nachsenden(f) || f.status == 401 || f.status == 403) break; // spaeter nochmals
          fertig = true; // Server lehnt ab - nicht ewig wiederholen
          protokoll('puffer_verworfen', meldung: f.meldung, daten: {'eintrag': e});
        }
        if (fertig) protokoll('puffer_gesendet', bestellung: (neu['serverId'] ?? e['serverId'] ?? e['orderId']) as int?, daten: {'art': e['art'], 'ref': e['ref']});
        // frisch lesen: inzwischen kann die Kasse Neues gepuffert haben
        final l = _pufferLesen();
        final i = l.indexWhere((x) => x['ref'] == e['ref']);
        if (i >= 0) {
          if (fertig) {
            l.removeAt(i);
          } else {
            l[i] = {...l[i], ...neu};
          }
          await _pufferSchreiben(l);
        }
      }
    } finally {
      _pufferLaeuft = false;
    }
  }
}
