// Anmelden, Erneuern und Abmelden — ohne Oberflaeche, damit die spaetere
// Vorstand-App dasselbe verwenden kann.
//
// Die Anmeldung ueber Authentik selbst (Browser, PKCE) braucht ein
// Plattform-Plugin und liegt deshalb in der App; sie uebergibt hier nur die
// erhaltenen Tokens ([mitOidcTokensAnmelden]). Alles andere — QR-Code,
// externer Organisator, Passwort-Reset, Erneuern — laeuft hier.
//
// Erneuern: mit dem Refresh-Token - von Authentik oder, bei QR-Code,
// Anmeldebon und Passwort-Reset, von api-members (gleich lange gueltig, gleiche
// Antwort; Entscheid 19.10.2026). Aeltere Sitzungen haben statt dessen den
// QR-Code und melden sich damit einmal still neu an. Sonst ist die Sitzung
// vorbei und der Login-Screen zeigt "Sitzung abgelaufen".

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../api/api_client.dart';
import 'jwt.dart';
import 'konfiguration.dart';
import 'sitzung.dart';

class SitzungsVerwaltung extends ChangeNotifier implements TokenQuelle {
  SitzungsVerwaltung({
    required this._speicher,
    required this._http,
    Uri? basis,
    this.oidc = OidcKonfiguration.mitgliederApp,
    this.beimAbmelden,
  }) : _basis = basis ?? apiBasis;

  final SitzungsSpeicher _speicher;
  final http.Client _http;
  final Uri _basis;
  final OidcKonfiguration oidc;

  /// Wird beim Abmelden aufgerufen, solange das Token noch gilt — die Stelle,
  /// an der die App ihr Geraet beim Backend abmeldet (Push-Token). Fehler
  /// darin verhindern das Abmelden nicht.
  final Future<void> Function(ApiClient api)? beimAbmelden;

  /// Wird gerufen, wenn sich das Access-Token aendert: nach dem Laden beim
  /// Start (nur mit gespeicherter Sitzung), nach jedem Anmelden, nach jedem
  /// Erneuern und mit null beim Abmelden bzw. wenn die Sitzung ablaeuft. Die
  /// App gibt das Token damit an Teile weiter, die ohne Flutter laufen (z.B.
  /// den Kontakt-Abgleich auf Android). Fehler darin stoeren die Sitzung
  /// nicht.
  void Function(Sitzung? sitzung)? beiNeuemToken;

  /// Angemeldeter Zugriff aufs Backend; erneuert abgelaufene Tokens selbst.
  late final ApiClient api = ApiClient(http: _http, tokenQuelle: this, basis: _basis);

  /// Angemeldeter Zugriff auf ein anderes Backend mit demselben Token und
  /// demselben Erneuern — z.B. die Inventar-API
  /// (`https://inventar.fwv-raura.ch/api/`), die Authentik-Tokens der App
  /// annimmt. [basis] muss mit `/` enden.
  ApiClient apiFuer(Uri basis) => ApiClient(http: _http, tokenQuelle: this, basis: basis);

  /// Zugriff ohne Anmeldung, fuer die Login-Routen selbst.
  late final ApiClient _offen = ApiClient(http: _http, basis: _basis);

  Sitzung? _sitzung;
  Future<Erneuerung>? _laufendeErneuerung;

  /// Grund, warum der Login-Screen erscheint (z.B. "Sitzung abgelaufen").
  String? hinweis;

  Sitzung? get sitzung => _sitzung;
  bool get angemeldet => _sitzung != null;

  @override
  String? get accessToken => _sitzung?.accessToken;

  /// Liest die gespeicherte Sitzung beim Start.
  Future<void> laden() async {
    _sitzung = await _speicher.laden();
    if (_sitzung != null) _tokenMelden();
    notifyListeners();
  }

  // ---------------------------------------------------------------------
  // Anmelden

  /// Nach der Anmeldung ueber Authentik. Name und E-Mail stehen im ID-Token
  /// (nur zur Anzeige gelesen, die Pruefung hat AppAuth erledigt).
  Future<void> mitOidcTokensAnmelden({
    required String accessToken,
    String? refreshToken,
    String? idToken,
  }) async {
    final angaben = jwtAngaben(idToken ?? accessToken);
    await _beginnen(
      Sitzung(
        accessToken: accessToken,
        refreshToken: refreshToken,
        kontotyp: Kontotyp.mitglied,
        name: _text(angaben['name']),
        email: _text(angaben['email']),
      ),
    );
  }

  /// QR-Code vom Datenblatt gegen ein Token tauschen. Liefert ein aelteres
  /// Backend keinen Refresh-Token, wird wie frueher der QR-Code gespeichert.
  Future<void> mitQrCodeAnmelden(String qrToken) async {
    final antwort = await _offen.post(
      'auth/member/qr-login',
      daten: _mitErneuerung({'token': qrToken}),
    );
    final (token, name, email) = _mitgliedAntwort(antwort);
    final refresh = _refreshToken(antwort);
    await _beginnen(
      Sitzung(
        accessToken: token,
        refreshToken: refresh,
        qrToken: refresh == null ? qrToken : null,
        kontotyp: Kontotyp.mitglied,
        name: name,
        email: email,
      ),
    );
  }

  /// Anmeldebon vom Bondrucker (einmaliger Code, `auth/member/code-login`).
  /// Der Code ist danach verbraucht; erneuert wird mit dem Refresh-Token.
  /// Antwort: `{token, refresh_token, name}`.
  Future<void> mitAnmeldebonAnmelden(String code) async {
    final antwort = await _offen.post(
      'auth/member/code-login',
      daten: _mitErneuerung({'code': code}),
    );
    final token = antwort is Map ? _text(antwort['token']) : null;
    if (token == null) throw const ApiFehler('Die Anmeldung wurde nicht angenommen.');
    await _beginnen(
      Sitzung(
        accessToken: token,
        refreshToken: _refreshToken(antwort),
        kontotyp: Kontotyp.mitglied,
        name: _text((antwort as Map)['name']),
      ),
    );
  }

  /// Externer Organisator: E-Mail und Passwort des Anlasses (`events/login`).
  /// Das Backend liefert `{success, token, event: {id, title, slug,
  /// organizer_name}}`; das Token gilt 24 Stunden und laesst sich nicht
  /// erneuern.
  Future<void> alsOrganisatorAnmelden(String email, String passwort) async {
    final antwort = await _offen.post(
      'events/login',
      daten: {'email': email.trim(), 'password': passwort},
    );
    if (antwort is! Map || antwort['token'] is! String || (antwort['token'] as String).isEmpty) {
      throw const ApiFehler('Die Anmeldung wurde nicht angenommen.');
    }
    final anlass = antwort['event'];
    final eventId = anlass is Map ? anlass['id'] : antwort['event_id'];
    await _beginnen(
      Sitzung(
        accessToken: antwort['token'] as String,
        kontotyp: Kontotyp.organisator,
        eventId: eventId?.toString(),
        name: anlass is Map ? _text(anlass['organizer_name']) ?? _text(anlass['title']) : null,
        email: email.trim(),
      ),
    );
  }

  /// Schritt 1 des Passwort-Resets: Code per E-Mail anfordern. Das Backend
  /// antwortet immer gleich, ob die Adresse bekannt ist oder nicht.
  Future<String> passwortResetAnfordern(String email) async {
    final antwort = await _offen.post('auth/member/request-reset', daten: {'email': email.trim()});
    return (antwort is Map ? _text(antwort['message']) : null) ??
        'Falls die E-Mail bei uns registriert ist, wurde ein Code verschickt.';
  }

  /// Schritt 2: Code und neues Passwort. Das Backend meldet direkt an.
  Future<void> passwortZuruecksetzen({
    required String email,
    required String code,
    required String neuesPasswort,
  }) async {
    final antwort = await _offen.post(
      'auth/member/reset',
      daten: _mitErneuerung({
        'email': email.trim(),
        'code': code.trim(),
        'new_password': neuesPasswort,
      }),
    );
    final (token, name, mail) = _mitgliedAntwort(antwort);
    await _beginnen(
      Sitzung(
        accessToken: token,
        refreshToken: _refreshToken(antwort),
        kontotyp: Kontotyp.mitglied,
        name: name,
        email: mail ?? email.trim(),
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Erneuern

  @override
  Future<Erneuerung> erneuern(String? verbrauchtesToken) {
    final s = _sitzung;
    if (s == null) return Future.value(Erneuerung.abgelaufen);
    // Ein anderer Aufruf hat schon erneuert: einfach das neue Token nehmen.
    if (verbrauchtesToken != null && s.accessToken != verbrauchtesToken) {
      return Future.value(Erneuerung.erneuert);
    }
    // Authentik rotiert den Refresh-Token: zwei parallele Versuche wuerden
    // denselben einloesen, der zweite scheitert und meldet ab. Deshalb teilen
    // sich alle Aufrufe einen Versuch.
    return _laufendeErneuerung ??= _erneuern(s).whenComplete(() => _laufendeErneuerung = null);
  }

  Future<Erneuerung> _erneuern(Sitzung s) async {
    var keinNetz = false;

    final refresh = s.refreshToken;
    if (refresh != null) {
      try {
        final neu = await _oidcErneuern(refresh);
        if (neu != null) return await _uebernehmen(s, neu.$1, neu.$2);
      } on ApiFehler catch (e) {
        if (e.status == null) keinNetz = true;
      }
    }

    final qr = s.qrToken;
    if (qr != null && s.kontotyp == Kontotyp.mitglied) {
      try {
        final antwort = await _offen.post(
          'auth/member/qr-login',
          daten: _mitErneuerung({'token': qr}),
        );
        final refresh = _refreshToken(antwort);
        return await _uebernehmen(
          s,
          _mitgliedAntwort(antwort).$1,
          refresh,
          ohneQr: refresh != null,
        );
      } on ApiFehler catch (e) {
        if (e.status == null) keinNetz = true;
      }
    }

    // Ohne Netz laesst sich nicht sagen, ob die Sitzung noch gilt — dann
    // nicht abmelden, sondern spaeter erneut versuchen.
    if (keinNetz) return Erneuerung.nichtErreichbar;
    if (identical(_sitzung, s)) await _ablaufen();
    return Erneuerung.abgelaufen;
  }

  /// `grant_type=refresh_token` am Token-Endpunkt von Authentik - oder bei
  /// einem Refresh-Token von api-members (`fwvm_`) an dessen `auth/refresh`,
  /// das gleich antwortet. Gibt null zurueck, wenn der Refresh-Token nicht
  /// mehr angenommen wird.
  Future<(String, String?)?> _oidcErneuern(String refreshToken) async {
    final endpunkt = refreshToken.startsWith('fwvm_')
        ? _basis.resolve('auth/refresh')
        : Uri.parse(oidc.tokenEndpunkt);
    final http.Response antwort;
    try {
      antwort = await _http
          .post(
            endpunkt,
            headers: {'Accept': 'application/json'},
            body: {
              'grant_type': 'refresh_token',
              'refresh_token': refreshToken,
              'client_id': oidc.clientId,
            },
          )
          .timeout(const Duration(seconds: 15));
    } on Exception {
      throw const ApiFehler.keineVerbindung();
    }
    if (antwort.statusCode != 200) return null;
    try {
      final json = jsonDecode(antwort.body);
      final access = json is Map ? _text(json['access_token']) : null;
      if (access == null) return null;
      return (access, _text((json as Map)['refresh_token']));
    } on FormatException {
      return null;
    }
  }

  Future<Erneuerung> _uebernehmen(
    Sitzung alt,
    String access,
    String? refresh, {
    bool ohneQr = false,
  }) async {
    // Wurde waehrenddessen abgemeldet oder neu angemeldet, gilt das Neue.
    if (!identical(_sitzung, alt)) {
      return _sitzung == null ? Erneuerung.abgelaufen : Erneuerung.erneuert;
    }
    // Liefert Authentik keinen neuen Refresh-Token mit, gilt der alte weiter.
    final neu = alt.kopieMit(accessToken: access, refreshToken: refresh, ohneQrToken: ohneQr);
    await _speicher.speichern(neu);
    _sitzung = neu;
    _tokenMelden();
    return Erneuerung.erneuert;
  }

  Future<void> _ablaufen() async {
    await _speicher.leeren();
    _sitzung = null;
    hinweis = 'Sitzung abgelaufen — bitte neu anmelden.';
    _tokenMelden();
    notifyListeners();
  }

  // ---------------------------------------------------------------------
  // Abmelden

  /// Meldet ab und loescht alle gespeicherten Anmeldedaten.
  Future<void> abmelden() async {
    if (_sitzung != null && beimAbmelden != null) {
      try {
        await beimAbmelden!(api);
      } on Object {
        // Abmelden geht immer — auch ohne Netz.
      }
    }
    await _speicher.leeren();
    _sitzung = null;
    hinweis = null;
    _tokenMelden();
    notifyListeners();
  }

  // ---------------------------------------------------------------------

  Future<void> _beginnen(Sitzung s) async {
    await _speicher.speichern(s);
    _sitzung = s;
    hinweis = null;
    _tokenMelden();
    notifyListeners();
  }

  void _tokenMelden() {
    try {
      beiNeuemToken?.call(_sitzung);
    } on Object {
      // Die Sitzung gilt trotzdem.
    }
  }

  /// `{success, token, user: {id, email, name}}` von qr-login und reset.
  (String, String?, String?) _mitgliedAntwort(Object? antwort) {
    final token = antwort is Map ? _text(antwort['token']) : null;
    if (token == null || (antwort as Map)['success'] == false) {
      throw const ApiFehler('Die Anmeldung wurde nicht angenommen.');
    }
    final user = antwort['user'];
    return (
      token,
      user is Map ? _text(user['name']) : null,
      user is Map ? _text(user['email']) : null,
    );
  }
}

/// Bittet api-members um einen Refresh-Token (aeltere Apps schicken das nicht
/// und behalten das alte Verhalten).
Map<String, Object> _mitErneuerung(Map<String, Object> daten) => {...daten, 'mit_erneuerung': true};

/// `refresh_token` aus der Antwort von qr-login, code-login und reset (fehlt
/// bei einem aelteren Backend).
String? _refreshToken(Object? antwort) => antwort is Map ? _text(antwort['refresh_token']) : null;

String? _text(Object? wert) => wert is String && wert.trim().isNotEmpty ? wert.trim() : null;
