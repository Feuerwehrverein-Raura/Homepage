package ch.fwvraura.kitchendisplay

import android.content.Intent
import android.media.AudioAttributes
import android.media.SoundPool
import android.os.Bundle
import android.os.CountDownTimer
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.preference.PreferenceManager
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.kitchendisplay.models.Order
import ch.fwvraura.kitchendisplay.models.OrderItem
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup
import kotlinx.coroutines.*

class MainActivity : AppCompatActivity(), WebSocketManager.WebSocketListener {

    private lateinit var recyclerView: RecyclerView
    private lateinit var emptyState: TextView
    private lateinit var connectionStatus: TextView
    private lateinit var stationToggle: MaterialButtonToggleGroup
    private lateinit var btnAll: MaterialButton
    private lateinit var btnBar: MaterialButton
    private lateinit var btnKitchen: MaterialButton
    private lateinit var btnSettings: ImageButton
    private lateinit var btnClean: MaterialButton
    private lateinit var cleaningOverlay: FrameLayout
    private lateinit var cleaningTimer: TextView

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

    private lateinit var updateChecker: UpdateChecker
    private val updateHandler = Handler(Looper.getMainLooper())
    private val updateCheckInterval = 2 * 60 * 60 * 1000L // Check every 2 hours

    private var cleaningCountDown: CountDownTimer? = null

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
        setupCleaningMode()
        startTimerUpdates()

        updateChecker = UpdateChecker(this)
        startPeriodicUpdateCheck()
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
        btnClean = findViewById(R.id.btnClean)
        cleaningOverlay = findViewById(R.id.cleaningOverlay)
        cleaningTimer = findViewById(R.id.cleaningTimer)

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
            onCompleteOrder = { order -> completeOrder(order) },
            onItemClick = { order, item -> completeItem(order, item) }
        )

        // Calculate span count based on screen width
        val displayMetrics = resources.displayMetrics
        val screenWidthDp = displayMetrics.widthPixels / displayMetrics.density
        val spanCount = when {
            screenWidthDp >= 1200 -> 2
            screenWidthDp >= 600 -> 1
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

    private fun setupCleaningMode() {
        btnClean.setOnClickListener {
            startCleaningMode()
        }
    }

    private fun startCleaningMode() {
        cleaningOverlay.visibility = View.VISIBLE
        cleaningTimer.text = "30"

        cleaningCountDown?.cancel()
        cleaningCountDown = object : CountDownTimer(30000, 1000) {
            override fun onTick(millisUntilFinished: Long) {
                val seconds = (millisUntilFinished / 1000).toInt()
                cleaningTimer.text = seconds.toString()
            }

            override fun onFinish() {
                cleaningOverlay.visibility = View.GONE
            }
        }.start()
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

    private fun checkForUpdates() {
        mainScope.launch {
            when (val result = updateChecker.checkForUpdate()) {
                is UpdateChecker.UpdateResult.UpdateAvailable -> {
                    updateChecker.showUpdateDialog(result)
                }
                else -> { /* No update or error - ignore */ }
            }
        }
    }

    private fun startPeriodicUpdateCheck() {
        updateHandler.post(object : Runnable {
            override fun run() {
                checkForUpdates()
                updateHandler.postDelayed(this, updateCheckInterval)
            }
        })
    }

    override fun onPause() {
        super.onPause()
        webSocketManager?.disconnect()
    }

    override fun onDestroy() {
        super.onDestroy()
        mainScope.cancel()
        timerHandler.removeCallbacksAndMessages(null)
        updateHandler.removeCallbacksAndMessages(null)
        cleaningCountDown?.cancel()
        soundPool?.release()
    }

    private fun fetchOrders() {
        mainScope.launch {
            apiService?.fetchOrders()?.onSuccess { fetchedOrders ->
                orders.clear()
                // Include pending, paid, and null status (server returns pending + paid)
                orders.addAll(fetchedOrders.filter {
                    it.status == "pending" || it.status == "paid" || it.status == null
                })
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

    private fun completeItem(order: Order, item: OrderItem) {
        mainScope.launch {
            apiService?.completeItems(order.id, listOf(item.id))?.onSuccess {
                // Update local state
                item.completed = true
                updateOrdersList()
            }
        }
    }

    private fun updateOrdersList() {
        val filteredOrders = orders.filter { it.hasItemsForStation(currentStation) }
            .sortedBy { it.id }

        adapter.submitList(filteredOrders)
        // Force rebind because DiffUtil may not detect in-place item.completed changes
        adapter.notifyDataSetChanged()

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
