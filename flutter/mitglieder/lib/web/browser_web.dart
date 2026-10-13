// Browser-Teil der Mitglieder-App, siehe browser.dart.

import 'dart:async';

import 'package:fwv_core/fwv_core.dart';
import 'package:web/web.dart' as web;

import '../anmeldung/authentik_anmeldung.dart';

/// Wie mein.html (AUTHENTIK_URL, CLIENT_ID, REDIRECT_URI).
const _authentik = 'https://auth.fwv-raura.ch';
const _clientId = 'fwv-members';

GeheimSpeicher browserSpeicher() => _BrowserSpeicher();

AuthentikAnmeldung websiteAnmeldung() => _WebsiteAnmeldung();

/// Wie der Abmelden-Knopf von mein.html: auch die Sitzung bei Authentik
/// beenden, sonst meldet der naechste Klick auf "Anmelden" ohne Rueckfrage
/// wieder an.
void websiteAbmelden() {
  web.window.location.href = '$_authentik/application/o/$_clientId/end-session/';
}

class _BrowserSpeicher implements GeheimSpeicher {
  // Das Token teilt die App mit der Website - alles andere nicht.
  static String _schluessel(String s) =>
      s == SitzungsSchluessel.accessToken ? s : 'fwv_app.$s';

  @override
  Future<String?> lesen(String schluessel) async =>
      web.window.localStorage.getItem(_schluessel(schluessel));

  @override
  Future<void> schreiben(String schluessel, String wert) async =>
      web.window.localStorage.setItem(_schluessel(schluessel), wert);

  @override
  Future<void> loeschen(String schluessel) async =>
      web.window.localStorage.removeItem(_schluessel(schluessel));
}

class _WebsiteAnmeldung implements AuthentikAnmeldung {
  /// Verlaesst die Seite Richtung Authentik. auth-callback.html legt danach
  /// `auth_token` ab und kehrt auf diese Seite zurueck (`state`); die App
  /// startet dann neu und findet die Sitzung. Darum kehrt das hier nie zurueck.
  @override
  Future<AuthentikTokens?> anmelden() {
    final ort = web.window.location;
    final rueckweg = Uri.encodeComponent('${ort.pathname}${ort.search}');
    final ziel = Uri.encodeComponent('${ort.origin}/auth-callback.html');
    ort.href = '$_authentik/application/o/authorize/?client_id=$_clientId'
        '&redirect_uri=$ziel&response_type=code&scope=openid%20profile%20email&state=$rueckweg';
    return Completer<AuthentikTokens?>().future;
  }
}
