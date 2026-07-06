package ch.fwvraura.members.data.model

import com.google.gson.annotations.SerializedName

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

// --- App-natives Mitglieder-Login (E-Mail + Passwort) + Passwort-Reset ---

/** POST /auth/member/login */
data class MemberLoginRequest(
    val email: String,
    val password: String
)

/** POST /auth/member/request-reset */
data class RequestResetRequest(
    val email: String
)

/** POST /auth/member/reset */
data class ResetRequest(
    val email: String,
    val code: String,
    @SerializedName("new_password") val new_password: String
)

/**
 * Antwort von /auth/member/login und /auth/member/reset (Erfolg: token + user)
 * sowie /auth/member/request-reset (nur message). Bei Fehlern (401/400/429)
 * liefert das Backend `{error}` — hier ueber [error] aus dem errorBody gelesen.
 * Alle Felder optional, damit Erfolgs- und Fehler-Bodies mit derselben Klasse
 * geparst werden koennen.
 */
data class MemberAuthResponse(
    val success: Boolean = false,
    val token: String? = null,
    val user: MemberAuthUser? = null,
    val message: String? = null,
    val error: String? = null
)

data class MemberAuthUser(
    val id: String? = null,
    val email: String? = null,
    val name: String? = null
)
