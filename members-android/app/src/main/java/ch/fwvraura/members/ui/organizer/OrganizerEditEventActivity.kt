package ch.fwvraura.members.ui.organizer

import android.os.Bundle
import android.provider.OpenableColumns
import android.view.Gravity
import android.view.View
import android.widget.ArrayAdapter
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.setPadding
import androidx.lifecycle.lifecycleScope
import ch.fwvraura.members.R
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.Event
import ch.fwvraura.members.data.model.Shift
import ch.fwvraura.members.databinding.ActivityOrganizerEditEventBinding
import ch.fwvraura.members.databinding.DialogOrgShiftFormBinding
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.datepicker.MaterialDatePicker
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.timepicker.MaterialTimePicker
import com.google.android.material.timepicker.TimeFormat
import com.google.gson.GsonBuilder
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * OrganizerEditEventActivity — Bildschirm fuer den Event-Organisator, um die
 * Grunddaten seines Events zu bearbeiten und dessen Schichten zu verwalten.
 *
 * Wird aus dem Organisator-Dashboard gestartet und erwartet das Intent-Extra
 * "eventId" (String). Alle Aenderungen laufen ueber die eingeschraenkten
 * `*-as-organizer`-Endpunkte, die serverseitig per E-Mail-Match abgesichert sind.
 *
 * Aufbau (analog zur Vorstand-App):
 * - Event-Formular mit serializeNulls-JSON-Body (damit z.B. der PDF-Aushang
 *   gezielt geleert werden kann).
 * - Schicht-Verwaltung mit sofortigen API-Aufrufen (Erstellen/Bearbeiten/Loeschen)
 *   und anschliessendem Neuladen der Schichtliste.
 */
class OrganizerEditEventActivity : AppCompatActivity() {

    private lateinit var binding: ActivityOrganizerEditEventBinding

    /** ID des zu bearbeitenden Events (Pflicht-Extra). */
    private lateinit var eventId: String

    // ── Dropdown-Optionen (muessen exakt mit Web/Desktop/Vorstand uebereinstimmen) ──

    /** Verfuegbare Kategorien (inkl. "GV" — steuert Menue-Optionen und Anmeldepflicht). */
    private val categoryOptions = listOf(
        "Dorffest", "GV", "Aufbau", "Abbau", "Ausflug", "Ausflug mit Anmeldung", "Sonstiges"
    )

    /** Kategorien, die automatisch eine Anmeldung erfordern. */
    private val regRequiredCategories = listOf(
        "Dorffest", "GV", "Aufbau", "Abbau", "Ausflug mit Anmeldung"
    )

    /** Status-Anzeige (Deutsch) und korrespondierende API-Werte (Englisch). */
    private val statusDisplayOptions = listOf("Geplant", "Bestätigt", "Abgesagt", "Abgeschlossen")
    private val statusApiValues = listOf("planned", "confirmed", "cancelled", "completed")
    private val statusDisplayToApi = statusDisplayOptions.zip(statusApiValues).toMap()
    private val statusApiToDisplay = statusApiValues.zip(statusDisplayOptions).toMap()

    /** Vorschlagsliste fuer den Bereich einer Schicht. */
    private val bereichOptions = listOf(
        "Allgemein", "Kueche", "Bar", "Service", "Kasse", "Springer", "Vorbereitung", "Aufbau", "Abbau"
    )

    // ── Datum/Zeit-Zustand (ISO-Strings, "yyyy-MM-dd'T'HH:mm" bzw. Roh-Backend-Wert) ──

    private var startIso: String? = null
    private var endIso: String? = null
    private var deadlineIso: String? = null

    // ── PDF-Aushang-Zustand ──────────────────────────────────────────────────

    /** Neu gewaehltes PDF als RAW-base64 (ohne data:-Prefix), null wenn keins gewaehlt. */
    private var pickedPdfBase64: String? = null

    /** Dateiname des neu gewaehlten PDFs. */
    private var pickedPdfName: String? = null

    /** true, wenn der bestehende PDF-Aushang entfernt werden soll. */
    private var removePdf: Boolean = false

    /** Dateiname eines bereits am Event haengenden PDF-Aushangs (aus dem Prefill). */
    private var existingPdfFilename: String? = null

    /** Aktuell geladene Schichten des Events (fuer die Anzeige). */
    private var shifts: List<Shift> = emptyList()

    /**
     * Activity-Result-Launcher fuer die PDF-Auswahl. Muss als Feld registriert
     * werden (vor dem START-Zustand). GetContent() liefert eine Uri; wir lesen die
     * Bytes und kodieren sie als RAW-base64.
     */
    private val pdfPickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null) {
            try {
                val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() }
                if (bytes != null) {
                    pickedPdfBase64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
                    pickedPdfName = resolvePdfName(uri)
                    // Neue Datei hebt eine evtl. vorgemerkte Entfernung wieder auf
                    removePdf = false
                    updatePdfUi()
                }
            } catch (e: Exception) {
                toast("Fehler beim Laden der PDF: ${e.message}")
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        @Suppress("DEPRECATION")
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, true)
        binding = ActivityOrganizerEditEventBinding.inflate(layoutInflater)
        setContentView(binding.root)

        eventId = intent.getStringExtra(EXTRA_EVENT_ID).orEmpty()
        if (eventId.isBlank()) {
            toast("Kein Event angegeben")
            finish()
            return
        }

        binding.toolbar.setNavigationOnClickListener { finish() }

        setupDropdowns()
        setupDatePickers()
        setupPdfSection()

        binding.btnAddShift.setOnClickListener { showShiftDialog(null) }
        binding.btnSave.setOnClickListener { save() }

        loadEvent()
    }

    // ── Dropdowns ────────────────────────────────────────────────────────────

    private fun setupDropdowns() {
        binding.inputCategory.setAdapter(
            ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, categoryOptions)
        )
        // Menue-Optionen (nur "GV") bei Kategorie-Wechsel ein-/ausblenden
        binding.inputCategory.setOnItemClickListener { _, _, _, _ -> updateMealOptionsVisibility() }

        binding.inputStatus.setAdapter(
            ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, statusDisplayOptions)
        )
    }

    /** Blendet das Menue-Optionen-Feld nur bei Kategorie "GV" ein. */
    private fun updateMealOptionsVisibility() {
        val isGv = binding.inputCategory.text.toString().trim() == "GV"
        binding.layoutMealOptions.visibility = if (isGv) View.VISIBLE else View.GONE
    }

    // ── Datum/Zeit-Picker (Event-Felder) ─────────────────────────────────────

    private fun setupDatePickers() {
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
        binding.inputRegistrationDeadline.setOnClickListener {
            showDateTimePicker("Anmeldefrist", deadlineIso) { iso ->
                deadlineIso = iso
                binding.inputRegistrationDeadline.setText(fmtDateTime(iso))
            }
        }
    }

    /**
     * Zeigt nacheinander Datums- und Zeit-Picker und liefert das kombinierte
     * Ergebnis als ISO-String ("yyyy-MM-dd'T'HH:mm"). Beim Bearbeiten wird der
     * bestehende Wert vorbelegt.
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

    // ── PDF-Aushang ──────────────────────────────────────────────────────────

    private fun setupPdfSection() {
        binding.btnSelectPdf.setOnClickListener { pdfPickerLauncher.launch("application/pdf") }
        binding.btnRemovePdf.setOnClickListener {
            removePdf = true
            pickedPdfBase64 = null
            pickedPdfName = null
            updatePdfUi()
        }
        updatePdfUi()
    }

    /** Aktualisiert Dateiname-Anzeige und Sichtbarkeit des "Entfernen"-Buttons. */
    private fun updatePdfUi() {
        val displayName = when {
            pickedPdfName != null -> pickedPdfName
            !removePdf && existingPdfFilename != null -> existingPdfFilename
            else -> null
        }
        binding.pdfFilenameText.text = displayName ?: "Keine Datei ausgewählt"
        binding.btnRemovePdf.visibility = if (displayName != null) View.VISIBLE else View.GONE
    }

    /** Anzeigename einer per Picker gewaehlten Datei (Fallback "aushang.pdf"). */
    private fun resolvePdfName(uri: android.net.Uri): String {
        var name: String? = null
        try {
            contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) {
                    val idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (idx >= 0) name = c.getString(idx)
                }
            }
        } catch (_: Exception) { /* Fallback verwenden */ }
        return name ?: "aushang.pdf"
    }

    // ── Event laden + Formular befuellen ─────────────────────────────────────

    private fun loadEvent() {
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.getEvent(eventId)
                if (response.isSuccessful) {
                    response.body()?.let { fillForm(it) }
                } else {
                    toast("Fehler ${response.code()}")
                }
            } catch (e: Exception) {
                toast("Netzwerkfehler: ${e.message}")
            } finally {
                binding.progress.visibility = View.GONE
            }
        }
    }

    private fun fillForm(e: Event) {
        binding.inputTitle.setText(e.title)
        binding.inputSubtitle.setText(e.subtitle.orEmpty())
        binding.inputCategory.setText(e.category.orEmpty(), false)
        binding.inputMealOptions.setText(e.mealOptions?.joinToString(", ").orEmpty())
        updateMealOptionsVisibility()
        binding.inputStatus.setText(statusApiToDisplay[e.status].orEmpty(), false)
        binding.inputLocation.setText(e.location.orEmpty())

        // Datum/Zeit: Roh-ISO merken (wird unveraendert zurueckgesendet) und Schweizer anzeigen
        startIso = e.startDate
        binding.inputStartDate.setText(fmtDateTime(e.startDate))
        endIso = e.endDate
        binding.inputEndDate.setText(fmtDateTime(e.endDate))
        deadlineIso = e.registrationDeadline
        binding.inputRegistrationDeadline.setText(fmtDateTime(e.registrationDeadline))

        binding.inputMaxParticipants.setText(e.maxParticipants?.toString().orEmpty())
        binding.inputCost.setText(e.cost.orEmpty())
        binding.inputDescription.setText(e.description.orEmpty())

        existingPdfFilename = e.pdfFilename?.takeIf { it.isNotBlank() }
        updatePdfUi()

        shifts = e.shifts.orEmpty()
        renderShifts()
    }

    // ── Speichern (Event-Grunddaten) ─────────────────────────────────────────

    /**
     * Serialisiert die Event-Grunddaten als JSON und sendet sie an
     * updateEventAsOrganizer. Spiegelt saveEditedEvent der Vorstand-App:
     * - serializeNulls, danach null-Felder wieder entfernen (partielles Update)
     * - Ausnahmen (bewusst als null belassen): meal_options (leert Menue ausserhalb
     *   GV) und pdf_attachment/pdf_filename beim Entfernen des Aushangs.
     */
    private fun save() {
        val title = binding.inputTitle.text?.toString()?.trim().orEmpty()
        if (title.isBlank()) {
            Snackbar.make(binding.root, "Titel ist ein Pflichtfeld", Snackbar.LENGTH_SHORT).show()
            return
        }

        val category = binding.inputCategory.text?.toString()?.trim().orEmpty()
        val statusDisplay = binding.inputStatus.text?.toString()?.trim().orEmpty()
        val statusApi = statusDisplayToApi[statusDisplay] ?: statusDisplay.ifBlank { null }
        val maxParticipants = binding.inputMaxParticipants.text?.toString()?.trim()?.toIntOrNull()

        // Menue-Optionen nur bei "GV" senden (kommagetrennt), sonst null (leeren).
        val mealOptions: List<String>? = if (category == "GV") {
            binding.inputMealOptions.text?.toString().orEmpty()
                .split(",").map { it.trim() }.filter { it.isNotBlank() }
        } else null

        // Nur die serverseitig akzeptierten Felder aufnehmen.
        val body = linkedMapOf<String, Any?>(
            "title" to title,
            "subtitle" to binding.inputSubtitle.text?.toString()?.trim()?.ifBlank { null },
            "description" to binding.inputDescription.text?.toString()?.trim()?.ifBlank { null },
            "start_date" to startIso,
            "end_date" to endIso,
            "location" to binding.inputLocation.text?.toString()?.trim()?.ifBlank { null },
            "category" to category.ifBlank { null },
            "registration_required" to regRequiredCategories.contains(category),
            "registration_deadline" to deadlineIso,
            "max_participants" to maxParticipants,
            "cost" to binding.inputCost.text?.toString()?.trim()?.ifBlank { null },
            "status" to statusApi,
            "meal_options" to mealOptions
        )

        // PDF-Handling: neu gewaehlt -> senden; Entfernen -> explizit null; sonst weglassen.
        val keepNulls = mutableSetOf("meal_options")
        when {
            pickedPdfBase64 != null -> {
                body["pdf_attachment"] = pickedPdfBase64
                body["pdf_filename"] = pickedPdfName
            }
            removePdf && existingPdfFilename != null -> {
                body["pdf_attachment"] = null
                body["pdf_filename"] = null
                keepNulls += "pdf_attachment"
                keepNulls += "pdf_filename"
            }
        }

        // null-Felder wieder entfernen (partielles Update) — ausser den bewusst zu leerenden.
        body.keys.toList().forEach { key ->
            if (body[key] == null && key !in keepNulls) body.remove(key)
        }

        val gson = GsonBuilder().serializeNulls().create()
        val requestBody = gson.toJson(body)
            .toRequestBody("application/json; charset=utf-8".toMediaType())

        binding.btnSave.isEnabled = false
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.updateEventAsOrganizer(eventId, requestBody)
                if (response.isSuccessful) {
                    toast("Event gespeichert")
                    finish()
                } else {
                    toast("Fehler ${response.code()}")
                    binding.btnSave.isEnabled = true
                }
            } catch (e: Exception) {
                toast("Netzwerkfehler: ${e.message}")
                binding.btnSave.isEnabled = true
            } finally {
                binding.progress.visibility = View.GONE
            }
        }
    }

    // ── Schicht-Anzeige ──────────────────────────────────────────────────────

    /** Baut die Schichtliste komplett neu auf (programmatische Cards). */
    private fun renderShifts() {
        binding.shiftsContainer.removeAllViews()
        binding.shiftsEmpty.visibility = if (shifts.isEmpty()) View.VISIBLE else View.GONE
        shifts.forEach { binding.shiftsContainer.addView(createShiftCard(it)) }
    }

    /** Erstellt eine Card fuer eine Schicht mit Bearbeiten-/Loeschen-Buttons. */
    private fun createShiftCard(shift: Shift): View {
        val card = MaterialCardView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = 8.dp }
            radius = 12f
            strokeWidth = 1
            strokeColor = getColor(R.color.divider)
            setCardBackgroundColor(getColor(R.color.surface))
            cardElevation = 2f
        }

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(16.dp)
        }

        // Titelzeile: Name + Aktions-Buttons
        val titleRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val nameLabel = TextView(this).apply {
            text = listOfNotNull(shift.bereich?.takeIf { it.isNotBlank() }, shift.name).joinToString(" – ")
            textSize = 16f
            setTextColor(getColor(R.color.text_primary))
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        titleRow.addView(nameLabel)

        val btnEdit = MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
            text = "Bearbeiten"
            textSize = 12f
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { marginEnd = 4.dp }
            minimumHeight = 0
            minHeight = 36.dp
            setPadding(8.dp, 0, 8.dp, 0)
            setOnClickListener { showShiftDialog(shift) }
        }
        titleRow.addView(btnEdit)

        val btnDelete = MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
            text = "Löschen"
            textSize = 12f
            setTextColor(getColor(R.color.error))
            strokeColor = android.content.res.ColorStateList.valueOf(getColor(R.color.error))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
            )
            minimumHeight = 0
            minHeight = 36.dp
            setPadding(8.dp, 0, 8.dp, 0)
            setOnClickListener { confirmDeleteShift(shift) }
        }
        titleRow.addView(btnDelete)
        content.addView(titleRow)

        // Detailzeile: Bereich, Datum, Zeit, Bedarf
        val details = buildList {
            if (!shift.bereich.isNullOrBlank()) add("Bereich: ${shift.bereich}")
            if (!shift.date.isNullOrBlank()) add("Datum: ${fmtDate(shift.date)}")
            val timeRange = listOfNotNull(shift.startTime, shift.endTime).joinToString(" - ")
            if (timeRange.isNotBlank()) add("Zeit: $timeRange")
            if (shift.needed != null) add("Benötigt: ${shift.needed}")
        }
        if (details.isNotEmpty()) {
            val detailsView = TextView(this).apply {
                text = details.joinToString("\n")
                textSize = 14f
                setTextColor(getColor(R.color.text_secondary))
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = 4.dp }
            }
            content.addView(detailsView)
        }

        card.addView(content)
        return card
    }

    // ── Schicht-Dialog (Erstellen/Bearbeiten) ────────────────────────────────

    private fun showShiftDialog(existing: Shift?) {
        val db = DialogOrgShiftFormBinding.inflate(layoutInflater)

        db.shiftInputBereich.setAdapter(
            ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, bereichOptions)
        )

        // Datum als ISO (yyyy-MM-dd) im Closure halten; Feld zeigt Schweizer Format.
        var shiftDateIso: String? = null

        db.shiftInputDate.setOnClickListener {
            val preset = parseForPickers(shiftDateIso)
            val picker = MaterialDatePicker.Builder.datePicker()
                .setTitleText("Datum")
                .setSelection(preset?.first ?: MaterialDatePicker.todayInUtcMilliseconds())
                .build()
            picker.addOnPositiveButtonClickListener { ms ->
                shiftDateIso = toIsoDate(ms)
                db.shiftInputDate.setText(fmtDate(shiftDateIso))
            }
            picker.show(supportFragmentManager, "shift_date")
        }
        db.shiftInputStartTime.setOnClickListener { pickTime(db.shiftInputStartTime, 8, 0) }
        db.shiftInputEndTime.setOnClickListener { pickTime(db.shiftInputEndTime, 17, 0) }

        if (existing != null) {
            db.shiftInputName.setText(existing.name)
            db.shiftInputBereich.setText(existing.bereich.orEmpty(), false)
            if (!existing.date.isNullOrBlank()) {
                parseForPickers(existing.date)?.let { shiftDateIso = toIsoDate(it.first) }
                db.shiftInputDate.setText(fmtDate(existing.date))
            }
            db.shiftInputStartTime.setText(existing.startTime.orEmpty())
            db.shiftInputEndTime.setText(existing.endTime.orEmpty())
            db.shiftInputNeeded.setText(existing.needed?.toString().orEmpty())
            db.shiftInputDescription.setText(existing.description.orEmpty())
        }

        val dialogTitle = if (existing != null) "Schicht bearbeiten" else "Neue Schicht"
        AlertDialog.Builder(this)
            .setTitle(dialogTitle)
            .setView(db.root)
            // Positiv-Button erst spaeter verdrahten, damit der Dialog bei
            // Validierungsfehlern offen bleibt.
            .setPositiveButton("Speichern", null)
            .setNegativeButton("Abbrechen", null)
            .create().also { dlg ->
                dlg.setOnShowListener {
                    dlg.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                        val name = db.shiftInputName.text?.toString()?.trim().orEmpty()
                        if (name.isBlank()) {
                            db.shiftInputName.error = "Pflichtfeld"
                            return@setOnClickListener
                        }
                        val map = mutableMapOf<String, Any?>(
                            "name" to name,
                            "description" to db.shiftInputDescription.text?.toString()?.trim()?.ifBlank { null },
                            "date" to shiftDateIso,
                            "start_time" to db.shiftInputStartTime.text?.toString()?.trim()?.ifBlank { null },
                            "end_time" to db.shiftInputEndTime.text?.toString()?.trim()?.ifBlank { null },
                            "needed" to db.shiftInputNeeded.text?.toString()?.trim()?.toIntOrNull(),
                            "bereich" to db.shiftInputBereich.text?.toString()?.trim()?.ifBlank { null }
                        )
                        saveShift(existing?.id, map, dlg)
                    }
                }
            }.show()
    }

    /** Zeigt einen Zeit-Picker und schreibt das Ergebnis als "HH:mm" ins Feld. */
    private fun pickTime(target: TextInputEditText, defaultHour: Int, defaultMinute: Int) {
        val current = parseHourMinute(target.text?.toString())
        val picker = MaterialTimePicker.Builder()
            .setTimeFormat(TimeFormat.CLOCK_24H)
            .setHour(current?.first ?: defaultHour)
            .setMinute(current?.second ?: defaultMinute)
            .build()
        picker.addOnPositiveButtonClickListener {
            target.setText(String.format(java.util.Locale.US, "%02d:%02d", picker.hour, picker.minute))
        }
        picker.show(supportFragmentManager, "shift_time")
    }

    /**
     * Legt eine neue Schicht an oder aktualisiert eine bestehende und laedt danach
     * die Schichtliste neu.
     */
    private fun saveShift(shiftId: String?, map: Map<String, Any?>, dlg: AlertDialog) {
        val positive = dlg.getButton(AlertDialog.BUTTON_POSITIVE)
        positive.isEnabled = false
        lifecycleScope.launch {
            try {
                val response = if (shiftId == null) {
                    ApiModule.eventsApi.createShiftAsOrganizer(eventId, map)
                } else {
                    ApiModule.eventsApi.updateShiftAsOrganizer(eventId, shiftId, map)
                }
                if (response.isSuccessful) {
                    dlg.dismiss()
                    refreshShifts()
                } else {
                    toast("Fehler ${response.code()}")
                    positive.isEnabled = true
                }
            } catch (e: Exception) {
                toast("Netzwerkfehler: ${e.message}")
                positive.isEnabled = true
            }
        }
    }

    private fun confirmDeleteShift(shift: Shift) {
        AlertDialog.Builder(this)
            .setTitle("Schicht löschen?")
            .setMessage("Möchtest du die Schicht \"${shift.name}\" wirklich löschen?")
            .setPositiveButton("Löschen") { _, _ -> deleteShift(shift.id) }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    private fun deleteShift(shiftId: String) {
        lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.deleteShiftAsOrganizer(eventId, shiftId)
                if (response.isSuccessful) refreshShifts()
                else toast("Fehler ${response.code()}")
            } catch (e: Exception) {
                toast("Netzwerkfehler: ${e.message}")
            }
        }
    }

    /** Laedt nur die Schichtliste neu (ohne das Event-Formular zu ueberschreiben). */
    private fun refreshShifts() {
        lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.getEvent(eventId)
                if (response.isSuccessful) {
                    shifts = response.body()?.shifts.orEmpty()
                    renderShifts()
                }
            } catch (_: Exception) { /* Anzeige bleibt beim letzten Stand */ }
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

    /** UTC-Datum-Millis -> "yyyy-MM-dd" (fuer Schicht-Datum). */
    private fun toIsoDate(dateMillisUtc: Long): String =
        Instant.ofEpochMilli(dateMillisUtc).atZone(ZoneOffset.UTC).toLocalDate().toString()

    /** ISO -> "dd.MM.yyyy" (leer bei ungueltig/null). */
    private fun fmtDate(iso: String?): String {
        val t = parseForPickers(iso) ?: return ""
        val d = Instant.ofEpochMilli(t.first).atZone(ZoneOffset.UTC).toLocalDate()
        return String.format(java.util.Locale.US, "%02d.%02d.%04d", d.dayOfMonth, d.monthValue, d.year)
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

    /** Parst "HH:mm" in (Stunde, Minute); null bei ungueltiger Eingabe. */
    private fun parseHourMinute(s: String?): Pair<Int, Int>? {
        if (s.isNullOrBlank()) return null
        val parts = s.split(":")
        if (parts.size < 2) return null
        val h = parts[0].trim().toIntOrNull() ?: return null
        val m = parts[1].trim().toIntOrNull() ?: return null
        return h to m
    }

    // ── Sonstiges ────────────────────────────────────────────────────────────

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_LONG).show()

    /** dp -> px anhand der Bildschirmdichte. */
    private val Int.dp: Int
        get() = (this * resources.displayMetrics.density).toInt()

    companion object {
        const val EXTRA_EVENT_ID = "eventId"
        private val ISO_LOCAL_MINUTE: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm")
    }
}
