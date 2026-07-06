package ch.fwvraura.vorstand.ui.events

import android.app.TimePickerDialog
import android.os.Bundle
import android.provider.OpenableColumns
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.AutoCompleteTextView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.core.view.setPadding
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.EventCreate
import ch.fwvraura.vorstand.data.model.Member
import ch.fwvraura.vorstand.data.model.Shift
import ch.fwvraura.vorstand.data.model.ShiftCreate
import ch.fwvraura.vorstand.databinding.FragmentEventFormBinding
import ch.fwvraura.vorstand.util.DateUtils
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.datepicker.MaterialDatePicker
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.timepicker.MaterialTimePicker
import com.google.android.material.timepicker.TimeFormat
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import com.google.gson.GsonBuilder
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody

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

    /**
     * Verfuegbare Kategorien fuer Events (Dropdown-Auswahl).
     * Muss exakt mit CATEGORIES im Web/Desktop uebereinstimmen (inkl. "GV"),
     * da die Backend-Logik (registration_required, Menue, Schichten) darauf aufbaut.
     */
    private val categoryOptions = listOf(
        "Dorffest", "GV", "Aufbau", "Abbau", "Ausflug", "Ausflug mit Anmeldung", "Sonstiges"
    )

    /**
     * Kategorien, die automatisch eine Anmeldung erfordern (wie im Web/Desktop).
     * Beim Speichern wird registration_required daraus abgeleitet.
     */
    private val regRequiredCategories = listOf(
        "Dorffest", "GV", "Aufbau", "Abbau", "Ausflug mit Anmeldung"
    )

    /** Status-Optionen auf Deutsch fuer die Anzeige im Dropdown */
    private val statusDisplayOptions = listOf("Geplant", "Bestätigt", "Abgesagt", "Abgeschlossen")

    /** Korrespondierende englische API-Werte fuer die Status-Optionen */
    private val statusApiValues = listOf("planned", "confirmed", "cancelled", "completed")

    /** Mapping: Deutsche Anzeige -> Englischer API-Wert (z.B. "Geplant" -> "planned") */
    private val statusDisplayToApi = statusDisplayOptions.zip(statusApiValues).toMap()

    /** Mapping: Englischer API-Wert -> Deutsche Anzeige (z.B. "planned" -> "Geplant") */
    private val statusApiToDisplay = statusApiValues.zip(statusDisplayOptions).toMap()

    /**
     * Verfuegbare Bereiche fuer Schichten (Vorschlagsliste im Schicht-Dialog).
     * Entspricht exakt SHIFT_BEREICHE im Web/Desktop, damit "Springer",
     * "Vorbereitung", "Kasse" etc. als Vorschlaege erscheinen.
     */
    private val bereichOptions = listOf(
        "Allgemein", "Kueche", "Bar", "Service", "Kasse", "Springer", "Vorbereitung", "Aufbau", "Abbau"
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

    // ── Datum/Zeit-Zustand ───────────────────────────────────────────────────

    /**
     * Gespeicherte ISO-Strings (Format "yyyy-MM-ddTHH:mm") fuer die drei
     * Datumsfelder. Werden ueber den Datum+Zeit-Picker gesetzt und beim Speichern
     * direkt (ohne Re-Parsing des Schweizer Anzeigetexts) an die API gesendet.
     */
    private var startIso: String? = null
    private var endIso: String? = null
    private var deadlineIso: String? = null

    // ── PDF-Aushang-Zustand ──────────────────────────────────────────────────

    /** Ausgewaehltes PDF als RAW-base64 (ohne data:-Prefix), null wenn keins gewaehlt. */
    private var pickedPdfBase64: String? = null

    /** Dateiname des ausgewaehlten PDFs. */
    private var pickedPdfName: String? = null

    /** true wenn der bestehende PDF-Aushang entfernt werden soll (Entfernen-Button). */
    private var removePdf: Boolean = false

    /** Dateiname eines bereits am Event haengenden PDF-Aushangs (aus dem Edit-Prefill). */
    private var existingPdfFilename: String? = null

    // ── Organisator-Zustand ──────────────────────────────────────────────────

    /** Geladene Mitgliederliste, hinterlegt den Organisator-Dropdown (Mitglied-Modus). */
    private var members: List<Member> = emptyList()

    /** Aktuell als Organisator ausgewaehltes Mitglied (Mitglied-Modus), sonst null. */
    private var selectedMember: Member? = null

    /**
     * Beim Edit-Prefill gemerkte organizer_id, falls die Mitgliederliste noch nicht
     * geladen ist. Sobald die Mitglieder geladen sind, wird das Mitglied vorausgewaehlt.
     */
    private var pendingOrganizerId: String? = null

    /**
     * Activity-Result-Launcher fuer die PDF-Auswahl.
     *
     * Muss als Fragment-Property (nicht in onViewCreated) initialisiert werden,
     * damit die Registrierung vor dem START-Zustand erfolgt (sonst
     * IllegalStateException) — gleiches Muster wie in MassPdfFragment.
     *
     * GetContent() liefert direkt eine Uri der gewaehlten Datei. Wir lesen die
     * Bytes, kodieren sie als RAW-base64 und merken uns Name + Inhalt.
     */
    private val pdfPickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null) {
            try {
                // PDF vollstaendig in ein ByteArray einlesen (use() schliesst den Stream)
                val bytes = requireContext().contentResolver.openInputStream(uri)?.use { it.readBytes() }
                if (bytes != null) {
                    // RAW-base64 ohne Zeilenumbrueche und ohne data:-Prefix
                    pickedPdfBase64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
                    pickedPdfName = resolvePdfName(uri)
                    // Neue Datei hebt eine evtl. vorgemerkte Entfernung auf
                    removePdf = false
                    updatePdfUi()
                }
            } catch (e: Exception) {
                Snackbar.make(binding.root, "Fehler beim Laden der PDF", Snackbar.LENGTH_SHORT).show()
            }
        }
    }

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

        // Dropdowns, DatePicker und PDF-Aushang-Bereich initialisieren
        setupDropdowns()
        setupDatePickers()
        setupPdfSection()
        setupOrganizerSection()

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

        // Bei Auswahl einer Kategorie: Sichtbarkeit der Menue-Optionen (nur "GV") anpassen
        binding.inputCategory.setOnItemClickListener { _, _, _, _ ->
            updateMealOptionsVisibility()
        }

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

    /**
     * Blendet das Menue-Optionen-Feld nur ein, wenn die Kategorie "GV" ausgewaehlt ist
     * (wie im Web/Desktop). Wird nach Kategorie-Auswahl und beim Edit-Prefill aufgerufen.
     */
    private fun updateMealOptionsVisibility() {
        val isGv = binding.inputCategory.text.toString().trim() == "GV"
        binding.layoutMealOptions.visibility = if (isGv) View.VISIBLE else View.GONE
    }

    // ── Date Pickers ─────────────────────────────────────────────────────────

    /**
     * Konfiguriert die drei Datumsfelder (Startdatum, Enddatum, Anmeldefrist).
     *
     * Anders als frueher wird pro Feld nicht nur ein Datum, sondern zusaetzlich
     * eine Uhrzeit erfasst: Ein Klick oeffnet einen MaterialDatePicker und danach
     * einen MaterialTimePicker. Das Ergebnis wird als ISO-String
     * ("yyyy-MM-ddTHH:mm") in der jeweiligen Zustandsvariable abgelegt und im Feld
     * im Schweizer Format ("dd.MM.yyyy HH:mm") angezeigt.
     */
    private fun setupDatePickers() {
        binding.inputStartDate.setOnClickListener {
            showDateTimePicker("Startdatum", startIso) { iso ->
                startIso = iso
                binding.inputStartDate.setText(DateUtils.formatDateTime(iso))
            }
        }
        binding.inputEndDate.setOnClickListener {
            showDateTimePicker("Enddatum", endIso) { iso ->
                endIso = iso
                binding.inputEndDate.setText(DateUtils.formatDateTime(iso))
            }
        }
        binding.inputRegistrationDeadline.setOnClickListener {
            showDateTimePicker("Anmeldefrist", deadlineIso) { iso ->
                deadlineIso = iso
                binding.inputRegistrationDeadline.setText(DateUtils.formatDateTime(iso))
            }
        }
    }

    /**
     * Zeigt nacheinander einen Datums- und einen Zeit-Picker und liefert das
     * kombinierte Ergebnis als ISO-String ("yyyy-MM-ddTHH:mm") zurueck.
     *
     * Beim Bearbeiten wird der Picker mit dem bestehenden Wert vorbelegt (Datum +
     * Uhrzeit ueber DateUtils.parseForPickers), sonst mit dem heutigen Datum und
     * 00:00 Uhr.
     *
     * @param title Titel fuer beide Picker (z.B. "Startdatum").
     * @param currentIso Bisheriger ISO-Wert des Feldes (fuer die Vorbelegung), oder null.
     * @param onPicked Callback mit dem fertigen ISO-String.
     */
    private fun showDateTimePicker(title: String, currentIso: String?, onPicked: (String) -> Unit) {
        // Vorbelegung aus einem evtl. bereits gesetzten Wert ableiten
        val preset = DateUtils.parseForPickers(currentIso)

        val datePicker = MaterialDatePicker.Builder.datePicker()
            .setTitleText(title)
            .setSelection(preset?.first ?: MaterialDatePicker.todayInUtcMilliseconds())
            .build()

        // Nach der Datumsauswahl den Zeit-Picker oeffnen
        datePicker.addOnPositiveButtonClickListener { dateMillis ->
            val timePicker = MaterialTimePicker.Builder()
                .setTimeFormat(TimeFormat.CLOCK_24H)
                .setHour(preset?.second ?: 0)
                .setMinute(preset?.third ?: 0)
                .setTitleText(title)
                .build()

            // Nach der Zeitauswahl Datum + Zeit zu einem ISO-String zusammensetzen
            timePicker.addOnPositiveButtonClickListener {
                val iso = DateUtils.toIsoDateTime(dateMillis, timePicker.hour, timePicker.minute)
                onPicked(iso)
            }
            timePicker.show(parentFragmentManager, "time_picker_$title")
        }

        datePicker.show(parentFragmentManager, "date_picker_$title")
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

    // ── PDF-Aushang ──────────────────────────────────────────────────────────

    /**
     * Richtet den PDF-Aushang-Bereich ein: "PDF waehlen" oeffnet den System-Picker,
     * "Entfernen" merkt das Entfernen des bestehenden Aushangs vor. Setzt zudem die
     * initiale Anzeige (Dateiname bzw. Platzhalter).
     */
    private fun setupPdfSection() {
        binding.btnSelectPdf.setOnClickListener {
            // GetContent-Contract erwartet den MIME-Type als Launch-Argument
            pdfPickerLauncher.launch("application/pdf")
        }
        binding.btnRemovePdf.setOnClickListener {
            // Entfernen vormerken und eine evtl. gewaehlte Datei verwerfen
            removePdf = true
            pickedPdfBase64 = null
            pickedPdfName = null
            updatePdfUi()
        }
        updatePdfUi()
    }

    /**
     * Aktualisiert die PDF-Anzeige: zeigt den Namen der neu gewaehlten bzw. der
     * bestehenden Datei und blendet den "Entfernen"-Button nur ein, wenn es etwas
     * zu entfernen gibt.
     */
    private fun updatePdfUi() {
        val displayName = when {
            // Neu gewaehlte Datei hat Vorrang
            pickedPdfName != null -> pickedPdfName
            // Bestehender Aushang, solange nicht zum Entfernen vorgemerkt
            !removePdf && existingPdfFilename != null -> existingPdfFilename
            else -> null
        }
        binding.pdfFilenameText.text = displayName ?: "Keine Datei ausgewählt"
        binding.btnRemovePdf.visibility = if (displayName != null) View.VISIBLE else View.GONE
    }

    /**
     * Ermittelt den Anzeigenamen einer per Picker gewaehlten Datei
     * (OpenableColumns.DISPLAY_NAME), mit Fallback "aushang.pdf".
     */
    private fun resolvePdfName(uri: android.net.Uri): String {
        var name: String? = null
        try {
            requireContext().contentResolver
                .query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
                ?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        if (idx >= 0) name = cursor.getString(idx)
                    }
                }
        } catch (_: Exception) {
            // Bei Fehlern den Fallback-Namen verwenden
        }
        return name ?: "aushang.pdf"
    }

    // ── Organisator ──────────────────────────────────────────────────────────

    /**
     * Richtet den Organisator-Bereich ein: Modus-Umschalter (Mitglied/Extern),
     * laedt die Mitgliederliste in den Dropdown und setzt den Standardmodus.
     *
     * Standard ist der Mitglied-Modus (verknuepfter Organisator ohne Token-Zugang).
     * Der Edit-Prefill (loadEvent) kann den Modus nachtraeglich auf Extern umstellen.
     */
    private fun setupOrganizerSection() {
        // Bei Moduswechsel die Sichtbarkeit der beiden Bereiche anpassen
        binding.organizerModeGroup.addOnButtonCheckedListener { _, _, isChecked ->
            if (isChecked) updateOrganizerMode()
        }

        // Standardmodus: Mitglied (wird bei Edit ggf. ueberschrieben)
        binding.organizerModeGroup.check(R.id.btnOrganizerMitglied)
        updateOrganizerMode()

        // Mitgliederliste asynchron laden und den Dropdown befuellen
        loadMembers()
    }

    /**
     * Blendet je nach gewaehltem Modus den Mitglied-Dropdown oder den Extern-Bereich
     * (Name/E-Mail/Zugang) ein bzw. aus.
     */
    private fun updateOrganizerMode() {
        val isMitglied = binding.organizerModeGroup.checkedButtonId == R.id.btnOrganizerMitglied
        binding.layoutOrganizerMember.visibility = if (isMitglied) View.VISIBLE else View.GONE
        binding.externOrganizerSection.visibility = if (isMitglied) View.GONE else View.VISIBLE
    }

    /**
     * Laedt alle Mitglieder vom Server und hinterlegt den Organisator-Dropdown mit
     * "Vorname Nachname"-Labels. Bei Auswahl wird das Mitglied in [selectedMember]
     * gemerkt. Wartet ein Edit-Prefill auf ein Mitglied ([pendingOrganizerId]),
     * wird es nach dem Laden vorausgewaehlt.
     */
    private fun loadMembers() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.membersApi.getMembers()
                if (response.isSuccessful) {
                    members = response.body() ?: emptyList()
                    val labels = members.map { "${it.vorname} ${it.nachname}" }
                    val adapter = ArrayAdapter(
                        requireContext(),
                        android.R.layout.simple_dropdown_item_1line,
                        labels
                    )
                    binding.inputOrganizerMember.setAdapter(adapter)
                    // Bei Auswahl: ausgewaehltes Mitglied merken (fuer den Speichern-Schritt)
                    binding.inputOrganizerMember.setOnItemClickListener { _, _, position, _ ->
                        selectedMember = members[position]
                    }
                    // Falls der Edit-Prefill auf die Mitglieder gewartet hat: jetzt vorwaehlen
                    pendingOrganizerId?.let { preselectOrganizerMember(it) }
                }
            } catch (_: Exception) { }
        }
    }

    /**
     * Waehlt das Mitglied mit der gegebenen ID im Organisator-Dropdown aus (Edit-Prefill).
     * Setzt [selectedMember] und den Anzeigetext. Ist die Mitgliederliste noch nicht
     * geladen, wird die ID in [pendingOrganizerId] gemerkt und die Auswahl nach dem
     * Laden (loadMembers) nachgeholt.
     */
    private fun preselectOrganizerMember(organizerId: String) {
        val member = members.firstOrNull { it.id == organizerId }
        if (member != null) {
            selectedMember = member
            binding.inputOrganizerMember.setText("${member.vorname} ${member.nachname}", false)
            pendingOrganizerId = null
        } else {
            // Mitglieder noch nicht geladen -> nach dem Laden nachholen
            pendingOrganizerId = organizerId
        }
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
                    // Menue-Optionen vorbelegen und Sichtbarkeit (nur "GV") setzen
                    binding.inputMealOptions.setText(e.mealOptions?.joinToString(", ") ?: "")
                    updateMealOptionsVisibility()
                    // Status: API-Wert (englisch) in Anzeige-Wert (deutsch) umwandeln
                    binding.inputStatus.setText(statusApiToDisplay[e.status] ?: "", false)
                    binding.inputLocation.setText(e.location ?: "")
                    // Datum + Zeit: ISO-Rohwert merken und im Schweizer Datums-/Zeitformat anzeigen
                    deadlineIso = e.registrationDeadline
                    binding.inputRegistrationDeadline.setText(DateUtils.formatDateTime(e.registrationDeadline))
                    startIso = e.startDate
                    binding.inputStartDate.setText(DateUtils.formatDateTime(e.startDate))
                    endIso = e.endDate
                    binding.inputEndDate.setText(DateUtils.formatDateTime(e.endDate))
                    binding.inputMaxParticipants.setText(e.maxParticipants?.toString() ?: "")
                    binding.inputCost.setText(e.cost ?: "")
                    binding.inputOrganizerName.setText(e.organizerName ?: "")
                    binding.inputOrganizerEmail.setText(e.organizerEmail ?: "")

                    // Organisator-Modus aus den Event-Daten ableiten:
                    //  - organizer_id gesetzt   -> Mitglied-Modus, Mitglied vorwaehlen
                    //    (wird nachgeholt, falls die Mitgliederliste noch nicht geladen ist)
                    //  - sonst Name/E-Mail da    -> Extern-Modus mit den bestehenden Werten
                    //  - sonst                   -> Standard (Mitglied) beibehalten
                    if (e.organizerId != null) {
                        binding.organizerModeGroup.check(R.id.btnOrganizerMitglied)
                        preselectOrganizerMember(e.organizerId)
                    } else if (!e.organizerEmail.isNullOrBlank() || !e.organizerName.isNullOrBlank()) {
                        binding.organizerModeGroup.check(R.id.btnOrganizerExtern)
                    }
                    updateOrganizerMode()

                    binding.inputDescription.setText(e.description ?: "")

                    // Organisator-Zugang: existiert bereits, wenn eine Event-E-Mail gesetzt ist.
                    // Dann nur den Status anzeigen und den Schalter ausblenden (nicht destruktiv,
                    // damit der bestehende Zugang beim Speichern nicht ueberschrieben wird).
                    if (!e.eventEmail.isNullOrBlank()) {
                        binding.textCreateAccessActive.text = "Organisator-Zugang aktiv: ${e.eventEmail}"
                        binding.textCreateAccessActive.visibility = View.VISIBLE
                        binding.switchCreateAccess.visibility = View.GONE
                        binding.textCreateAccessHint.visibility = View.GONE
                    }

                    // PDF-Aushang: bestehenden Dateinamen merken und in der UI anzeigen
                    // (ermoeglicht das Anzeigen und Entfernen ueber updatePdfUi()).
                    if (!e.pdfFilename.isNullOrBlank()) {
                        existingPdfFilename = e.pdfFilename
                    }
                    updatePdfUi()

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

        // Ausgewaehlte Kategorie: bestimmt registration_required und ob Menue-Optionen gesendet werden
        val selectedCategory = binding.inputCategory.text.toString().trim()

        val maxParticipantsText = binding.inputMaxParticipants.text.toString().trim()

        // Menue-Optionen nur bei Kategorie "GV" senden (kommagetrennt, leere Eintraege
        // verwerfen), sonst null — wie im Web/Desktop.
        val mealOptions = if (selectedCategory == "GV") {
            binding.inputMealOptions.text.toString().split(",").map { it.trim() }.filter { it.isNotBlank() }
        } else {
            null
        }

        // PDF-Aushang beim Speichern (wie im Web/Desktop):
        //  - neue Datei gewaehlt   -> Anhang (base64) + Dateiname senden
        //  - Entfernen vorgemerkt  -> explizit null senden (bestehenden Aushang loeschen)
        //  - sonst                 -> nichts mitschicken
        val pdfAttachmentValue: String?
        val pdfFilenameValue: String?
        when {
            pickedPdfBase64 != null -> {
                pdfAttachmentValue = pickedPdfBase64
                pdfFilenameValue = pickedPdfName
            }
            removePdf && existingPdfFilename != null -> {
                pdfAttachmentValue = null
                pdfFilenameValue = null
            }
            else -> {
                pdfAttachmentValue = null
                pdfFilenameValue = null
            }
        }

        // Schichten fuer neue Events: Nicht-geloeschte Schichten inline mitschicken
        // Bei bestehenden Events werden Schichten separat verwaltet (null setzen)
        val newShifts = if (!isEdit) {
            shiftEntries.filter { !it.deleted }.map { it.data }.ifEmpty { null }
        } else {
            null // Schichten werden beim Bearbeiten separat ueber die API verwaltet
        }

        // Organisator je nach gewaehltem Modus bestimmen:
        //  - Mitglied-Modus mit Auswahl -> organizer_id + Name/E-Mail aus dem Mitglied,
        //    KEIN Token-Zugang (das Backend ueberspringt ihn bei gesetztem organizer_id).
        //  - Extern-Modus (oder Mitglied-Modus ohne Auswahl) -> freie Eingabe aus den
        //    Textfeldern; Organisator-Zugang nur, wenn der Schalter aktiv ist.
        val isMitgliedMode = binding.organizerModeGroup.checkedButtonId == R.id.btnOrganizerMitglied
        val selected = selectedMember
        val organizerIdValue: String?
        val organizerNameValue: String?
        val organizerEmailValue: String?
        val createAccessValue: Boolean?
        if (isMitgliedMode && selected != null) {
            organizerIdValue = selected.id
            organizerNameValue = "${selected.vorname} ${selected.nachname}"
            organizerEmailValue = selected.email
            createAccessValue = null
        } else {
            organizerIdValue = null
            organizerNameValue = binding.inputOrganizerName.text.toString().trim().ifBlank { null }
            organizerEmailValue = binding.inputOrganizerEmail.text.toString().trim().ifBlank { null }
            createAccessValue = if (binding.switchCreateAccess.isChecked) true else null
        }

        // EventCreate-Objekt aus allen Formularfeldern zusammenbauen
        // Leere Felder werden als null gesetzt um sie nicht zu ueberschreiben
        val event = EventCreate(
            title = title,
            subtitle = binding.inputSubtitle.text.toString().trim().ifBlank { null },
            category = selectedCategory.ifBlank { null },
            status = statusApiValue,
            location = binding.inputLocation.text.toString().trim().ifBlank { null },
            // Datum/Zeit direkt aus den gespeicherten ISO-Werten (kein Re-Parsing des Anzeigetexts)
            registrationDeadline = deadlineIso,
            startDate = startIso,
            endDate = endIso,
            maxParticipants = if (maxParticipantsText.isNotBlank()) maxParticipantsText.toIntOrNull() else null,
            cost = binding.inputCost.text.toString().trim().ifBlank { null },
            organizerName = organizerNameValue,
            organizerEmail = organizerEmailValue,
            organizerId = organizerIdValue,
            description = binding.inputDescription.text.toString().trim().ifBlank { null },
            // registration_required aus der Kategorie ableiten (wie im Web/Desktop)
            registrationRequired = regRequiredCategories.contains(selectedCategory),
            mealOptions = mealOptions,
            // Organisator-Zugang: im Mitglied-Modus null (Backend ueberspringt ihn),
            // im Extern-Modus je nach Schalter
            createAccess = createAccessValue,
            pdfAttachment = pdfAttachmentValue,
            pdfFilename = pdfFilenameValue,
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
        // Schritt 1: Event-Grunddaten aktualisieren.
        //
        // Der Standard-Gson des Retrofit-Clients laesst null-Felder weg. Das ist
        // beim Bearbeiten meist erwuenscht (partielles Update — nicht vorbelegte
        // Felder sollen nicht versehentlich geleert werden). Es verhindert aber
        // zwei Dinge, die das Web/Desktop kann:
        //   - "PDF-Aushang entfernen": pdf_attachment/pdf_filename muessen als
        //     explizites null gesendet werden (present+null = leeren im Backend).
        //   - meal_options ausserhalb von GV auf null setzen.
        // Deshalb serialisieren wir hier selbst mit serializeNulls, entfernen dann
        // aber alle null-Felder WIEDER — ausser den bewusst zu leerenden. So bleibt
        // das partielle Update erhalten und "Entfernen" wirkt trotzdem.
        val gson = GsonBuilder().serializeNulls().create()
        val obj = gson.toJsonTree(event).asJsonObject
        obj.remove("shifts") // Schichten werden separat ueber eigene Endpunkte verwaltet

        val keepNulls = mutableSetOf("meal_options")
        if (removePdf && existingPdfFilename != null) {
            keepNulls += "pdf_attachment"
            keepNulls += "pdf_filename"
        }
        // Im Extern-Modus organizer_id bewusst als null senden, damit ein zuvor
        // verknuepftes Mitglied entkoppelt wird (analog meal_options ausserhalb GV).
        if (binding.organizerModeGroup.checkedButtonId != R.id.btnOrganizerMitglied) {
            keepNulls += "organizer_id"
        }
        obj.entrySet()
            .filter { it.value.isJsonNull && it.key !in keepNulls }
            .map { it.key }
            .forEach { obj.remove(it) }

        val body = gson.toJson(obj)
            .toRequestBody("application/json; charset=utf-8".toMediaType())
        val response = ApiModule.eventsApi.updateEventRaw(eventId!!, body)
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
