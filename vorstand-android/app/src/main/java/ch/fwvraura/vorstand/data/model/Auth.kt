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
