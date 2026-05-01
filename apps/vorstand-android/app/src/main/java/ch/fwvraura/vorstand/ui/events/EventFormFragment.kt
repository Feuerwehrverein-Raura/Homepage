package ch.fwvraura.vorstand.ui.events

import android.app.TimePickerDialog
import android.os.Bundle
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.AutoCompleteTextView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.core.view.setPadding
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.EventCreate
import ch.fwvraura.vorstand.data.model.Shift
import ch.fwvraura.vorstand.data.model.ShiftCreate
import ch.fwvraura.vorstand.databinding.FragmentEventFormBinding
import ch.fwvraura.vorstand.util.DateUtils
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.datepicker.MaterialDatePicker
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * EventFormFragment – Komplexes Formular zum Erstellen und Bearbeiten von Events
 * inklusive Schicht-Verwaltung.
 *
 * Funktionalitaet:
 * - Erstellen neuer Events mit allen Feldern (Titel, Kategorie, Status, Datum, etc.)
 * - Bearbeiten bestehender Events (Felder werden vorausgefuellt)
 * - Verwaltung von Schichten (Shifts): Hinzufuegen, Bearbeiten, Loeschen
 * - Dropdowns fuer Kategorie und Status mit deutsch/englisch-Mapping
 * - MaterialDatePicker fuer Datumsfelder
 * - Unterschiedliches Speicherverhalten: Neues Event sendet Schichten inline,
 *   bei Edit werden Schichten separat ueber die API verwaltet
 */
class EventFormFragment : Fragment() {

    /** View-Binding-Referenz, wird in onDestroyView auf null gesetzt */
    private var _binding: FragmentEventFormBinding? = null

    /** Sicherer Zugriff auf das Binding */
    private val binding get() = _binding!!

    /** ID des zu bearbeitenden Events, null bei neuem Event */
    private var eventId: String? = null

    /** Hilfsproperty: true wenn ein bestehendes Event bearbeitet wird */
    private val isEdit get() = eventId != null

    // ── Dropdown-Optionen ────────────────────────────────────────────────────

    /** Verfuegbare Kategorien fuer Events (Dropdown-Auswahl) */
    private val categoryOptions = listOf(
        "Dorffest", "Aufbau", "Abbau", "Ausflug", "Ausflug mit Anmeldung", "Sonstiges"
    )

    /** Status-Optionen auf Deutsch fuer die Anzeige im Dropdown */
    private val statusDisplayOptions = listOf("Geplant", "Bestätigt", "Abgesagt", "Abgeschlossen")

    /** Korrespondierende englische API-Werte fuer die Status-Optionen */
    private val statusApiValues = listOf("planned", "confirmed", "cancelled", "completed")

    /** Mapping: Deutsche Anzeige -> Englischer API-Wert (z.B. "Geplant" -> "planned") */
    private val statusDisplayToApi = statusDisplayOptions.zip(statusApiValues).toMap()

    /** Mapping: Englischer API-Wert -> Deutsche Anzeige (z.B. "planned" -> "Geplant") */
    private val statusApiToDisplay = statusApiValues.zip(statusDisplayOptions).toMap()

    /** Verfuegbare Bereiche fuer Schichten (z.B. "Bar", "Kueche", "Service") */
    private val bereichOptions = listOf(
        "Bar", "Küche", "Service", "Aufbau", "Abbau", "Technik", "Sonstiges"
    )

    // ── Schicht-Verwaltung ───────────────────────────────────────────────────

    /**
     * ShiftEntry – Lokale Datenklasse zur Verwaltung von Schichten im Formular.
     *
     * @param existingId ID einer bestehenden Schicht (null bei neuen Schichten)
     * @param data Die Schichtdaten (Name, Bereich, Datum, Zeit, etc.)
     * @param deleted Markiert ob die Schicht zum Loeschen vorgemerkt ist
     */
    private data class ShiftEntry(
        val existingId: String? = null,
        var data: ShiftCreate,
        var deleted: Boolean = false
    )

    /** Lokale Liste aller Schichten (neu, bestehend, und zum Loeschen vorgemerkte) */
    private val shiftEntries = mutableListOf<ShiftEntry>()

    /**
     * Erstellt die View-Hierarchie des Fragments.
     */
    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentEventFormBinding.inflate(inflater, container, false)
        return binding.root
    }

    /**
     * Initialisiert das Formular nach dem Erstellen der View.
     * Setzt den Titel (Neu/Bearbeiten), konfiguriert Dropdowns und DatePicker,
     * laedt bestehende Event-Daten im Edit-Modus und setzt Button-Listener.
     */
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        eventId = arguments?.getString("eventId")

        // Toolbar-Titel je nach Modus setzen: "Event bearbeiten" oder "Neues Event"
        binding.toolbar.title = if (isEdit) getString(R.string.event_edit) else getString(R.string.event_new)
        binding.toolbar.setNavigationOnClickListener { findNavController().navigateUp() }

        // Dropdowns und DatePicker initialisieren
        setupDropdowns()
        setupDatePickers()

        // Im Edit-Modus: Bestehende Event-Daten vom Server laden und Felder befuellen
        if (isEdit) loadEvent()

        // Button zum Hinzufuegen einer neuen Schicht (oeffnet den Schicht-Dialog)
        binding.btnAddShift.setOnClickListener { showShiftDialog(null) }

        // Speichern-Button: Loest das Speichern des Events aus
        binding.btnSave.setOnClickListener { saveEvent() }
    }

    // ── Dropdowns ────────────────────────────────────────────────────────────

    /**
     * Richtet die Dropdown-Menues fuer Kategorie und Status ein.
     * Verwendet ArrayAdapter mit AutoCompleteTextView.
     * Bei einem neuen Event wird der Standard-Status "Geplant" gesetzt.
     */
    private fun setupDropdowns() {
        // Kategorie-Dropdown mit den verfuegbaren Kategorien befuellen
        val categoryAdapter = ArrayAdapter(
            requireContext(),
            android.R.layout.simple_dropdown_item_1line,
            categoryOptions
        )
        binding.inputCategory.setAdapter(categoryAdapter)

        // Status-Dropdown mit den deutschen Status-Bezeichnungen befuellen
        val statusAdapter = ArrayAdapter(
            requireContext(),
            android.R.layout.simple_dropdown_item_1line,
            statusDisplayOptions
        )
        binding.inputStatus.setAdapter(statusAdapter)

        // Standard-Status fuer neue Events auf "Geplant" setzen
        if (!isEdit) {
            binding.inputStatus.setText("Geplant", false)
        }
    }

    // ── Date Pickers ─────────────────────────────────────────────────────────

    /**
     * Konfiguriert die DatePicker fuer die drei Datumsfelder:
     * Startdatum, Enddatum und Anmeldefrist.
     * Bei Klick auf ein Datumsfeld oeffnet sich ein MaterialDatePicker.
     */
    private fun setupDatePickers() {
        binding.inputStartDate.setOnClickListener { showDatePicker("Startdatum") { binding.inputStartDate.setText(it) } }
        binding.inputEndDate.setOnClickListener { showDatePicker("Enddatum") { binding.inputEndDate.setText(it) } }
        binding.inputRegistrationDeadline.setOnClickListener { showDatePicker("Anmeldefrist") { binding.inputRegistrationDeadline.setText(it) } }
    }

    /**
     * Zeigt einen MaterialDatePicker-Dialog an.
     * Das gewaehlte Datum wird im Format "dd.MM.yyyy" (Schweizer Format)
     * zurueckgegeben und ueber den Callback an das Eingabefeld uebergeben.
     *
     * @param title Titel des DatePicker-Dialogs (z.B. "Startdatum")
     * @param onDateSelected Callback mit dem formatierten Datum als String
     */
    private fun showDatePicker(title: String, onDateSelected: (String) -> Unit) {
        val picker = MaterialDatePicker.Builder.datePicker()
            .setTitleText(title)
            .setSelection(MaterialDatePicker.todayInUtcMilliseconds())
            .build()

        // Bei Auswahl: Datum in Schweizer Format (dd.MM.yyyy) umwandeln
        picker.addOnPositiveButtonClickListener { millis ->
            val sdf = SimpleDateFormat("dd.MM.yyyy", Locale("de", "CH"))
            sdf.timeZone = TimeZone.getTimeZone("UTC")
            onDateSelected(sdf.format(Date(millis)))
        }

        picker.show(parentFragmentManager, "date_picker_$title")
    }

    // ── Bestehendes Event laden ──────────────────────────────────────────────

    /**
     * Laedt ein bestehendes Event vom Server und befuellt alle Formularfelder.
     * Wird nur im Edit-Modus aufgerufen.
     *
     * Laedt auch die bestehenden Schichten des Events und fuegt sie
     * als ShiftEntry-Objekte in die lokale shiftEntries-Liste ein.
     * Aktualisiert anschliessend die Schicht-UI.
     */
    private fun loadEvent() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.getEvent(eventId!!)
                if (response.isSuccessful) {
                    val e = response.body() ?: return@launch

                    // Alle Formularfelder mit den bestehenden Event-Daten befuellen
                    binding.inputTitle.setText(e.title)
                    binding.inputSubtitle.setText(e.subtitle ?: "")
                    binding.inputCategory.setText(e.category ?: "", false)
                    // Status: API-Wert (englisch) in Anzeige-Wert (deutsch) umwandeln
                    binding.inputStatus.setText(statusApiToDisplay[e.status] ?: "", false)
                    binding.inputLocation.setText(e.location ?: "")
                    binding.inputRegistrationDeadline.setText(DateUtils.formatDate(e.registrationDeadline))
                    binding.inputStartDate.setText(DateUtils.formatDate(e.startDate))
                    binding.inputEndDate.setText(DateUtils.formatDate(e.endDate))
                    binding.inputMaxParticipants.setText(e.maxParticipants?.toString() ?: "")
                    binding.inputCost.setText(e.cost ?: "")
                    binding.inputOrganizerName.setText(e.organizerName ?: "")
                    binding.inputOrganizerEmail.setText(e.organizerEmail ?: "")
                    binding.inputDescription.setText(e.description ?: "")

                    // Bestehende Schichten in die lokale Liste laden
                    // Jede Schicht wird als ShiftEntry mit existingId gespeichert,
                    // damit spaeter zwischen Update und Neuanlage unterschieden werden kann
                    e.shifts?.forEach { shift ->
                        shiftEntries.add(
                            ShiftEntry(
                                existingId = shift.id,
                                data = ShiftCreate(
                                    eventId = shift.eventId,
                                    name = shift.name,
                                    description = shift.description,
                                    date = shift.date,
                                    startTime = shift.startTime,
                                    endTime = shift.endTime,
                                    needed = shift.needed,
                                    bereich = shift.bereich
                                )
                            )
                        )
                    }
                    // Schicht-UI mit den geladenen Schichten aktualisieren
                    refreshShiftsUI()
                }
            } catch (_: Exception) { }
        }
    }

    // ── Schicht-UI ───────────────────────────────────────────────────────────

    /**
     * Baut die Schicht-Anzeige komplett neu auf.
     * Entfernt alle bisherigen Views aus dem Container und erstellt
     * fuer jede nicht-geloeschte Schicht eine neue Card.
     */
    private fun refreshShiftsUI() {
        binding.shiftsContainer.removeAllViews()

        shiftEntries.forEachIndexed { index, entry ->
            // Geloeschte Schichten ueberspringen (werden nicht angezeigt)
            if (entry.deleted) return@forEachIndexed
            binding.shiftsContainer.addView(createShiftCard(index, entry))
        }
    }

    /**
     * Erstellt programmatisch eine MaterialCardView fuer eine einzelne Schicht.
     * Die Card enthaelt:
     * - Titelzeile mit Schichtname, Bearbeiten-Button und Loeschen-Button
     * - Detailzeile mit Bereich, Datum, Zeitraum und Anzahl benoetigter Personen
     *
     * @param index Index der Schicht in der shiftEntries-Liste
     * @param entry Das ShiftEntry-Objekt mit den Schichtdaten
     * @return Die erstellte Card-View
     */
    private fun createShiftCard(index: Int, entry: ShiftEntry): View {
        // MaterialCardView mit gerundeten Ecken, Rand und leichtem Schatten erstellen
        val card = MaterialCardView(requireContext()).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = 8.dp }
            radius = 12f
            strokeWidth = 1
            strokeColor = requireContext().getColor(R.color.divider)
            setCardBackgroundColor(requireContext().getColor(R.color.surface))
            cardElevation = 2f
        }

        // Vertikales LinearLayout als Inhalt der Card
        val content = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(16.dp)
        }

        val shift = entry.data

        // ── Titelzeile mit Schichtname und Aktions-Buttons ───────────────
        val titleRow = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        // Schichtname als Label (nimmt den verfuegbaren Platz ein)
        val nameLabel = TextView(requireContext()).apply {
            text = shift.name
            textSize = 16f
            setTextColor(requireContext().getColor(R.color.text_primary))
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        titleRow.addView(nameLabel)

        // Bearbeiten-Button: Oeffnet den Schicht-Dialog mit den bestehenden Daten
        val btnEdit = MaterialButton(requireContext(), null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
            text = "Bearbeiten"
            textSize = 12f
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { marginEnd = 4.dp }
            minimumHeight = 0
            minHeight = 36.dp
            setPadding(8.dp, 0, 8.dp, 0)
        }
        btnEdit.setOnClickListener { showShiftDialog(index) }
        titleRow.addView(btnEdit)

        // Loeschen-Button: Markiert die Schicht als geloescht und aktualisiert die UI
        val btnDelete = MaterialButton(requireContext(), null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
            text = "Löschen"
            textSize = 12f
            setTextColor(requireContext().getColor(R.color.error))
            strokeColor = android.content.res.ColorStateList.valueOf(requireContext().getColor(R.color.error))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            minimumHeight = 0
            minHeight = 36.dp
            setPadding(8.dp, 0, 8.dp, 0)
        }
        btnDelete.setOnClickListener {
            // Schicht als geloescht markieren (wird erst beim Speichern ueber API geloescht)
            entry.deleted = true
            refreshShiftsUI()
        }
        titleRow.addView(btnDelete)

        content.addView(titleRow)

        // ── Detail-Informationen der Schicht ─────────────────────────────
        // Sammelt alle verfuegbaren Details (Bereich, Datum, Zeit, Bedarf)
        val details = buildList {
            if (!shift.bereich.isNullOrBlank()) add("Bereich: ${shift.bereich}")
            if (!shift.date.isNullOrBlank()) add("Datum: ${DateUtils.formatDate(shift.date)}")
            val timeRange = listOfNotNull(shift.startTime, shift.endTime).joinToString(" - ")
            if (timeRange.isNotBlank()) add("Zeit: $timeRange")
            if (shift.needed != null) add("Benötigt: ${shift.needed}")
        }

        // Details nur anzeigen wenn mindestens ein Detail vorhanden ist
        if (details.isNotEmpty()) {
            val detailsView = TextView(requireContext()).apply {
                text = details.joinToString("\n")
                textSize = 14f
                setTextColor(requireContext().getColor(R.color.text_secondary))
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = 4.dp }
            }
            content.addView(detailsView)
        }

        card.addView(content)
        return card
    }

    // ── Schicht-Dialog ───────────────────────────────────────────────────────

    /**
     * Zeigt einen Dialog zum Erstellen oder Bearbeiten einer Schicht.
     *
     * Der Dialog enthaelt Eingabefelder fuer:
     * - Name (Pflichtfeld)
     * - Bereich (Dropdown: Bar, Kueche, Service, etc.)
     * - Datum (DatePicker)
     * - Startzeit und Endzeit (TimePicker)
     * - Anzahl benoetigter Personen
     * - Beschreibung
     *
     * Im Bearbeitungsmodus werden die bestehenden Daten vorausgefuellt.
     *
     * @param editIndex Index der zu bearbeitenden Schicht in shiftEntries, null fuer neue Schicht
     */
    private fun showShiftDialog(editIndex: Int?) {
        // Dialog-Layout inflaten mit allen Eingabefeldern
        val dialogView = LayoutInflater.from(requireContext())
            .inflate(R.layout.dialog_shift_form, null)

        // Referenzen auf die Eingabefelder im Dialog
        val inputName = dialogView.findViewById<TextInputEditText>(R.id.shiftInputName)
        val inputBereich = dialogView.findViewById<AutoCompleteTextView>(R.id.shiftInputBereich)
        val inputDate = dialogView.findViewById<TextInputEditText>(R.id.shiftInputDate)
        val inputStartTime = dialogView.findViewById<TextInputEditText>(R.id.shiftInputStartTime)
        val inputEndTime = dialogView.findViewById<TextInputEditText>(R.id.shiftInputEndTime)
        val inputNeeded = dialogView.findViewById<TextInputEditText>(R.id.shiftInputNeeded)
        val inputDescription = dialogView.findViewById<TextInputEditText>(R.id.shiftInputDescription)

        // Bereich-Dropdown mit den verfuegbaren Optionen befuellen
        val bereichAdapter = ArrayAdapter(
            requireContext(),
            android.R.layout.simple_dropdown_item_1line,
            bereichOptions
        )
        inputBereich.setAdapter(bereichAdapter)

        // DatePicker fuer das Schicht-Datum einrichten
        inputDate.setOnClickListener {
            showDatePicker("Datum") { inputDate.setText(it) }
        }

        // TimePicker fuer Startzeit (Standard: 08:00, 24h-Format)
        inputStartTime.setOnClickListener {
            TimePickerDialog(requireContext(), { _, h, m ->
                inputStartTime.setText(String.format(Locale.getDefault(), "%02d:%02d", h, m))
            }, 8, 0, true).show()
        }

        // TimePicker fuer Endzeit (Standard: 17:00, 24h-Format)
        inputEndTime.setOnClickListener {
            TimePickerDialog(requireContext(), { _, h, m ->
                inputEndTime.setText(String.format(Locale.getDefault(), "%02d:%02d", h, m))
            }, 17, 0, true).show()
        }

        // Im Bearbeitungsmodus: Bestehende Schichtdaten in die Felder laden
        if (editIndex != null) {
            val existing = shiftEntries[editIndex].data
            inputName.setText(existing.name)
            inputBereich.setText(existing.bereich ?: "", false)
            inputDate.setText(DateUtils.formatDate(existing.date))
            inputStartTime.setText(existing.startTime ?: "")
            inputEndTime.setText(existing.endTime ?: "")
            inputNeeded.setText(existing.needed?.toString() ?: "")
            inputDescription.setText(existing.description ?: "")
        }

        // Dialog-Titel: "Schicht bearbeiten" oder "Neue Schicht"
        val dialogTitle = if (editIndex != null) "Schicht bearbeiten" else "Neue Schicht"

        AlertDialog.Builder(requireContext())
            .setTitle(dialogTitle)
            .setView(dialogView)
            .setPositiveButton(R.string.save) { dialog, _ ->
                // Validierung: Name ist ein Pflichtfeld
                val name = inputName.text.toString().trim()
                if (name.isBlank()) {
                    Snackbar.make(binding.root, "Name ist ein Pflichtfeld", Snackbar.LENGTH_SHORT).show()
                    return@setPositiveButton
                }

                val neededText = inputNeeded.text.toString().trim()
                val dateText = inputDate.text.toString().trim()

                // ShiftCreate-Objekt aus den Eingabefeldern zusammenbauen
                // Leere Felder werden als null gesetzt
                val shiftCreate = ShiftCreate(
                    eventId = eventId,
                    name = name,
                    bereich = inputBereich.text.toString().trim().ifBlank { null },
                    date = if (dateText.isNotBlank()) DateUtils.toIsoDate(dateText) else null,
                    startTime = inputStartTime.text.toString().trim().ifBlank { null },
                    endTime = inputEndTime.text.toString().trim().ifBlank { null },
                    needed = if (neededText.isNotBlank()) neededText.toIntOrNull() else null,
                    description = inputDescription.text.toString().trim().ifBlank { null }
                )

                if (editIndex != null) {
                    // Bestehende Schicht aktualisieren (existingId bleibt erhalten)
                    shiftEntries[editIndex] = shiftEntries[editIndex].copy(data = shiftCreate)
                } else {
                    // Neue Schicht zur lokalen Liste hinzufuegen (ohne existingId)
                    shiftEntries.add(ShiftEntry(data = shiftCreate))
                }

                // Schicht-UI aktualisieren um die Aenderung anzuzeigen
                refreshShiftsUI()
                dialog.dismiss()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    // ── Speichern ────────────────────────────────────────────────────────────

    /**
     * Speichert das Event (neu oder bearbeitet).
     *
     * Validiert den Titel (Pflichtfeld), sammelt alle Formulardaten,
     * wandelt den Status von deutsch nach englisch um und erstellt
     * ein EventCreate-Objekt.
     *
     * Bei einem neuen Event werden die Schichten inline mitgeschickt.
     * Bei einem bestehenden Event werden die Schichten separat ueber die API
     * verwaltet (siehe saveEditedEvent).
     */
    private fun saveEvent() {
        // Validierung: Titel ist ein Pflichtfeld
        val title = binding.inputTitle.text.toString().trim()
        if (title.isBlank()) {
            Snackbar.make(binding.root, "Titel ist ein Pflichtfeld", Snackbar.LENGTH_SHORT).show()
            return
        }

        // Status von deutscher Anzeige in englischen API-Wert umwandeln
        val selectedStatusDisplay = binding.inputStatus.text.toString().trim()
        val statusApiValue = statusDisplayToApi[selectedStatusDisplay] ?: selectedStatusDisplay.ifBlank { null }

        val maxParticipantsText = binding.inputMaxParticipants.text.toString().trim()
        val registrationDeadlineText = binding.inputRegistrationDeadline.text.toString().trim()

        // Schichten fuer neue Events: Nicht-geloeschte Schichten inline mitschicken
        // Bei bestehenden Events werden Schichten separat verwaltet (null setzen)
        val newShifts = if (!isEdit) {
            shiftEntries.filter { !it.deleted }.map { it.data }.ifEmpty { null }
        } else {
            null // Schichten werden beim Bearbeiten separat ueber die API verwaltet
        }

        // EventCreate-Objekt aus allen Formularfeldern zusammenbauen
        // Leere Felder werden als null gesetzt um sie nicht zu ueberschreiben
        val event = EventCreate(
            title = title,
            subtitle = binding.inputSubtitle.text.toString().trim().ifBlank { null },
            category = binding.inputCategory.text.toString().trim().ifBlank { null },
            status = statusApiValue,
            location = binding.inputLocation.text.toString().trim().ifBlank { null },
            registrationDeadline = if (registrationDeadlineText.isNotBlank()) DateUtils.toIsoDate(registrationDeadlineText) else null,
            startDate = DateUtils.toIsoDate(binding.inputStartDate.text.toString().trim()),
            endDate = DateUtils.toIsoDate(binding.inputEndDate.text.toString().trim()),
            maxParticipants = if (maxParticipantsText.isNotBlank()) maxParticipantsText.toIntOrNull() else null,
            cost = binding.inputCost.text.toString().trim().ifBlank { null },
            organizerName = binding.inputOrganizerName.text.toString().trim().ifBlank { null },
            organizerEmail = binding.inputOrganizerEmail.text.toString().trim().ifBlank { null },
            description = binding.inputDescription.text.toString().trim().ifBlank { null },
            shifts = newShifts
        )

        // Speichern-Button deaktivieren um Doppelklick zu verhindern
        binding.btnSave.isEnabled = false
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                if (isEdit) {
                    // Bestehendes Event aktualisieren (inkl. Schicht-Verwaltung)
                    saveEditedEvent(event)
                } else {
                    // Neues Event erstellen (Schichten werden inline mitgeschickt)
                    saveNewEvent(event)
                }
            } catch (e: Exception) {
                Snackbar.make(binding.root, "Netzwerkfehler: ${e.message}", Snackbar.LENGTH_LONG).show()
                binding.btnSave.isEnabled = true
            }
        }
    }

    /**
     * Speichert ein neues Event ueber die API.
     * Bei Erfolg wird zurueck zur Events-Liste navigiert.
     * Bei einem Fehler wird eine Snackbar-Meldung angezeigt.
     */
    private suspend fun saveNewEvent(event: EventCreate) {
        val response = ApiModule.eventsApi.createEvent(event)
        if (response.isSuccessful) {
            findNavController().navigateUp()
        } else {
            Snackbar.make(binding.root, "Fehler (${response.code()})", Snackbar.LENGTH_LONG).show()
            binding.btnSave.isEnabled = true
        }
    }

    /**
     * Speichert ein bearbeitetes Event in zwei Schritten:
     *
     * 1. Event selbst aktualisieren (Titel, Datum, etc.)
     * 2. Schicht-Aenderungen separat verarbeiten:
     *    - Geloeschte bestehende Schichten: DELETE-Request an API
     *    - Aktualisierte bestehende Schichten: PUT-Request an API
     *    - Neue Schichten: POST-Request an API
     *
     * Bei Erfolg wird zurueck zur Events-Liste navigiert.
     * Falls das Event gespeichert, aber ein Schicht-Update fehlschlaegt,
     * wird eine entsprechende Fehlermeldung angezeigt.
     */
    private suspend fun saveEditedEvent(event: EventCreate) {
        // Schritt 1: Event-Grunddaten aktualisieren
        val response = ApiModule.eventsApi.updateEvent(eventId!!, event)
        if (!response.isSuccessful) {
            Snackbar.make(binding.root, "Fehler (${response.code()})", Snackbar.LENGTH_LONG).show()
            binding.btnSave.isEnabled = true
            return
        }

        // Schritt 2: Schicht-Aenderungen einzeln verarbeiten
        try {
            for (entry in shiftEntries) {
                when {
                    // Fall 1: Bestehende Schicht zum Loeschen vorgemerkt -> DELETE
                    entry.deleted && entry.existingId != null -> {
                        ApiModule.eventsApi.deleteShift(entry.existingId)
                    }
                    // Fall 2: Bestehende Schicht aktualisiert -> PUT (Update)
                    !entry.deleted && entry.existingId != null -> {
                        val shiftWithEventId = entry.data.copy(eventId = eventId)
                        ApiModule.eventsApi.updateShift(entry.existingId, shiftWithEventId)
                    }
                    // Fall 3: Neue Schicht hinzugefuegt -> POST (Erstellen)
                    !entry.deleted && entry.existingId == null -> {
                        val shiftWithEventId = entry.data.copy(eventId = eventId)
                        ApiModule.eventsApi.createShift(shiftWithEventId)
                    }
                }
            }
        } catch (e: Exception) {
            // Event wurde gespeichert, aber Schicht-Aenderungen sind fehlgeschlagen
            Snackbar.make(binding.root, "Event gespeichert, aber Fehler bei Schichten: ${e.message}", Snackbar.LENGTH_LONG).show()
            binding.btnSave.isEnabled = true
            return
        }

        // Alles erfolgreich: Zurueck zur Events-Liste navigieren
        findNavController().navigateUp()
    }

    // ── Hilfsfunktionen ──────────────────────────────────────────────────────

    /**
     * Extension Property: Konvertiert einen Int-Wert von dp (density-independent pixels)
     * in Pixel basierend auf der Bildschirmdichte des Geraets.
     */
    private val Int.dp: Int
        get() = (this * resources.displayMetrics.density).toInt()

    /**
     * Raeumt das Binding auf wenn die View zerstoert wird.
     */
    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
