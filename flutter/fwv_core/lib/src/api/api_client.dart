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
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

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

  /// Laedt eine Datei als `multipart/form-data` hoch (z.B. das Profilfoto
  /// unter dem Feld `photo`). Erneuern und Wiederholen wie bei den
  /// JSON-Aufrufen; die Anfrage wird dafuer neu gebaut.
  Future<dynamic> hochladen(
    String pfad, {
    required String feld,
    required List<int> bytes,
    required String dateiname,
    String inhaltstyp = 'application/octet-stream',
  }) async => _auswerten(
    await _mitErneuern(
      (token) => _schicken(() {
        final anfrage = http.MultipartRequest('POST', adresse(pfad))
          ..headers['Accept'] = 'application/json'
          ..files.add(
            http.MultipartFile.fromBytes(
              feld,
              bytes,
              filename: dateiname,
              contentType: _medientyp(inhaltstyp),
            ),
          );
        if (token != null) anfrage.headers['Authorization'] = 'Bearer $token';
        return anfrage;
      }),
    ),
  );

  /// Laedt eine Datei (z.B. ein PDF) als Bytes. Fehler wie bei den
  /// JSON-Aufrufen ([ApiFehler] mit der Meldung des Backends).
  Future<Uint8List> datei(String pfad, {Map<String, String>? abfrage}) async {
    final antwort = await _mitErneuern(
      (token) => _schicken(() {
        final anfrage = http.Request('GET', adresse(pfad, abfrage));
        if (token != null) anfrage.headers['Authorization'] = 'Bearer $token';
        return anfrage;
      }),
    );
    if (antwort.statusCode >= 200 && antwort.statusCode < 300) return antwort.bodyBytes;
    throw _fehler(antwort, _json(antwort));
  }

  /// Kopfzeilen fuer Abrufe ausserhalb des [ApiClient] (z.B. Bilder ueber
  /// `Image.network`): das aktuelle Token, aber nur fuer Adressen dieses
  /// Backends — fremde Server bekommen es nie.
  Map<String, String> kopfzeilenFuer(Uri ziel) {
    final token = tokenQuelle?.accessToken;
    if (token == null || ziel.host != basis.host || ziel.scheme != basis.scheme) return const {};
    return {'Authorization': 'Bearer $token'};
  }

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
  }) async => _auswerten(
    await _mitErneuern(
      (token) => _schicken(() {
        final anfrage = http.Request(methode, adresse(pfad, abfrage))
          ..headers['Accept'] = 'application/json';
        if (token != null) anfrage.headers['Authorization'] = 'Bearer $token';
        if (daten != null) {
          anfrage.headers['Content-Type'] = 'application/json; charset=utf-8';
          anfrage.body = jsonEncode(daten);
        }
        return anfrage;
      }),
    ),
  );

  /// Schickt einen Aufruf mit dem aktuellen Token; bei 401/403 einmal
  /// erneuern und mit dem neuen Token wiederholen.
  Future<http.Response> _mitErneuern(Future<http.Response> Function(String? token) einmal) async {
    final quelle = tokenQuelle;
    final token = quelle?.accessToken;
    var antwort = await einmal(token);

    if (quelle != null &&
        token != null &&
        (antwort.statusCode == 401 || antwort.statusCode == 403)) {
      switch (await quelle.erneuern(token)) {
        case Erneuerung.erneuert:
          antwort = await einmal(quelle.accessToken);
        case Erneuerung.abgelaufen:
          throw const SitzungAbgelaufen();
        case Erneuerung.nichtErreichbar:
          throw const ApiFehler.keineVerbindung();
      }
    }
    return antwort;
  }

  Future<http.Response> _schicken(http.BaseRequest Function() bauen) async {
    try {
      final strom = await _http.send(bauen()).timeout(zeitlimit);
      return await http.Response.fromStream(strom).timeout(zeitlimit);
    } on TimeoutException {
      throw const ApiFehler.keineVerbindung();
    } on http.ClientException {
      throw const ApiFehler.keineVerbindung();
    }
  }

  dynamic _auswerten(http.Response antwort) {
    final json = _json(antwort);
    if (antwort.statusCode >= 200 && antwort.statusCode < 300) return json;
    throw _fehler(antwort, json);
  }

  Object? _json(http.Response antwort) {
    final text = utf8.decode(antwort.bodyBytes, allowMalformed: true);
    if (text.isEmpty) return null;
    try {
      return jsonDecode(text);
    } on FormatException {
      return null;
    }
  }

  ApiFehler _fehler(http.Response antwort, Object? json) {
    String? meldung;
    if (json is Map) {
      final e = json['error'] ?? json['message'];
      if (e is String && e.isNotEmpty) meldung = e;
    }
    return ApiFehler(
      meldung ?? 'Der Server meldet einen Fehler (${antwort.statusCode}).',
      status: antwort.statusCode,
    );
  }
}

MediaType? _medientyp(String text) {
  try {
    return MediaType.parse(text);
  } on FormatException {
    return null;
  }
}
