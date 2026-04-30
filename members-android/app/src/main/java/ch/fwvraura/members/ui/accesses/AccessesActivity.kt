package ch.fwvraura.members.ui.accesses

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.AccessesResponse
import ch.fwvraura.members.data.model.FunctionEmail
import ch.fwvraura.members.data.model.NextcloudFolder
import ch.fwvraura.members.data.model.ServiceAccount
import ch.fwvraura.members.data.model.SystemAccess
import ch.fwvraura.members.databinding.ActivityAccessesBinding
import ch.fwvraura.members.databinding.ItemAccessCredentialBinding
import ch.fwvraura.members.databinding.ItemAccessLinkBinding
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.launch

/**
 * "Zugaenge"-Seite — zeigt alle Web-Zugaenge, Cloud-Ordner, Funktions-E-Mails
 * und geteilten Konten des eingeloggten Mitglieds in einer langen Scroll-Seite.
 *
 * Backend: GET /members/me/accesses (api-members) liefert alles in einem
 * Response — wir filtern lokal die leeren Sektionen aus.
 */
class AccessesActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAccessesBinding
    private val nextcloudBase = "https://nextcloud.fwv-raura.ch"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        @Suppress("DEPRECATION")
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, true)
        binding = ActivityAccessesBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.toolbar.setNavigationOnClickListener { finish() }
        binding.swipeRefresh.setOnRefreshListener { load() }
        load()
    }

    private fun load() {
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val resp = ApiModule.membersApi.getAccesses()
                if (resp.isSuccessful) {
                    val data = resp.body() ?: AccessesResponse()
                    render(data)
                } else {
                    Snackbar.make(binding.root, "Fehler ${resp.code()}", Snackbar.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Snackbar.make(binding.root, "Netzwerkfehler: ${e.message}", Snackbar.LENGTH_LONG).show()
            } finally {
                binding.progress.visibility = View.GONE
                binding.swipeRefresh.isRefreshing = false
            }
        }
    }

    private fun render(data: AccessesResponse) {
        renderSystem(data.systemAccesses)
        renderNextcloud(data.nextcloudFolders)
        renderFunctionEmails(data.functionEmails)
        renderServiceAccounts(data.serviceAccounts)
    }

    private fun renderSystem(items: List<SystemAccess>) {
        binding.systemList.removeAllViews()
        if (items.isEmpty()) {
            binding.systemHeader.visibility = View.GONE
            return
        }
        binding.systemHeader.visibility = View.VISIBLE
        for (s in items.filter { it.enabled }) {
            val card = ItemAccessLinkBinding.inflate(layoutInflater, binding.systemList, false)
            card.linkTitle.text = s.system
            card.linkSubtitle.text = listOfNotNull(s.access, s.url).joinToString(" · ")
            card.root.setOnClickListener { s.url?.let { openUrl(it) } }
            binding.systemList.addView(card.root)
        }
    }

    private fun renderNextcloud(folders: List<NextcloudFolder>) {
        binding.nextcloudList.removeAllViews()
        if (folders.isEmpty()) {
            binding.nextcloudHeader.visibility = View.GONE
            return
        }
        binding.nextcloudHeader.visibility = View.VISIBLE
        for (f in folders) {
            val mp = f.mountPoint?.takeIf { it.isNotBlank() } ?: continue
            val card = ItemAccessLinkBinding.inflate(layoutInflater, binding.nextcloudList, false)
            card.linkTitle.text = mp
            card.linkSubtitle.text = "Nextcloud-Gruppenordner"
            card.root.setOnClickListener {
                openUrl("$nextcloudBase/apps/files/?dir=/${Uri.encode(mp)}")
            }
            binding.nextcloudList.addView(card.root)
        }
    }

    private fun renderFunctionEmails(items: List<FunctionEmail>) {
        binding.functionEmailsList.removeAllViews()
        if (items.isEmpty()) {
            binding.functionEmailsHeader.visibility = View.GONE
            return
        }
        binding.functionEmailsHeader.visibility = View.VISIBLE
        for (f in items) {
            val card = ItemAccessCredentialBinding.inflate(layoutInflater, binding.functionEmailsList, false)
            card.credTitle.text = f.email
            card.credSubtitle.text = f.function
            card.credUser.text = f.email
            card.credPassword.text = "•".repeat(f.password?.length?.coerceAtMost(12) ?: 8)
            card.credExtra.text = buildString {
                f.server?.let { append("Server: $it") }
                f.imapPort?.let { append("  IMAP: $it") }
                f.smtpPort?.let { append("  SMTP: $it") }
            }
            wireCredentialButtons(
                card,
                username = f.email,
                password = f.password,
                webUrl = f.webmail,
                webButtonLabel = "Webmail öffnen",
                onChangePassword = { showChangePasswordDialog(f.email) }
            )
            binding.functionEmailsList.addView(card.root)
        }
    }

    /** Dialog mit zwei Passwort-Feldern. Speichern -> PUT /members/me/function-email-password. */
    private fun showChangePasswordDialog(email: String) {
        val dialogBinding = ch.fwvraura.members.databinding.DialogChangePasswordBinding
            .inflate(layoutInflater)
        dialogBinding.dialogPwHint.text = "Neues Passwort für $email setzen. Mailcow + lokal verschlüsselt gespeichert."

        val dlg = androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Passwort ändern")
            .setView(dialogBinding.root)
            .setPositiveButton("Speichern", null)
            .setNegativeButton("Abbrechen", null)
            .create()
        dlg.setOnShowListener {
            dlg.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val pw = dialogBinding.inputPassword.text?.toString().orEmpty()
                val pw2 = dialogBinding.inputPasswordConfirm.text?.toString().orEmpty()
                if (pw.length < 8) {
                    dialogBinding.inputPassword.error = "Mindestens 8 Zeichen"
                    return@setOnClickListener
                }
                if (pw != pw2) {
                    dialogBinding.inputPasswordConfirm.error = "Stimmt nicht überein"
                    return@setOnClickListener
                }
                dlg.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).isEnabled = false
                lifecycleScope.launch {
                    try {
                        val resp = ApiModule.membersApi.changeFunctionEmailPassword(
                            ch.fwvraura.members.data.model.ChangeFunctionEmailPasswordRequest(
                                email = email, password = pw
                            )
                        )
                        if (resp.isSuccessful) {
                            Snackbar.make(binding.root, "Passwort für $email aktualisiert.", Snackbar.LENGTH_LONG).show()
                            dlg.dismiss()
                            load()
                        } else {
                            val err = resp.errorBody()?.string() ?: "Fehler ${resp.code()}"
                            Snackbar.make(binding.root, err, Snackbar.LENGTH_LONG).show()
                            dlg.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).isEnabled = true
                        }
                    } catch (e: Exception) {
                        Snackbar.make(binding.root, "Netzwerkfehler: ${e.message}", Snackbar.LENGTH_LONG).show()
                        dlg.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).isEnabled = true
                    }
                }
            }
        }
        dlg.show()
    }

    private fun renderServiceAccounts(items: List<ServiceAccount>) {
        binding.serviceAccountsList.removeAllViews()
        if (items.isEmpty()) {
            binding.serviceAccountsHeader.visibility = View.GONE
            return
        }
        binding.serviceAccountsHeader.visibility = View.VISIBLE
        for (sa in items) {
            val card = ItemAccessCredentialBinding.inflate(layoutInflater, binding.serviceAccountsList, false)
            card.credTitle.text = sa.displayName ?: sa.accountName ?: sa.username
            card.credSubtitle.text = sa.description.orEmpty()
            card.credSubtitle.visibility = if (sa.description.isNullOrBlank()) View.GONE else View.VISIBLE
            // Username-Zeile + Copy-Button verstecken wenn kein User noetig (z.B. Kassensystem)
            if (sa.username.isBlank()) {
                card.credUser.visibility = View.GONE
                card.btnCopyUser.visibility = View.GONE
            } else {
                card.credUser.text = sa.username
            }
            card.credPassword.text = "•".repeat(sa.password?.length?.coerceAtMost(12) ?: 8)
            val rotation = sa.nextRotation?.substring(0, minOf(10, sa.nextRotation.length))
            card.credExtra.text = if (rotation != null) "Nächste Rotation: $rotation" else ""
            card.credExtra.visibility = if (card.credExtra.text.isBlank()) View.GONE else View.VISIBLE
            wireCredentialButtons(card, username = sa.username, password = sa.password, webUrl = null, webButtonLabel = null, onChangePassword = null)
            binding.serviceAccountsList.addView(card.root)
        }
    }

    /** Verkabelt die Copy-/Show-/Web-/Passwort-Buttons in einer Credential-Karte. */
    private fun wireCredentialButtons(
        card: ItemAccessCredentialBinding,
        username: String,
        password: String?,
        webUrl: String?,
        webButtonLabel: String?,
        onChangePassword: (() -> Unit)?
    ) {
        card.btnCopyUser.setOnClickListener { copyToClipboard("Username", username) }
        if (!password.isNullOrBlank()) {
            card.btnTogglePassword.setOnClickListener {
                val showing = card.credPassword.text?.toString() == password
                if (showing) {
                    card.credPassword.text = "•".repeat(password.length.coerceAtMost(12))
                    card.btnTogglePassword.text = "Anzeigen"
                } else {
                    card.credPassword.text = password
                    card.btnTogglePassword.text = "Verstecken"
                }
            }
            card.btnCopyPassword.setOnClickListener { copyToClipboard("Passwort", password, sensitive = true) }
        } else {
            card.btnTogglePassword.visibility = View.GONE
            card.btnCopyPassword.visibility = View.GONE
        }
        if (!webUrl.isNullOrBlank() && !webButtonLabel.isNullOrBlank()) {
            card.btnOpenWeb.visibility = View.VISIBLE
            card.btnOpenWeb.text = webButtonLabel
            card.btnOpenWeb.setOnClickListener { openUrl(webUrl) }
        }
        if (onChangePassword != null) {
            card.btnChangePassword.visibility = View.VISIBLE
            card.btnChangePassword.setOnClickListener { onChangePassword.invoke() }
        }
    }

    private fun copyToClipboard(label: String, text: String, sensitive: Boolean = false) {
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText(label, text)
        cm.setPrimaryClip(clip)
        // Auf Android 13+ zeigt das System ein Toast — wir blenden eigenen nur fuer aelteres Android ein.
        Snackbar.make(binding.root, "$label kopiert.", Snackbar.LENGTH_SHORT).show()
    }

    private fun openUrl(url: String) {
        try {
            val full = if (url.startsWith("http")) url else "https://$url"
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(full)))
        } catch (_: Exception) {
            Snackbar.make(binding.root, "Keine App zum Öffnen gefunden.", Snackbar.LENGTH_LONG).show()
        }
    }
}
