package ch.fwvraura.kitchendisplay

import android.util.Log
import ch.fwvraura.kitchendisplay.models.Order
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.util.concurrent.TimeUnit

/** Der Server hat das Token abgelehnt (401/403) — neu anmelden bzw. erneuern. */
class AuthException(val code: Int) : Exception("HTTP $code")

class ApiService(val serverUrl: String, private val token: String? = null) {
    companion object {
        private const val TAG = "ApiService"

        // Ein Client fuer alle Instanzen (teilt Verbindungs-Pool und Threads).
        private val client = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .callTimeout(30, TimeUnit.SECONDS)
            .build()

        /** Alle offenen Verbindungen verwerfen (nach Netzwechsel koennen sie tot sein). */
        fun resetConnections() {
            client.connectionPool.evictAll()
        }
    }

    private fun Request.Builder.addAuth(): Request.Builder {
        token?.let { addHeader("Authorization", "Bearer $it") }
        return this
    }

    private val gson = Gson()

    private val baseUrl: String
        get() = serverUrl.trimEnd('/') + "/api"

    private fun check(response: Response) {
        if (response.code == 401 || response.code == 403) throw AuthException(response.code)
        if (!response.isSuccessful) throw Exception("HTTP ${response.code}")
    }

    suspend fun fetchOrders(): Result<List<Order>> = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url("$baseUrl/orders")
                .addAuth()
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                check(response)
                val body = response.body?.string() ?: "[]"
                val type = object : TypeToken<List<Order>>() {}.type
                val orders: List<Order> = gson.fromJson(body, type) ?: emptyList()
                Log.d(TAG, "Fetched ${orders.size} orders")
                Result.success(orders)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to fetch orders: ${e.message}")
            Result.failure(e)
        }
    }

    suspend fun completeOrder(orderId: Int): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url("$baseUrl/orders/$orderId/complete")
                .addAuth()
                .patch("".toRequestBody("application/json".toMediaType()))
                .build()

            client.newCall(request).execute().use { check(it) }
            Log.d(TAG, "Order $orderId marked as complete")
            Result.success(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to complete order $orderId", e)
            Result.failure(e)
        }
    }

    suspend fun completeItems(orderId: Int, itemIds: List<Int>): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val json = gson.toJson(mapOf("item_ids" to itemIds))
            val request = Request.Builder()
                .url("$baseUrl/orders/$orderId/items/complete")
                .addAuth()
                .patch(json.toRequestBody("application/json".toMediaType()))
                .build()

            client.newCall(request).execute().use { check(it) }
            Log.d(TAG, "Items $itemIds in order $orderId marked as complete")
            Result.success(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to complete items in order $orderId", e)
            Result.failure(e)
        }
    }
}
