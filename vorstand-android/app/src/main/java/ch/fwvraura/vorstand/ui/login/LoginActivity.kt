package ch.fwvraura.vorstand.ui.login

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import ch.fwvraura.vorstand.MainActivity
import ch.fwvraura.vorstand.VorstandApp
import ch.fwvraura.vorstand.databinding.ActivityLoginBinding
import kotlinx.coroutines.launch

/**
 * Login-Screen mit E-Mail- und Passwort-Eingabe.
 *
 * Dies ist die LAUNCHER Activity — der erste Screen, der beim App-Start angezeigt wird.
 * Falls der Benutzer bereits eingeloggt ist (Token vorhanden), wird direkt
 * zur MainActivity weitergeleitet, ohne den Login-Screen anzuzeigen.
 */
class LoginActivity : AppCompatActivity() {

    /** View-Binding fuer activity_login.xml — ermoeglicht typsicheren Zugriff auf alle Views. */
    private lateinit var binding: ActivityLoginBinding

    /**
     * ViewModel fuer den Login-Screen.
     * Wird per Delegate (by viewModels()) erzeugt und ueberlebt Konfigurationsaenderungen
     * wie z.B. Bildschirmdrehungen.
     */
    private val viewModel: LoginViewModel by viewModels()

    /**
     * Wird beim Erstellen der Activity aufgerufen.
     *
     * Prueft zuerst, ob der Benutzer bereits eingeloggt ist (Token im TokenManager vorhanden).
     * Falls ja, wird sofort zur MainActivity navigiert und der Login-Screen uebersprungen.
     * Falls nein, wird das Login-Layout angezeigt, die UI eingerichtet und
     * der Login-State beobachtet.
     */
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Login ueberspringen, falls bereits authentifiziert (Token vorhanden)
        if (VorstandApp.instance.tokenManager.isLoggedIn) {
            navigateToMain()
            return
        }

        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupUI()
        observeState()
    }

    /**
     * Richtet die UI-Interaktionen ein.
     *
     * 1. Setzt einen OnClickListener auf den Login-Button, der doLogin() aufruft.
     * 2. Setzt einen EditorActionListener auf das Passwort-Feld, sodass der Login
     *    auch ausgeloest wird, wenn der Benutzer auf der Tastatur "Fertig" (IME_ACTION_DONE)
     *    drueckt — das verbessert die Benutzererfahrung, weil man nicht extra
     *    den Button antippen muss.
     */
    private fun setupUI() {
        binding.loginButton.setOnClickListener {
            doLogin()
        }

        binding.passwordInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                doLogin()
                true
            } else false
        }
    }

    /**
     * Liest E-Mail und Passwort aus den Eingabefeldern und startet den Login-Vorgang
     * ueber das ViewModel.
     *
     * Die E-Mail wird mit trim() bereinigt (fuehrende/nachfolgende Leerzeichen entfernt),
     * das Passwort wird unveraendert uebergeben.
     */
    private fun doLogin() {
        val email = binding.emailInput.text.toString().trim()
        val password = binding.passwordInput.text.toString()
        viewModel.login(email, password)
    }

    /**
     * Beobachtet den LoginState-StateFlow aus dem ViewModel und reagiert auf Zustandsaenderungen.
     *
     * Verwendet lifecycleScope + repeatOnLifecycle(STARTED), damit die Beobachtung nur
     * aktiv ist, wenn die Activity sichtbar ist (zwischen onStart und onStop).
     * Das verhindert unnoetige UI-Updates im Hintergrund.
     *
     * Zustaende:
     * - Idle:    Ausgangszustand — Fortschrittsanzeige und Fehlertext versteckt, Button aktiv.
     * - Loading: Login laeuft — Fortschrittsanzeige sichtbar, Button deaktiviert,
     *            damit der Benutzer nicht mehrfach klickt.
     * - Success: Login erfolgreich — Navigation zur MainActivity.
     * - Error:   Login fehlgeschlagen — Fehlermeldung anzeigen, Button wieder aktivieren,
     *            damit der Benutzer es erneut versuchen kann.
     */
    private fun observeState() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.loginState.collect { state ->
                    when (state) {
                        is LoginViewModel.LoginState.Idle -> {
                            binding.loginProgress.visibility = View.GONE
                            binding.errorText.visibility = View.GONE
                            binding.loginButton.isEnabled = true
                        }
                        is LoginViewModel.LoginState.Loading -> {
                            binding.loginProgress.visibility = View.VISIBLE
                            binding.errorText.visibility = View.GONE
                            binding.loginButton.isEnabled = false
                        }
                        is LoginViewModel.LoginState.Success -> {
                            navigateToMain()
                        }
                        is LoginViewModel.LoginState.Error -> {
                            binding.loginProgress.visibility = View.GONE
                            binding.errorText.text = state.message
                            binding.errorText.visibility = View.VISIBLE
                            binding.loginButton.isEnabled = true
                        }
                    }
                }
            }
        }
    }

    /**
     * Navigiert zur MainActivity und beendet die LoginActivity.
     *
     * finish() sorgt dafuer, dass die LoginActivity vom Activity-Stack entfernt wird,
     * sodass der Benutzer nicht per Zurueck-Taste wieder zum Login-Screen gelangt.
     */
    private fun navigateToMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
