package ch.fwvraura.members.ui.events

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import android.view.ViewGroup
import android.widget.TextView
import ch.fwvraura.members.MembersApp
import ch.fwvraura.members.R
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.Event
import ch.fwvraura.members.data.model.PublicRegistrationRequest
import ch.fwvraura.members.data.model.Shift
import ch.fwvraura.members.databinding.ActivityEventDetailBinding
import ch.fwvraura.members.databinding.DialogRegisterBinding
import ch.fwvraura.members.databinding.DialogRegisterShiftsBinding
import ch.fwvraura.members.databinding.ItemShiftChoiceBinding
import ch.fwvraura.members.util.DateUtils
import ch.fwvraura.members.util.FileOpener
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.checkbox.MaterialCheckBox
import kotlinx.coroutines.launch

class EventDetailActivity : AppCompatActivity() {

    private lateinit var binding: ActivityEventDetailBinding
    private var event: Event? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        @Suppress("DEPRECATION")
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, true)
        binding = ActivityEventDetailBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        binding.toolbar.setNavigationOnClickListener { finish() }

        val eventId = intent.getStringExtra(EXTRA_EVENT_ID)
        if (eventId.isNullOrBlank()) {
            finish()
            return
        }
        loadEvent(eventId)

        binding.btnRegister.setOnClickListener {
            event?.let { e ->
                if (!e.shifts.isNullOrEmpty()) showShiftRegisterDialog(e)
                else showRegisterDialog(e)
            }
        }
        binding.btnAddToCalendar.setOnClickListener {
            event?.let { addToCalendar(it) }
        }
        binding.btnArbeitsplan.setOnClickListener {
            event?.let { showArbeitsplan(it) }
        }
    }

    // ============================================================
    // Arbeitsplan — der Plan wird komplett im Backend aufbereitet
    // (GET /events/:id/arbeitsplan). Die App gruppiert/rechnet nichts,
    // sondern zeichnet nur (ArbeitsplanView): pro Tag eine Ueberschrift,
    // pro Zeitfenster eine Karte mit den Bereichen, die eine Schicht
    // haben — handytauglich, ohne seitliches Scrollen. Die Knoepfe liegen
    // in der festen Knopfleiste des Dialogs und bleiben immer sichtbar.
    // ============================================================

    private fun showArbeitsplan(e: Event) {
        // Platzhalter, der nach dem Laden durch den Plan oder eine Meldung ersetzt wird
        val container = android.widget.FrameLayout(this).apply {
            setPadding(0, dp(16), 0, dp(16))
            addView(
                android.widget.ProgressBar(this@EventDetailActivity),
                android.widget.FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                    android.view.Gravity.CENTER
                )
            )
        }
        // Auf schmalen Handys kurze Knopf-Beschriftung, damit die Knoepfe
        // nebeneinander in die feste Knopfleiste passen
        val schmal = resources.configuration.screenWidthDp < 480
        val builder = AlertDialog.Builder(this)
            .setView(container)
            .setPositiveButton(if (schmal) "PDF" else "PDF herunterladen", null)
            .setNegativeButton("Schließen", null)
        // "Bearbeiten" nur fuer den Organisator (E-Mail-Match wie im Backend) —
        // entspricht dem Link aufs event-dashboard auf der Website.
        val myEmail = MembersApp.instance.tokenManager.userEmail
        val isOrganizer = !myEmail.isNullOrBlank() && myEmail.equals(e.organizerEmail, ignoreCase = true)
        if (isOrganizer) {
            builder.setNeutralButton("Bearbeiten") { _, _ ->
                startActivity(
                    android.content.Intent(this, ch.fwvraura.members.ui.organizer.OrganizerEditEventActivity::class.java)
                        .putExtra(ch.fwvraura.members.ui.organizer.OrganizerEditEventActivity.EXTRA_EVENT_ID, e.id)
                )
            }
        }
        val dialog = builder.show()
        // Listener nachtraeglich setzen, damit der Dialog beim PDF-Download offen bleibt
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener { downloadArbeitsplanPdf(e) }

        lifecycleScope.launch {
            val content: View = try {
                val resp = ApiModule.eventsApi.getArbeitsplan(e.id)
                val plan = resp.body()
                if (resp.isSuccessful && plan != null) {
                    ArbeitsplanView.build(this@EventDetailActivity, plan)
                } else if (resp.code() == 404) arbeitsplanMeldung("Event nicht gefunden.")
                else arbeitsplanMeldung("Arbeitsplan konnte nicht geladen werden (Fehler ${resp.code()}).")
            } catch (ex: Exception) {
                arbeitsplanMeldung("Netzwerkfehler: ${ex.message}")
            }
            if (!dialog.isShowing) return@launch
            container.removeAllViews()
            container.setPadding(0, 0, 0, 0)
            container.addView(content)
        }
    }

    /** Meldung im Arbeitsplan-Dialog anstelle des Plans. */
    private fun arbeitsplanMeldung(text: String) = TextView(this).apply {
        this.text = text
        textSize = 14f
        setTextColor(getColor(R.color.text_primary))
        setPadding(dp(24), dp(16), dp(24), dp(8))
    }

    /** Laedt das Arbeitsplan-PDF (GET /events/:id/pdf/arbeitsplan, oeffentlich) und oeffnet es. */
    private fun downloadArbeitsplanPdf(e: Event) {
        Toast.makeText(this, "PDF wird generiert…", Toast.LENGTH_SHORT).show()
        lifecycleScope.launch {
            try {
                val resp = ApiModule.eventsApi.getArbeitsplanPdf(e.id)
                val body = resp.body()
                if (resp.isSuccessful && body != null) {
                    val ok = FileOpener.openPdf(this@EventDetailActivity, body.bytes(), "Arbeitsplan ${e.title}.pdf")
                    if (!ok) Toast.makeText(this@EventDetailActivity, "Keine PDF-App gefunden", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this@EventDetailActivity, "Fehler ${resp.code()}", Toast.LENGTH_LONG).show()
                }
            } catch (ex: Exception) {
                Toast.makeText(this@EventDetailActivity, "Netzwerkfehler: ${ex.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    /** Oeffnet den Android-Kalender mit vorausgefuelltem Event-Insert. */
    private fun addToCalendar(e: Event) {
        try {
            val intent = android.content.Intent(android.content.Intent.ACTION_INSERT)
                .setData(android.provider.CalendarContract.Events.CONTENT_URI)
                .putExtra(android.provider.CalendarContract.Events.TITLE, e.title)
            e.location?.takeIf { it.isNotBlank() }?.let {
                intent.putExtra(android.provider.CalendarContract.Events.EVENT_LOCATION, it)
            }
            e.description?.takeIf { it.isNotBlank() }?.let {
                intent.putExtra(android.provider.CalendarContract.Events.DESCRIPTION, it)
            }
            // Start- und Endzeit aus ISO-Strings parsen — die offiziellen
            // CalendarContract-Extras werden vom System-Insert akzeptiert.
            parseEventTime(e.startDate)?.let { ms ->
                intent.putExtra(android.provider.CalendarContract.EXTRA_EVENT_BEGIN_TIME, ms.first)
            }
            parseEventTime(e.endDate)?.let { ms ->
                intent.putExtra(android.provider.CalendarContract.EXTRA_EVENT_END_TIME, ms.first)
            }
            startActivity(intent)
        } catch (ex: Exception) {
            android.widget.Toast.makeText(this,
                "Keine Kalender-App gefunden: ${ex.message}",
                android.widget.Toast.LENGTH_LONG).show()
        }
    }

    /** Wandelt ISO-Datums-Strings in Millisekunden um (Pair: ms, hadTime). */
    private fun parseEventTime(iso: String?): Pair<Long, Boolean>? {
        if (iso.isNullOrBlank()) return null
        val s = iso.removeSuffix("Z").substringBefore('+').substringBefore('.')
        val formats = listOf(
            "yyyy-MM-dd'T'HH:mm:ss" to true,
            "yyyy-MM-dd'T'HH:mm" to true,
            "yyyy-MM-dd HH:mm:ss" to true,
            "yyyy-MM-dd" to false
        )
        for ((pattern, hasTime) in formats) {
            try {
                val sdf = java.text.SimpleDateFormat(pattern, java.util.Locale.US)
                sdf.timeZone = java.util.TimeZone.getDefault()
                val d = sdf.parse(s) ?: continue
                return d.time to hasTime
            } catch (_: Exception) { /* nächstes Format probieren */ }
        }
        return null
    }

    private fun renderShifts(shifts: List<Shift>) {
        binding.shiftsHeader.visibility = View.VISIBLE
        binding.shiftsList.visibility = View.VISIBLE
        binding.shiftsList.removeAllViews()
        for (s in shifts) {
            val card = ItemShiftChoiceBinding.inflate(layoutInflater, binding.shiftsList, false)
            card.shiftCheck.visibility = View.GONE
            decorateShiftCard(card, s, includeCapacity = true, includeHelpers = true)
            binding.shiftsList.addView(card.root)
        }
    }

    /** Befuellt eine Schicht-Karte mit allen verfuegbaren Details (genutzt von Detail-Liste + Anmelde-Dialog). */
    private fun decorateShiftCard(
        card: ItemShiftChoiceBinding,
        s: Shift,
        includeCapacity: Boolean,
        includeHelpers: Boolean
    ) {
        card.shiftName.text = listOfNotNull(s.bereich, s.name).joinToString(" – ")

        val parts = mutableListOf<String>()
        if (!s.date.isNullOrBlank()) parts.add(DateUtils.formatDate(s.date))
        val time = listOfNotNull(s.startTime, s.endTime).joinToString(" - ")
        if (time.isNotBlank()) parts.add(time)
        card.shiftDetails.text = parts.joinToString(" · ")

        // Belegungs-Status-Badge: "X / Y belegt" — gruen wenn voll, gelb sonst
        val approved = s.registrations?.approved?.size ?: 0
        val pending = s.registrations?.pending?.size ?: 0
        val needed = s.needed
        if (includeCapacity && needed != null) {
            val full = approved >= needed
            card.shiftCapacity.visibility = View.VISIBLE
            card.shiftCapacity.text = if (pending > 0) "$approved+$pending / $needed" else "$approved / $needed"
            card.shiftCapacity.setTextColor(
                if (full) android.graphics.Color.parseColor("#0F7A2D")
                else android.graphics.Color.parseColor("#A05A00")
            )
        } else if (includeCapacity && needed != null) {
            card.shiftCapacity.visibility = View.GONE
        } else {
            card.shiftCapacity.visibility = View.GONE
        }

        // Beschreibung anzeigen wenn vorhanden
        if (!s.description.isNullOrBlank()) {
            card.shiftDescription.visibility = View.VISIBLE
            card.shiftDescription.text = s.description
        } else {
            card.shiftDescription.visibility = View.GONE
        }

        // Liste der bereits angemeldeten Helfer (max 5 sichtbar, Rest gekuerzt)
        if (includeHelpers && s.registrations != null) {
            val names = mutableListOf<String>()
            s.registrations.approved.mapNotNull { it.name?.takeIf { n -> n.isNotBlank() } }.forEach { names.add(it) }
            s.registrations.pending.mapNotNull { it.name?.takeIf { n -> n.isNotBlank() } }
                .forEach { names.add("$it (wartend)") }
            if (names.isNotEmpty()) {
                card.shiftHelpers.visibility = View.VISIBLE
                val display = if (names.size > 5) names.take(5).joinToString(", ") + " · +${names.size - 5}"
                else names.joinToString(", ")
                card.shiftHelpers.text = "Angemeldet: $display"
            } else {
                card.shiftHelpers.visibility = View.GONE
            }
        } else {
            card.shiftHelpers.visibility = View.GONE
        }
    }

    private fun showShiftRegisterDialog(e: Event) {
        val dialogBinding = DialogRegisterShiftsBinding.inflate(LayoutInflater.from(this))
        val tm = MembersApp.instance.tokenManager
        if (!tm.userName.isNullOrBlank()) dialogBinding.regName.setText(tm.userName)
        if (!tm.userEmail.isNullOrBlank()) dialogBinding.regEmail.setText(tm.userEmail)

        val checkBoxes = mutableMapOf<String, MaterialCheckBox>()
        for (s in e.shifts.orEmpty()) {
            val item = ItemShiftChoiceBinding.inflate(layoutInflater, dialogBinding.shiftsContainer, false)
            decorateShiftCard(item, s, includeCapacity = true, includeHelpers = false)
            checkBoxes[s.id] = item.shiftCheck
            item.root.setOnClickListener { item.shiftCheck.isChecked = !item.shiftCheck.isChecked }
            dialogBinding.shiftsContainer.addView(item.root)
        }

        AlertDialog.Builder(this)
            .setTitle("Schicht-Anmeldung: ${e.title}")
            .setView(dialogBinding.root)
            .setPositiveButton("Anmelden") { _, _ ->
                val name = dialogBinding.regName.text?.toString()?.trim().orEmpty()
                val selected = checkBoxes.filter { it.value.isChecked }.keys.toList()
                if (name.isBlank()) {
                    Snackbar.make(binding.root, "Bitte Namen eingeben", Snackbar.LENGTH_SHORT).show()
                    return@setPositiveButton
                }
                if (selected.isEmpty()) {
                    Snackbar.make(binding.root, "Bitte mindestens eine Schicht wählen", Snackbar.LENGTH_SHORT).show()
                    return@setPositiveButton
                }
                submitShiftRegistration(
                    e, name,
                    dialogBinding.regEmail.text?.toString()?.trim().orEmpty(),
                    dialogBinding.regPhone.text?.toString()?.trim().orEmpty(),
                    dialogBinding.regNotes.text?.toString()?.trim().orEmpty(),
                    selected
                )
            }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    private fun submitShiftRegistration(
        e: Event, name: String, email: String, phone: String, notes: String, shiftIds: List<String>
    ) {
        val req = PublicRegistrationRequest(
            type = "shift",
            eventId = e.id,
            eventTitle = e.title,
            organizerEmail = e.organizerEmail,
            name = name,
            email = email.ifBlank { null },
            phone = phone.ifBlank { null },
            notes = notes.ifBlank { null },
            shiftIds = shiftIds
        )
        lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.publicRegister(req)
                if (response.isSuccessful && response.body()?.success == true) {
                    Snackbar.make(binding.root, "Anmeldung gesendet!", Snackbar.LENGTH_LONG).show()
                } else {
                    val msg = response.body()?.message ?: "Fehler ${response.code()}"
                    Snackbar.make(binding.root, msg, Snackbar.LENGTH_LONG).show()
                }
            } catch (ex: Exception) {
                Snackbar.make(binding.root, "Netzwerkfehler: ${ex.message}", Snackbar.LENGTH_LONG).show()
            }
        }
    }

    private fun loadEvent(id: String) {
        lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.getEvent(id)
                if (response.isSuccessful) {
                    val e = response.body() ?: return@launch
                    event = e
                    bind(e)
                } else {
                    Toast.makeText(this@EventDetailActivity, "Fehler ${response.code()}", Toast.LENGTH_LONG).show()
                    finish()
                }
            } catch (e: Exception) {
                Toast.makeText(this@EventDetailActivity, "Netzwerkfehler: ${e.message}", Toast.LENGTH_LONG).show()
                finish()
            }
        }
    }

    private fun bind(e: Event) {
        binding.toolbar.title = e.title
        binding.eventTitle.text = e.title
        binding.eventSubtitle.text = e.subtitle.orEmpty()
        binding.eventSubtitle.visibility = if (e.subtitle.isNullOrBlank()) View.GONE else View.VISIBLE

        binding.eventWann.text = buildDateText(e)
        binding.eventWo.text = e.location.orEmpty()
        binding.rowWo.visibility = if (e.location.isNullOrBlank()) View.GONE else View.VISIBLE

        val regRequired = e.registrationRequired == true
        binding.eventAnmeldung.text = if (regRequired) "Zwingend" else "Freiwillig"

        if (!e.registrationDeadline.isNullOrBlank()) {
            binding.eventDeadline.text = DateUtils.formatDate(e.registrationDeadline)
            binding.rowDeadline.visibility = View.VISIBLE
        } else binding.rowDeadline.visibility = View.GONE

        if (e.maxParticipants != null) {
            binding.eventMaxPart.text = e.maxParticipants.toString()
            binding.rowMaxPart.visibility = View.VISIBLE
        } else binding.rowMaxPart.visibility = View.GONE

        if (!e.cost.isNullOrBlank()) {
            binding.eventKosten.text = e.cost
            binding.rowKosten.visibility = View.VISIBLE
        } else binding.rowKosten.visibility = View.GONE

        binding.eventDescription.text = e.description.orEmpty()
        binding.eventDescription.visibility = if (e.description.isNullOrBlank()) View.GONE else View.VISIBLE

        if (!e.shifts.isNullOrEmpty()) renderShifts(e.shifts) else {
            binding.shiftsHeader.visibility = View.GONE
            binding.shiftsList.visibility = View.GONE
        }

        // Anmelde-Button: bei regRequired ODER wenn Schichten vorhanden
        val canRegister = regRequired || !e.shifts.isNullOrEmpty()
        binding.btnRegister.visibility = if (canRegister) View.VISIBLE else View.GONE
        binding.btnRegister.text = if (!e.shifts.isNullOrEmpty()) "Helfen" else "Anmelden"

        // Arbeitsplan nur wenn Schichten vorhanden (wie auf der Website)
        binding.btnArbeitsplan.visibility = if (!e.shifts.isNullOrEmpty()) View.VISIBLE else View.GONE
    }

    private fun buildDateText(e: Event): String {
        val start = DateUtils.formatLong(e.startDate).ifBlank { DateUtils.formatDate(e.startDate) }
        val time = DateUtils.formatDateTime(e.startDate).substringAfter(" ", "")
        return if (time.isNotBlank()) "$start, $time Uhr" else start
    }

    private fun showRegisterDialog(e: Event) {
        val dialogBinding = DialogRegisterBinding.inflate(LayoutInflater.from(this))
        val tm = MembersApp.instance.tokenManager
        if (!tm.userName.isNullOrBlank()) dialogBinding.regName.setText(tm.userName)
        if (!tm.userEmail.isNullOrBlank()) dialogBinding.regEmail.setText(tm.userEmail)

        AlertDialog.Builder(this)
            .setTitle("Anmeldung: ${e.title}")
            .setView(dialogBinding.root)
            .setPositiveButton("Anmelden") { _, _ ->
                val name = dialogBinding.regName.text?.toString()?.trim().orEmpty()
                if (name.isBlank()) {
                    Snackbar.make(binding.root, "Bitte Namen eingeben", Snackbar.LENGTH_SHORT).show()
                    return@setPositiveButton
                }
                submitRegistration(
                    e,
                    name,
                    dialogBinding.regEmail.text?.toString()?.trim().orEmpty(),
                    dialogBinding.regPhone.text?.toString()?.trim().orEmpty(),
                    dialogBinding.regParticipants.text?.toString()?.trim()?.toIntOrNull() ?: 1,
                    dialogBinding.regAllergies.text?.toString()?.trim().orEmpty(),
                    dialogBinding.regNotes.text?.toString()?.trim().orEmpty()
                )
            }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    private fun submitRegistration(
        e: Event, name: String, email: String, phone: String,
        participants: Int, allergies: String, notes: String
    ) {
        val req = PublicRegistrationRequest(
            type = "participant",
            eventId = e.id,
            eventTitle = e.title,
            organizerEmail = e.organizerEmail,
            name = name,
            email = email.ifBlank { null },
            phone = phone.ifBlank { null },
            participants = participants,
            notes = notes.ifBlank { null },
            allergies = allergies.ifBlank { null }
        )
        lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.publicRegister(req)
                if (response.isSuccessful && response.body()?.success == true) {
                    Snackbar.make(binding.root, "Anmeldung gesendet!", Snackbar.LENGTH_LONG).show()
                } else {
                    val msg = response.body()?.message ?: "Fehler ${response.code()}"
                    Snackbar.make(binding.root, msg, Snackbar.LENGTH_LONG).show()
                }
            } catch (ex: Exception) {
                Snackbar.make(binding.root, "Netzwerkfehler: ${ex.message}", Snackbar.LENGTH_LONG).show()
            }
        }
    }

    companion object {
        const val EXTRA_EVENT_ID = "event_id"
    }
}
