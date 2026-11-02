// Zugriff aufs Bestellsystem (order-backend): REST, Anmeldung, WebSocket.
//
// Android 7.1 (Kuechen-Tablet) kennt ISRG Root X2 nicht; die Kette von
// kasse-lokal.fwv-raura.ch (T400) und www.fwv-raura.ch fuehrt dorthin. Die
// frueheren App legte die Wurzeln per network_security_config bei - Dart
// beachtet die nicht. Darum ein eigener SecurityContext mit System-CAs plus
// X1/X2 (assets/), fuer HTTP und WebSocket.

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart' show rootBundle;
import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';

import 'modelle.dart';

/// Kasse vor Ort auf dem T400 im Roten Schopf: antwortet nur im Schopf-Netz.
/// Fuer Tests im Emulator umbiegbar (--dart-define, Skill fwv-kasse-testen) -
/// KUECHE_LOKAL dann immer setzen, sonst spricht die Test-App den echten T400 an.
const lokalUrl = String.fromEnvironment('KUECHE_LOKAL', defaultValue: 'https://kasse-lokal.fwv-raura.ch');
const cloudUrl = String.fromEnvironment('KUECHE_CLOUD', defaultValue: 'https://order.fwv-raura.ch');

/// Der Server hat das Token abgelehnt (401/403).
class AnmeldungAbgelehnt implements Exception {
  const AnmeldungAbgelehnt(this.status);
  final int status;
  @override
  String toString() => 'HTTP $status';
}

class Netz {
  Netz._(this._io);

  final HttpClient _io;
  late final http.Client client = IOClient(_io);

  /// Mit X1/X2 aus den Assets; ohne Assets (Tests) nur die System-CAs.
  static Future<Netz> erstellen() async {
    final kontext = SecurityContext(withTrustedRoots: true);
    for (final datei in const ['assets/isrg_root_x1.pem', 'assets/isrg_root_x2.pem']) {
      try {
        kontext.setTrustedCertificatesBytes(utf8.encode(await rootBundle.loadString(datei)));
      } on Object {
        // schon bekannt (neuere Android-Versionen) oder fehlt - egal
      }
    }
    final io = HttpClient(context: kontext)
      ..connectionTimeout = const Duration(seconds: 10)
      ..idleTimeout = const Duration(seconds: 15);
    return Netz._(io);
  }

  HttpClient get ioClient => _io;
}

/// Was die Anzeige vom Bestellsystem braucht (fuer Tests austauschbar).
abstract class Bestellsystem {
  String get url;

  Future<List<Bestellung>> bestellungen();
  Future<void> bestellungErledigt(int id);
  Future<void> positionenErledigt(int id, List<int> positionen);
}

class HttpBestellsystem implements Bestellsystem {
  HttpBestellsystem(this.netz, this.url, this.token);

  final Netz netz;
  @override
  final String url;
  final String? token;

  Uri _uri(String pfad) => Uri.parse('${url.replaceAll(RegExp(r'/+$'), '')}/api$pfad');

  Map<String, String> get _kopf => {
    'Content-Type': 'application/json',
    if (token != null) 'Authorization': 'Bearer $token',
  };

  void _pruefen(http.Response r) {
    if (r.statusCode == 401 || r.statusCode == 403) throw AnmeldungAbgelehnt(r.statusCode);
    if (r.statusCode >= 300) throw HttpException('HTTP ${r.statusCode}');
  }

  @override
  Future<List<Bestellung>> bestellungen() async {
    final r = await netz.client.get(_uri('/orders'), headers: _kopf).timeout(const Duration(seconds: 20));
    _pruefen(r);
    final j = jsonDecode(utf8.decode(r.bodyBytes));
    return [
      for (final o in (j is List ? j : const []))
        if (o is Map) Bestellung.ausJson(Map<String, dynamic>.from(o)),
    ];
  }

  @override
  Future<void> bestellungErledigt(int id) async {
    final r = await netz.client
        .patch(_uri('/orders/$id/complete'), headers: _kopf)
        .timeout(const Duration(seconds: 20));
    _pruefen(r);
  }

  @override
  Future<void> positionenErledigt(int id, List<int> positionen) async {
    final r = await netz.client
        .patch(_uri('/orders/$id/items/complete'), headers: _kopf, body: jsonEncode({'item_ids': positionen}))
        .timeout(const Duration(seconds: 20));
    _pruefen(r);
  }
}

/// Ergebnis von Anmeldung und Erneuerung.
sealed class AuthErgebnis {
  const AuthErgebnis();
}

class AuthOk extends AuthErgebnis {
  const AuthOk(this.token);
  final String token;
}

/// Server hat abgelehnt (falsches Passwort, gesperrt, Token ungueltig).
class AuthAbgelehnt extends AuthErgebnis {
  const AuthAbgelehnt(this.status, this.text);
  final int status;
  final String? text;
}

/// Netz oder Server nicht erreichbar - spaeter erneut versuchen.
class AuthUnerreichbar extends AuthErgebnis {
  const AuthUnerreichbar(this.text, {this.serverText});
  final String? text;
  final String? serverText;
}

class Anmeldedienst {
  const Anmeldedienst(this.netz);

  final Netz netz;

  /// Mit dem gemeinsamen Kassen-/Kuechen-Passwort: 30 Tage gueltiges Token.
  Future<AuthErgebnis> anmelden(String url, String passwort) =>
      _post('$url/api/auth/login', {'password': passwort});

  /// Datenblatt oder Anmeldebon: der Server loest den Code ein.
  Future<AuthErgebnis> qrAnmelden(String url, String code) => _post('$url/api/auth/qr-login', {'code': code});

  /// Noch gueltiges Token gegen ein frisches tauschen.
  Future<AuthErgebnis> erneuern(String url, String token) =>
      _post('$url/api/auth/refresh', const {}, token: token);

  Future<AuthErgebnis> _post(String adresse, Map<String, Object?> daten, {String? token}) async {
    try {
      final r = await netz.client
          .post(
            Uri.parse(adresse.replaceFirst(RegExp(r'(?<!:)//+'), '/')),
            headers: {
              'Content-Type': 'application/json',
              if (token != null) 'Authorization': 'Bearer $token',
            },
            body: jsonEncode(daten),
          )
          .timeout(const Duration(seconds: 15));
      Map? j;
      try {
        final d = jsonDecode(utf8.decode(r.bodyBytes));
        if (d is Map) j = d;
      } on FormatException {
        j = null;
      }
      // Fehlertext des Servers woertlich weitergeben («Falsches Passwort. Noch 2
      // Versuche übrig.», «IP gesperrt …»)
      final fehler = j?['error'] is String ? j!['error'] as String : null;
      if (r.statusCode >= 200 && r.statusCode < 300) {
        final t = j?['token'];
        return t is String && t.isNotEmpty ? AuthOk(t) : const AuthUnerreichbar('Antwort ohne Token');
      }
      if (r.statusCode >= 500) return AuthUnerreichbar(fehler ?? 'HTTP ${r.statusCode}', serverText: fehler);
      return AuthAbgelehnt(r.statusCode, fehler);
    } on Object catch (e) {
      return AuthUnerreichbar('$e');
    }
  }
}

/// Ist der T400 im Schopf erreichbar? Nur er meldet "vor_ort":true.
Future<bool> vorOrtErreichbar(Netz netz) async {
  try {
    final r = await netz.client.get(Uri.parse('$lokalUrl/api/health')).timeout(const Duration(seconds: 3));
    return r.statusCode == 200 && r.body.replaceAll(' ', '').contains('"vor_ort":true');
  } on Object {
    return false;
  }
}

/// WebSocket /ws mit Token im Kopf, Ping alle 20 s: eine tote Verbindung (WLAN
/// weg, Router neu) faellt so nach spaetestens ~40 s auf.
abstract class LiveVerbindung {
  Stream<WsNachricht?> get nachrichten;

  /// Wird geschlossen, wenn die Verbindung endet (auch bei Fehlern).
  Future<void> get ende;
  void schliessen();
}

typedef LiveVerbinder = Future<LiveVerbindung> Function(String url, String? token);

class IoLiveVerbindung implements LiveVerbindung {
  IoLiveVerbindung._(this._ws);

  final WebSocket _ws;
  final _ende = Completer<void>();
  late final Stream<WsNachricht?> _strom = _ws
      .map((t) {
        try {
          return WsNachricht.ausJson(jsonDecode(t is String ? t : utf8.decode(t as List<int>)));
        } on Object {
          return null;
        }
      })
      .handleError((Object _) {})
      .asBroadcastStream();

  static Future<LiveVerbindung> verbinden(Netz netz, String url, String? token) async {
    final ws = await WebSocket.connect(
      '${url.replaceFirst('https://', 'wss://').replaceFirst('http://', 'ws://').replaceAll(RegExp(r'/+$'), '')}/ws',
      headers: {if (token != null) 'Authorization': 'Bearer $token'},
      customClient: netz.ioClient,
    ).timeout(const Duration(seconds: 10));
    ws.pingInterval = const Duration(seconds: 20);
    final v = IoLiveVerbindung._(ws);
    ws.done.whenComplete(() {
      if (!v._ende.isCompleted) v._ende.complete();
    });
    return v;
  }

  @override
  Stream<WsNachricht?> get nachrichten => _strom;

  @override
  Future<void> get ende => _ende.future;

  @override
  void schliessen() {
    _ws.close(1000).ignore();
    if (!_ende.isCompleted) _ende.complete();
  }
}
