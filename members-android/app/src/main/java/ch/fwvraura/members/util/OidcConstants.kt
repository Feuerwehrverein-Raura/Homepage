package ch.fwvraura.members.util

object OidcConstants {
    // Eigener Public-OAuth2-Provider fuer die Mobile App (PKCE-Flow ohne Client-Secret).
    const val AUTHENTIK_ISSUER = "https://auth.fwv-raura.ch/application/o/fwv-members-app/"

    // Globaler Token-Endpoint aus der OIDC-Discovery. WICHTIG: NICHT unter dem
    // App-Slug (.../o/fwv-members-app/token/) — der existiert nicht (404). Der
    // Login nutzt automatisch die Discovery; der manuelle Refresh im
    // AuthInterceptor muss aber exakt diese URL verwenden.
    const val TOKEN_ENDPOINT = "https://auth.fwv-raura.ch/application/o/token/"

    const val CLIENT_ID = "fwv-members-app"
    const val REDIRECT_URI = "com.fwv.members:/oauth2redirect"

    // "offline_access" ist noetig, damit Authentik einen Refresh-Token ausstellt.
    // Ohne ihn bekommt die App nur einen 8h-Access-Token und der User muss sich
    // danach jedes Mal neu anmelden. Der Provider muss den Scope ebenfalls
    // anbieten (in Authentik dem Provider "FWV Members Mobile App" zugeordnet).
    val SCOPES = listOf("openid", "profile", "email", "offline_access")
}
