package ch.fwvraura.kitchendisplay

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

object ServerDetector {
    private const val TAG = "ServerDetector"
    // Kasse vor Ort auf dem T400 im Roten Schopf (Oktober 2026). Der Name
    // zeigt oeffentlich auf 192.168.88.10 und hat ein echtes Zertifikat; er
    // antwortet also nur im Schopf-Netz. Vorher: http://kasse.local (Pi).
    const val LOCAL_URL = "https://kasse-lokal.fwv-raura.ch"
    const val CLOUD_URL = "https://order.fwv-raura.ch"

    private val client = OkHttpClient.Builder()
        .connectTimeout(3, TimeUnit.SECONDS)
        .readTimeout(3, TimeUnit.SECONDS)
        .build()

    suspend fun detectServer(configuredUrl: String): String = withContext(Dispatchers.IO) {
        // Try local server first (mDNS)
        try {
            val request = Request.Builder()
                .url("$LOCAL_URL/api/health")
                .get()
                .build()
            // Nur der T400 meldet "vor_ort":true - kein anderer Server unter dem Namen
            val ok = client.newCall(request).execute().use { r ->
                r.isSuccessful && (r.body?.string() ?: "").replace(" ", "").contains("\"vor_ort\":true")
            }
            if (ok) {
                Log.d(TAG, "Local server reachable at $LOCAL_URL")
                return@withContext LOCAL_URL
            }
        } catch (e: Exception) {
            Log.d(TAG, "Local server not reachable: ${e.message}")
        }

        // Fallback to configured/cloud URL
        Log.d(TAG, "Using fallback: $configuredUrl")
        configuredUrl
    }
}
