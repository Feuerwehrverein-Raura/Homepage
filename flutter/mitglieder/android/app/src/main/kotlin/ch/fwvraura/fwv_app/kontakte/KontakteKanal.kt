package ch.fwvraura.fwv_app.kontakte

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * Kanal "ch.fwvraura.members/kontakte" — Gegenstueck zu
 * lib/einstellungen/kontakte_abgleich.dart:
 *
 *  - "status"           -> Boolean: Abgleich eingeschaltet (Konto existiert
 *                          und Kontakte-Berechtigung erteilt)?
 *                          Stellt bei vorhandenem Konto die Abgleich-
 *                          Einstellungen wieder her (siehe sicherstellen).
 *  - "aktivieren"       -> Boolean: fragt nach READ/WRITE_CONTACTS, schaltet
 *                          ein und stoesst an; false bei verweigerter Berechtigung.
 *  - "deaktivieren"     -> null: schaltet aus, entfernt FWV-Kontakte und Konto.
 *  - "jetztAbgleichen"  -> null: stoesst einen Abgleich an.
 *  - "wiederherstellen" -> Int: Anzahl der wiederhergestellten FWV-Kontakte.
 *  - "token"            -> null: Argument {"token": String?} oder String?; der
 *                          aktuelle Access-Token fuer den Abgleich im
 *                          Hintergrund (null/leer loescht ihn), siehe TokenAblage.
 *                          Mit Token und eingeschaltetem Abgleich: gleich
 *                          abgleichen.
 */
class KontakteKanal(private val activity: Activity) : MethodChannel.MethodCallHandler {

    private val context = activity.applicationContext
    private val hauptThread = Handler(Looper.getMainLooper())
    private var wartetAufBerechtigung: MethodChannel.Result? = null

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            // Ohne Kontakte-Berechtigung laeuft der Abgleich nicht (Android
            // bricht ihn mit databaseError ab) — dann "aus" melden, damit das
            // Einschalten ueber "aktivieren" nach der Berechtigung fragt.
            "status" -> imHintergrund(result) {
                KontakteKonto.sicherstellen(context) && hatBerechtigung()
            }
            "aktivieren" -> aktivieren(result)
            "deaktivieren" -> imHintergrund(result) { KontakteKonto.deaktivieren(context); null }
            "jetztAbgleichen" -> {
                KontakteKonto.jetztAbgleichen(context)
                result.success(null)
            }
            "wiederherstellen" -> imHintergrund(result) {
                try {
                    KontakteKonto.wiederherstellen(context)
                } catch (e: SecurityException) {
                    // Ohne Kontakte-Berechtigung nichts zu loeschen — trotzdem abgleichen.
                    KontakteKonto.jetztAbgleichen(context)
                    0
                }
            }
            "token" -> {
                val token = when (val a = call.arguments) {
                    is String -> a
                    is Map<*, *> -> a["token"] as? String
                    else -> null
                }
                imHintergrund(result) {
                    TokenAblage.setzen(context, token)
                    // Neuer Token: Einstellungen pruefen und gleich abgleichen
                    // (wie die alte App bei jeder Anmeldung).
                    if (!token.isNullOrBlank() && KontakteKonto.sicherstellen(context)) {
                        KontakteKonto.jetztAbgleichen(context)
                    }
                    null
                }
            }
            else -> result.notImplemented()
        }
    }

    private fun aktivieren(result: MethodChannel.Result) {
        if (hatBerechtigung()) {
            einschalten(result)
            return
        }
        if (wartetAufBerechtigung != null) {
            result.error("laeuft", "Berechtigungsanfrage laeuft bereits", null)
            return
        }
        wartetAufBerechtigung = result
        activity.requestPermissions(BERECHTIGUNGEN, ANFRAGE_CODE)
    }

    /** Aus MainActivity.onRequestPermissionsResult; true, wenn es unsere Anfrage war. */
    fun berechtigungErhalten(requestCode: Int, grantResults: IntArray): Boolean {
        if (requestCode != ANFRAGE_CODE) return false
        val result = wartetAufBerechtigung ?: return true
        wartetAufBerechtigung = null
        val erteilt = grantResults.isNotEmpty() &&
            grantResults.all { it == PackageManager.PERMISSION_GRANTED }
        if (erteilt) einschalten(result) else result.success(false)
        return true
    }

    private fun einschalten(result: MethodChannel.Result) = imHintergrund(result) {
        KontakteKonto.aktivieren(context)
        KontakteKonto.jetztAbgleichen(context)
        true
    }

    private fun hatBerechtigung() = BERECHTIGUNGEN.all {
        activity.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED
    }

    private fun imHintergrund(result: MethodChannel.Result, arbeit: () -> Any?) {
        Thread {
            try {
                val wert = arbeit()
                hauptThread.post { result.success(wert) }
            } catch (e: Exception) {
                Log.w(TAG, "Kontakt-Abgleich: Aufruf fehlgeschlagen", e)
                hauptThread.post { result.error("kontakte", e.message, null) }
            }
        }.start()
    }

    companion object {
        const val KANAL = "ch.fwvraura.members/kontakte"
        private const val TAG = "KontakteKanal"
        private const val ANFRAGE_CODE = 4711
        private val BERECHTIGUNGEN = arrayOf(
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.WRITE_CONTACTS
        )
    }
}
