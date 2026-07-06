package ch.fwvraura.members.ui.events

import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.databinding.ActivityProposeEventBinding
import com.google.android.material.datepicker.MaterialDatePicker
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.timepicker.MaterialTimePicker
import com.google.android.material.timepicker.TimeFormat
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * ProposeEventActivity — Bildschirm, mit dem ein eingeloggtes Mitglied ein Event
 * *vorschlagen* kann. Es wird bewusst kein veroeffentlichtes Event erzeugt: der
 * POST an `events/propose` legt einen Vorschlag (status='proposed') an, den der
 * Vorstand an anderer Stelle prueft und freigibt.
 *
 * Aufbau analog zu OrganizerEditEventActivity (scrollbares Formular, Datum/Zeit
 * ueber Material-Picker), aber deutlich schlanker: kein Status, keine Schichten,
 * kein PDF. Organizer-Felder werden nicht gesendet — das Backend setzt den
 * Vorschlagenden automatisch als Organisator.
 */
class ProposeEventActivity : AppCompatActivity() {

    private lateinit var binding: ActivityProposeEventBinding

    /** Verfuegbare Kategorien (muessen exakt mit Web/Vorstand uebereinstimmen). */
    private val categoryOptions = listOf(
        "Dorffest", "GV", "Aufbau", "Abbau", "Ausflug", "Ausflug mit Anmeldung", "Sonstiges"
    )

    // ── Datum/Zeit-Zustand (ISO-Strings "yyyy-MM-dd'T'HH:mm") ─────────────────

    private var startIso: String? = null
    private var endIso: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        @Suppress("DEPRECATION")
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, true)
        binding = ActivityProposeEventBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.toolbar.setNavigationOnClickListener { finish() }

        binding.inputCategory.setAdapter(
            ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, categoryOptions)
        )

        binding.inputStartDate.setOnClickListener {
            showDateTimePicker("Startdatum", startIso) { iso ->
                startIso = iso
                binding.inputStartDate.setText(fmtDateTime(iso))
            }
        }
        binding.inputEndDate.setOnClickListener {
            showDateTimePicker("Enddatum", endIso) { iso ->
                endIso = iso
                binding.inputEndDate.setText(fmtDateTime(iso))
            }
        }

        binding.btnPropose.setOnClickListener { submit() }
    }

    // ── Datum/Zeit-Picker ─────────────────────────────────────────────────────

    /**
     * Zeigt nacheinander Datums- und Zeit-Picker und liefert das kombinierte
     * Ergebnis als ISO-String ("yyyy-MM-dd'T'HH:mm"). Ein bereits gewaehlter Wert
     * wird vorbelegt.
     */
    private fun showDateTimePicker(title: String, currentIso: String?, onPicked: (String) -> Unit) {
        val preset = parseForPickers(currentIso)

        val datePicker = MaterialDatePicker.Builder.datePicker()
            .setTitleText(title)
            .setSelection(preset?.first ?: MaterialDatePicker.todayInUtcMilliseconds())
            .build()

        datePicker.addOnPositiveButtonClickListener { dateMillis ->
            val timePicker = MaterialTimePicker.Builder()
                .setTimeFormat(TimeFormat.CLOCK_24H)
                .setHour(preset?.second ?: 0)
                .setMinute(preset?.third ?: 0)
                .setTitleText(title)
                .build()
            timePicker.addOnPositiveButtonClickListener {
                onPicked(toIsoDateTime(dateMillis, timePicker.hour, timePicker.minute))
            }
            timePicker.show(supportFragmentManager, "time_picker_$title")
        }

        datePicker.show(supportFragmentManager, "date_picker_$title")
    }

    // ── Absenden ──────────────────────────────────────────────────────────────

    /**
     * Validiert Pflichtfelder (Titel + Startdatum), baut den Body (leere Optionalen
     * weglassen) und sendet den Vorschlag. Bei Erfolg: Hinweis-Toast + finish().
     */
    private fun submit() {
        val title = binding.inputTitle.text?.toString()?.trim().orEmpty()
        if (title.isBlank()) {
            binding.inputTitle.error = "Pflichtfeld"
            Snackbar.make(binding.root, "Titel ist ein Pflichtfeld", Snackbar.LENGTH_SHORT).show()
            return
        }
        val start = startIso
        if (start.isNullOrBlank()) {
            Snackbar.make(binding.root, "Startdatum ist ein Pflichtfeld", Snackbar.LENGTH_SHORT).show()
            return
        }

        // Nur nicht-leere Felder aufnehmen — Optionalen weglassen statt als null senden.
        val body = mutableMapOf<String, Any?>(
            "title" to title,
            "start_date" to start
        )
        endIso?.takeIf { it.isNotBlank() }?.let { body["end_date"] = it }
        binding.inputLocation.text?.toString()?.trim()?.takeIf { it.isNotBlank() }
            ?.let { body["location"] = it }
        binding.inputCategory.text?.toString()?.trim()?.takeIf { it.isNotBlank() }
            ?.let { body["category"] = it }
        binding.inputCost.text?.toString()?.trim()?.takeIf { it.isNotBlank() }
            ?.let { body["cost"] = it }
        binding.inputDescription.text?.toString()?.trim()?.takeIf { it.isNotBlank() }
            ?.let { body["description"] = it }

        binding.btnPropose.isEnabled = false
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.proposeEvent(body)
                if (response.isSuccessful) {
                    Toast.makeText(
                        this@ProposeEventActivity,
                        "Vorschlag eingereicht — der Vorstand prüft ihn",
                        Toast.LENGTH_LONG
                    ).show()
                    finish()
                } else {
                    Toast.makeText(
                        this@ProposeEventActivity,
                        "Fehler ${response.code()}",
                        Toast.LENGTH_LONG
                    ).show()
                    binding.btnPropose.isEnabled = true
                }
            } catch (e: Exception) {
                Toast.makeText(
                    this@ProposeEventActivity,
                    "Netzwerkfehler: ${e.message}",
                    Toast.LENGTH_LONG
                ).show()
                binding.btnPropose.isEnabled = true
            } finally {
                binding.progress.visibility = View.GONE
            }
        }
    }

    // ── Datum/Zeit-Hilfsfunktionen (lokal, da members-DateUtils diese nicht hat) ──

    /**
     * Zerlegt einen ISO-Datum/-DateTime-String in (Datum-Millis-UTC, Stunde, Minute).
     * Akzeptiert "yyyy-MM-dd", "yyyy-MM-ddTHH:mm[:ss][.SSS][Z]" und Leerzeichen statt 'T'.
     */
    private fun parseForPickers(iso: String?): Triple<Long, Int, Int>? {
        if (iso.isNullOrBlank()) return null
        return try {
            val s = iso.trim().replace(' ', 'T')
            val date = LocalDate.parse(s.substring(0, 10))
            val millis = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
            val hasTime = s.length >= 16 && s.contains('T')
            if (hasTime) {
                val t = LocalTime.parse(s.substring(11, 16))
                Triple(millis, t.hour, t.minute)
            } else {
                Triple(millis, 0, 0)
            }
        } catch (e: Exception) {
            null
        }
    }

    /** Baut aus UTC-Datum-Millis + Uhrzeit einen ISO-String "yyyy-MM-dd'T'HH:mm". */
    private fun toIsoDateTime(dateMillisUtc: Long, hour: Int, minute: Int): String {
        val date = Instant.ofEpochMilli(dateMillisUtc).atZone(ZoneOffset.UTC).toLocalDate()
        return date.atTime(hour, minute).format(ISO_LOCAL_MINUTE)
    }

    /** ISO -> "dd.MM.yyyy HH:mm" (leer bei ungueltig/null). */
    private fun fmtDateTime(iso: String?): String {
        val t = parseForPickers(iso) ?: return ""
        val d = Instant.ofEpochMilli(t.first).atZone(ZoneOffset.UTC).toLocalDate()
        return String.format(
            java.util.Locale.US, "%02d.%02d.%04d %02d:%02d",
            d.dayOfMonth, d.monthValue, d.year, t.second, t.third
        )
    }

    companion object {
        private val ISO_LOCAL_MINUTE: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm")
    }
}
