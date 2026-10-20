// Was jede Anmeldung ueber Authentik liefert - egal ob ueber flutter_appauth
// (Handy, in der Mitglieder-App) oder ueber Loopback (Desktop,
// loopback_anmeldung.dart). Die Oberflaeche kennt nur diese Schnittstelle.

/// Tokens nach erfolgreicher Anmeldung.
class AuthentikTokens {
  const AuthentikTokens({required this.accessToken, this.refreshToken, this.idToken});

  final String accessToken;
  final String? refreshToken;
  final String? idToken;
}

/// Eigene Schnittstelle, damit Tests ohne Browser laufen.
abstract interface class AuthentikAnmeldung {
  /// Oeffnet den Browser. Gibt null zurueck, wenn der Nutzer abbricht; wirft
  /// [AuthentikFehler], wenn die Anmeldung scheitert.
  Future<AuthentikTokens?> anmelden();
}

class AuthentikFehler implements Exception {
  const AuthentikFehler(this.meldung);

  final String meldung;

  @override
  String toString() => 'AuthentikFehler: $meldung';
}
