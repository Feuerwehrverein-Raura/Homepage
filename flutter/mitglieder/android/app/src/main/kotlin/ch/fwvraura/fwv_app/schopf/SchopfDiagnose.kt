package ch.fwvraura.fwv_app.schopf

// Diagnose des Schopf-Players: jeder Schritt (Nachricht empfangen, Kopplung,
// Anzeige, Fehler) geht ins Android-Log (Tag "SchopfPlayer") und an
// api-members (POST /kiosk/schopf/diagnose, landet dort als SCHOPF-DIAGNOSE im
// Log). So lassen sich Eigenheiten einzelner Handys - z.B. Samsung One UI -
// nachvollziehen, ohne das Handy an einen Rechner zu haengen.
//
// Nur mit der Freigabe aus der Push-Nachricht (ohne Schicht kein Senden),
// nie mit Inhalten ausser Schritt, Geraet und Fehlertext.

import android.content.Context
import android.os.Build
import android.util.Log
import ch.fwvraura.fwv_app.MainActivity
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

object SchopfDiagnose {
    private const val ADRESSE = "https://api.fwv-raura.ch/kiosk/schopf/diagnose"

    fun melden(
        c: Context,
        schritt: String,
        gekoppelt: Boolean = false,
        stil: String? = null,
        fehler: Throwable? = null,
        t: String? = null,
        laeuft: Boolean? = null,
        info: String? = null,
    ) {
        val text = fehler?.let { "${it.javaClass.simpleName}: ${it.message}" }
        Log.i("SchopfPlayer", "$schritt gekoppelt=$gekoppelt stil=$stil laeuft=$laeuft sichtbar=${MainActivity.sichtbar}" +
            (info?.let { " $it" } ?: "") + (text?.let { " fehler=$it" } ?: ""))
        val freigabe = t ?: c.getSharedPreferences("schopf_player", Context.MODE_PRIVATE).getString("t", null)
            ?: return
        thread {
            try {
                val v = URL(ADRESSE).openConnection() as HttpURLConnection
                v.requestMethod = "POST"
                v.connectTimeout = 8000
                v.readTimeout = 8000
                v.doOutput = true
                v.setRequestProperty("Content-Type", "application/json")
                val daten = JSONObject()
                    .put("t", freigabe)
                    .put("schritt", schritt)
                    .put("geraet", "${Build.MANUFACTURER} ${Build.MODEL}")
                    .put("android", "${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT})")
                    .put("app", runCatching { c.packageManager.getPackageInfo(c.packageName, 0).versionName }.getOrNull())
                    .put("sichtbar", MainActivity.sichtbar)
                    .put("gekoppelt", gekoppelt)
                    .put("stil", stil)
                    .put("laeuft", laeuft)
                    .put("info", info)
                    .put("fehler", text)
                v.outputStream.use { it.write(daten.toString().toByteArray()) }
                v.responseCode
                v.disconnect()
            } catch (e: Exception) {
                Log.w("SchopfPlayer", "Diagnose nicht gesendet: ${e.message}")
            }
        }
    }
}
