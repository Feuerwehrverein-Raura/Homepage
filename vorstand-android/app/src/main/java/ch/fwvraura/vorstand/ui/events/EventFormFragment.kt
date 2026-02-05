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

class EventFormFragment : Fragment() {

    private var _binding: FragmentEventFormBinding? = null
    private val binding get() = _binding!!
    private var eventId: String? = null
    private val isEdit get() = eventId != null

    // Category options
    private val categoryOptions = listOf(
        "Dorffest", "Aufbau", "Abbau", "Ausflug", "Ausflug mit Anmeldung", "Sonstiges"
    )

    // Status: display (German) -> API (English)
    private val statusDisplayOptions = listOf("Geplant", "Bestätigt", "Abgesagt", "Abgeschlossen")
    private val statusApiValues = listOf("planned", "confirmed", "cancelled", "completed")
    private val statusDisplayToApi = statusDisplayOptions.zip(statusApiValues).toMap()
    private val statusApiToDisplay = statusApiValues.zip(statusDisplayOptions).toMap()

    // Bereich options for shifts
    private val bereichOptions = listOf(
        "Bar", "Küche", "Service", "Aufbau", "Abbau", "Technik", "Sonstiges"
    )

    // Shift management
    private data class ShiftEntry(
        val existingId: String? = null,
        var data: ShiftCreate,
        var deleted: Boolean = false
    )

    private val shiftEntries = mutableListOf<ShiftEntry>()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentEventFormBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        eventId = arguments?.getString("eventId")

        binding.toolbar.title = if (isEdit) getString(R.string.event_edit) else getString(R.string.event_new)
        binding.toolbar.setNavigationOnClickListener { findNavController().navigateUp() }

        setupDropdowns()
        setupDatePickers()

        if (isEdit) loadEvent()

        binding.btnAddShift.setOnClickListener { showShiftDialog(null) }
        binding.btnSave.setOnClickListener { saveEvent() }
    }

    // ── Dropdowns ────────────────────────────────────────────────────────────

    private fun setupDropdowns() {
        // Category dropdown
        val categoryAdapter = ArrayAdapter(
            requireContext(),
            android.R.layout.simple_dropdown_item_1line,
            categoryOptions
        )
        binding.inputCategory.setAdapter(categoryAdapter)

        // Status dropdown
        val statusAdapter = ArrayAdapter(
            requireContext(),
            android.R.layout.simple_dropdown_item_1line,
            statusDisplayOptions
        )
        binding.inputStatus.setAdapter(statusAdapter)
        // Default status for new events
        if (!isEdit) {
            binding.inputStatus.setText("Geplant", false)
        }
    }

    // ── Date Pickers ─────────────────────────────────────────────────────────

    private fun setupDatePickers() {
        binding.inputStartDate.setOnClickListener { showDatePicker("Startdatum") { binding.inputStartDate.setText(it) } }
        binding.inputEndDate.setOnClickListener { showDatePicker("Enddatum") { binding.inputEndDate.setText(it) } }
        binding.inputRegistrationDeadline.setOnClickListener { showDatePicker("Anmeldefrist") { binding.inputRegistrationDeadline.setText(it) } }
    }

    private fun showDatePicker(title: String, onDateSelected: (String) -> Unit) {
        val picker = MaterialDatePicker.Builder.datePicker()
            .setTitleText(title)
            .setSelection(MaterialDatePicker.todayInUtcMilliseconds())
            .build()

        picker.addOnPositiveButtonClickListener { millis ->
            val sdf = SimpleDateFormat("dd.MM.yyyy", Locale("de", "CH"))
            sdf.timeZone = TimeZone.getTimeZone("UTC")
            onDateSelected(sdf.format(Date(millis)))
        }

        picker.show(parentFragmentManager, "date_picker_$title")
    }

    // ── Load existing event ──────────────────────────────────────────────────

    private fun loadEvent() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.getEvent(eventId!!)
                if (response.isSuccessful) {
                    val e = response.body() ?: return@launch
                    binding.inputTitle.setText(e.title)
                    binding.inputSubtitle.setText(e.subtitle ?: "")
                    binding.inputCategory.setText(e.category ?: "", false)
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

                    // Load existing shifts
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
                    refreshShiftsUI()
                }
            } catch (_: Exception) { }
        }
    }

    // ── Shift UI ─────────────────────────────────────────────────────────────

    private fun refreshShiftsUI() {
        binding.shiftsContainer.removeAllViews()

        shiftEntries.forEachIndexed { index, entry ->
            if (entry.deleted) return@forEachIndexed
            binding.shiftsContainer.addView(createShiftCard(index, entry))
        }
    }

    private fun createShiftCard(index: Int, entry: ShiftEntry): View {
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

        val content = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(16.dp)
        }

        val shift = entry.data

        // Title row with edit/delete
        val titleRow = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val nameLabel = TextView(requireContext()).apply {
            text = shift.name
            textSize = 16f
            setTextColor(requireContext().getColor(R.color.text_primary))
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        titleRow.addView(nameLabel)

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
            entry.deleted = true
            refreshShiftsUI()
        }
        titleRow.addView(btnDelete)

        content.addView(titleRow)

        // Details
        val details = buildList {
            if (!shift.bereich.isNullOrBlank()) add("Bereich: ${shift.bereich}")
            if (!shift.date.isNullOrBlank()) add("Datum: ${DateUtils.formatDate(shift.date)}")
            val timeRange = listOfNotNull(shift.startTime, shift.endTime).joinToString(" - ")
            if (timeRange.isNotBlank()) add("Zeit: $timeRange")
            if (shift.needed != null) add("Benötigt: ${shift.needed}")
        }

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

    // ── Shift Dialog ─────────────────────────────────────────────────────────

    private fun showShiftDialog(editIndex: Int?) {
        val dialogView = LayoutInflater.from(requireContext())
            .inflate(R.layout.dialog_shift_form, null)

        val inputName = dialogView.findViewById<TextInputEditText>(R.id.shiftInputName)
        val inputBereich = dialogView.findViewById<AutoCompleteTextView>(R.id.shiftInputBereich)
        val inputDate = dialogView.findViewById<TextInputEditText>(R.id.shiftInputDate)
        val inputStartTime = dialogView.findViewById<TextInputEditText>(R.id.shiftInputStartTime)
        val inputEndTime = dialogView.findViewById<TextInputEditText>(R.id.shiftInputEndTime)
        val inputNeeded = dialogView.findViewById<TextInputEditText>(R.id.shiftInputNeeded)
        val inputDescription = dialogView.findViewById<TextInputEditText>(R.id.shiftInputDescription)

        // Setup Bereich dropdown
        val bereichAdapter = ArrayAdapter(
            requireContext(),
            android.R.layout.simple_dropdown_item_1line,
            bereichOptions
        )
        inputBereich.setAdapter(bereichAdapter)

        // Setup date picker
        inputDate.setOnClickListener {
            showDatePicker("Datum") { inputDate.setText(it) }
        }

        // Setup time pickers
        inputStartTime.setOnClickListener {
            TimePickerDialog(requireContext(), { _, h, m ->
                inputStartTime.setText(String.format(Locale.getDefault(), "%02d:%02d", h, m))
            }, 8, 0, true).show()
        }

        inputEndTime.setOnClickListener {
            TimePickerDialog(requireContext(), { _, h, m ->
                inputEndTime.setText(String.format(Locale.getDefault(), "%02d:%02d", h, m))
            }, 17, 0, true).show()
        }

        // Pre-fill if editing
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

        val dialogTitle = if (editIndex != null) "Schicht bearbeiten" else "Neue Schicht"

        AlertDialog.Builder(requireContext())
            .setTitle(dialogTitle)
            .setView(dialogView)
            .setPositiveButton(R.string.save) { dialog, _ ->
                val name = inputName.text.toString().trim()
                if (name.isBlank()) {
                    Snackbar.make(binding.root, "Name ist ein Pflichtfeld", Snackbar.LENGTH_SHORT).show()
                    return@setPositiveButton
                }

                val neededText = inputNeeded.text.toString().trim()
                val dateText = inputDate.text.toString().trim()

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
                    shiftEntries[editIndex] = shiftEntries[editIndex].copy(data = shiftCreate)
                } else {
                    shiftEntries.add(ShiftEntry(data = shiftCreate))
                }

                refreshShiftsUI()
                dialog.dismiss()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    // ── Save ─────────────────────────────────────────────────────────────────

    private fun saveEvent() {
        val title = binding.inputTitle.text.toString().trim()
        if (title.isBlank()) {
            Snackbar.make(binding.root, "Titel ist ein Pflichtfeld", Snackbar.LENGTH_SHORT).show()
            return
        }

        val selectedStatusDisplay = binding.inputStatus.text.toString().trim()
        val statusApiValue = statusDisplayToApi[selectedStatusDisplay] ?: selectedStatusDisplay.ifBlank { null }

        val maxParticipantsText = binding.inputMaxParticipants.text.toString().trim()
        val registrationDeadlineText = binding.inputRegistrationDeadline.text.toString().trim()

        // Build shifts list for new events (sent inline)
        val newShifts = if (!isEdit) {
            shiftEntries.filter { !it.deleted }.map { it.data }.ifEmpty { null }
        } else {
            null // shifts are managed separately when editing
        }

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

        binding.btnSave.isEnabled = false
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                if (isEdit) {
                    saveEditedEvent(event)
                } else {
                    saveNewEvent(event)
                }
            } catch (e: Exception) {
                Snackbar.make(binding.root, "Netzwerkfehler: ${e.message}", Snackbar.LENGTH_LONG).show()
                binding.btnSave.isEnabled = true
            }
        }
    }

    private suspend fun saveNewEvent(event: EventCreate) {
        val response = ApiModule.eventsApi.createEvent(event)
        if (response.isSuccessful) {
            findNavController().navigateUp()
        } else {
            Snackbar.make(binding.root, "Fehler (${response.code()})", Snackbar.LENGTH_LONG).show()
            binding.btnSave.isEnabled = true
        }
    }

    private suspend fun saveEditedEvent(event: EventCreate) {
        // 1. Update the event itself
        val response = ApiModule.eventsApi.updateEvent(eventId!!, event)
        if (!response.isSuccessful) {
            Snackbar.make(binding.root, "Fehler (${response.code()})", Snackbar.LENGTH_LONG).show()
            binding.btnSave.isEnabled = true
            return
        }

        // 2. Handle shift changes
        try {
            for (entry in shiftEntries) {
                when {
                    // Delete existing shift that was marked for deletion
                    entry.deleted && entry.existingId != null -> {
                        ApiModule.eventsApi.deleteShift(entry.existingId)
                    }
                    // Update existing shift
                    !entry.deleted && entry.existingId != null -> {
                        val shiftWithEventId = entry.data.copy(eventId = eventId)
                        ApiModule.eventsApi.updateShift(entry.existingId, shiftWithEventId)
                    }
                    // Create new shift
                    !entry.deleted && entry.existingId == null -> {
                        val shiftWithEventId = entry.data.copy(eventId = eventId)
                        ApiModule.eventsApi.createShift(shiftWithEventId)
                    }
                }
            }
        } catch (e: Exception) {
            Snackbar.make(binding.root, "Event gespeichert, aber Fehler bei Schichten: ${e.message}", Snackbar.LENGTH_LONG).show()
            binding.btnSave.isEnabled = true
            return
        }

        findNavController().navigateUp()
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private val Int.dp: Int
        get() = (this * resources.displayMetrics.density).toInt()

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
