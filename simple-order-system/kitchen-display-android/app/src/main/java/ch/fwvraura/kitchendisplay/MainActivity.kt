package ch.fwvraura.kitchendisplay

import android.content.Intent
import android.media.AudioAttributes
import android.media.SoundPool
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.preference.PreferenceManager
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.kitchendisplay.models.Order
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup
import kotlinx.coroutines.*
import android.widget.ImageButton
import android.widget.TextView

class MainActivity : AppCompatActivity(), WebSocketManager.WebSocketListener {

    private lateinit var recyclerView: RecyclerView
    private lateinit var emptyState: TextView
    private lateinit var connectionStatus: TextView
    private lateinit var stationToggle: MaterialButtonToggleGroup
    private lateinit var btnAll: MaterialButton
    private lateinit var btnBar: MaterialButton
    private lateinit var btnKitchen: MaterialButton
    private lateinit var btnSettings: ImageButton

    private lateinit var adapter: OrderAdapter
    private var webSocketManager: WebSocketManager? = null
    private var apiService: ApiService? = null

    private val orders = mutableListOf<Order>()
    private var currentStation = "all"

    private val mainScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private val timerHandler = Handler(Looper.getMainLooper())

    private var soundPool: SoundPool? = null
    private var notificationSoundId: Int = 0
    private var soundEnabled = true

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Keep screen on
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        initViews()
        initSound()
        loadSettings()
        setupRecyclerView()
        setupStationToggle()
        startTimerUpdates()
    }

    private fun initViews() {
        recyclerView = findViewById(R.id.ordersRecyclerView)
        emptyState = findViewById(R.id.emptyState)
        connectionStatus = findViewById(R.id.connectionStatus)
        stationToggle = findViewById(R.id.stationToggle)
        btnAll = findViewById(R.id.btnAll)
        btnBar = findViewById(R.id.btnBar)
        btnKitchen = findViewById(R.id.btnKitchen)
        btnSettings = findViewById(R.id.btnSettings)

        btnSettings.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
    }

    private fun initSound() {
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        soundPool = SoundPool.Builder()
            .setMaxStreams(1)
            .setAudioAttributes(audioAttributes)
            .build()

        // Generate a simple beep tone programmatically
        notificationSoundId = 0 // We'll use ToneGenerator instead
    }

    private fun playNotificationSound() {
        if (!soundEnabled) return

        try {
            val toneGenerator = android.media.ToneGenerator(
                android.media.AudioManager.STREAM_NOTIFICATION,
                100
            )
            // Play three ascending tones
            toneGenerator.startTone(android.media.ToneGenerator.TONE_PROP_BEEP, 150)
            Handler(Looper.getMainLooper()).postDelayed({
                toneGenerator.startTone(android.media.ToneGenerator.TONE_PROP_BEEP2, 150)
            }, 200)
            Handler(Looper.getMainLooper()).postDelayed({
                toneGenerator.startTone(android.media.ToneGenerator.TONE_PROP_ACK, 200)
                Handler(Looper.getMainLooper()).postDelayed({
                    toneGenerator.release()
                }, 300)
            }, 400)
        } catch (e: Exception) {
            // Ignore sound errors
        }
    }

    private fun loadSettings() {
        val prefs = PreferenceManager.getDefaultSharedPreferences(this)
        val serverUrl = prefs.getString("server_url", getString(R.string.default_server_url))
            ?: getString(R.string.default_server_url)
        soundEnabled = prefs.getBoolean("sound_enabled", true)

        // Initialize services with server URL
        apiService = ApiService(serverUrl)
        webSocketManager = WebSocketManager(serverUrl, this)
    }

    private fun setupRecyclerView() {
        adapter = OrderAdapter(
            currentStation = { currentStation },
            onCompleteClick = { order -> completeOrder(order) }
        )

        // Calculate span count based on screen width
        val displayMetrics = resources.displayMetrics
        val screenWidthDp = displayMetrics.widthPixels / displayMetrics.density
        val spanCount = when {
            screenWidthDp >= 1200 -> 4
            screenWidthDp >= 900 -> 3
            screenWidthDp >= 600 -> 2
            else -> 1
        }

        recyclerView.layoutManager = GridLayoutManager(this, spanCount)
        recyclerView.adapter = adapter
    }

    private fun setupStationToggle() {
        stationToggle.check(R.id.btnAll)

        stationToggle.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (isChecked) {
                currentStation = when (checkedId) {
                    R.id.btnBar -> "bar"
                    R.id.btnKitchen -> "kitchen"
                    else -> "all"
                }
                updateOrdersList()
            }
        }
    }

    private fun startTimerUpdates() {
        timerHandler.post(object : Runnable {
            override fun run() {
                adapter.notifyDataSetChanged()
                timerHandler.postDelayed(this, 60000) // Update every minute
            }
        })
    }

    override fun onResume() {
        super.onResume()
        loadSettings()
        webSocketManager?.connect()
        fetchOrders()
    }

    override fun onPause() {
        super.onPause()
        webSocketManager?.disconnect()
    }

    override fun onDestroy() {
        super.onDestroy()
        mainScope.cancel()
        timerHandler.removeCallbacksAndMessages(null)
        soundPool?.release()
    }

    private fun fetchOrders() {
        mainScope.launch {
            apiService?.fetchOrders()?.onSuccess { fetchedOrders ->
                orders.clear()
                orders.addAll(fetchedOrders.filter { it.status == "pending" || it.status == null })
                updateOrdersList()
            }
        }
    }

    private fun completeOrder(order: Order) {
        mainScope.launch {
            apiService?.completeOrder(order.id)?.onSuccess {
                orders.removeAll { it.id == order.id }
                updateOrdersList()
            }
        }
    }

    private fun updateOrdersList() {
        val filteredOrders = orders.filter { it.hasItemsForStation(currentStation) }
            .sortedBy { it.id }

        adapter.submitList(filteredOrders)

        emptyState.visibility = if (filteredOrders.isEmpty()) View.VISIBLE else View.GONE
        recyclerView.visibility = if (filteredOrders.isEmpty()) View.GONE else View.VISIBLE
    }

    // WebSocket Listener Implementation

    override fun onConnected() {
        connectionStatus.text = getString(R.string.connected)
        connectionStatus.setTextColor(ContextCompat.getColor(this, R.color.accent))
        fetchOrders()
    }

    override fun onDisconnected() {
        connectionStatus.text = getString(R.string.disconnected)
        connectionStatus.setTextColor(ContextCompat.getColor(this, R.color.urgent))
    }

    override fun onNewOrder(order: Order) {
        if (orders.none { it.id == order.id }) {
            orders.add(order)
            updateOrdersList()
            playNotificationSound()

            // Flash effect
            val originalColor = window.decorView.background
            window.decorView.setBackgroundColor(
                ContextCompat.getColor(this, R.color.warning)
            )
            Handler(Looper.getMainLooper()).postDelayed({
                window.decorView.setBackgroundColor(
                    ContextCompat.getColor(this, R.color.background_dark)
                )
            }, 200)
        }
    }

    override fun onOrderCompleted(orderId: Int) {
        orders.removeAll { it.id == orderId }
        updateOrdersList()
    }

    override fun onOrderUpdated(orderId: Int, status: String?, paymentMethod: String?) {
        val orderIndex = orders.indexOfFirst { it.id == orderId }
        if (orderIndex >= 0 && status == "completed") {
            orders.removeAt(orderIndex)
            updateOrdersList()
        }
    }
}
