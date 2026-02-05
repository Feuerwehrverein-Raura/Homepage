package ch.fwvraura.vorstand.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ch.fwvraura.vorstand.VorstandApp
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.LoginRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * ViewModel fuer den Login-Screen.
 *
 * Verwaltet den Login-State als StateFlow, sodass die LoginActivity
 * reaktiv auf Zustandsaenderungen reagieren kann.
 * Das ViewModel ueberlebt Konfigurationsaenderungen (z.B. Bildschirmdrehungen),
 * wodurch ein laufender Login-Vorgang nicht unterbrochen wird.
 */
class LoginViewModel : ViewModel() {

    /**
     * Interner MutableStateFlow fuer den Login-Zustand.
     * Nur innerhalb des ViewModels beschreibbar (_loginState).
     */
    private val _loginState = MutableStateFlow<LoginState>(LoginState.Idle)

    /**
     * Oeffentlich lesbarer StateFlow fuer den Login-Zustand.
     * Die Activity beobachtet diesen Flow, um die UI entsprechend zu aktualisieren.
     */
    val loginState: StateFlow<LoginState> = _loginState

    /**
     * Fuehrt den Login-Vorgang durch.
     *
     * Ablauf:
     * 1. Validierung: Prueft ob E-Mail und Passwort nicht leer sind.
     *    Falls leer, wird sofort ein Error-State gesetzt und abgebrochen.
     * 2. Setzt den State auf Loading (zeigt Ladeindikator in der UI).
     * 3. Startet eine Coroutine im viewModelScope (wird automatisch abgebrochen,
     *    wenn das ViewModel zerstoert wird).
     * 4. Sendet einen POST-Request an /auth/vorstand/login ueber die AuthApi.
     * 5. Bei Erfolg (HTTP 2xx):
     *    - Speichert Token, E-Mail, Rolle und Name im TokenManager (SharedPreferences).
     *    - Setzt den State auf Success (loest Navigation zur MainActivity aus).
     * 6. Bei HTTP-Fehler:
     *    - 401: Ungueltige Anmeldedaten (falsches Passwort oder E-Mail).
     *    - 403: E-Mail nicht berechtigt (kein Vorstandsmitglied).
     *    - Sonstige: Allgemeine Fehlermeldung mit HTTP-Statuscode.
     * 7. Bei Netzwerkfehler (Exception): Zeigt Fehlermeldung mit Exception-Details.
     *
     * @param email    Die eingegebene E-Mail-Adresse des Benutzers.
     * @param password Das eingegebene Passwort des Benutzers.
     */
    fun login(email: String, password: String) {
        // Validierung: E-Mail und Passwort duerfen nicht leer sein
        if (email.isBlank() || password.isBlank()) {
            _loginState.value = LoginState.Error("E-Mail und Passwort eingeben")
            return
        }

        // Ladezustand setzen, bevor der Netzwerk-Request gestartet wird
        _loginState.value = LoginState.Loading
        viewModelScope.launch {
            try {
                // POST-Request an die Login-API mit E-Mail und Passwort
                val response = ApiModule.authApi.login(LoginRequest(email, password))
                if (response.isSuccessful) {
                    // Erfolgreiche Antwort: Token und Benutzerdaten speichern
                    val body = response.body()!!
                    val tokenManager = VorstandApp.instance.tokenManager
                    tokenManager.token = body.token
                    tokenManager.userEmail = body.user.email
                    tokenManager.userRole = body.user.role
                    tokenManager.userName = body.user.name
                    _loginState.value = LoginState.Success
                } else {
                    // HTTP-Fehler: Passende Fehlermeldung je nach Statuscode anzeigen
                    val errorMsg = when (response.code()) {
                        401 -> "Ungültige Anmeldedaten"
                        403 -> "E-Mail nicht berechtigt"
                        else -> "Anmeldung fehlgeschlagen (${response.code()})"
                    }
                    _loginState.value = LoginState.Error(errorMsg)
                }
            } catch (e: Exception) {
                // Netzwerkfehler (z.B. kein Internet, Server nicht erreichbar)
                _loginState.value = LoginState.Error("Netzwerkfehler: ${e.message}")
            }
        }
    }

    /**
     * Sealed Class fuer die Zustandsmaschine des Login-Prozesses.
     *
     * Definiert alle moeglichen Zustaende, in denen sich der Login befinden kann.
     * Durch die Verwendung einer Sealed Class stellt der Compiler sicher,
     * dass in when-Ausdruecken alle Zustaende behandelt werden.
     *
     * - Idle:    Ausgangszustand — der Benutzer hat noch nichts eingegeben
     *            oder der letzte Vorgang wurde zurueckgesetzt.
     * - Loading: Der Login-Request wurde gesendet und die Antwort wird erwartet.
     * - Success: Der Login war erfolgreich, Token wurde gespeichert.
     * - Error:   Der Login ist fehlgeschlagen, enthaelt die Fehlermeldung als String.
     */
    sealed class LoginState {
        /** Ausgangszustand — kein Login-Vorgang aktiv. */
        object Idle : LoginState()

        /** Ladezustand — Login-Request laeuft, Antwort wird erwartet. */
        object Loading : LoginState()

        /** Erfolgszustand — Login war erfolgreich, Token gespeichert. */
        object Success : LoginState()

        /** Fehlerzustand — Login fehlgeschlagen, enthaelt die Fehlermeldung. */
        data class Error(val message: String) : LoginState()
    }
}
