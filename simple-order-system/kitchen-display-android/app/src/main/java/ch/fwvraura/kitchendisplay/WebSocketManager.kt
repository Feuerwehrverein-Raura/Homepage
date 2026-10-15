package ch.fwvraura.kitchendisplay

import android.os.Handler
import android.os.Looper
import android.util.Log
import ch.fwvraura.kitchendisplay.models.Order
import ch.fwvraura.kitchendisplay.models.WebSocketMessage
import com.google.gson.Gson
import okhttp3.*
import java.util.concurrent.TimeUnit

/**
 * WebSocket zum order-backend (/ws, Token im Authorization-Header).
 *
 * Selbstheilung:
 * - Ping alle 20 s: eine «tote» Verbindung (WLAN weg, Router neu gestartet,
 *   Server-Neustart ohne sauberes Schliessen) faellt so nach spaetestens
 *   ~40 s auf und wird neu aufgebaut. Ohne Ping blieb sie fuer immer «verbunden».
 * - Neuverbindung mit wachsender Pause (3 s .. 60 s).
 * - 401/403 beim Verbindungsaufbau melden wir als onAuthFailed().
 */
class WebSocketManager(
    private val serverUrl: String,
    private val listener: WebSocketListener,
    private val token: String? = null
) {
    companion object {
        private const val TAG = "WebSocketManager"
        private const val MIN_RECONNECT_MS = 3000L
        private const val MAX_RECONNECT_MS = 60000L

        private val client = OkHttpClient.Builder()
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .connectTimeout(10, TimeUnit.SECONDS)
            .pingInterval(20, TimeUnit.SECONDS)
            .build()
    }

    interface WebSocketListener {
        fun onConnected()
        fun onDisconnected()
        fun onAuthFailed()
        fun onMessageReceived()
        fun onNewOrder(order: Order)
        fun onOrderCompleted(orderId: Int)
        fun onOrderUpdated(orderId: Int, status: String?, paymentMethod: String?)
        fun onItemsCompleted(orderId: Int, itemIds: List<Int>)
    }

    private val gson = Gson()
    private val mainHandler = Handler(Looper.getMainLooper())

    private var webSocket: WebSocket? = null
    private var isConnecting = false
    private var shouldReconnect = true
    private var reconnectDelay = MIN_RECONNECT_MS
    // Jede Verbindung bekommt eine Nummer; Rueckrufe alter Verbindungen werden ignoriert.
    private var generation = 0

    @Volatile
    var isConnected = false
        private set

    private val reconnectRunnable = Runnable { connect() }

    fun connect() {
        shouldReconnect = true
        if (isConnecting || webSocket != null) return
        mainHandler.removeCallbacks(reconnectRunnable)
        isConnecting = true
        val myGeneration = ++generation

        val wsUrl = serverUrl
            .replace("https://", "wss://")
            .replace("http://", "ws://")
            .trimEnd('/') + "/ws"

        Log.d(TAG, "Connecting to WebSocket: $wsUrl")

        val requestBuilder = Request.Builder().url(wsUrl)
        token?.let { requestBuilder.addHeader("Authorization", "Bearer $it") }

        webSocket = client.newWebSocket(requestBuilder.build(), object : okhttp3.WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                mainHandler.post {
                    if (myGeneration != generation) return@post
                    Log.d(TAG, "WebSocket connected")
                    isConnecting = false
                    isConnected = true
                    reconnectDelay = MIN_RECONNECT_MS
                    listener.onConnected()
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleMessage(text, myGeneration)
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WebSocket closing: $code $reason")
                webSocket.close(1000, null)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WebSocket closed: $code $reason")
                mainHandler.post { handleDisconnect(myGeneration, false) }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                val code = response?.code ?: 0
                Log.w(TAG, "WebSocket failure (HTTP $code): ${t.message}")
                mainHandler.post { handleDisconnect(myGeneration, code == 401 || code == 403) }
            }
        })
    }

    private fun handleMessage(text: String, myGeneration: Int) {
        val message = try {
            gson.fromJson(text, WebSocketMessage::class.java)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse WebSocket message", e)
            null
        }
        mainHandler.post {
            if (myGeneration != generation) return@post
            listener.onMessageReceived()
            if (message == null) return@post
            when (message.type) {
                "new_order" -> message.order?.let { listener.onNewOrder(it) }
                "order_completed" -> message.orderId?.let { listener.onOrderCompleted(it) }
                "order_updated" -> message.orderId?.let {
                    listener.onOrderUpdated(it, message.status, message.paymentMethod)
                }
                "items_completed" -> {
                    val id = message.orderId
                    val ids = message.itemIds
                    if (id != null && ids != null) listener.onItemsCompleted(id, ids)
                }
            }
        }
    }

    private fun handleDisconnect(myGeneration: Int, authFailed: Boolean) {
        if (myGeneration != generation) return
        webSocket = null
        isConnecting = false
        val wasConnected = isConnected
        isConnected = false
        if (wasConnected || authFailed) listener.onDisconnected()
        if (authFailed) {
            listener.onAuthFailed()
            return
        }
        if (shouldReconnect) {
            mainHandler.removeCallbacks(reconnectRunnable)
            mainHandler.postDelayed(reconnectRunnable, reconnectDelay)
            reconnectDelay = (reconnectDelay * 2).coerceAtMost(MAX_RECONNECT_MS)
        }
    }

    /** Verbindung sofort neu aufbauen (z.B. wenn das Netz zurueck ist). */
    fun reconnectNow() {
        val ws = webSocket
        generation++ // Rueckrufe der alten Verbindung ignorieren
        webSocket = null
        isConnecting = false
        isConnected = false
        ws?.cancel()
        reconnectDelay = MIN_RECONNECT_MS
        mainHandler.removeCallbacks(reconnectRunnable)
        connect()
    }

    fun disconnect() {
        shouldReconnect = false
        mainHandler.removeCallbacks(reconnectRunnable)
        generation++
        webSocket?.close(1000, "User disconnect")
        webSocket = null
        isConnecting = false
        isConnected = false
    }
}
