package ch.fwvraura.kitchendisplay

import android.os.Handler
import android.os.Looper
import android.util.Log
import ch.fwvraura.kitchendisplay.models.Order
import ch.fwvraura.kitchendisplay.models.WebSocketMessage
import com.google.gson.Gson
import okhttp3.*
import java.util.concurrent.TimeUnit

class WebSocketManager(
    private val serverUrl: String,
    private val listener: WebSocketListener,
    private val token: String? = null
) {
    companion object {
        private const val TAG = "WebSocketManager"
        private const val RECONNECT_DELAY_MS = 3000L
    }

    interface WebSocketListener {
        fun onConnected()
        fun onDisconnected()
        fun onNewOrder(order: Order)
        fun onOrderCompleted(orderId: Int)
        fun onOrderUpdated(orderId: Int, status: String?, paymentMethod: String?)
    }

    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    private val gson = Gson()
    private val mainHandler = Handler(Looper.getMainLooper())

    private var webSocket: WebSocket? = null
    private var isConnecting = false
    private var shouldReconnect = true

    fun connect() {
        if (isConnecting || webSocket != null) return
        isConnecting = true

        val wsUrl = serverUrl
            .replace("https://", "wss://")
            .replace("http://", "ws://")
            .trimEnd('/') + "/ws"

        Log.d(TAG, "Connecting to WebSocket: $wsUrl")

        val requestBuilder = Request.Builder().url(wsUrl)
        token?.let { requestBuilder.addHeader("Authorization", "Bearer $it") }
        val request = requestBuilder.build()

        webSocket = client.newWebSocket(request, object : okhttp3.WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d(TAG, "WebSocket connected")
                isConnecting = false
                mainHandler.post { listener.onConnected() }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                Log.d(TAG, "WebSocket message: $text")
                handleMessage(text)
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WebSocket closing: $code $reason")
                webSocket.close(1000, null)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WebSocket closed: $code $reason")
                handleDisconnect()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WebSocket failure", t)
                isConnecting = false
                handleDisconnect()
            }
        })
    }

    private fun handleMessage(text: String) {
        try {
            val message = gson.fromJson(text, WebSocketMessage::class.java)
            mainHandler.post {
                when (message.type) {
                    "new_order" -> message.order?.let { listener.onNewOrder(it) }
                    "order_completed" -> message.orderId?.let { listener.onOrderCompleted(it) }
                    "order_updated" -> message.orderId?.let {
                        listener.onOrderUpdated(it, message.status, message.paymentMethod)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse WebSocket message", e)
        }
    }

    private fun handleDisconnect() {
        webSocket = null
        isConnecting = false
        mainHandler.post { listener.onDisconnected() }

        if (shouldReconnect) {
            mainHandler.postDelayed({ connect() }, RECONNECT_DELAY_MS)
        }
    }

    fun disconnect() {
        shouldReconnect = false
        webSocket?.close(1000, "User disconnect")
        webSocket = null
    }
}
