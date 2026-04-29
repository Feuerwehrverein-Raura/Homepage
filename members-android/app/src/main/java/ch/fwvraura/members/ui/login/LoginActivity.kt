package ch.fwvraura.members.ui.login

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import ch.fwvraura.members.MainActivity
import ch.fwvraura.members.MembersApp
import ch.fwvraura.members.R
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.OrganizerLoginRequest
import ch.fwvraura.members.databinding.ActivityLoginBinding
import com.google.android.material.tabs.TabLayout
import kotlinx.coroutines.launch

/**
 * Login-Screen mit drei Modi (Tabs): Mitglied, Organisator, QR-Code.
 *
 * - Mitglied:    OIDC-Login (AppAuth) — Implementierung in Phase 1b
 * - Organisator: E-Mail + Passwort gegen POST /events/login (existierender Endpoint)
 * - QR-Code:     QR-Scanner (zxing) -> POST /auth/{member,organizer}/qr-login (Phase 1c)
 */
class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (MembersApp.instance.tokenManager.isLoggedIn) {
            navigateToMain()
            return
        }

        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupTabs()
        setupActions()
    }

    private fun setupTabs() {
        binding.loginTabs.addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: TabLayout.Tab) {
                binding.errorText.visibility = View.GONE
                binding.paneMember.visibility = if (tab.position == 0) View.VISIBLE else View.GONE
                binding.paneOrganizer.visibility = if (tab.position == 1) View.VISIBLE else View.GONE
                binding.paneQr.visibility = if (tab.position == 2) View.VISIBLE else View.GONE
            }
            override fun onTabUnselected(tab: TabLayout.Tab) {}
            override fun onTabReselected(tab: TabLayout.Tab) {}
        })
    }

    private fun setupActions() {
        binding.btnMemberLogin.setOnClickListener {
            // Phase 1b: OIDC-Login mit AppAuth. Vorlaeufig oeffnen wir die Mitglieder-Webseite,
            // damit Tester den Flow im Browser absolvieren koennen.
            val url = "https://fwv-raura.ch/mein.html"
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            Toast.makeText(this, "OIDC-Login folgt in der naechsten Version", Toast.LENGTH_LONG).show()
        }

        binding.btnOrganizerLogin.setOnClickListener {
            val email = binding.orgEmailInput.text?.toString()?.trim().orEmpty()
            val password = binding.orgPasswordInput.text?.toString().orEmpty()
            if (email.isEmpty() || password.isEmpty()) {
                showError(getString(R.string.login_error_empty))
                return@setOnClickListener
            }
            doOrganizerLogin(email, password)
        }

        binding.btnQrLogin.setOnClickListener {
            startActivity(Intent(this, QrScannerActivity::class.java))
        }
    }

    private fun doOrganizerLogin(email: String, password: String) {
        binding.loginProgress.visibility = View.VISIBLE
        binding.errorText.visibility = View.GONE
        binding.btnOrganizerLogin.isEnabled = false
        lifecycleScope.launch {
            try {
                val response = ApiModule.authApi.organizerLogin(OrganizerLoginRequest(email, password))
                if (response.isSuccessful) {
                    val body = response.body()
                    if (body == null) {
                        showError("Leere Antwort vom Server")
                        return@launch
                    }
                    val tm = MembersApp.instance.tokenManager
                    tm.token = body.token
                    tm.accountType = "organizer"
                    tm.userEmail = email
                    tm.eventId = body.event_id
                    navigateToMain()
                } else {
                    val msg = when (response.code()) {
                        401 -> "Ungültige Anmeldedaten"
                        else -> "Anmeldung fehlgeschlagen (${response.code()})"
                    }
                    showError(msg)
                }
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            } finally {
                binding.loginProgress.visibility = View.GONE
                binding.btnOrganizerLogin.isEnabled = true
            }
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
