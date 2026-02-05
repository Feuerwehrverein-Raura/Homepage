package ch.fwvraura.vorstand.util

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Verwaltet den JWT-Token und User-Daten in verschluesselten SharedPreferences.
 *
 * SharedPreferences = Android Key-Value-Speicher (wie ein Dictionary/Map auf der Festplatte).
 * EncryptedSharedPreferences = Verschluesselte Variante — Werte werden mit AES-256 verschluesselt,
 * sodass sie nicht ausgelesen werden koennen (z.B. durch Root-Zugriff oder Backup-Extraktion).
 *
 * Gespeicherte Werte:
 * - auth_token: JWT-Token fuer die API-Authentifizierung
 * - user_email: E-Mail des eingeloggten Users
 * - user_role: Rolle (z.B. "praesident", "aktuar")
 * - user_name: Anzeigename
 * - last_audit_check: Zeitstempel des letzten Audit-Notification-Checks
 */
class TokenManager(context: Context) {

    // SharedPreferences-Instanz — wird im init-Block erstellt
    private val prefs: SharedPreferences

    init {
        prefs = try {
            // MasterKey erstellen — Android Keystore generiert einen AES-256 Schluessel,
            // der hardware-geschuetzt ist (auf Geraeten mit Secure Element/TEE)
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM) // AES-256 im GCM-Modus
                .build()

            // Verschluesselte SharedPreferences erstellen
            // - Dateiname: "fwv_vorstand_prefs" (in /data/data/ch.fwvraura.vorstand/shared_prefs/)
            // - Keys werden mit AES-256-SIV verschluesselt (deterministisch, fuer Lookups)
            // - Values werden mit AES-256-GCM verschluesselt (authentifiziert, sicher)
            EncryptedSharedPreferences.create(
                context,
                "fwv_vorstand_prefs",           // Dateiname der Preferences-Datei
                masterKey,                       // Schluessel aus dem Android Keystore
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,  // Key-Verschluesselung
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM // Value-Verschluesselung
            )
        } catch (e: Exception) {
            // Fallback auf unverschluesselte SharedPreferences, falls Verschluesselung fehlschlaegt
            // (z.B. auf alten Geraeten oder bei beschaedigtem Keystore)
            Log.e("TokenManager", "EncryptedSharedPreferences failed, using fallback", e)
            context.getSharedPreferences("fwv_vorstand_prefs_fallback", Context.MODE_PRIVATE)
        }
    }

    // JWT-Token fuer API-Authentifizierung
    // Wird vom AuthInterceptor bei jedem API-Aufruf als "Authorization: Bearer <token>" gesendet
    var token: String?
        get() = prefs.getString(KEY_TOKEN, null)          // Lesen: gibt null zurueck wenn nicht gesetzt
        set(value) {
            prefs.edit().putString(KEY_TOKEN, value).commit() // Schreiben: commit() = synchron (wartet bis geschrieben)
        }

    // E-Mail-Adresse des eingeloggten Vorstandsmitglieds
    var userEmail: String?
        get() = prefs.getString(KEY_EMAIL, null)
        set(value) {
            prefs.edit().putString(KEY_EMAIL, value).commit()
        }

    // Rolle des Users (z.B. "praesident", "aktuar", "kassier")
    var userRole: String?
        get() = prefs.getString(KEY_ROLE, null)
        set(value) {
            prefs.edit().putString(KEY_ROLE, value).commit()
        }

    // Anzeigename des Users
    var userName: String?
        get() = prefs.getString(KEY_NAME, null)
        set(value) {
            prefs.edit().putString(KEY_NAME, value).commit()
        }

    // Zeitstempel des letzten Audit-Notification-Checks (ISO-8601 Format)
    // z.B. "2026-02-05T14:30:00.123Z"
    // Der AuditNotificationWorker speichert hier den created_at des neuesten Eintrags,
    // damit beim naechsten Check nur neuere Eintraege abgefragt werden.
    // null = noch nie gecheckt → beim ersten Aufruf werden die neuesten Eintraege geladen
    var lastAuditCheck: String?
        get() = prefs.getString(KEY_LAST_AUDIT_CHECK, null)
        set(value) {
            prefs.edit().putString(KEY_LAST_AUDIT_CHECK, value).commit()
        }

    // Convenience-Property: true wenn ein Token gespeichert ist (= User ist eingeloggt)
    val isLoggedIn: Boolean
        get() = !token.isNullOrEmpty()

    // Alle gespeicherten Werte loeschen (beim Logout)
    // Loescht Token, E-Mail, Rolle, Name UND lastAuditCheck
    fun clear() {
        prefs.edit().clear().commit()
    }

    // Konstanten fuer die SharedPreferences-Keys
    // companion object = statische Konstanten (wie "static final" in Java)
    companion object {
        private const val KEY_TOKEN = "auth_token"
        private const val KEY_EMAIL = "user_email"
        private const val KEY_ROLE = "user_role"
        private const val KEY_NAME = "user_name"
        private const val KEY_LAST_AUDIT_CHECK = "last_audit_check"  // NEU: fuer Audit-Polling
    }
}
