// Anmeldung ueber Authentik im System-Browser (OIDC, Authorization-Code mit
// PKCE) mit flutter_appauth.
//
// AppAuth (Android und iOS) erzeugt `state`, `nonce` und den PKCE-Verifier
// (S256) selbst und verwirft eine Rueckleitung, deren `state` nicht zur Anfrage
// passt — die Pruefung, die der alten iOS-App fehlte. Kein Client-Secret: der
// Provider "fwv-members-app" ist oeffentlich, AppAuth schickt beim Token-Tausch
// deshalb keine Client-Authentifizierung mit.
//
// Schnittstelle und Tokens (AuthentikAnmeldung, AuthentikTokens) liegen in
// fwv_core, die Desktop-Anmeldung in package:fwv_core/desktop.dart.

import 'package:flutter/services.dart';
import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:fwv_core/fwv_core.dart';

class AppAuthAnmeldung implements AuthentikAnmeldung {
  AppAuthAnmeldung({this.konfiguration = OidcKonfiguration.mitgliederApp, FlutterAppAuth? appAuth})
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

    // Wie die alte Android-App: notfalls das ID-Token als Bearer verwenden.
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
