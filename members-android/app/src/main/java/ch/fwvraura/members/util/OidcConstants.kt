package ch.fwvraura.members.util

object OidcConstants {
    const val AUTHENTIK_ISSUER = "https://auth.fwv-raura.ch/application/o/fwv-members/"
    const val CLIENT_ID = "fwv-members"
    const val REDIRECT_URI = "ch.fwvraura.members:/oauth2redirect"
    val SCOPES = listOf("openid", "profile", "email")
}
