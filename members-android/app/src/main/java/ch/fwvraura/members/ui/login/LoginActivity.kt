package ch.fwvraura.members.ui.login

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.View
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.lifecycle.lifecycleScope
import ch.fwvraura.members.MainActivity
import ch.fwvraura.members.MembersApp
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.databinding.ActivityLoginBinding
import ch.fwvraura.members.sync.ContactsSyncManager
import ch.fwvraura.members.util.OidcConstants
import androidx.appcompat.app.AlertDialog
import com.google.android.material.tabs.TabLayout
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import net.openid.appauth.AuthorizationException
import net.openid.appauth.AuthorizationRequest
import net.openid.appauth.AuthorizationResponse
import net.openid.appauth.AuthorizationService
import net.openid.appauth.AuthorizationServiceConfiguration
import net.openid.appauth.NoClientAuthentication
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

    /**
     * Rueckkehr aus dem Passwort-Reset. Bei Erfolg hat die PasswordResetActivity
     * bereits ein frisches Member-JWT erhalten und gibt es hier zurueck — wir
     * legen damit die Session an und faehren dieselbe Post-Login-Routine wie beim
     * normalen Login.
     */
    private val passwordResetLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode != Activity.RESULT_OK) return@registerForActivityResult
        val data = result.data ?: return@registerForActivityResult
        val token = data.getStringExtra(PasswordResetActivity.EXTRA_TOKEN)
        if (token.isNullOrBlank()) return@registerForActivityResult
        loginWithMemberToken(
            token,
            data.getStringExtra(PasswordResetActivity.EXTRA_EMAIL),
            data.getStringExtra(PasswordResetActivity.EXTRA_NAME)
        )
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
        // Mitglied-Tab: OIDC-Browser-Login (Authentik/AppAuth).
        binding.btnMemberLogin.setOnClickListener { startOidcLogin() }

        // Passwort-Reset laeuft app-nativ; die Reset-Activity fragt die E-Mail
        // selbst ab (kein Prefill mehr, da das E-Mail-Feld entfernt wurde).
        binding.btnForgotPassword.setOnClickListener {
            passwordResetLauncher.launch(Intent(this, PasswordResetActivity::class.java))
        }

        binding.btnQrLogin.setOnClickListener {
            startActivity(Intent(this, QrScannerActivity::class.java))
        }
    }

    /**
     * Session aus einem rohen Member-JWT anlegen (Login ODER Reset-Erfolg) und
     * die bestehende Post-Login-Routine ausfuehren: FCM-Token registrieren +
     * Kontakt-Sync-Frage/Trigger + navigateToMain. Wie beim QR-Login hat dieses
     * JWT keinen Refresh-Token — der stille Re-Login laeuft ueber den QR-App-Token
     * bzw. hier ueber ein Neu-Anmelden.
     */
    private fun loginWithMemberToken(token: String, email: String?, name: String?) {
        val tm = MembersApp.instance.tokenManager
        tm.token = token
        tm.refreshToken = null
        tm.accountType = "member"
        if (!email.isNullOrBlank()) tm.userEmail = email
        tm.userName = name
        lifecycleScope.launch {
            registerFcmTokenIfPresent(tm)
            handleContactsSyncAfterLogin()
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
        // Authentik-Discovery listet 'none' nicht in token_endpoint_auth_methods_supported,
        // obwohl der Mobile-App-Provider als public konfiguriert ist. Ohne expliziten
        // NoClientAuthentication versucht AppAuth client_secret_post zu senden — hat aber
        // keinen Secret und scheitert mit "no client authentication included".
        authService.performTokenRequest(
            authResponse.createTokenExchangeRequest(),
            NoClientAuthentication.INSTANCE
        ) { tokenResp, ex ->
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
            registerFcmTokenIfPresent(tm)
            handleContactsSyncAfterLogin()
        }
    }

    /**
     * FCM-Token nach dem Login ans Backend pushen. Falls noch keiner gecached ist
     * (z.B. erster Start nach Install — onNewToken kann verzoegert kommen),
     * holen wir ihn aktiv von FirebaseMessaging.
     */
    private suspend fun registerFcmTokenIfPresent(tm: ch.fwvraura.members.util.TokenManager) {
        val token = tm.fcmToken ?: requestFcmToken() ?: return
        tm.fcmToken = token
        try {
            ApiModule.membersApi.registerFcmToken(
                ch.fwvraura.members.data.model.FcmTokenRegistration(token = token)
            )
            Log.d("LoginActivity", "FCM token registered with backend (len=${token.length})")
        } catch (e: Exception) {
            Log.w("LoginActivity", "FCM token registration failed: ${e.message}")
        }
    }

    private suspend fun requestFcmToken(): String? = try {
        FirebaseMessaging.getInstance().token.await()
    } catch (e: Exception) {
        Log.w("LoginActivity", "FirebaseMessaging.getToken failed: ${e.message}")
        null
    }

    /**
     * Beim ersten Login fragen wir den Mitglieder-Sync an. Bei spaeteren Logins:
     * wenn der Sync aktiviert ist, sofort einen Sync triggern damit das Adressbuch
     * aktuell bleibt.
     */
    private fun handleContactsSyncAfterLogin() {
        val tm = MembersApp.instance.tokenManager
        if (!tm.contactsSyncAsked) {
            AlertDialog.Builder(this)
                .setTitle("Mitglieder-Verzeichnis")
                .setMessage(
                    "Möchtest du die FWV-Mitglieder als Adressbuch-Konto auf deinem Telefon hinzufügen?\n\n" +
                            "So siehst du bei eingehenden Anrufen automatisch den Namen, wenn ein Mitglied " +
                            "dich anruft. Das Konto wird im Adressbuch unter \"FWV Raura\" angezeigt; du " +
                            "kannst einzelne Kontakte löschen oder den Sync später unter Profil deaktivieren."
                )
                .setPositiveButton("Ja, hinzufügen") { _, _ ->
                    tm.contactsSyncAsked = true
                    tm.contactsSyncEnabled = true
                    enableContactsSyncWithPermission()
                }
                .setNegativeButton("Nein, danke") { _, _ ->
                    tm.contactsSyncAsked = true
                    tm.contactsSyncEnabled = false
                    navigateToMain()
                }
                .setCancelable(false)
                .show()
        } else {
            if (tm.contactsSyncEnabled) ContactsSyncManager.requestSyncNow(this)
            navigateToMain()
        }
    }

    private val contactsPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { _ ->
        // Permissions akzeptiert oder nicht — wir versuchen den Sync trotzdem zu starten;
        // ohne WRITE_CONTACTS schreibt der SyncAdapter halt nichts.
        ContactsSyncManager.enableSync(this)
        ContactsSyncManager.requestSyncNow(this)
        navigateToMain()
    }

    private fun enableContactsSyncWithPermission() {
        contactsPermissionLauncher.launch(arrayOf(
            android.Manifest.permission.READ_CONTACTS,
            android.Manifest.permission.WRITE_CONTACTS
        ))
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
