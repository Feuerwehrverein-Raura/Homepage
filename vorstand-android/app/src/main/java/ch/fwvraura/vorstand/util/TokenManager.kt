package ch.fwvraura.vorstand.util

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class TokenManager(context: Context) {

    private val prefs: SharedPreferences

    init {
        prefs = try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            EncryptedSharedPreferences.create(
                context,
                "fwv_vorstand_prefs",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            Log.e("TokenManager", "EncryptedSharedPreferences failed, using fallback", e)
            context.getSharedPreferences("fwv_vorstand_prefs_fallback", Context.MODE_PRIVATE)
        }
    }

    var token: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(value) {
            prefs.edit().putString(KEY_TOKEN, value).commit()
        }

    var userEmail: String?
        get() = prefs.getString(KEY_EMAIL, null)
        set(value) {
            prefs.edit().putString(KEY_EMAIL, value).commit()
        }

    var userRole: String?
        get() = prefs.getString(KEY_ROLE, null)
        set(value) {
            prefs.edit().putString(KEY_ROLE, value).commit()
        }

    var userName: String?
        get() = prefs.getString(KEY_NAME, null)
        set(value) {
            prefs.edit().putString(KEY_NAME, value).commit()
        }

    val isLoggedIn: Boolean
        get() = !token.isNullOrEmpty()

    fun clear() {
        prefs.edit().clear().commit()
    }

    companion object {
        private const val KEY_TOKEN = "auth_token"
        private const val KEY_EMAIL = "user_email"
        private const val KEY_ROLE = "user_role"
        private const val KEY_NAME = "user_name"
    }
}
