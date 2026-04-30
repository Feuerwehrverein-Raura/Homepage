package ch.fwvraura.members.ui.login

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.lifecycle.lifecycleScope
import ch.fwvraura.members.MainActivity
import ch.fwvraura.members.MembersApp
import ch.fwvraura.members.R
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.databinding.ActivityLoginBinding
import ch.fwvraura.members.util.OidcConstants
import com.google.android.material.tabs.TabLayout
import kotlinx.coroutines.launch
import net.openid.appauth.AuthorizationException
import net.openid.appauth.AuthorizationRequest
import net.openid.appauth.AuthorizationResponse
import net.openid.appauth.AuthorizationService
import net.openid.appauth.AuthorizationServiceConfiguration
import net.openid.appauth.ResponseTypeValues
import net.openid.appauth.TokenResponse

/**
 * Login-Screen mit drei Modi (Tabs): Mitglied, Organisator, QR-Code.
 *
 * - Mitglied:    OIDC-Login (AppAuth) — Implementierung in Phase 1b
 * - Organisator: E-Mail + Passwort gegen POST /events/login (existierender Endpoint)
 * - QR-Code:     QR-Scanner (zxing) -> POST /auth/{member,organizer}/qr-login (Phase 1c)
 */
class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding
    private lateinit var authService: AuthorizationService

    private val oidcLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val data = result.data
        if (data == null) {
            showError("Login abgebrochen")
            return@registerForActivityResult
        }
        val resp = AuthorizationResponse.fromIntent(data)
        val ex = AuthorizationException.fromIntent(data)
        when {
            resp != null -> exchangeAuthCode(resp)
            ex != null -> showError("Login-Fehler: ${ex.errorDescription ?: ex.error}")
            else -> showError("Login fehlgeschlagen")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        @Suppress("DEPRECATION")
        WindowCompat.setDecorFitsSystemWindows(window, true)

        if (MembersApp.instance.tokenManager.isLoggedIn) {
            navigateToMain()
            return
        }

        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)
        authService = AuthorizationService(this)

        setupTabs()
        setupActions()
    }

    override fun onDestroy() {
        super.onDestroy()
        if (::authService.isInitialized) authService.dispose()
    }

    private fun setupTabs() {
        binding.loginTabs.addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: TabLayout.Tab) {
                binding.errorText.visibility = View.GONE
                binding.paneMember.visibility = if (tab.position == 0) View.VISIBLE else View.GONE
                binding.paneQr.visibility = if (tab.position == 1) View.VISIBLE else View.GONE
            }
            override fun onTabUnselected(tab: TabLayout.Tab) {}
            override fun onTabReselected(tab: TabLayout.Tab) {}
        })
    }

    private fun setupActions() {
        binding.btnMemberLogin.setOnClickListener { startOidcLogin() }

        binding.btnQrLogin.setOnClickListener {
            startActivity(Intent(this, QrScannerActivity::class.java))
        }
    }

    private fun startOidcLogin() {
        binding.loginProgress.visibility = View.VISIBLE
        binding.errorText.visibility = View.GONE
        AuthorizationServiceConfiguration.fetchFromIssuer(
            Uri.parse(OidcConstants.AUTHENTIK_ISSUER)
        ) { config, ex ->
            if (config == null) {
                runOnUiThread {
                    binding.loginProgress.visibility = View.GONE
                    showError("Konnte Login-Server nicht erreichen: ${ex?.errorDescription ?: ex?.error}")
                }
                return@fetchFromIssuer
            }
            val request = AuthorizationRequest.Builder(
                config,
                OidcConstants.CLIENT_ID,
                ResponseTypeValues.CODE,
                Uri.parse(OidcConstants.REDIRECT_URI)
            ).setScopes(OidcConstants.SCOPES).build()
            val intent = authService.getAuthorizationRequestIntent(request)
            runOnUiThread {
                binding.loginProgress.visibility = View.GONE
                oidcLauncher.launch(intent)
            }
        }
    }

    private fun exchangeAuthCode(authResponse: AuthorizationResponse) {
        binding.loginProgress.visibility = View.VISIBLE
        binding.errorText.visibility = View.GONE
        authService.performTokenRequest(authResponse.createTokenExchangeRequest()) { tokenResp, ex ->
            runOnUiThread {
                binding.loginProgress.visibility = View.GONE
                if (tokenResp != null) {
                    saveTokenAndContinue(tokenResp)
                } else {
                    Log.e("LoginActivity", "Token exchange failed", ex)
                    showError("Token-Tausch fehlgeschlagen: ${ex?.errorDescription ?: ex?.error}")
                }
            }
        }
    }

    private fun saveTokenAndContinue(tokenResp: TokenResponse) {
        val token = tokenResp.accessToken ?: tokenResp.idToken
        if (token.isNullOrBlank()) {
            showError("Kein Token erhalten")
            return
        }
        val tm = MembersApp.instance.tokenManager
        tm.token = token
        tm.refreshToken = tokenResp.refreshToken
        tm.accountType = "member"
        // Profil im Hintergrund laden, um Name/E-Mail anzuzeigen
        lifecycleScope.launch {
            try {
                val profile = ApiModule.membersApi.getMe().body()
                if (profile != null) {
                    tm.userEmail = profile.email
                    tm.userName = listOfNotNull(profile.vorname, profile.nachname)
                        .joinToString(" ").ifBlank { null }
                }
            } catch (_: Exception) { /* nicht kritisch */ }
            navigateToMain()
        }
    }

    private fun showError(msg: String) {
        binding.errorText.text = msg
        binding.errorText.visibility = View.VISIBLE
    }

    private fun navigateToMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
