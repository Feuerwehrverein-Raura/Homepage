package ch.fwvraura.vorstand.data.model

/**
 * Request-Body fuer den Login-Endpunkt POST /auth/vorstand/login.
 * Wird als JSON gesendet: {"email": "...", "password": "..."}
 *
 * data class = Kotlin-Klasse die automatisch equals(), hashCode(), toString() und copy() generiert.
 * Gson serialisiert die Felder automatisch zu JSON.
 */
data class LoginRequest(
    val email: String,     // E-Mail-Adresse des Vorstandsmitglieds
    val password: String   // IMAP-Passwort (wird gegen den Mailserver authentifiziert)
)

/**
 * Request-Body fuer den QR-Login-Endpunkt POST /auth/vorstand/qr-login.
 * Wird als JSON gesendet: {"token": "fwv-app-..."}
 */
data class QrLoginRequest(
    val token: String  // Persistenter App-Token aus dem QR-Code
)

/**
 * Response-Body vom Login-Endpunkt.
 * Bei erfolgreichem Login enthaelt die Antwort den JWT-Token und User-Informationen.
 */
data class LoginResponse(
    val success: Boolean,  // true wenn Login erfolgreich
    val token: String,     // JWT-Token (HS256, 8h gueltig) — wird fuer alle weiteren API-Aufrufe benoetigt
    val user: UserInfo     // Informationen ueber den eingeloggten User
)

/**
 * User-Informationen, die im LoginResponse und von GET /auth/vorstand/me zurueckgegeben werden.
 */
data class UserInfo(
    val email: String,               // E-Mail-Adresse
    val role: String,                // Rolle im Vorstand (z.B. "praesident", "aktuar", "kassier")
    val name: String? = null,        // Anzeigename (optional)
    val groups: List<String>? = null // Gruppen-Zugehoerigkeiten (optional, fuer Berechtigungen)
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
