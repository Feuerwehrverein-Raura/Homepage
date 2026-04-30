package ch.fwvraura.members.ui.organizer

import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import ch.fwvraura.members.MembersApp
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.Event
import ch.fwvraura.members.data.model.EventRegistration
import ch.fwvraura.members.databinding.FragmentOrganizerBinding
import ch.fwvraura.members.databinding.ItemOrganizerEventBinding
import ch.fwvraura.members.databinding.ItemRegistrationBinding
import ch.fwvraura.members.util.DateUtils
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.launch

class OrganizerDashboardFragment : Fragment() {

    private var _binding: FragmentOrganizerBinding? = null
    private val binding get() = _binding!!

    private val regToEventId = mutableMapOf<String, String>()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentOrganizerBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.swipeRefresh.setOnRefreshListener { load() }
        load()
    }

    private fun isMemberMode(): Boolean =
        MembersApp.instance.tokenManager.accountType != "organizer"

    private fun load() {
        binding.progress.visibility = View.VISIBLE
        binding.emptyText.visibility = View.GONE
        binding.eventsContainer.removeAllViews()
        regToEventId.clear()
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                if (isMemberMode()) loadAsMember() else loadAsOrganizer()
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            } finally {
                binding.progress.visibility = View.GONE
                binding.swipeRefresh.isRefreshing = false
            }
        }
    }

    private suspend fun loadAsMember() {
        val eventsResp = ApiModule.eventsApi.listOrganizedByMe()
        if (!eventsResp.isSuccessful) {
            showError("Fehler ${eventsResp.code()}")
            return
        }
        val events = eventsResp.body().orEmpty()
        if (events.isEmpty()) {
            binding.emptyText.text = "Du organisierst aktuell kein Event."
            binding.emptyText.visibility = View.VISIBLE
            return
        }
        for (event in events) {
            val regsResp = ApiModule.eventsApi.listOrganizerRegistrations(event.id)
            val regs = if (regsResp.isSuccessful) regsResp.body().orEmpty() else emptyList()
            regs.forEach { regToEventId[it.id] = event.id }
            renderEventCard(event, regs)
        }
    }

    private suspend fun loadAsOrganizer() {
        val response = ApiModule.eventsApi.listMyEventRegistrations()
        if (!response.isSuccessful) {
            showError("Fehler ${response.code()}")
            return
        }
        val regs = response.body().orEmpty()
        // Im organizer-Mode kennen wir den Event-Titel nicht; rendern unter generischem Header.
        renderEventCard(
            Event(id = "my-event", title = "Mein Event"),
            regs
        )
    }

    private fun renderEventCard(event: Event, regs: List<EventRegistration>) {
        val card = ItemOrganizerEventBinding.inflate(layoutInflater, binding.eventsContainer, false)
        card.orgEventTitle.text = event.title
        card.orgEventDate.text = DateUtils.formatDate(event.startDate)
        card.orgEventDate.visibility = if (event.startDate.isNullOrBlank()) View.GONE else View.VISIBLE
        card.orgEventLocation.text = event.location.orEmpty()
        card.orgEventLocation.visibility = if (event.location.isNullOrBlank()) View.GONE else View.VISIBLE

        val pending = regs.count { it.status == "pending" }
        val approved = regs.count { it.status == "approved" }
        card.orgEventStatPending.text = "$pending wartend"
        card.orgEventStatApproved.text = "$approved bestätigt"
        val capLabel = event.maxParticipants?.let { "$approved / $it Plätze" } ?: "${regs.size} total"
        card.orgEventStatCapacity.text = capLabel

        card.orgEventRegsContainer.removeAllViews()
        if (regs.isEmpty()) {
            card.orgEventRegsEmpty.visibility = View.VISIBLE
        } else {
            card.orgEventRegsEmpty.visibility = View.GONE
            val sorted = regs.sortedBy { it.status != "pending" }
            for (r in sorted) {
                val item = ItemRegistrationBinding.inflate(layoutInflater, card.orgEventRegsContainer, false)
                bindRegistration(item, r)
                card.orgEventRegsContainer.addView(item.root)
            }
        }
        binding.eventsContainer.addView(card.root)
    }

    private fun bindRegistration(item: ItemRegistrationBinding, r: EventRegistration) {
        val displayName = listOfNotNull(r.memberVorname, r.memberNachname)
            .joinToString(" ")
            .ifBlank { r.guestName ?: "(unbekannt)" }
        item.regName.text = displayName

        item.regStatus.text = when (r.status) {
            "approved" -> "Genehmigt"
            "rejected" -> "Abgelehnt"
            "pending" -> "Offen"
            else -> r.status ?: ""
        }
        item.regStatus.setTextColor(when (r.status) {
            "approved" -> Color.parseColor("#0F7A2D")
            "rejected" -> Color.parseColor("#B91C1C")
            "pending" -> Color.parseColor("#A05A00")
            else -> Color.parseColor("#4B5563")
        })

        val metaParts = mutableListOf<String>()
        r.guestEmail?.let { metaParts.add(it) }
        r.parsedNotes?.phone?.let { metaParts.add(it) }
        r.parsedNotes?.participants?.let { metaParts.add("Personen: $it") }
        r.parsedNotes?.allergies?.takeIf { it.isNotBlank() }?.let { metaParts.add("Allergien: $it") }
        r.parsedNotes?.notes?.takeIf { it.isNotBlank() }?.let { metaParts.add(it) }
        item.regMeta.text = metaParts.joinToString("\n")
        item.regMeta.visibility = if (metaParts.isEmpty()) View.GONE else View.VISIBLE

        if (r.status == "pending") {
            item.regActions.visibility = View.VISIBLE
            item.btnApprove.setOnClickListener { approve(r) }
            item.btnReject.setOnClickListener { reject(r) }
        } else {
            item.regActions.visibility = View.GONE
        }
    }

    private fun approve(reg: EventRegistration) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = if (isMemberMode()) {
                    val eventId = regToEventId[reg.id] ?: return@launch
                    ApiModule.eventsApi.approveAsOrganizer(eventId, reg.id)
                } else {
                    ApiModule.eventsApi.approveMyEventRegistration(reg.id)
                }
                if (response.isSuccessful) load()
                else showError("Fehler ${response.code()}")
            } catch (e: Exception) { showError("Netzwerkfehler: ${e.message}") }
        }
    }

    private fun reject(reg: EventRegistration) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = if (isMemberMode()) {
                    val eventId = regToEventId[reg.id] ?: return@launch
                    ApiModule.eventsApi.rejectAsOrganizer(eventId, reg.id)
                } else {
                    ApiModule.eventsApi.rejectMyEventRegistration(reg.id)
                }
                if (response.isSuccessful) load()
                else showError("Fehler ${response.code()}")
            } catch (e: Exception) { showError("Netzwerkfehler: ${e.message}") }
        }
    }

    private fun showError(msg: String) {
        Snackbar.make(binding.root, msg, Snackbar.LENGTH_LONG).show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
