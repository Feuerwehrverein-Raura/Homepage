package ch.fwvraura.kitchendisplay

import android.content.Context
import android.content.SharedPreferences

/**
 * Haelt das Kassen-/Kuechen-Token (signiert vom Bestellsystem, 30 Tage gueltig).
 *
 * Frueher galt hier eine feste Frist von 24 Stunden nach der Anmeldung — das
 * zwang jeden Tag zu einer neuen Passworteingabe, obwohl das Token selbst 30
 * Tage lebt. Massgebend ist jetzt das Ablaufdatum im Token (exp). Die App
 * erneuert das Token selbst (POST /api/auth/refresh), lange bevor es abläuft.
 */
class TokenManager(context: Context) {
    companion object {
        private const val PREFS_NAME = "kds_auth"
        private const val KEY_TOKEN = "jwt_token"
        private const val KEY_LOGIN_TIME = "login_time"

        /** Erneuern, sobald das Token aelter als ein Tag ist (Restlaufzeit < 29 Tage). */
        const val REFRESH_WHEN_REMAINING_MS = 29L * 24 * 60 * 60 * 1000

        /** Ablaufzeit (ms seit 1970) aus dem JWT lesen, null wenn nicht lesbar/ohne exp. */
        fun expiryMillis(token: String): Long? {
            val parts = token.split('.')
            if (parts.size < 2) return null
            return try {
                val json = String(decodeBase64Url(parts[1]), Charsets.UTF_8)
                val m = Regex("\"exp\"\\s*:\\s*(\\d+)").find(json) ?: return null
                m.groupValues[1].toLong() * 1000
            } catch (e: Exception) {
                null
            }
        }

        private const val ALPHABET =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

        /**
         * Base64url ohne Abhaengigkeit: java.util.Base64 gibt es erst ab API 26,
         * android.util.Base64 nicht in lokalen Unit-Tests.
         */
        internal fun decodeBase64Url(s: String): ByteArray {
            val out = java.io.ByteArrayOutputStream(s.length * 3 / 4)
            var buffer = 0
            var bits = 0
            for (c in s) {
                if (c == '=') break
                val v = ALPHABET.indexOf(if (c == '+') '-' else if (c == '/') '_' else c)
                require(v >= 0) { "kein Base64" }
                buffer = (buffer shl 6) or v
                bits += 6
                if (bits >= 8) {
                    bits -= 8
                    out.write((buffer shr bits) and 0xFF)
                }
            }
            return out.toByteArray()
        }

        fun isValid(token: String?, now: Long = System.currentTimeMillis()): Boolean {
            if (token.isNullOrEmpty()) return false
            val exp = expiryMillis(token) ?: return true // ohne exp: der Server entscheidet
            return exp > now
        }

        fun needsRefresh(token: String?, now: Long = System.currentTimeMillis()): Boolean {
            if (token.isNullOrEmpty()) return false
            val exp = expiryMillis(token) ?: return false
            return exp - now < REFRESH_WHEN_REMAINING_MS
        }
    }

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun saveToken(token: String) {
        prefs.edit()
            .putString(KEY_TOKEN, token)
            .putLong(KEY_LOGIN_TIME, System.currentTimeMillis())
            .apply()
    }

    /** Gespeichertes Token, sofern noch nicht abgelaufen. */
    fun getToken(): String? {
        val token = prefs.getString(KEY_TOKEN, null)
        return if (isValid(token)) token else null
    }

    fun isLoggedIn(): Boolean = getToken() != null

    fun needsRefresh(): Boolean = needsRefresh(prefs.getString(KEY_TOKEN, null))

    fun expiryMillis(): Long? = prefs.getString(KEY_TOKEN, null)?.let { expiryMillis(it) }

    fun logout() {
        prefs.edit().clear().apply()
    }
}
