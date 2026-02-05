package ch.fwvraura.vorstand.ui.events

import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.AutoCompleteTextView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.Event
import ch.fwvraura.vorstand.data.model.EventRegistration
import ch.fwvraura.vorstand.data.model.Member
import ch.fwvraura.vorstand.data.model.Shift
import ch.fwvraura.vorstand.databinding.FragmentEventRegistrationsBinding
import ch.fwvraura.vorstand.util.DateUtils
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import kotlinx.coroutines.launch

class EventRegistrationsFragment : Fragment() {

    private var _binding: FragmentEventRegistrationsBinding? = null
    private val binding get() = _binding!!
    private var eventId: String? = null

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentEventRegistrationsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        eventId = arguments?.getString("eventId")

        binding.toolbar.setNavigationOnClickListener { findNavController().navigateUp() }
        binding.swipeRefresh.setOnRefreshListener { loadEvent() }

        loadEvent()
    }

    private fun loadEvent() {
        viewLifecycleOwner.lifecycleScope.launch {
            binding.swipeRefresh.isRefreshing = true
            try {
                val response = ApiModule.eventsApi.getEvent(eventId!!)
                if (response.isSuccessful) {
                    val event = response.body() ?: return@launch
                    binding.toolbar.title = event.title
                    displayShifts(event)
                    displayDirectRegistrations(event)
                }
            } catch (_: Exception) { }
            binding.swipeRefresh.isRefreshing = false
        }
    }

    private fun displayShifts(event: Event) {
        binding.shiftsContainer.removeAllViews()
        val shifts = event.shifts ?: return

        for (shift in shifts) {
            val shiftView = layoutInflater.inflate(R.layout.item_shift_registrations, binding.shiftsContainer, false)
            val title = shiftView.findViewById<TextView>(R.id.shiftTitle)
            val info = shiftView.findViewById<TextView>(R.id.shiftInfo)
            val recycler = shiftView.findViewById<RecyclerView>(R.id.registrationsRecycler)
            val btnAddPerson = shiftView.findViewById<MaterialButton>(R.id.btnAddPerson)

            title.text = shift.name
            val regs = shift.registrations
            val registered = regs?.approvedCount ?: regs?.approved?.size ?: 0
            val needed = shift.needed ?: 0
            info.text = "$registered / $needed | ${DateUtils.formatDate(shift.date)} ${shift.startTime ?: ""}-${shift.endTime ?: ""}"

            val allRegistrations = (regs?.approved ?: emptyList()) + (regs?.pending ?: emptyList())
            recycler.layoutManager = LinearLayoutManager(requireContext())
            recycler.adapter = ShiftRegistrationsAdapter(
                registrations = allRegistrations,
                onApprove = { reg -> approveRegistration(reg.id) },
                onReject = { reg -> rejectRegistration(reg.id) }
            )

            btnAddPerson.setOnClickListener { showAddPersonDialog(shift) }

            binding.shiftsContainer.addView(shiftView)
        }
    }

    private fun displayDirectRegistrations(event: Event) {
        val direct = event.directRegistrations
        val allDirect = (direct?.approved ?: emptyList()) + (direct?.pending ?: emptyList())

        if (allDirect.isEmpty()) {
            binding.directRegistrationsHeader.visibility = View.GONE
            binding.directRegistrationsContainer.visibility = View.GONE
            return
        }

        binding.directRegistrationsHeader.visibility = View.VISIBLE
        binding.directRegistrationsContainer.visibility = View.VISIBLE
        binding.directRegistrationsContainer.removeAllViews()

        for (reg in allDirect) {
            val itemView = layoutInflater.inflate(R.layout.item_shift_registration, binding.directRegistrationsContainer, false)
            val name = itemView.findViewById<TextView>(R.id.regName)
            val status = itemView.findViewById<TextView>(R.id.regStatus)
            val btnApprove = itemView.findViewById<View>(R.id.btnApprove)
            val btnReject = itemView.findViewById<View>(R.id.btnReject)

            name.text = reg.displayName

            val isPending = reg.status == "pending"
            val isApproved = reg.status == "approved"

            status.text = when (reg.status) {
                "approved" -> "Genehmigt"
                "pending" -> "Ausstehend"
                else -> reg.status ?: "Ausstehend"
            }

            status.setTextColor(
                when {
                    isApproved -> Color.parseColor("#10B981")
                    isPending -> Color.parseColor("#F59E0B")
                    else -> Color.parseColor("#6B7280")
                }
            )

            btnApprove.visibility = if (isPending) View.VISIBLE else View.GONE
            btnReject.visibility = if (isPending) View.VISIBLE else View.GONE

            btnApprove.setOnClickListener { approveRegistration(reg.id) }
            btnReject.setOnClickListener { rejectRegistration(reg.id) }

            binding.directRegistrationsContainer.addView(itemView)
        }
    }

    private fun approveRegistration(registrationId: String) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.approveRegistration(registrationId)
                if (response.isSuccessful) {
                    Toast.makeText(requireContext(), "Anmeldung genehmigt", Toast.LENGTH_SHORT).show()
                    loadEvent()
                } else {
                    Toast.makeText(requireContext(), "Fehler beim Genehmigen", Toast.LENGTH_SHORT).show()
                }
            } catch (_: Exception) {
                Toast.makeText(requireContext(), "Fehler beim Genehmigen", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun rejectRegistration(registrationId: String) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.rejectRegistration(registrationId)
                if (response.isSuccessful) {
                    Toast.makeText(requireContext(), "Anmeldung abgelehnt", Toast.LENGTH_SHORT).show()
                    loadEvent()
                } else {
                    Toast.makeText(requireContext(), "Fehler beim Ablehnen", Toast.LENGTH_SHORT).show()
                }
            } catch (_: Exception) {
                Toast.makeText(requireContext(), "Fehler beim Ablehnen", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun showAddPersonDialog(shift: Shift) {
        val dialogView = layoutInflater.inflate(R.layout.dialog_add_person, null)
        val toggleGroup = dialogView.findViewById<MaterialButtonToggleGroup>(R.id.toggleGroup)
        val btnMitglied = dialogView.findViewById<MaterialButton>(R.id.btnMitglied)
        val btnGast = dialogView.findViewById<MaterialButton>(R.id.btnGast)
        val memberSection = dialogView.findViewById<LinearLayout>(R.id.memberSection)
        val guestSection = dialogView.findViewById<LinearLayout>(R.id.guestSection)
        val memberDropdown = dialogView.findViewById<AutoCompleteTextView>(R.id.memberDropdown)
        val guestName = dialogView.findViewById<com.google.android.material.textfield.TextInputEditText>(R.id.guestName)
        val guestEmail = dialogView.findViewById<com.google.android.material.textfield.TextInputEditText>(R.id.guestEmail)
        val guestPhone = dialogView.findViewById<com.google.android.material.textfield.TextInputEditText>(R.id.guestPhone)

        var members: List<Member> = emptyList()
        var selectedMember: Member? = null

        // Default: Mitglied tab selected
        toggleGroup.check(R.id.btnMitglied)

        toggleGroup.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (isChecked) {
                when (checkedId) {
                    R.id.btnMitglied -> {
                        memberSection.visibility = View.VISIBLE
                        guestSection.visibility = View.GONE
                    }
                    R.id.btnGast -> {
                        memberSection.visibility = View.GONE
                        guestSection.visibility = View.VISIBLE
                    }
                }
            }
        }

        // Load members for dropdown
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.membersApi.getMembers()
                if (response.isSuccessful) {
                    members = response.body() ?: emptyList()
                    val memberNames = members.map { "${it.vorname} ${it.nachname}" }
                    val adapter = ArrayAdapter(
                        requireContext(),
                        android.R.layout.simple_dropdown_item_1line,
                        memberNames
                    )
                    memberDropdown.setAdapter(adapter)
                    memberDropdown.setOnItemClickListener { _, _, position, _ ->
                        selectedMember = members[position]
                    }
                }
            } catch (_: Exception) { }
        }

        val dialog = MaterialAlertDialogBuilder(requireContext())
            .setTitle("Person hinzufügen – ${shift.name}")
            .setView(dialogView)
            .setPositiveButton("Speichern", null)
            .setNegativeButton("Abbrechen", null)
            .create()

        dialog.setOnShowListener {
            dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val isMember = toggleGroup.checkedButtonId == R.id.btnMitglied

                if (isMember) {
                    if (selectedMember == null) {
                        Toast.makeText(requireContext(), "Bitte ein Mitglied auswählen", Toast.LENGTH_SHORT).show()
                        return@setOnClickListener
                    }
                    val m = selectedMember!!
                    val body = mutableMapOf<String, Any>(
                        "event_id" to shift.eventId,
                        "shift_ids" to listOf(shift.id),
                        "status" to "approved",
                        "member_id" to m.id,
                        "guest_name" to "${m.vorname} ${m.nachname}"
                    )
                    if (!m.email.isNullOrEmpty()) body["guest_email"] = m.email
                    createRegistration(body, dialog)
                } else {
                    val name = guestName.text?.toString()?.trim() ?: ""
                    if (name.isEmpty()) {
                        Toast.makeText(requireContext(), "Bitte einen Namen eingeben", Toast.LENGTH_SHORT).show()
                        return@setOnClickListener
                    }
                    val body = mutableMapOf<String, Any>(
                        "event_id" to shift.eventId,
                        "shift_ids" to listOf(shift.id),
                        "status" to "approved",
                        "guest_name" to name
                    )
                    val email = guestEmail.text?.toString()?.trim() ?: ""
                    if (email.isNotEmpty()) body["guest_email"] = email
                    val phone = guestPhone.text?.toString()?.trim() ?: ""
                    if (phone.isNotEmpty()) body["phone"] = phone
                    createRegistration(body, dialog)
                }
            }
        }

        dialog.show()
    }

    private fun createRegistration(body: Map<String, Any>, dialog: androidx.appcompat.app.AlertDialog) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.createRegistration(body)
                if (response.isSuccessful) {
                    Toast.makeText(requireContext(), "Person hinzugefügt", Toast.LENGTH_SHORT).show()
                    dialog.dismiss()
                    loadEvent()
                } else {
                    Toast.makeText(requireContext(), "Fehler beim Hinzufügen", Toast.LENGTH_SHORT).show()
                }
            } catch (_: Exception) {
                Toast.makeText(requireContext(), "Fehler beim Hinzufügen", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
