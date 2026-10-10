// Zugriff auf das Backend (https://api.fwv-raura.ch/): JSON hin und zurueck,
// `Authorization: Bearer` und automatisches Erneuern abgelaufener Tokens.
//
// Ablauf wie in den alten Apps (members-android AuthInterceptor.kt,
// members-ios AuthManager.swift): Antwortet das Backend mit 401 oder 403, wird
// die Sitzung genau einmal erneuert und der Aufruf mit dem neuen Token
// wiederholt. Klappt das Erneuern nicht, ist die Sitzung vorbei
// ([SitzungAbgelaufen]).

import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../auth/konfiguration.dart';

/// Ausgang eines Erneuerungsversuchs.
enum Erneuerung {
  /// Es gibt ein frisches Token — der Aufruf kann wiederholt werden.
  erneuert,

  /// Weder Refresh-Token noch QR-Code werden angenommen: neu anmelden.
  abgelaufen,

  /// Server nicht erreichbar. Die Sitzung bleibt, spaeter erneut versuchen.
  nichtErreichbar,
}

/// Woher der [ApiClient] sein Token bekommt und wer es erneuert.
abstract interface class TokenQuelle {
  /// Das aktuell gueltige Access-Token, oder null ohne Anmeldung.
  String? get accessToken;

  /// Besorgt ein neues Token. [verbrauchtesToken] ist das Token, mit dem der
  /// Aufruf gescheitert ist: hat inzwischen ein anderer Aufruf erneuert, ist
  /// nichts weiter zu tun. Gleichzeitige Aufrufe teilen sich einen Versuch.
  Future<Erneuerung> erneuern(String? verbrauchtesToken);
}

/// Fehler eines Backend-Aufrufs. [meldung] ist fuer Menschen gedacht: der
/// Text, den das Backend in `error` oder `message` mitschickt, sonst ein
/// allgemeiner Satz.
class ApiFehler implements Exception {
  const ApiFehler(this.meldung, {this.status});

  /// Keine Antwort (kein Netz, Zeitueberschreitung).
  const ApiFehler.keineVerbindung()
    : meldung = 'Keine Verbindung zum Server. Bitte später erneut versuchen.',
      status = null;

  final String meldung;

  /// HTTP-Status, oder null, wenn keine Antwort kam.
  final int? status;

  @override
  String toString() => status == null ? 'ApiFehler: $meldung' : 'ApiFehler $status: $meldung';
}

/// Die Sitzung ist abgelaufen und liess sich nicht erneuern.
class SitzungAbgelaufen extends ApiFehler {
  const SitzungAbgelaufen() : super('Sitzung abgelaufen — bitte neu anmelden.', status: 401);
}

class ApiClient {
  ApiClient({
    required this._http,
    this.tokenQuelle,
    Uri? basis,
    this.zeitlimit = const Duration(seconds: 30),
  }) : basis = basis ?? apiBasis;

  final http.Client _http;

  /// Ohne Token-Quelle gehen die Aufrufe ohne Anmeldung raus (Login-Routen).
  final TokenQuelle? tokenQuelle;
  final Uri basis;
  final Duration zeitlimit;

  Future<dynamic> get(String pfad, {Map<String, String>? abfrage}) =>
      _senden('GET', pfad, abfrage: abfrage);

  Future<dynamic> post(String pfad, {Object? daten}) => _senden('POST', pfad, daten: daten);

  Future<dynamic> put(String pfad, {Object? daten}) => _senden('PUT', pfad, daten: daten);

  Future<dynamic> delete(String pfad, {Object? daten}) => _senden('DELETE', pfad, daten: daten);

  /// Volle Adresse fuer einen Pfad wie `auth/member/qr-login`.
  Uri adresse(String pfad, [Map<String, String>? abfrage]) {
    final ziel = basis.resolve(pfad.startsWith('/') ? pfad.substring(1) : pfad);
    return abfrage == null ? ziel : ziel.replace(queryParameters: abfrage);
  }

  Future<dynamic> _senden(
    String methode,
    String pfad, {
    Map<String, String>? abfrage,
    Object? daten,
  }) async {
    final quelle = tokenQuelle;
    final token = quelle?.accessToken;
    var antwort = await _einmal(methode, pfad, abfrage, daten, token);

    if (quelle != null &&
        token != null &&
        (antwort.statusCode == 401 || antwort.statusCode == 403)) {
      switch (await quelle.erneuern(token)) {
        case Erneuerung.erneuert:
          antwort = await _einmal(methode, pfad, abfrage, daten, quelle.accessToken);
        case Erneuerung.abgelaufen:
          throw const SitzungAbgelaufen();
        case Erneuerung.nichtErreichbar:
          throw const ApiFehler.keineVerbindung();
      }
    }
    return _auswerten(antwort);
  }

  Future<http.Response> _einmal(
    String methode,
    String pfad,
    Map<String, String>? abfrage,
    Object? daten,
    String? token,
  ) async {
    final anfrage = http.Request(methode, adresse(pfad, abfrage))
      ..headers['Accept'] = 'application/json';
    if (token != null) anfrage.headers['Authorization'] = 'Bearer $token';
    if (daten != null) {
      anfrage.headers['Content-Type'] = 'application/json; charset=utf-8';
      anfrage.body = jsonEncode(daten);
    }
    try {
      final strom = await _http.send(anfrage).timeout(zeitlimit);
      return await http.Response.fromStream(strom).timeout(zeitlimit);
    } on TimeoutException {
      throw const ApiFehler.keineVerbindung();
    } on http.ClientException {
      throw const ApiFehler.keineVerbindung();
    }
  }

  dynamic _auswerten(http.Response antwort) {
    final text = utf8.decode(antwort.bodyBytes, allowMalformed: true);
    Object? json;
    if (text.isNotEmpty) {
      try {
        json = jsonDecode(text);
      } on FormatException {
        json = null;
      }
    }
    if (antwort.statusCode >= 200 && antwort.statusCode < 300) return json;

    String? meldung;
    if (json is Map) {
      final e = json['error'] ?? json['message'];
      if (e is String && e.isNotEmpty) meldung = e;
    }
    throw ApiFehler(
      meldung ?? 'Der Server meldet einen Fehler (${antwort.statusCode}).',
      status: antwort.statusCode,
    );
  }
}
