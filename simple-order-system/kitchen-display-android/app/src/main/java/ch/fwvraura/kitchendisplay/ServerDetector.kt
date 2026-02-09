package ch.fwvraura.kitchendisplay

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

object ServerDetector {
    private const val TAG = "ServerDetector"
    private const val LOCAL_URL = "http://kasse.local"
    const val CLOUD_URL = "https://order.fwv-raura.ch"

    private val client = OkHttpClient.Builder()
        .connectTimeout(3, TimeUnit.SECONDS)
        .readTimeout(3, TimeUnit.SECONDS)
        .build()

    suspend fun detectServer(configuredUrl: String): String = withContext(Dispatchers.IO) {
        // Try local server first (mDNS)
        try {
            val request = Request.Builder()
                .url("$LOCAL_URL/api/orders")
                .get()
                .build()
            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
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
