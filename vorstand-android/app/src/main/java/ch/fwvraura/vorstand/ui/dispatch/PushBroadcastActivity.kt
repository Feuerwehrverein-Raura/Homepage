package ch.fwvraura.vorstand.ui.dispatch

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.databinding.ActivityPushBroadcastBinding
import kotlinx.coroutines.launch

/**
 * PushBroadcastActivity — "Mitglieder per App benachrichtigen".
 *
 * Der Vorstand verfasst einen Titel und eine mehrzeilige Nachricht und sendet
 * diese als Push-Benachrichtigung an alle Mitglieder mit installierter App und
 * aktivierten Benachrichtigungen. Der Versand laeuft ueber POST push/broadcast
 * (FCM, Kanal "general"); die Vorstand-Authentifizierung erledigt der
 * AuthInterceptor automatisch.
 *
 * Hinweis: Erreicht ausschliesslich App-Nutzer. E-Mail- und Post-Versand
 * laufen ueber die separaten Versand-Funktionen.
 */
class PushBroadcastActivity : AppCompatActivity() {

    /** View-Binding fuer activity_push_broadcast.xml. */
    private lateinit var binding: ActivityPushBroadcastBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPushBroadcastBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Zurueck-Pfeil in der Toolbar schliesst den Screen
        binding.toolbar.setNavigationOnClickListener { finish() }

        binding.sendButton.setOnClickListener { send() }
    }

    /**
     * Validiert Titel und Nachricht (beide Pflichtfelder) und loest den
     * Push-Broadcast aus. Bei Erfolg: Toast + Schliessen, sonst Fehler-Toast.
     */
    private fun send() {
        val title = binding.titleInput.text?.toString()?.trim().orEmpty()
        val message = binding.messageInput.text?.toString()?.trim().orEmpty()

        if (title.isEmpty()) {
            binding.titleLayout.error = "Bitte einen Titel eingeben"
            return
        }
        binding.titleLayout.error = null

        if (message.isEmpty()) {
            binding.messageLayout.error = "Bitte eine Nachricht eingeben"
            return
        }
        binding.messageLayout.error = null

        // Doppelten Versand waehrend der laufenden Anfrage verhindern
        binding.sendButton.isEnabled = false
        lifecycleScope.launch {
            try {
                val response = ApiModule.dispatchApi.broadcastPush(
                    mapOf("title" to title, "body" to message)
                )
                val result = response.body()
                if (response.isSuccessful && result?.success == true) {
                    // Optional die Anzahl erreichter Geraete anhaengen
                    val suffix = result.sent?.let { " ($it Geräte)" } ?: ""
                    Toast.makeText(
                        this@PushBroadcastActivity,
                        "Push gesendet$suffix",
                        Toast.LENGTH_LONG
                    ).show()
                    finish()
                } else {
                    Toast.makeText(
                        this@PushBroadcastActivity,
                        "Versand fehlgeschlagen (${response.code()})",
                        Toast.LENGTH_LONG
                    ).show()
                    binding.sendButton.isEnabled = true
                }
            } catch (e: Exception) {
                Toast.makeText(
                    this@PushBroadcastActivity,
                    "Netzwerkfehler: ${e.message}",
                    Toast.LENGTH_LONG
                ).show()
                binding.sendButton.isEnabled = true
            }
        }
    }
}
