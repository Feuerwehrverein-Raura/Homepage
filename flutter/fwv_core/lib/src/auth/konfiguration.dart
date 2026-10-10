// Feste Adressen von Backend und Authentik. Dieselben Werte wie in den alten
// Apps (members-android util/OidcConstants.kt, members-ios AppConfig).

/// Basis-URL aller Backend-Aufrufe. Endet mit `/`, Pfade werden ohne
/// fuehrenden Schraegstrich angehaengt (`auth/member/qr-login`).
final Uri apiBasis = Uri.parse('https://api.fwv-raura.ch/');

/// Einstellungen fuer die Anmeldung ueber Authentik (OIDC mit PKCE).
class OidcKonfiguration {
  const OidcKonfiguration({
    required this.issuer,
    required this.clientId,
    required this.redirectUri,
    required this.scopes,
    required this.tokenEndpunkt,
  });

  /// Eigener oeffentlicher Provider der Mitglieder-App (ohne Client-Secret).
  static const mitgliederApp = OidcKonfiguration(
    issuer: 'https://auth.fwv-raura.ch/application/o/fwv-members-app/',
    clientId: 'fwv-members-app',
    redirectUri: 'com.fwv.members:/oauth2redirect',
    // "offline_access" ist noetig, damit Authentik einen Refresh-Token
    // ausstellt — sonst ist nach 8 Stunden Schluss.
    scopes: ['openid', 'profile', 'email', 'offline_access'],
    // Globaler Token-Endpunkt aus der Discovery. NICHT unter dem App-Slug
    // (.../o/fwv-members-app/token/) — den gibt es nicht (404). Die Anmeldung
    // selbst liest die Discovery; das Erneuern braucht genau diese Adresse.
    tokenEndpunkt: 'https://auth.fwv-raura.ch/application/o/token/',
  );

  final String issuer;
  final String clientId;
  final String redirectUri;
  final List<String> scopes;
  final String tokenEndpunkt;

  /// Adresse des Discovery-Dokuments.
  String get discoveryUrl => '$issuer.well-known/openid-configuration';
}
