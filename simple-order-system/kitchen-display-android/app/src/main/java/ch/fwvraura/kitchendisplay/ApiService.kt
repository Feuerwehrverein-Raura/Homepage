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
import java.util.concurrent.TimeUnit

class ApiService(private val serverUrl: String) {
    companion object {
        private const val TAG = "ApiService"
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()

    private val baseUrl: String
        get() = serverUrl.trimEnd('/') + "/api"

    suspend fun fetchOrders(): Result<List<Order>> = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url("$baseUrl/orders")
                .get()
                .build()

            val response = client.newCall(request).execute()

            if (!response.isSuccessful) {
                return@withContext Result.failure(Exception("HTTP ${response.code}"))
            }

            val body = response.body?.string() ?: "[]"
            val type = object : TypeToken<List<Order>>() {}.type
            val orders: List<Order> = gson.fromJson(body, type)

            Log.d(TAG, "Fetched ${orders.size} orders")
            Result.success(orders)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to fetch orders", e)
            Result.failure(e)
        }
    }

    suspend fun completeOrder(orderId: Int): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url("$baseUrl/orders/$orderId/complete")
                .patch("".toRequestBody("application/json".toMediaType()))
                .build()

            val response = client.newCall(request).execute()

            if (!response.isSuccessful) {
                return@withContext Result.failure(Exception("HTTP ${response.code}"))
            }

            Log.d(TAG, "Order $orderId marked as complete")
            Result.success(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to complete order $orderId", e)
            Result.failure(e)
        }
    }
}
