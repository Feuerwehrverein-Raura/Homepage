package ch.fwvraura.members.ui.login

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.lifecycle.lifecycleScope
import ch.fwvraura.members.R
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.api.authErrorMessage
import ch.fwvraura.members.data.model.RequestResetRequest
import ch.fwvraura.members.data.model.ResetRequest
import ch.fwvraura.members.databinding.ActivityPasswordResetBinding
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.launch

/**
 * Zweistufiger Passwort-Reset fuer Mitglieder (ohne Browser):
 *
 *  Schritt 1: E-Mail eingeben -> "Code anfordern" (POST auth/member/request-reset).
 *             Antwort ist immer generisch (kein Konto-Leak).
 *  Schritt 2: Code + neues Passwort (+ Wiederholung) -> "Passwort setzen"
 *             (POST auth/member/reset). Bei Erfolg liefert das Backend ein
 *             Member-JWT zurueck; wir geben Token/E-Mail/Name als Result an die
 *             LoginActivity zurueck, die daraus die Session anlegt und die
 *             uebliche Post-Login-Routine (FCM + Kontakt-Sync) faehrt.
 */
class PasswordResetActivity : AppCompatActivity() {

    private lateinit var binding: ActivityPasswordResetBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        @Suppress("DEPRECATION")
        WindowCompat.setDecorFitsSystemWindows(window, true)
        binding = ActivityPasswordResetBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.toolbar.setNavigationOnClickListener { finish() }

        intent.getStringExtra(EXTRA_PREFILL_EMAIL)?.let { binding.inputResetEmail.setText(it) }

        binding.btnRequestCode.setOnClickListener { requestCode() }
        binding.btnSetPassword.setOnClickListener { submitReset() }
    }

    /** Schritt 1: Reset-Code an die eingegebene E-Mail anfordern. */
    private fun requestCode() {
        val email = binding.inputResetEmail.text?.toString()?.trim().orEmpty()
        if (email.isBlank()) {
            binding.inputResetEmail.error = "Bitte E-Mail eingeben"
            return
        }
        binding.inputResetEmail.error = null
        setLoading(true)
        lifecycleScope.launch {
            try {
                val resp = ApiModule.authApi.requestPasswordReset(RequestResetRequest(email))
                if (resp.isSuccessful) {
                    val msg = resp.body()?.message?.takeIf { it.isNotBlank() }
                        ?: getString(R.string.reset_generic_sent)
                    Snackbar.make(binding.root, msg, Snackbar.LENGTH_LONG).show()
                    revealStep2()
                } else {
                    Snackbar.make(binding.root, resp.authErrorMessage(), Snackbar.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Snackbar.make(binding.root, "Netzwerkfehler: ${e.message}", Snackbar.LENGTH_LONG).show()
            } finally {
                setLoading(false)
            }
        }
    }

    private fun revealStep2() {
        if (binding.paneStep2.visibility != View.VISIBLE) {
            binding.paneStep2.visibility = View.VISIBLE
            // Nach dem ersten Versand kann der User bei Bedarf einen neuen Code holen.
            binding.btnRequestCode.setText(R.string.reset_resend_code)
        }
        binding.inputResetCode.requestFocus()
    }

    /** Schritt 2: Code + neues Passwort ans Backend; bei Erfolg direkt einloggen. */
    private fun submitReset() {
        val email = binding.inputResetEmail.text?.toString()?.trim().orEmpty()
        val code = binding.inputResetCode.text?.toString()?.trim().orEmpty()
        val pw = binding.inputResetPassword.text?.toString().orEmpty()
        val pw2 = binding.inputResetPasswordConfirm.text?.toString().orEmpty()

        if (email.isBlank()) {
            binding.inputResetEmail.error = "Bitte E-Mail eingeben"
            return
        }
        if (code.isBlank()) {
            binding.inputResetCode.error = "Bitte Code eingeben"
            return
        }
        if (pw.length < 8) {
            binding.inputResetPassword.error = "Mindestens 8 Zeichen"
            return
        }
        if (pw != pw2) {
            binding.inputResetPasswordConfirm.error = "Passwörter stimmen nicht überein"
            return
        }
        binding.inputResetCode.error = null
        binding.inputResetPassword.error = null
        binding.inputResetPasswordConfirm.error = null

        setLoading(true)
        lifecycleScope.launch {
            try {
                val resp = ApiModule.authApi.resetPassword(
                    ResetRequest(email = email, code = code, new_password = pw)
                )
                val body = resp.body()
                if (resp.isSuccessful && !body?.token.isNullOrBlank()) {
                    val data = Intent()
                        .putExtra(EXTRA_TOKEN, body!!.token)
                        .putExtra(EXTRA_EMAIL, body.user?.email ?: email)
                        .putExtra(EXTRA_NAME, body.user?.name)
                    setResult(Activity.RESULT_OK, data)
                    finish()
                } else {
                    Snackbar.make(binding.root, resp.authErrorMessage(), Snackbar.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Snackbar.make(binding.root, "Netzwerkfehler: ${e.message}", Snackbar.LENGTH_LONG).show()
            } finally {
                setLoading(false)
            }
        }
    }

    private fun setLoading(loading: Boolean) {
        binding.resetProgress.visibility = if (loading) View.VISIBLE else View.GONE
        binding.btnRequestCode.isEnabled = !loading
        binding.btnSetPassword.isEnabled = !loading
    }

    companion object {
        const val EXTRA_TOKEN = "token"
        const val EXTRA_EMAIL = "email"
        const val EXTRA_NAME = "name"

        /** Optional vom Login-Screen vorbefuellte E-Mail-Adresse. */
        const val EXTRA_PREFILL_EMAIL = "prefill_email"
    }
}
