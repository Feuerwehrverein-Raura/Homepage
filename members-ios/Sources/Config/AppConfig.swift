import Foundation

/// Zentrale Konfiguration — Werte identisch zur Android-App
/// (`ApiModule`, `OidcConstants`), damit beide Apps dasselbe Backend
/// und denselben Authentik-Provider nutzen.
enum AppConfig {
    /// Basis-URL der REST-API (api-events/api-members hinter einem Gateway).
    static let apiBase = URL(string: "https://api.fwv-raura.ch")!

    // MARK: OIDC / Authentik (Provider "FWV Members Mobile App", PKCE ohne Secret)

    /// Issuer-URL — Discovery liegt unter <issuer>/.well-known/openid-configuration.
    static let oidcIssuer = URL(string: "https://auth.fwv-raura.ch/application/o/fwv-members-app/")!
    static let oidcClientID = "fwv-members-app"
    /// Gleicher Redirect wie Android — Authentik whitelistet ihn bereits.
    static let oidcRedirectURI = "com.fwv.members:/oauth2redirect"
    /// Schema-Teil des Redirects für ASWebAuthenticationSession.
    static let oidcCallbackScheme = "com.fwv.members"
    /// offline_access ⇒ Refresh-Token (sonst nur kurzlebiger Access-Token).
    static let oidcScopes = ["openid", "profile", "email", "offline_access"]
}
