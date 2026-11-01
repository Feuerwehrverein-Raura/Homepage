// Anmeldung auf Android: Authentik im System-Browser mit flutter_appauth
// (Authorization-Code mit PKCE) - wie die Mitglieder-App
// (flutter/mitglieder/lib/anmeldung/authentik_anmeldung.dart), nur mit
// eigener Rueckleitung ch.fwvraura.musik:/oauth2redirect. Nicht in fwv_core,
// damit die Desktop-Programme das Plugin nicht mitschleppen.

import 'package:flutter/services.dart';
import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:fwv_core/fwv_core.dart';

class AppAuthAnmeldung implements AuthentikAnmeldung {
  AppAuthAnmeldung({this.konfiguration = OidcKonfiguration.musikApp, FlutterAppAuth? appAuth})
    : _appAuth = appAuth ?? const FlutterAppAuth();

  final OidcKonfiguration konfiguration;
  final FlutterAppAuth _appAuth;

  @override
  Future<AuthentikTokens?> anmelden() async {
    final AuthorizationTokenResponse antwort;
    try {
      antwort = await _appAuth.authorizeAndExchangeCode(
        AuthorizationTokenRequest(
          konfiguration.clientId,
          konfiguration.redirectUri,
          discoveryUrl: konfiguration.discoveryUrl,
          scopes: konfiguration.scopes,
        ),
      );
    } on FlutterAppAuthUserCancelledException {
      return null;
    } on PlatformException catch (e) {
      throw AuthentikFehler(e.message ?? e.code);
    }
    final token = antwort.accessToken ?? antwort.idToken;
    if (token == null || token.isEmpty) {
      throw const AuthentikFehler('Kein Token erhalten.');
    }
    return AuthentikTokens(
      accessToken: token,
      refreshToken: antwort.refreshToken,
      idToken: antwort.idToken,
    );
  }
}
