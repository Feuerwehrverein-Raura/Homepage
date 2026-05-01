package ch.fwvraura.members.data.model

/** POST /events/login */
data class OrganizerLoginRequest(
    val email: String,
    val password: String
)

/** POST /auth/member/qr-login bzw. /auth/organizer/qr-login (kommt in Phase 1c). */
data class QrLoginRequest(val token: String)

data class LoginResponse(
    val success: Boolean,
    val token: String,
    val event_id: String? = null,
    val user: UserInfo? = null
)

data class UserInfo(
    val email: String,
    val name: String? = null,
    val role: String? = null
)

/**
 * Inhalt eines gescannten Login-QR-Codes. Top-Level damit ProGuard die Klasse
 * fuer die Gson-Deserialisierung nicht entfernt (innere Klassen sind anders behandelt).
 */
data class QrLoginPayload(
    val v: Int? = null,
    val type: String? = null,
    val email: String? = null,
    val token: String? = null
)
