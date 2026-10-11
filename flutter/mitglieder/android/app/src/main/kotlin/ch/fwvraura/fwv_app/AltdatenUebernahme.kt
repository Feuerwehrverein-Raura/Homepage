package ch.fwvraura.fwv_app

import android.content.Context
import android.content.SharedPreferences
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.File

/**
 * Liest einmalig die Anmeldedaten der alten Kotlin-App (members-android) und
 * loescht sie danach. Gegenstueck in Dart: fwv_core AltdatenUebernahme.
 *
 * Die alte App speicherte in EncryptedSharedPreferences "fwv_members_prefs"
 * (MasterKey AES256_GCM, Standard-Alias), bei Keystore-Problemen in den
 * unverschluesselten "fwv_members_prefs_fallback" (util/TokenManager.kt).
 * Die Flutter-App hat dieselbe App-ID und Signatur, sieht also dieselben
 * Dateien und denselben Keystore-Schluessel.
 *
 * Methoden:
 *  - "lesen":    Map der vorhandenen Werte; null, wenn es keine alte Datei gibt.
 *                Die Ja/Nein-Werte des Adressbuch-Abgleichs (contacts_sync_enabled,
 *                contacts_sync_asked) kommen als Text "true"/"false" — nur wenn
 *                sie in der alten Datei gesetzt waren.
 *  - "loeschen": entfernt beide Dateien.
 */
class AltdatenUebernahme(private val context: Context) : MethodChannel.MethodCallHandler {

    private val hauptThread = Handler(Looper.getMainLooper())

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            // Keystore-Zugriffe koennen dauern — nicht im UI-Thread.
            "lesen" -> imHintergrund(result) { lesen() }
            "loeschen" -> imHintergrund(result) { loeschen(); null }
            else -> result.notImplemented()
        }
    }

    private fun imHintergrund(result: MethodChannel.Result, arbeit: () -> Any?) {
        Thread {
            try {
                val wert = arbeit()
                hauptThread.post { result.success(wert) }
            } catch (e: Exception) {
                Log.w(TAG, "Uebernahme der alten Anmeldung fehlgeschlagen", e)
                hauptThread.post { result.error("altdaten", e.message, null) }
            }
        }.start()
    }

    private fun lesen(): Map<String, String>? {
        val verschluesselt = if (gibtEs(PREFS)) verschluesselteOeffnen() else null
        val klartext = if (gibtEs(PREFS_FALLBACK)) {
            context.getSharedPreferences(PREFS_FALLBACK, Context.MODE_PRIVATE)
        } else null
        if (!gibtEs(PREFS) && klartext == null) return null

        val werte = HashMap<String, String>()
        for (schluessel in SCHLUESSEL) {
            val wert = auslesen(verschluesselt, schluessel) ?: auslesen(klartext, schluessel)
            if (!wert.isNullOrBlank()) werte[schluessel] = wert
        }
        for (schluessel in JA_NEIN_SCHLUESSEL) {
            val wert = jaNeinAuslesen(verschluesselt, schluessel)
                ?: jaNeinAuslesen(klartext, schluessel)
            if (wert != null) werte[schluessel] = wert.toString()
        }
        return werte
    }

    private fun loeschen() {
        context.deleteSharedPreferences(PREFS)
        context.deleteSharedPreferences(PREFS_FALLBACK)
    }

    /** Gleicher Aufbau wie TokenManager.kt der alten App. */
    private fun verschluesselteOeffnen(): SharedPreferences? = try {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            PREFS,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    } catch (e: Exception) {
        Log.w(TAG, "Alte verschluesselte Anmeldedaten nicht lesbar", e)
        null
    }

    private fun auslesen(prefs: SharedPreferences?, schluessel: String): String? = try {
        prefs?.getString(schluessel, null)
    } catch (e: Exception) {
        // Einzelner Wert nicht entschluesselbar oder kein Text — auslassen.
        null
    }

    private fun jaNeinAuslesen(prefs: SharedPreferences?, schluessel: String): Boolean? = try {
        if (prefs != null && prefs.contains(schluessel)) prefs.getBoolean(schluessel, false) else null
    } catch (e: Exception) {
        null
    }

    /** Ohne Datei nichts oeffnen: sonst legt EncryptedSharedPreferences sie an. */
    private fun gibtEs(name: String) =
        File(context.applicationInfo.dataDir, "shared_prefs/$name.xml").exists()

    companion object {
        const val KANAL = "ch.fwvraura.members/altdaten"
        private const val TAG = "AltdatenUebernahme"
        private const val PREFS = "fwv_members_prefs"
        private const val PREFS_FALLBACK = "fwv_members_prefs_fallback"

        /** Schluessel aus TokenManager.kt, die die neue App weiterfuehrt. */
        private val SCHLUESSEL = listOf(
            "auth_token", "refresh_token", "account_type", "qr_token",
            "event_id", "user_name", "user_email"
        )

        /**
         * Ja/Nein-Werte aus TokenManager.kt (Adressbuch-Abgleich). Ob der
         * Abgleich laeuft, steht ohnehin im Konto "FWV Raura" selbst (Kanal
         * "kontakte", Methode "status"); contacts_sync_asked braucht Dart,
         * damit die Frage nach dem Abgleich nicht nochmals kommt.
         */
        private val JA_NEIN_SCHLUESSEL = listOf("contacts_sync_enabled", "contacts_sync_asked")
    }
}
