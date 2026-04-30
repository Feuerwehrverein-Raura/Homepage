package ch.fwvraura.members.ui.organizer

import android.app.Dialog
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.widget.ArrayAdapter
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.DialogFragment
import androidx.lifecycle.lifecycleScope
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.DirectoryEntry
import ch.fwvraura.members.data.model.OrganizerAddRegistrationRequest
import ch.fwvraura.members.databinding.DialogAddRegistrationBinding
import com.google.android.material.tabs.TabLayout
import kotlinx.coroutines.launch

/**
 * Dialog fuer den Organisator: manuelle Anmeldung erstellen, z.B. fuer Gaeste die
 * telefonisch melden. Zwei Modi: Mitglied (Picker aus /members/directory) oder
 * Gast (freie Eingabefelder). Status wird vom Backend direkt auf 'approved' gesetzt.
 */
class AddRegistrationDialog : DialogFragment() {

    private var _binding: DialogAddRegistrationBinding? = null
    private val binding get() = _binding!!

    private var members: List<DirectoryEntry> = emptyList()
    private var selectedMemberId: String? = null

    /** Nach erfolgreichem Hinzufuegen aufgerufen, damit das Dashboard neu lädt. */
    var onAdded: (() -> Unit)? = null
    private var eventId: String = ""

    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        eventId = arguments?.getString(ARG_EVENT_ID).orEmpty()
        _binding = DialogAddRegistrationBinding.inflate(LayoutInflater.from(requireContext()))
        setupTabs()
        loadDirectory()

        return AlertDialog.Builder(requireContext())
            .setTitle("Anmeldung hinzufügen")
            .setView(binding.root)
            .setPositiveButton("Hinzufügen", null) // override below to keep dialog open on validation error
            .setNegativeButton("Abbrechen", null)
            .create().also { dlg ->
                dlg.setOnShowListener {
                    dlg.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                        submit(dlg)
                    }
                }
            }
    }

    private fun setupTabs() {
        binding.addRegTabs.addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: TabLayout.Tab) {
                binding.paneMember.visibility = if (tab.position == 0) View.VISIBLE else View.GONE
                binding.paneGuest.visibility = if (tab.position == 1) View.VISIBLE else View.GONE
            }
            override fun onTabUnselected(tab: TabLayout.Tab) {}
            override fun onTabReselected(tab: TabLayout.Tab) {}
        })

        binding.memberPicker.setOnItemClickListener { _, _, position, _ ->
            val label = binding.memberPicker.adapter.getItem(position) as String
            selectedMemberId = members.firstOrNull { displayName(it) == label }?.id
        }
        binding.memberPicker.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                // Wenn der User den Text manuell ändert, Auswahl invalidieren
                val match = members.firstOrNull { displayName(it) == s?.toString() }
                selectedMemberId = match?.id
            }
            override fun afterTextChanged(s: android.text.Editable?) {}
        })
    }

    private fun loadDirectory() {
        lifecycleScope.launch {
            try {
                val resp = ApiModule.membersApi.getDirectory()
                if (resp.isSuccessful) {
                    members = resp.body().orEmpty().sortedBy { (it.nachname ?: "") + " " + (it.vorname ?: "") }
                    val labels = members.map(::displayName)
                    val adapter = ArrayAdapter(requireContext(), android.R.layout.simple_dropdown_item_1line, labels)
                    binding.memberPicker.setAdapter(adapter)
                }
            } catch (_: Exception) { /* ignorieren — User kann Gast-Modus nutzen */ }
        }
    }

    private fun displayName(e: DirectoryEntry): String =
        listOfNotNull(e.vorname, e.nachname).joinToString(" ").ifBlank { e.email.orEmpty() }

    private fun submit(dlg: AlertDialog) {
        val isMemberMode = binding.addRegTabs.selectedTabPosition == 0
        val participants = binding.participants.text?.toString()?.toIntOrNull() ?: 1
        val notes = binding.notes.text?.toString()?.trim()?.ifBlank { null }

        val body = if (isMemberMode) {
            val mid = selectedMemberId
            if (mid.isNullOrBlank()) {
                binding.memberHint.text = "Bitte ein Mitglied auswählen."
                return
            }
            OrganizerAddRegistrationRequest(memberId = mid, participants = participants, notes = notes)
        } else {
            val name = binding.guestName.text?.toString()?.trim().orEmpty()
            if (name.isBlank()) {
                binding.guestName.error = "Pflichtfeld"
                return
            }
            OrganizerAddRegistrationRequest(
                guestName = name,
                guestEmail = binding.guestEmail.text?.toString()?.trim()?.ifBlank { null },
                guestPhone = binding.guestPhone.text?.toString()?.trim()?.ifBlank { null },
                participants = participants,
                notes = notes
            )
        }

        dlg.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = false
        lifecycleScope.launch {
            try {
                val resp = ApiModule.eventsApi.addRegistrationAsOrganizer(eventId, body)
                if (resp.isSuccessful && resp.body()?.success == true) {
                    onAdded?.invoke()
                    dismiss()
                } else {
                    val msg = resp.body()?.message ?: resp.errorBody()?.string() ?: "Fehler ${resp.code()}"
                    com.google.android.material.snackbar.Snackbar
                        .make(binding.root, msg, com.google.android.material.snackbar.Snackbar.LENGTH_LONG).show()
                    dlg.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = true
                }
            } catch (e: Exception) {
                com.google.android.material.snackbar.Snackbar
                    .make(binding.root, "Netzwerkfehler: ${e.message}", com.google.android.material.snackbar.Snackbar.LENGTH_LONG).show()
                dlg.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = true
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    companion object {
        private const val ARG_EVENT_ID = "event_id"
        fun newInstance(eventId: String): AddRegistrationDialog = AddRegistrationDialog().apply {
            arguments = Bundle().apply { putString(ARG_EVENT_ID, eventId) }
        }
    }
}
