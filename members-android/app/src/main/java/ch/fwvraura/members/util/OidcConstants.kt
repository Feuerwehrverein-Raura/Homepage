package ch.fwvraura.members.util

object OidcConstants {
    // Eigener Public-OAuth2-Provider fuer die Mobile App (PKCE-Flow ohne Client-Secret).
    const val AUTHENTIK_ISSUER = "https://auth.fwv-raura.ch/application/o/fwv-members-app/"
    const val CLIENT_ID = "fwv-members-app"
    const val REDIRECT_URI = "com.fwv.members:/oauth2redirect"
    val SCOPES = listOf("openid", "profile", "email")
}
