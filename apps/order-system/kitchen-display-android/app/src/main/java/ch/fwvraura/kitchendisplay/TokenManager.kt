package ch.fwvraura.kitchendisplay

import android.content.Context
import android.content.SharedPreferences

class TokenManager(context: Context) {
    companion object {
        private const val PREFS_NAME = "kds_auth"
        private const val KEY_TOKEN = "jwt_token"
        private const val KEY_LOGIN_TIME = "login_time"
        private const val TOKEN_VALIDITY_MS = 24 * 60 * 60 * 1000L // 24 hours
    }

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun saveToken(token: String) {
        prefs.edit()
            .putString(KEY_TOKEN, token)
            .putLong(KEY_LOGIN_TIME, System.currentTimeMillis())
            .apply()
    }

    fun getToken(): String? {
        if (!isLoggedIn()) return null
        return prefs.getString(KEY_TOKEN, null)
    }

    fun isLoggedIn(): Boolean {
        val token = prefs.getString(KEY_TOKEN, null) ?: return false
        val loginTime = prefs.getLong(KEY_LOGIN_TIME, 0)
        val elapsed = System.currentTimeMillis() - loginTime
        return token.isNotEmpty() && elapsed < TOKEN_VALIDITY_MS
    }

    fun logout() {
        prefs.edit().clear().apply()
    }
}
