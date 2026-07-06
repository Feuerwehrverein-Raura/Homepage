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
 * Steuert die Push-Benachrichtigungen dieser App — vier Toggle-Switches, je
 * einer pro Typ (shift_reminder, event_update, newsletter, general). Default:
 * alle an. E-Mail-/Post-Zustellung wird separat vom Vorstand verwaltet und ist
 * hier bewusst nicht abgebildet.
 *
 * Gespeichert wird automatisch bei jeder Aenderung eines Switches: alle vier
 * Praeferenzen werden per PUT geschickt (Backend-Upsert ist idempotent).
 *
 * Der Abschnitt "Oeffentlicher Newsletter" darunter ist ein separater
 * Verteiler (auch fuer nicht-Mitglieder) und hat mit den Push-Toggles nichts
 * zu tun.
 */
class NotificationsActivity : AppCompatActivity() {

    private lateinit var binding: ActivityNotificationsBinding

    /** Reihenfolge + Labels der Notification-Typen. */
    private val TYPES = listOf(
        Triple("shift_reminder", "Schicht-Erinnerungen", "Erinnerung, wenn du für eine Schicht eingeteilt bist"),
        Triple("event_update", "Anlass-Änderungen", "Änderungen bei Anlässen (Datum, Ort, Absage)"),
        Triple("newsletter", "Newsletter", "Vereins-Newsletter und Rundmails"),
        Triple("general", "Allgemeine Mitteilungen", "Sonstige Informationen vom Vorstand")
    )

    private val itemBindings = mutableMapOf<String, ItemNotificationPrefBinding>()

    /** Unterdrueckt Auto-Save waehrend die Switches programmatisch gesetzt werden (load). */
    private var suppressSave = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        @Suppress("DEPRECATION")
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, true)
        binding = ActivityNotificationsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.toolbar.setNavigationOnClickListener { finish() }

        // Profil-E-Mail vorausfuellen, damit der haeufigste Use-Case (eigene
        // Mail-Adresse vom Newsletter abmelden) ein Tap weniger ist.
        ch.fwvraura.members.MembersApp.instance.tokenManager.userEmail?.let {
            binding.inputNewsletterEmail.setText(it)
        }
        binding.btnNewsletterSubscribe.setOnClickListener { newsletterAction(subscribe = true) }
        binding.btnNewsletterUnsubscribe.setOnClickListener { newsletterAction(subscribe = false) }

        // Vier Karten inflaten — jeder Notification-Typ eine. Default: an.
        for ((type, title, subtitle) in TYPES) {
            val item = ItemNotificationPrefBinding.inflate(layoutInflater, binding.prefsList, false)
            item.prefTitle.text = title
            item.prefSubtitle.text = subtitle
            item.prefSwitch.isChecked = true
            // Auto-Save bei jeder Aenderung — spart den expliziten Speichern-Button.
            item.prefSwitch.setOnCheckedChangeListener { _, _ ->
                if (!suppressSave) save()
            }
            binding.prefsList.addView(item.root)
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
                    // Programmatisches Setzen darf kein Auto-Save ausloesen.
                    suppressSave = true
                    for ((type, _, _) in TYPES) {
                        val item = itemBindings[type] ?: continue
                        // Nicht zurueckgelieferte Typen gelten als aktiviert.
                        item.prefSwitch.isChecked = prefs[type]?.enabled ?: true
                    }
                    suppressSave = false
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

    /** An- oder abmelden vom oeffentlichen Newsletter. */
    private fun newsletterAction(subscribe: Boolean) {
        val email = binding.inputNewsletterEmail.text?.toString()?.trim().orEmpty()
        if (email.isBlank() || !email.contains("@")) {
            binding.inputNewsletterEmail.error = "Ungültige E-Mail-Adresse"
            return
        }
        val req = ch.fwvraura.members.data.model.NewsletterEmailRequest(email)
        binding.btnNewsletterSubscribe.isEnabled = false
        binding.btnNewsletterUnsubscribe.isEnabled = false
        lifecycleScope.launch {
            try {
                val resp = if (subscribe) ApiModule.newsletterApi.subscribe(req)
                else ApiModule.newsletterApi.unsubscribe(req)
                val msg = resp.body()?.message ?: if (resp.isSuccessful) "OK" else "Fehler ${resp.code()}"
                Snackbar.make(binding.root, msg, Snackbar.LENGTH_LONG).show()
            } catch (e: Exception) {
                Snackbar.make(binding.root, "Netzwerkfehler: ${e.message}", Snackbar.LENGTH_LONG).show()
            } finally {
                binding.btnNewsletterSubscribe.isEnabled = true
                binding.btnNewsletterUnsubscribe.isEnabled = true
            }
        }
    }

    /**
     * Alle vier Push-Praeferenzen speichern. Wird bei jeder Toggle-Aenderung
     * aufgerufen; es werden immer alle vier Typen geschickt (nur Typ + enabled,
     * der Upsert im Backend ist idempotent).
     */
    private fun save() {
        val prefs = TYPES.map { (type, _, _) ->
            NotificationPreference(
                notificationType = type,
                enabled = itemBindings[type]!!.prefSwitch.isChecked
            )
        }

        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val resp = ApiModule.membersApi.updateNotifications(NotificationsUpdateRequest(prefs))
                if (resp.isSuccessful) {
                    Snackbar.make(binding.root, "Gespeichert", Snackbar.LENGTH_SHORT).show()
                } else {
                    Snackbar.make(binding.root, "Speichern fehlgeschlagen (${resp.code()})", Snackbar.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Snackbar.make(binding.root, "Netzwerkfehler: ${e.message}", Snackbar.LENGTH_LONG).show()
            } finally {
                binding.progress.visibility = View.GONE
            }
        }
    }
}
