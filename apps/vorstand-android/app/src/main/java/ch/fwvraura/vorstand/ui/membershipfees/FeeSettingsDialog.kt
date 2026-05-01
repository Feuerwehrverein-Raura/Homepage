package ch.fwvraura.vorstand.ui.membershipfees

import android.app.Dialog
import android.os.Bundle
import android.view.LayoutInflater
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.DialogFragment
import androidx.lifecycle.lifecycleScope
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.FeeSettingsUpsert
import ch.fwvraura.vorstand.data.model.MembershipFeeSettings
import ch.fwvraura.vorstand.databinding.DialogFeeSettingsBinding
import com.google.android.material.datepicker.MaterialDatePicker
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Dialog zum Bearbeiten der Jahres-Beitragseinstellungen
 * (Betrag, GV-Datum, Faelligkeit, Beschreibung).
 *
 * Beim Oeffnen werden die existierenden Settings geladen (404 = leer
 * lassen). Beim Speichern Upsert via POST /membership-fees/settings.
 */
class FeeSettingsDialog : DialogFragment() {

    private var _binding: DialogFeeSettingsBinding? = null
    private val binding get() = _binding!!

    private val swissDate = SimpleDateFormat("dd.MM.yyyy", Locale.GERMAN).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
    private val isoDate = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
    private var dueDateIso: String? = null

    var onSaved: (() -> Unit)? = null
    private var year: Int = 0

    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        year = arguments?.getInt(ARG_YEAR) ?: 0
        _binding = DialogFeeSettingsBinding.inflate(LayoutInflater.from(requireContext()))
        binding.dialogYear.text = "Einstellungen für $year"
        binding.inputDueDate.setOnClickListener { showDatePicker() }

        val dlg = AlertDialog.Builder(requireContext())
            .setTitle("Beitragseinstellungen")
            .setView(binding.root)
            .setPositiveButton("Speichern", null)
            .setNegativeButton("Abbrechen", null)
            .create()
        dlg.setOnShowListener {
            dlg.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener { submit(dlg) }
        }
        loadExisting()
        return dlg
    }

    private fun loadExisting() {
        lifecycleScope.launch {
            try {
                val resp = ApiModule.membershipFeesApi.getSettings(year)
                if (resp.isSuccessful) fillForm(resp.body())
            } catch (_: Exception) { /* leerer Form */ }
        }
    }

    private fun fillForm(s: MembershipFeeSettings?) {
        if (s == null) return
        binding.inputAmount.setText(s.amount.orEmpty())
        binding.inputGvDate.setText(s.gvDate.orEmpty())
        binding.inputDescription.setText(s.description.orEmpty())
        if (!s.dueDate.isNullOrBlank()) {
            dueDateIso = s.dueDate.substring(0, minOf(10, s.dueDate.length))
            try {
                val d = isoDate.parse(dueDateIso!!)
                binding.inputDueDate.setText(swissDate.format(d ?: Date()))
            } catch (_: Exception) {
                binding.inputDueDate.setText(dueDateIso)
            }
        }
    }

    private fun showDatePicker() {
        val initialMs = dueDateIso?.let {
            try { isoDate.parse(it)?.time } catch (_: Exception) { null }
        } ?: MaterialDatePicker.todayInUtcMilliseconds()

        val picker = MaterialDatePicker.Builder.datePicker()
            .setTitleText("Fälligkeitsdatum")
            .setSelection(initialMs)
            .build()
        picker.addOnPositiveButtonClickListener { ms ->
            val date = Date(ms)
            dueDateIso = isoDate.format(date)
            binding.inputDueDate.setText(swissDate.format(date))
        }
        picker.show(parentFragmentManager, "due_picker")
    }

    private fun submit(dlg: AlertDialog) {
        val amount = binding.inputAmount.text?.toString()?.trim().orEmpty()
        if (amount.isBlank()) {
            binding.inputAmount.error = "Pflichtfeld"
            return
        }
        // Kommas werden vom Backend nicht akzeptiert — auf Punkt normieren
        val amountNorm = amount.replace(',', '.')

        val body = FeeSettingsUpsert(
            year = year,
            amount = amountNorm,
            gvDate = binding.inputGvDate.text?.toString()?.trim()?.ifBlank { null },
            dueDate = dueDateIso,
            description = binding.inputDescription.text?.toString()?.trim()?.ifBlank { null }
        )

        dlg.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = false
        lifecycleScope.launch {
            try {
                val resp = ApiModule.membershipFeesApi.upsertSettings(body)
                if (resp.isSuccessful) {
                    onSaved?.invoke()
                    dismiss()
                } else {
                    Snackbar.make(binding.root, "Fehler ${resp.code()}", Snackbar.LENGTH_LONG).show()
                    dlg.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = true
                }
            } catch (e: Exception) {
                Snackbar.make(binding.root, "Netzwerkfehler: ${e.message}", Snackbar.LENGTH_LONG).show()
                dlg.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = true
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    companion object {
        private const val ARG_YEAR = "year"
        fun newInstance(year: Int) = FeeSettingsDialog().apply {
            arguments = Bundle().apply { putInt(ARG_YEAR, year) }
        }
    }
}
