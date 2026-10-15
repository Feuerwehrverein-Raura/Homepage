package ch.fwvraura.kitchendisplay

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup
import com.google.android.material.progressindicator.CircularProgressIndicator
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.*

/**
 * Einstieg der App. Ist ein gueltiges Token gespeichert, geht es sofort zur
 * Anzeige — die Maske sieht man nur bei der Ersteinrichtung oder wenn das
 * Token wirklich abgelaufen ist (Geraet > 30 Tage offline).
 */
class LoginActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_NOTICE = "notice"

        fun open(context: Context, notice: String? = null) {
            context.startActivity(
                Intent(context, LoginActivity::class.java)
                    .putExtra(EXTRA_NOTICE, notice)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            )
        }
    }

    private lateinit var passwordInput: TextInputEditText
    private lateinit var loginButton: MaterialButton
    private lateinit var errorText: TextView
    private lateinit var loadingIndicator: CircularProgressIndicator
    private lateinit var stationGroup: MaterialButtonToggleGroup
    private lateinit var tokenManager: TokenManager

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        tokenManager = TokenManager(this)
        val notice = intent.getStringExtra(EXTRA_NOTICE)

        // Schon angemeldet und Station gewaehlt? Direkt zur Anzeige.
        if (notice == null && tokenManager.isLoggedIn() && Kiosk.station(this) != null) {
            startMainActivity()
            return
        }

        setContentView(R.layout.activity_login)
        Kiosk.applyFullscreen(this)

        passwordInput = findViewById(R.id.passwordInput)
        loginButton = findViewById(R.id.loginButton)
        errorText = findViewById(R.id.errorText)
        loadingIndicator = findViewById(R.id.loadingIndicator)
        stationGroup = findViewById(R.id.stationGroup)

        findViewById<TextView>(R.id.versionText).text = getString(
            R.string.version_label,
            packageManager.getPackageInfo(packageName, 0).versionName
        )

        findViewById<TextView>(R.id.noticeText).apply {
            if (!notice.isNullOrBlank()) {
                text = notice
                visibility = View.VISIBLE
            }
        }

        stationGroup.check(
            when (Kiosk.station(this)) {
                Kiosk.STATION_BAR -> R.id.loginStationBar
                Kiosk.STATION_ALL -> R.id.loginStationAll
                else -> R.id.loginStationKitchen
            }
        )

        // Token noch gueltig (nur die Station fehlte)? Dann kein Passwort noetig.
        if (tokenManager.isLoggedIn()) {
            findViewById<View>(R.id.passwordLayout).visibility = View.GONE
            loginButton.text = getString(R.string.start_button)
        }

        loginButton.setOnClickListener { doLogin() }

        // Kiosk: «Zurueck» ignorieren; Einstellungen/Beenden nur ueber Logo 3 s + Code
        onBackPressedDispatcher.addCallback(this, object : androidx.activity.OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { /* bewusst ignoriert */ }
        })
        Kiosk.attachSecretHold(this, findViewById(R.id.loginLogo)) {
            startActivity(Intent(this, SettingsActivity::class.java))
        }

        passwordInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                doLogin()
                true
            } else false
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) Kiosk.applyFullscreen(this)
    }

    private fun selectedStation(): String = when (stationGroup.checkedButtonId) {
        R.id.loginStationBar -> Kiosk.STATION_BAR
        R.id.loginStationAll -> Kiosk.STATION_ALL
        else -> Kiosk.STATION_KITCHEN
    }

    private fun showError(text: String) {
        errorText.text = text
        errorText.visibility = View.VISIBLE
    }

    private fun doLogin() {
        Kiosk.setStation(this, selectedStation())

        if (tokenManager.isLoggedIn()) {
            startMainActivity()
            return
        }

        val password = passwordInput.text?.toString()?.trim() ?: ""
        if (password.isEmpty()) {
            showError(getString(R.string.error_empty_password))
            return
        }

        // Nach einem Fehlversuch: vor dem naechsten Versuch deutlich warnen. Das
        // Backend sperrt nach 3 Fehlversuchen die oeffentliche IP fuer 24 h — im
        // Schopf trifft das auch die Kasse.
        val left = remainingAttempts
        if (left != null && !confirmedRisk) {
            androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle(R.string.attempts_warning_title)
                .setMessage(getString(R.string.attempts_warning, left))
                .setPositiveButton(R.string.attempts_send) { _, _ ->
                    confirmedRisk = true
                    doLogin()
                }
                .setNegativeButton(R.string.attempts_cancel, null)
                .show()
            return
        }
        confirmedRisk = false
        sendLogin(password)
    }

    // Vom Server gemeldete Restversuche (null = noch kein Fehlversuch)
    private var remainingAttempts: Int? = null
    private var confirmedRisk = false

    private fun sendLogin(password: String) {
        errorText.visibility = View.GONE
        loginButton.isEnabled = false
        loadingIndicator.visibility = View.VISIBLE

        scope.launch {
            try {
                // Lokaler Vor-Ort-Server (kasse.local) zuerst, sonst Cloud
                val serverUrl = ServerDetector.detectServer(Kiosk.serverUrl(this@LoginActivity))
                when (val result = AuthService.login(serverUrl, password)) {
                    is AuthService.Result.Ok -> {
                        tokenManager.saveToken(result.token)
                        startMainActivity()
                    }
                    is AuthService.Result.Rejected -> {
                        // Text des Servers woertlich (Restversuche, IP-Sperre, ...)
                        val text = result.message ?: "Anmeldung abgelehnt (HTTP ${result.code})"
                        remainingAttempts = AuthService.remainingAttempts(text)
                        showError(
                            if (remainingAttempts != null)
                                text + "\n" + getString(R.string.attempts_hint, remainingAttempts)
                            else text
                        )
                    }
                    is AuthService.Result.Unreachable -> showError(
                        result.serverText ?: getString(R.string.error_connection)
                    )
                }
            } finally {
                loginButton.isEnabled = true
                loadingIndicator.visibility = View.GONE
            }
        }
    }

    private fun startMainActivity() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }
}
