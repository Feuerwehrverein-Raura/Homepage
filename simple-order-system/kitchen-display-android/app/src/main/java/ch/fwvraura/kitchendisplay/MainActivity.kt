package ch.fwvraura.kitchendisplay

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.os.Bundle
import android.os.CountDownTimer
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.widget.FrameLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.kitchendisplay.models.Order
import ch.fwvraura.kitchendisplay.models.OrderItem
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup
import kotlinx.coroutines.*

/**
 * Die eigentliche Anzeige.
 *
 * Damit niemand mehr von Hand neu laden muss:
 * - WebSocket mit Ping (siehe WebSocketManager) + Abruf aller Bestellungen
 *   alle 30 s als Rueckfallebene.
 * - Waechter alle 15 s: Kein Netz -> rote Leiste «Keine Verbindung – versuche
 *   erneut». Seit 60 s nichts vom Server -> Server neu suchen, neu verbinden.
 *   Seit 10 min nichts -> Anzeige komplett neu aufbauen (wie «Neu laden»).
 * - Netz kommt zurueck -> sofort neu verbinden und abrufen.
 * - Token taeglich erneuern; lehnt der Server es ab, erst erneuern, und nur
 *   wenn das scheitert zur Anmeldung.
 */
class MainActivity : AppCompatActivity(), WebSocketManager.WebSocketListener {

    companion object {
        private const val TAG = "MainActivity"
        private const val POLL_MS = 30_000L
        private const val ORT_MS = 20_000L
        private const val WATCHDOG_MS = 15_000L
        private const val STALE_MS = 60_000L
        private const val RELOAD_MS = 10 * 60_000L
        private const val TOKEN_CHECK_MS = 60 * 60_000L
        private const val UPDATE_CHECK_MS = 2 * 60 * 60_000L
    }

    private lateinit var recyclerView: RecyclerView
    private lateinit var emptyState: TextView
    private lateinit var connectionStatus: TextView
    private lateinit var headerTitle: TextView
    private lateinit var statusBanner: TextView
    private lateinit var updateBar: TextView
    private lateinit var stationToggle: MaterialButtonToggleGroup
    private lateinit var btnClean: MaterialButton
    private lateinit var cleaningOverlay: FrameLayout
    private lateinit var cleaningTimer: TextView

    private lateinit var adapter: OrderAdapter
    private lateinit var tokenManager: TokenManager
    private lateinit var updateChecker: UpdateChecker

    private var webSocketManager: WebSocketManager? = null
    private var apiService: ApiService? = null
    private var serverUrl: String = ""

    private val orders = mutableListOf<Order>()
    private var currentStation = Kiosk.STATION_KITCHEN
    private var soundEnabled = true

    private val mainScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private val handler = Handler(Looper.getMainLooper())

    private var running = false
    private var lastSuccessAt = 0L
    private var lastReconnectAt = 0L
    private var startedAt = 0L
    private var networkAvailable = true
    private var handlingAuthFailure = false
    private var pendingUpdate: UpdateChecker.UpdateResult.UpdateAvailable? = null
    private var downloading = false

    private var cleaningCountDown: CountDownTimer? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    // --- Lebenszyklus -------------------------------------------------------

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        tokenManager = TokenManager(this)
        updateChecker = UpdateChecker(this)

        val station = Kiosk.station(this)
        if (station == null || !tokenManager.isLoggedIn()) {
            LoginActivity.open(this, if (station == null) null else getString(R.string.notice_login_expired))
            finish()
            return
        }
        currentStation = station

        setContentView(R.layout.activity_main)
        Kiosk.applyFullscreen(this)

        initViews()
        setupRecyclerView()
        setupStationToggle()
        setupCleaningMode()
        registerNetworkCallback()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) Kiosk.applyFullscreen(this)
    }

    override fun onResume() {
        super.onResume()
        if (!::adapter.isInitialized) return

        if (!tokenManager.isLoggedIn()) {
            goToLogin(getString(R.string.notice_login_expired))
            return
        }

        // Einstellungen koennen sich geaendert haben
        soundEnabled = Kiosk.soundEnabled(this)
        Kiosk.station(this)?.let { if (it != currentStation) selectStation(it) }

        running = true
        startedAt = SystemClock.elapsedRealtime()
        lastSuccessAt = startedAt
        serverUrl = "" // Server-Adresse kann in den Einstellungen geaendert worden sein
        startConnection(detect = true)

        handler.post(pollRunnable)
        handler.postDelayed(watchdogRunnable, WATCHDOG_MS)
        handler.postDelayed(tokenRunnable, 5_000)
        handler.postDelayed(updateRunnable, 15_000)
        handler.postDelayed(minuteTicker, 60_000)
        handler.postDelayed(ortRunnable, ORT_MS)
    }

    override fun onPause() {
        super.onPause()
        running = false
        handler.removeCallbacksAndMessages(null)
        webSocketManager?.disconnect()
        webSocketManager = null
    }

    override fun onDestroy() {
        super.onDestroy()
        mainScope.cancel()
        handler.removeCallbacksAndMessages(null)
        cleaningCountDown?.cancel()
        networkCallback?.let {
            try {
                (getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager).unregisterNetworkCallback(it)
            } catch (e: Exception) { /* schon abgemeldet */ }
        }
    }

    // --- Oberflaeche --------------------------------------------------------

    private fun initViews() {
        recyclerView = findViewById(R.id.ordersRecyclerView)
        emptyState = findViewById(R.id.emptyState)
        connectionStatus = findViewById(R.id.connectionStatus)
        headerTitle = findViewById(R.id.headerTitle)
        statusBanner = findViewById(R.id.statusBanner)
        updateBar = findViewById(R.id.updateBar)
        stationToggle = findViewById(R.id.stationToggle)
        btnClean = findViewById(R.id.btnClean)
        cleaningOverlay = findViewById(R.id.cleaningOverlay)
        cleaningTimer = findViewById(R.id.cleaningTimer)

        // Kein sichtbarer Einstellungs-Knopf mehr: Logo 3 s halten + Ausgangs-Code
        Kiosk.attachSecretHold(this, findViewById(R.id.headerLogo)) {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
        // «Zurueck» beendet die Anzeige nicht (Kiosk)
        onBackPressedDispatcher.addCallback(this, object : androidx.activity.OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { /* bewusst ignoriert */ }
        })
        updateBar.setOnClickListener { pendingUpdate?.let { startUpdate(it) } }
        headerTitle.text = Kiosk.stationLabel(this, currentStation)
    }

    private fun setupRecyclerView() {
        adapter = OrderAdapter(
            currentStation = { currentStation },
            onCompleteOrder = { order -> completeOrder(order) },
            onItemClick = { order, item -> completeItem(order, item) }
        )

        val displayMetrics = resources.displayMetrics
        val screenWidthDp = displayMetrics.widthPixels / displayMetrics.density
        val spanCount = if (screenWidthDp >= 1200) 2 else 1

        recyclerView.layoutManager = GridLayoutManager(this, spanCount)
        recyclerView.adapter = adapter
    }

    private fun stationButton(station: String) = when (station) {
        Kiosk.STATION_BAR -> R.id.btnBar
        Kiosk.STATION_KITCHEN -> R.id.btnKitchen
        else -> R.id.btnAll
    }

    private fun setupStationToggle() {
        stationToggle.check(stationButton(currentStation))
        stationToggle.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (!isChecked) return@addOnButtonCheckedListener
            val station = when (checkedId) {
                R.id.btnBar -> Kiosk.STATION_BAR
                R.id.btnKitchen -> Kiosk.STATION_KITCHEN
                else -> Kiosk.STATION_ALL
            }
            if (station != currentStation) {
                currentStation = station
                Kiosk.setStation(this, station) // bleibt nach Neustart erhalten
                headerTitle.text = Kiosk.stationLabel(this, station)
                updateOrdersList()
            }
        }
    }

    private fun selectStation(station: String) {
        currentStation = station
        headerTitle.text = Kiosk.stationLabel(this, station)
        stationToggle.check(stationButton(station))
        updateOrdersList()
    }

    private fun setupCleaningMode() {
        btnClean.setOnClickListener { startCleaningMode() }
    }

    private fun startCleaningMode() {
        cleaningOverlay.visibility = View.VISIBLE
        cleaningTimer.text = "30"
        cleaningCountDown?.cancel()
        cleaningCountDown = object : CountDownTimer(30000, 1000) {
            override fun onTick(millisUntilFinished: Long) {
                cleaningTimer.text = (millisUntilFinished / 1000).toInt().toString()
            }

            override fun onFinish() {
                cleaningOverlay.visibility = View.GONE
            }
        }.start()
    }

    private fun playNotificationSound() {
        if (!soundEnabled) return
        try {
            val toneGenerator = android.media.ToneGenerator(android.media.AudioManager.STREAM_NOTIFICATION, 100)
            toneGenerator.startTone(android.media.ToneGenerator.TONE_PROP_BEEP, 150)
            handler.postDelayed({ toneGenerator.startTone(android.media.ToneGenerator.TONE_PROP_BEEP2, 150) }, 200)
            handler.postDelayed({
                toneGenerator.startTone(android.media.ToneGenerator.TONE_PROP_ACK, 200)
                handler.postDelayed({ toneGenerator.release() }, 300)
            }, 400)
        } catch (e: Exception) {
            // Ton ist nett, aber nicht kritisch
        }
    }

    private fun updateOrdersList() {
        val filteredOrders = orders.filter { it.hasItemsForStation(currentStation) }.sortedBy { it.id }
        adapter.submitList(filteredOrders)
        // In-place-Aenderungen (item.completed) erkennt DiffUtil nicht
        adapter.notifyDataSetChanged()
        emptyState.visibility = if (filteredOrders.isEmpty()) View.VISIBLE else View.GONE
        recyclerView.visibility = if (filteredOrders.isEmpty()) View.GONE else View.VISIBLE
    }

    private fun showConnectionState() {
        val connected = webSocketManager?.isConnected == true
        connectionStatus.text = getString(if (connected) R.string.connected else R.string.connecting) +
            getString(if (serverUrl == ServerDetector.LOCAL_URL) R.string.ort_schopf else R.string.ort_cloud)
        connectionStatus.setTextColor(
            ContextCompat.getColor(this, if (connected) R.color.accent else R.color.warning)
        )

        val silentFor = SystemClock.elapsedRealtime() - lastSuccessAt
        val text = when {
            !networkAvailable -> getString(R.string.banner_no_network)
            silentFor > STALE_MS -> getString(R.string.banner_server_unreachable, silentFor / 60_000)
            else -> null
        }
        if (text == null) {
            statusBanner.visibility = View.GONE
        } else {
            statusBanner.text = text
            statusBanner.visibility = View.VISIBLE
        }
    }

    // --- Verbindung ---------------------------------------------------------

    private fun startConnection(detect: Boolean) {
        val token = tokenManager.getToken()
        val configured = Kiosk.serverUrl(this)
        if (serverUrl.isEmpty()) serverUrl = configured
        connectTo(serverUrl, token)
        if (detect) {
            // Vor-Ort-Server (kasse.local) bevorzugen, sonst Cloud
            mainScope.launch {
                val detected = ServerDetector.detectServer(configured)
                if (running && detected != serverUrl) {
                    Log.d(TAG, "Server gewechselt: $serverUrl -> $detected")
                    serverUrl = detected
                    connectTo(detected, tokenManager.getToken())
                }
            }
        }
    }

    private fun connectTo(url: String, token: String?) {
        webSocketManager?.disconnect()
        apiService = ApiService(url, token)
        webSocketManager = WebSocketManager(url, this, token).also { it.connect() }
        fetchOrders()
        showConnectionState()
    }

    // T400 im Schopf laufend suchen: hin sofort, zurueck in die Cloud erst
    // nach zwei Fehlschlaegen (ein verlorenes Paket soll nicht umschalten).
    private var ortFehler = 0
    private val ortRunnable = object : Runnable {
        override fun run() {
            if (!running) return
            mainScope.launch {
                val configured = Kiosk.serverUrl(this@MainActivity)
                val detected = ServerDetector.detectServer(configured)
                if (!running) return@launch
                val lokal = detected == ServerDetector.LOCAL_URL
                if (lokal) ortFehler = 0 else ortFehler++
                val ziel = when {
                    lokal && serverUrl != detected -> detected
                    !lokal && serverUrl == ServerDetector.LOCAL_URL && ortFehler >= 2 -> configured
                    else -> null
                }
                if (ziel != null) {
                    Log.d(TAG, "Ort gewechselt: $serverUrl -> $ziel")
                    serverUrl = ziel
                    connectTo(ziel, tokenManager.getToken())
                }
            }
            handler.postDelayed(this, ORT_MS)
        }
    }

    private val pollRunnable = object : Runnable {
        override fun run() {
            if (!running) return
            fetchOrders()
            handler.postDelayed(this, POLL_MS)
        }
    }

    private val minuteTicker = object : Runnable {
        override fun run() {
            if (!running) return
            adapter.notifyDataSetChanged() // Minutenanzeige auffrischen
            handler.postDelayed(this, 60_000)
        }
    }

    private val watchdogRunnable = object : Runnable {
        override fun run() {
            if (!running) return
            val now = SystemClock.elapsedRealtime()
            val silentFor = now - lastSuccessAt
            showConnectionState()
            if (networkAvailable && silentFor > RELOAD_MS && now - startedAt > RELOAD_MS) {
                Log.w(TAG, "Seit ${silentFor / 1000}s nichts vom Server — Anzeige wird neu aufgebaut")
                mainScope.launch(Dispatchers.IO) { ApiService.resetConnections() }
                recreate()
                return
            }
            if (silentFor > STALE_MS && now - lastReconnectAt > STALE_MS) {
                Log.w(TAG, "Seit ${silentFor / 1000}s nichts vom Server — neu verbinden")
                lastReconnectAt = now
                mainScope.launch(Dispatchers.IO) { ApiService.resetConnections() }
                serverUrl = "" // neu suchen (Vor-Ort-Server koennte weg/da sein)
                webSocketManager?.disconnect()
                startConnection(detect = true)
            }
            handler.postDelayed(this, WATCHDOG_MS)
        }
    }

    private fun registerNetworkCallback() {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        @Suppress("DEPRECATION")
        networkAvailable = cm.activeNetworkInfo?.isConnected == true
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                handler.post {
                    val wasOffline = !networkAvailable
                    networkAvailable = true
                    if (running && wasOffline) {
                        Log.i(TAG, "Netz wieder da — neu verbinden")
                        mainScope.launch(Dispatchers.IO) { ApiService.resetConnections() }
                        webSocketManager?.reconnectNow()
                        fetchOrders()
                    }
                    showConnectionState()
                }
            }

            override fun onLost(network: Network) {
                handler.post {
                    @Suppress("DEPRECATION")
                    networkAvailable = cm.activeNetworkInfo?.isConnected == true
                    showConnectionState()
                }
            }
        }
        try {
            cm.registerDefaultNetworkCallback(callback)
            networkCallback = callback
        } catch (e: Exception) {
            Log.w(TAG, "Netz-Rueckruf nicht moeglich: ${e.message}")
        }
    }

    private fun markSuccess() {
        lastSuccessAt = SystemClock.elapsedRealtime()
        if (statusBanner.visibility == View.VISIBLE) showConnectionState()
    }

    private fun fetchOrders() {
        val api = apiService ?: return
        mainScope.launch {
            api.fetchOrders()
                .onSuccess { fetchedOrders ->
                    if (api !== apiService) return@onSuccess
                    markSuccess()
                    orders.clear()
                    orders.addAll(fetchedOrders.filter {
                        it.status == "pending" || it.status == "paid" || it.status == null
                    })
                    updateOrdersList()
                }
                .onFailure { e ->
                    if (e is AuthException) handleAuthFailure()
                    showConnectionState()
                }
        }
    }

    // --- Anmeldung ----------------------------------------------------------

    /** Taeglich: Token gegen ein frisches tauschen (POST /api/auth/refresh). */
    private val tokenRunnable = object : Runnable {
        override fun run() {
            if (!running) return
            if (!tokenManager.isLoggedIn()) {
                goToLogin(getString(R.string.notice_login_expired))
                return
            }
            if (tokenManager.needsRefresh()) {
                val token = tokenManager.getToken()
                if (token != null) mainScope.launch {
                    // Immer gegen den konfigurierten (Cloud-)Server: der Vor-Ort-Server
                    // hat ein anderes Geheimnis und kennt unser Token nicht.
                    when (val r = AuthService.refresh(Kiosk.serverUrl(this@MainActivity), token)) {
                        is AuthService.Result.Ok -> {
                            Log.i(TAG, "Token erneuert")
                            tokenManager.saveToken(r.token)
                            if (running) connectTo(serverUrl, r.token)
                        }
                        // Ablehnung hier ist kein Grund zur Abmeldung (z.B. Server noch
                        // ohne /refresh, oder Vor-Ort-Betrieb). Das alte Token gilt weiter.
                        else -> Log.w(TAG, "Token-Erneuerung nicht moeglich: $r")
                    }
                }
            }
            handler.postDelayed(this, TOKEN_CHECK_MS)
        }
    }

    private fun handleAuthFailure() {
        if (handlingAuthFailure) return
        handlingAuthFailure = true
        val token = tokenManager.getToken()
        if (token == null) {
            goToLogin(getString(R.string.notice_login_expired))
            return
        }
        mainScope.launch {
            when (val r = AuthService.refresh(serverUrl, token)) {
                is AuthService.Result.Ok -> {
                    tokenManager.saveToken(r.token)
                    handlingAuthFailure = false
                    if (running) connectTo(serverUrl, r.token)
                }
                is AuthService.Result.Unreachable -> {
                    handlingAuthFailure = false // spaeter erneut
                }
                is AuthService.Result.Rejected -> {
                    tokenManager.logout()
                    goToLogin(getString(R.string.notice_login_rejected))
                }
            }
        }
    }

    private fun goToLogin(notice: String) {
        running = false
        handler.removeCallbacksAndMessages(null)
        webSocketManager?.disconnect()
        LoginActivity.open(this, notice)
        finish()
    }

    // --- Erledigen ----------------------------------------------------------

    private fun completeOrder(order: Order) {
        mainScope.launch {
            if (currentStation == Kiosk.STATION_ALL) {
                apiService?.completeOrder(order.id)?.onSuccess {
                    orders.removeAll { it.id == order.id }
                    updateOrdersList()
                }?.onFailure { if (it is AuthException) handleAuthFailure() }
            } else {
                val stationItems = order.getItemsForStation(currentStation).filter { !it.completed }
                if (stationItems.isNotEmpty()) {
                    apiService?.completeItems(order.id, stationItems.map { it.id })?.onSuccess {
                        stationItems.forEach { it.completed = true }
                        updateOrdersList()
                    }?.onFailure { if (it is AuthException) handleAuthFailure() }
                }
            }
        }
    }

    private fun completeItem(order: Order, item: OrderItem) {
        mainScope.launch {
            apiService?.completeItems(order.id, listOf(item.id))?.onSuccess {
                item.completed = true
                updateOrdersList()
            }?.onFailure { if (it is AuthException) handleAuthFailure() }
        }
    }

    // --- Selbst-Update ------------------------------------------------------

    private val updateRunnable = object : Runnable {
        override fun run() {
            if (!running) return
            checkForUpdates()
            handler.postDelayed(this, UPDATE_CHECK_MS)
        }
    }

    private fun checkForUpdates() {
        mainScope.launch {
            val result = updateChecker.checkForUpdate()
            if (result is UpdateChecker.UpdateResult.UpdateAvailable && !downloading) {
                pendingUpdate = result
                updateBar.text = getString(R.string.update_available, result.newVersion)
                updateBar.visibility = View.VISIBLE
            }
        }
    }

    private fun startUpdate(update: UpdateChecker.UpdateResult.UpdateAvailable) {
        if (downloading) return
        if (!updateChecker.canInstall()) {
            AlertDialog.Builder(this)
                .setTitle(R.string.update_permission_title)
                .setMessage(R.string.update_permission_message)
                .setPositiveButton(R.string.open_settings) { _, _ ->
                    try {
                        startActivity(updateChecker.installPermissionIntent())
                    } catch (e: Exception) {
                        startActivity(Intent(android.provider.Settings.ACTION_SETTINGS))
                    }
                }
                .setNegativeButton(R.string.later, null)
                .show()
            return
        }
        downloading = true
        updateBar.text = getString(R.string.update_downloading, 0)
        mainScope.launch {
            val apk = updateChecker.download(update) { pct ->
                updateBar.text = getString(R.string.update_downloading, pct)
            }
            downloading = false
            if (apk == null) {
                updateBar.text = getString(R.string.update_failed)
            } else {
                updateBar.text = getString(R.string.update_available, update.newVersion)
                try {
                    updateChecker.install(apk)
                } catch (e: Exception) {
                    Log.e(TAG, "Installer nicht startbar", e)
                    updateBar.text = getString(R.string.update_failed)
                }
            }
        }
    }

    // --- WebSocket-Rueckrufe ------------------------------------------------

    override fun onConnected() {
        markSuccess()
        showConnectionState()
        fetchOrders()
    }

    override fun onDisconnected() {
        showConnectionState()
    }

    override fun onAuthFailed() {
        handleAuthFailure()
    }

    override fun onMessageReceived() {
        markSuccess()
    }

    override fun onNewOrder(order: Order) {
        if (orders.none { it.id == order.id }) {
            orders.add(order)
            updateOrdersList()
            if (order.hasItemsForStation(currentStation)) {
                playNotificationSound()
                window.decorView.setBackgroundColor(ContextCompat.getColor(this, R.color.warning))
                handler.postDelayed({
                    window.decorView.setBackgroundColor(ContextCompat.getColor(this, R.color.background_dark))
                }, 200)
            }
        }
    }

    override fun onOrderCompleted(orderId: Int) {
        orders.removeAll { it.id == orderId }
        updateOrdersList()
    }

    override fun onOrderUpdated(orderId: Int, status: String?, paymentMethod: String?) {
        // Wie die Web-Anzeige: im Zweifel frisch abrufen (Positionen koennen sich geaendert haben)
        if (status == "completed" || status == "cancelled") {
            orders.removeAll { it.id == orderId }
            updateOrdersList()
        }
        fetchOrders()
    }

    override fun onItemsCompleted(orderId: Int, itemIds: List<Int>) {
        // Eine andere Anzeige (z.B. die Bar) hat Positionen erledigt
        val order = orders.firstOrNull { it.id == orderId } ?: return
        order.items.forEach { if (it.id in itemIds) it.completed = true }
        updateOrdersList()
    }
}
