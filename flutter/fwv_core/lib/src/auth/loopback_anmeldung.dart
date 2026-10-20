// Anmeldung ueber Authentik auf dem Desktop (Linux, Windows, macOS).
//
// flutter_appauth gibt es fuer Linux und Windows nicht. Darum hier selbst,
// nach RFC 8252 ("OAuth 2.0 for Native Apps", Abschnitt 7.3): Authorization
// Code mit PKCE (S256), Rueckleitung auf eine Loopback-Adresse.
//
//  1. Die App oeffnet einen kleinen HTTP-Empfaenger auf 127.0.0.1 mit einem
//     freien Port, den das System waehlt.
//  2. Sie oeffnet den System-Browser mit der Anmeldeseite von Authentik,
//     redirect_uri = http://127.0.0.1:<port>/callback.
//  3. Nach der Anmeldung leitet Authentik den Browser dorthin zurueck; die
//     App prueft `state`, nimmt den Code und zeigt "fertig" im Browser.
//  4. Code gegen Tokens tauschen (Token-Endpunkt, mit code_verifier, ohne
//     Client-Secret - der Provider fwv-members-app ist oeffentlich).
//
// Voraussetzung in Authentik (Provider fwv-members-app, Redirect URIs):
//   Modus "Regex", Wert  ^http://127\.0\.0\.1:\d+/callback$
// Sonst lehnt Authentik die Anfrage mit "Redirect URI Error" ab.
// Details: docs/flutter-desktop.md. Gemeinsam fuer die Mitglieder-App und
// die Musik-App (flutter/musik); eigene Bibliothek package:fwv_core/desktop.dart,
// weil dart:io im Browser fehlt.

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;

import 'authentik_anmeldung.dart';
import 'konfiguration.dart';

/// Pfad, auf den Authentik zurueckleitet.
const loopbackPfad = '/callback';

/// Zufaelliger Text aus den in RFC 7636 erlaubten Zeichen
/// (`A-Z a-z 0-9 - . _ ~`), fuer code_verifier, state und nonce.
String zufallsText(Random zufall, [int laenge = 64]) {
  const zeichen = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  return List.generate(laenge, (_) => zeichen[zufall.nextInt(zeichen.length)]).join();
}

/// PKCE-Challenge (S256): BASE64URL(SHA256(verifier)) ohne `=`.
String pkceChallenge(String verifier) =>
    base64Url.encode(sha256.convert(ascii.encode(verifier)).bytes).replaceAll('=', '');

/// Wertet die Rueckleitung aus. Gibt den Code zurueck; null, wenn der
/// Nutzer abgelehnt hat (`error=access_denied`); wirft [AuthentikFehler] bei
/// fremdem `state`, anderen Fehlern oder ohne Code.
String? rueckleitungAuswerten(Uri rueckleitung, {required String erwarteterState}) {
  final p = rueckleitung.queryParameters;
  // Zuerst state: auch eine Fehlermeldung muss zu unserer Anfrage gehoeren.
  if (p['state'] != erwarteterState) {
    throw const AuthentikFehler('Rueckleitung gehoert nicht zu dieser Anmeldung (state).');
  }
  final fehler = p['error'];
  if (fehler == 'access_denied') return null;
  if (fehler != null) {
    throw AuthentikFehler(p['error_description'] ?? fehler);
  }
  final code = p['code'];
  if (code == null || code.isEmpty) {
    throw const AuthentikFehler('Kein Code in der Rueckleitung.');
  }
  return code;
}

/// Liest die Antwort des Token-Endpunkts.
AuthentikTokens tokenAntwortLesen(http.Response antwort) {
  Object? daten;
  try {
    daten = jsonDecode(antwort.body);
  } on FormatException {
    daten = null;
  }
  if (antwort.statusCode != 200 || daten is! Map) {
    final text = daten is Map ? (daten['error_description'] ?? daten['error']) : null;
    throw AuthentikFehler('Token-Tausch fehlgeschlagen (${antwort.statusCode}${text != null ? ': $text' : ''}).');
  }
  // Wie AppAuthAnmeldung: notfalls das ID-Token als Bearer verwenden.
  final token = (daten['access_token'] ?? daten['id_token']) as String?;
  if (token == null || token.isEmpty) throw const AuthentikFehler('Kein Token erhalten.');
  return AuthentikTokens(
    accessToken: token,
    refreshToken: daten['refresh_token'] as String?,
    idToken: daten['id_token'] as String?,
  );
}

/// `nonce` aus dem (nicht geprueften) Inhalt eines ID-Tokens; die Signatur
/// prueft das Backend. Hier geht es nur darum, dass das Token zu dieser
/// Anfrage gehoert.
String? nonceAusIdToken(String idToken) {
  final teile = idToken.split('.');
  if (teile.length != 3) return null;
  try {
    final inhalt = jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(teile[1]))));
    return inhalt is Map ? inhalt['nonce'] as String? : null;
  } on Object {
    return null;
  }
}

/// Kann eine laufende Anmeldung abbrechen (Knopf im Login-Screen, falls der
/// Browser-Tab einfach geschlossen wurde).
abstract interface class AbbrechbareAnmeldung {
  void abbrechen();
}

class LoopbackAnmeldung implements AuthentikAnmeldung, AbbrechbareAnmeldung {
  LoopbackAnmeldung({
    required this.browserOeffnen,
    this.konfiguration = OidcKonfiguration.mitgliederApp,
    http.Client? client,
    Random? zufall,
    this.zeitlimit = const Duration(minutes: 10),
  }) : _client = client ?? http.Client(),
       _zufall = zufall ?? Random.secure();

  final OidcKonfiguration konfiguration;

  /// Oeffnet die Anmeldeseite im System-Browser (url_launcher; in Tests
  /// "klickt" ein Nachbau selbst).
  final Future<bool> Function(Uri adresse) browserOeffnen;

  /// So lange wartet die App auf die Rueckleitung; danach gilt die
  /// Anmeldung als abgebrochen.
  final Duration zeitlimit;

  final http.Client _client;
  final Random _zufall;

  HttpServer? _empfaenger;
  Completer<Uri?>? _rueckleitung;

  @override
  void abbrechen() {
    final r = _rueckleitung;
    if (r != null && !r.isCompleted) r.complete(null);
  }

  @override
  Future<AuthentikTokens?> anmelden() async {
    abbrechen(); // eine haengende fruehere Anmeldung beenden
    final endpunkte = await _endpunkte();

    final verifier = zufallsText(_zufall);
    final state = zufallsText(_zufall, 32);
    final nonce = zufallsText(_zufall, 32);

    final empfaenger = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _empfaenger = empfaenger;
    final rueckleitung = _rueckleitung = Completer<Uri?>();
    final redirectUri = 'http://127.0.0.1:${empfaenger.port}$loopbackPfad';

    final abo = empfaenger.listen((anfrage) => _anfrageBeantworten(anfrage, rueckleitung));
    try {
      final adresse = endpunkte.autorisierung.replace(
        queryParameters: {
          ...endpunkte.autorisierung.queryParameters,
          'response_type': 'code',
          'client_id': konfiguration.clientId,
          'redirect_uri': redirectUri,
          'scope': konfiguration.scopes.join(' '),
          'state': state,
          'nonce': nonce,
          'code_challenge': pkceChallenge(verifier),
          'code_challenge_method': 'S256',
        },
      );
      if (!await browserOeffnen(adresse)) {
        throw const AuthentikFehler('Browser konnte nicht geoeffnet werden.');
      }

      final ziel = await rueckleitung.future.timeout(zeitlimit, onTimeout: () => null);
      if (ziel == null) return null; // abgebrochen oder Zeit abgelaufen
      final code = rueckleitungAuswerten(ziel, erwarteterState: state);
      if (code == null) return null;

      final antwort = await _client
          .post(
            endpunkte.token,
            headers: {'Accept': 'application/json'},
            body: {
              'grant_type': 'authorization_code',
              'code': code,
              'redirect_uri': redirectUri,
              'client_id': konfiguration.clientId,
              'code_verifier': verifier,
            },
          )
          .timeout(const Duration(seconds: 30));
      final tokens = tokenAntwortLesen(antwort);
      final idToken = tokens.idToken;
      if (idToken != null) {
        final erhalten = nonceAusIdToken(idToken);
        if (erhalten != null && erhalten != nonce) {
          throw const AuthentikFehler('ID-Token gehoert nicht zu dieser Anmeldung (nonce).');
        }
      }
      return tokens;
    } on SocketException catch (e) {
      throw AuthentikFehler(e.message);
    } on TimeoutException {
      throw const AuthentikFehler('Authentik antwortet nicht.');
    } finally {
      await abo.cancel();
      await empfaenger.close(force: true);
      if (identical(_empfaenger, empfaenger)) _empfaenger = null;
      if (identical(_rueckleitung, rueckleitung)) _rueckleitung = null;
    }
  }

  /// Nur `/callback` zaehlt; der Browser fragt evtl. auch nach
  /// `/favicon.ico`.
  Future<void> _anfrageBeantworten(HttpRequest anfrage, Completer<Uri?> rueckleitung) async {
    final antwort = anfrage.response;
    if (anfrage.method != 'GET' || anfrage.uri.path != loopbackPfad) {
      antwort.statusCode = HttpStatus.notFound;
      await antwort.close();
      return;
    }
    final ok = anfrage.uri.queryParameters.containsKey('code');
    antwort
      ..statusCode = HttpStatus.ok
      ..headers.contentType = ContentType.html
      ..write(_seite(ok));
    await antwort.close();
    if (!rueckleitung.isCompleted) rueckleitung.complete(anfrage.uri);
  }

  static String _seite(bool ok) =>
      '<!doctype html><html lang="de"><head><meta charset="utf-8">'
      '<title>FWV Raura</title></head>'
      '<body style="font-family:sans-serif;text-align:center;margin-top:15vh;color:#333">'
      '<h1 style="color:#b71c1c">FWV Raura</h1>'
      '<p>${ok ? 'Anmeldung abgeschlossen. Du kannst dieses Fenster schliessen und zur App zur&uuml;ckkehren.' : 'Anmeldung nicht abgeschlossen. Bitte in der App erneut versuchen.'}</p>'
      '</body></html>';

  /// Adressen aus der Discovery; ohne Netz zur Discovery die bekannten
  /// Adressen von Authentik.
  Future<({Uri autorisierung, Uri token})> _endpunkte() async {
    final token = Uri.parse(konfiguration.tokenEndpunkt);
    var autorisierung = token.resolve('../authorize/');
    try {
      final antwort = await _client.get(Uri.parse(konfiguration.discoveryUrl)).timeout(const Duration(seconds: 10));
      if (antwort.statusCode == 200) {
        final daten = jsonDecode(antwort.body);
        if (daten is Map && daten['authorization_endpoint'] is String) {
          autorisierung = Uri.parse(daten['authorization_endpoint'] as String);
        }
      }
    } on Object {
      // Fallback oben.
    }
    return (autorisierung: autorisierung, token: token);
  }
}
