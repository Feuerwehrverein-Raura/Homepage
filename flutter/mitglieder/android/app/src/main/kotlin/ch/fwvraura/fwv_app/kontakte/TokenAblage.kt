package ch.fwvraura.fwv_app.kontakte

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Der Access-Token fuer den Abgleich im Hintergrund.
 *
 * Der SyncAdapter laeuft ohne Flutter, kommt also nicht an den Dart-Speicher
 * (flutter_secure_storage). Statt dessen interne Ablage des Plugins
 * nachzubauen (Format und Schluessel wechseln zwischen Versionen, und bei
 * einem Lesefehler loescht das Plugin mit resetOnError die ganze Sitzung),
 * teilt die Dart-Seite den aktuellen Token ueber den Kanal mit
 * ("token", bei jedem Start und nach jeder Erneuerung; null beim Abmelden).
 *
 * Gespeichert wird verschluesselt (EncryptedSharedPreferences, wie die alte
 * App). Klappt der Keystore nicht, wird nichts gespeichert — der Abgleich
 * faellt dann aus, statt den Token im Klartext abzulegen.
 *
 * Der SyncAdapter laeuft im selben Prozess wie die App (kein ":sync"), damit
 * er immer den zuletzt geschriebenen Wert sieht.
 */
object TokenAblage {
    private const val TAG = "KontakteToken"
    private const val DATEI = "fwv_kontakte_abgleich"
    private const val SCHLUESSEL = "auth_token"

    @Volatile
    private var prefs: SharedPreferences? = null

    private fun oeffnen(context: Context): SharedPreferences? {
        prefs?.let { return it }
        synchronized(this) {
            prefs?.let { return it }
            return try {
                val masterKey = MasterKey.Builder(context.applicationContext)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build()
                EncryptedSharedPreferences.create(
                    context.applicationContext,
                    DATEI,
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                ).also { prefs = it }
            } catch (e: Exception) {
                Log.w(TAG, "Verschluesselter Speicher nicht verfuegbar", e)
                null
            }
        }
    }

    fun lesen(context: Context): String? = try {
        oeffnen(context)?.getString(SCHLUESSEL, null)?.takeIf { it.isNotBlank() }
    } catch (e: Exception) {
        Log.w(TAG, "Token nicht lesbar", e)
        null
    }

    fun setzen(context: Context, token: String?) {
        try {
            val p = oeffnen(context) ?: return
            if (token.isNullOrBlank()) p.edit().remove(SCHLUESSEL).commit()
            else p.edit().putString(SCHLUESSEL, token).commit()
        } catch (e: Exception) {
            Log.w(TAG, "Token nicht speicherbar", e)
        }
    }
}
