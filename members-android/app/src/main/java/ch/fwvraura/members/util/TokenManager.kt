package ch.fwvraura.members.util

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Speichert Auth-Token und User-Daten in EncryptedSharedPreferences.
 *
 * Unterscheidet zwischen drei Account-Typen:
 *  - "member"    -> Mitglied (OIDC via Authentik)
 *  - "organizer" -> Veranstaltungs-Organisator (Event-Login)
 *  - "qr"        -> Persistenter QR-Token (kann fuer beide Modi gelten)
 */
class TokenManager(context: Context) {

    private val prefs: SharedPreferences = try {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "fwv_members_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    } catch (e: Exception) {
        Log.e("TokenManager", "EncryptedSharedPreferences failed, using fallback", e)
        context.getSharedPreferences("fwv_members_prefs_fallback", Context.MODE_PRIVATE)
    }

    var token: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(value) { prefs.edit().putString(KEY_TOKEN, value).commit() }

    /** OIDC-Refresh-Token — gueltig bis 30 Tage nach letzter Nutzung (Authentik rotiert ihn). */
    var refreshToken: String?
        get() = prefs.getString(KEY_REFRESH_TOKEN, null)
        set(value) { prefs.edit().putString(KEY_REFRESH_TOKEN, value).commit() }

    /** "member", "organizer" oder "qr" */
    var accountType: String?
        get() = prefs.getString(KEY_ACCOUNT_TYPE, null)
        set(value) { prefs.edit().putString(KEY_ACCOUNT_TYPE, value).commit() }

    var userEmail: String?
        get() = prefs.getString(KEY_EMAIL, null)
        set(value) { prefs.edit().putString(KEY_EMAIL, value).commit() }

    var userName: String?
        get() = prefs.getString(KEY_NAME, null)
        set(value) { prefs.edit().putString(KEY_NAME, value).commit() }

    /** Falls Organisator-Login: ID des verwalteten Events. */
    var eventId: String?
        get() = prefs.getString(KEY_EVENT_ID, null)
        set(value) { prefs.edit().putString(KEY_EVENT_ID, value).commit() }

    val isLoggedIn: Boolean
        get() = !token.isNullOrEmpty()

    fun clear() = prefs.edit().clear().commit()

    companion object {
        private const val KEY_TOKEN = "auth_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_ACCOUNT_TYPE = "account_type"
        private const val KEY_EMAIL = "user_email"
        private const val KEY_NAME = "user_name"
        private const val KEY_EVENT_ID = "event_id"
    }
}
