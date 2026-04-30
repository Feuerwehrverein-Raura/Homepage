package ch.fwvraura.members.ui.notifications

import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.NotificationPreference
import ch.fwvraura.members.data.model.NotificationsUpdateRequest
import ch.fwvraura.members.databinding.ActivityNotificationsBinding
import ch.fwvraura.members.databinding.ItemNotificationPrefBinding
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.launch

/**
 * Benachrichtigungs-Einstellungen fuer das Mitglied.
 *
 * Zeigt vier Toggle-Switches mit optionaler alternativer E-Mail-Adresse pro
 * Typ (shift_reminder, event_update, newsletter, general). Defaults: alle
 * an, alt-Email leer (= Profil-E-Mail wird verwendet).
 *
 * Beim Speichern werden alle vier Praeferenzen via PUT geschickt — der
 * Backend-Upsert ist idempotent.
 */
class NotificationsActivity : AppCompatActivity() {

    private lateinit var binding: ActivityNotificationsBinding

    /** Reihenfolge + Labels der Notification-Typen. */
    private val TYPES = listOf(
        Triple("shift_reminder", "Schicht-Erinnerungen", "Erinnerung wenn du fuer eine Schicht eingeteilt bist"),
        Triple("event_update", "Event-Updates", "Aenderungen bei Anlaessen (Datum, Ort, Absage)"),
        Triple("newsletter", "Newsletter", "Allgemeine Vereins-Mitteilungen"),
        Triple("general", "Allgemeine Benachrichtigungen", "Sonstige Informationen vom Vorstand")
    )

    private val itemBindings = mutableMapOf<String, ItemNotificationPrefBinding>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        @Suppress("DEPRECATION")
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, true)
        binding = ActivityNotificationsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.toolbar.setNavigationOnClickListener { finish() }
        binding.btnSave.setOnClickListener { save() }

        // Vier Karten in den Container inflaten — jeder Notification-Typ eine.
        for ((type, title, subtitle) in TYPES) {
            val item = ItemNotificationPrefBinding.inflate(layoutInflater, binding.prefsContainer, false)
            item.prefTitle.text = title
            item.prefSubtitle.text = subtitle
            item.prefSwitch.isChecked = true  // Default: an
            // Die Karten werden vor dem Save-Button eingefuegt (Index = Anzahl bisheriger Children - 1)
            binding.prefsContainer.addView(item.root, binding.prefsContainer.childCount - 1)
            itemBindings[type] = item
        }

        load()
    }

    private fun load() {
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val resp = ApiModule.membersApi.getNotifications()
                if (resp.isSuccessful) {
                    val prefs = resp.body().orEmpty().associateBy { it.notificationType }
                    for ((type, _, _) in TYPES) {
                        val item = itemBindings[type] ?: continue
                        val pref = prefs[type]
                        item.prefSwitch.isChecked = pref?.enabled ?: true
                        item.prefAltEmail.setText(pref?.alternativeEmail.orEmpty())
                    }
                } else {
                    Snackbar.make(binding.root, "Fehler ${resp.code()}", Snackbar.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Snackbar.make(binding.root, "Netzwerkfehler: ${e.message}", Snackbar.LENGTH_LONG).show()
            } finally {
                binding.progress.visibility = View.GONE
            }
        }
    }

    private fun save() {
        val prefs = TYPES.map { (type, _, _) ->
            val item = itemBindings[type]!!
            NotificationPreference(
                notificationType = type,
                enabled = item.prefSwitch.isChecked,
                alternativeEmail = item.prefAltEmail.text?.toString()?.trim()?.ifBlank { null }
            )
        }

        binding.progress.visibility = View.VISIBLE
        binding.btnSave.isEnabled = false
        lifecycleScope.launch {
            try {
                val resp = ApiModule.membersApi.updateNotifications(NotificationsUpdateRequest(prefs))
                if (resp.isSuccessful) {
                    Snackbar.make(binding.root, "Einstellungen gespeichert.", Snackbar.LENGTH_SHORT).show()
                    binding.root.postDelayed({ finish() }, 700)
                } else {
                    Snackbar.make(binding.root, "Fehler ${resp.code()}", Snackbar.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Snackbar.make(binding.root, "Netzwerkfehler: ${e.message}", Snackbar.LENGTH_LONG).show()
            } finally {
                binding.progress.visibility = View.GONE
                binding.btnSave.isEnabled = true
            }
        }
    }
}
