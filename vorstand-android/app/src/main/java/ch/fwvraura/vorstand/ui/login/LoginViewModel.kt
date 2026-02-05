package ch.fwvraura.vorstand.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ch.fwvraura.vorstand.VorstandApp
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.LoginRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class LoginViewModel : ViewModel() {

    private val _loginState = MutableStateFlow<LoginState>(LoginState.Idle)
    val loginState: StateFlow<LoginState> = _loginState

    fun login(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            _loginState.value = LoginState.Error("E-Mail und Passwort eingeben")
            return
        }

        _loginState.value = LoginState.Loading
        viewModelScope.launch {
            try {
                val response = ApiModule.authApi.login(LoginRequest(email, password))
                if (response.isSuccessful) {
                    val body = response.body()!!
                    val tokenManager = VorstandApp.instance.tokenManager
                    tokenManager.token = body.token
                    tokenManager.userEmail = body.user.email
                    tokenManager.userRole = body.user.role
                    tokenManager.userName = body.user.name
                    _loginState.value = LoginState.Success
                } else {
                    val errorMsg = when (response.code()) {
                        401 -> "Ungültige Anmeldedaten"
                        403 -> "E-Mail nicht berechtigt"
                        else -> "Anmeldung fehlgeschlagen (${response.code()})"
                    }
                    _loginState.value = LoginState.Error(errorMsg)
                }
            } catch (e: Exception) {
                _loginState.value = LoginState.Error("Netzwerkfehler: ${e.message}")
            }
        }
    }

    sealed class LoginState {
        object Idle : LoginState()
        object Loading : LoginState()
        object Success : LoginState()
        data class Error(val message: String) : LoginState()
    }
}
