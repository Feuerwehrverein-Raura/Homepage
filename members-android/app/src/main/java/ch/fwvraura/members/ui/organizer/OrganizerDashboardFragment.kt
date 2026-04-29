package ch.fwvraura.members.ui.organizer

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import ch.fwvraura.members.MembersApp
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.Event
import ch.fwvraura.members.data.model.EventRegistration
import ch.fwvraura.members.databinding.FragmentOrganizerBinding
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.launch

/**
 * Dashboard fuer Veranstaltungs-Organisatoren. Unterstuetzt zwei Modi:
 *
 *  - accountType == "organizer": Login per Event-E-Mail/Passwort, ein Event,
 *    nutzt /events/my-event/... Endpoints.
 *  - accountType == "member": Mitglied das per E-Mail-Match Organisator von
 *    einem oder mehreren Events ist, nutzt /events/organized-by-me und
 *    /events/:id/organizer-registrations + /...as-organizer.
 */
class OrganizerDashboardFragment : Fragment() {

    private var _binding: FragmentOrganizerBinding? = null
    private val binding get() = _binding!!

    private lateinit var adapter: RegistrationsAdapter
    private val regToEventId = mutableMapOf<String, String>()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentOrganizerBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        adapter = RegistrationsAdapter(
            onApprove = { reg -> approve(reg) },
            onReject = { reg -> reject(reg) }
        )
        binding.regsRecycler.layoutManager = LinearLayoutManager(requireContext())
        binding.regsRecycler.adapter = adapter
        binding.swipeRefresh.setOnRefreshListener { loadRegistrations() }
        loadRegistrations()
    }

    private fun isMemberMode(): Boolean =
        MembersApp.instance.tokenManager.accountType != "organizer"

    private fun loadRegistrations() {
        binding.progress.visibility = View.VISIBLE
        binding.emptyText.visibility = View.GONE
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val regs = if (isMemberMode()) loadAsMember() else loadAsOrganizer()
                val sorted = regs.sortedBy { it.status != "pending" }
                adapter.submitList(sorted)
                binding.emptyText.visibility = if (sorted.isEmpty()) View.VISIBLE else View.GONE
                if (sorted.isEmpty()) binding.emptyText.text = "Noch keine Anmeldungen."
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            } finally {
                binding.progress.visibility = View.GONE
                binding.swipeRefresh.isRefreshing = false
            }
        }
    }

    private suspend fun loadAsOrganizer(): List<EventRegistration> {
        val response = ApiModule.eventsApi.listMyEventRegistrations()
        if (!response.isSuccessful) {
            showError("Fehler ${response.code()}")
            return emptyList()
        }
        return response.body().orEmpty()
    }

    private suspend fun loadAsMember(): List<EventRegistration> {
        val eventsResp = ApiModule.eventsApi.listOrganizedByMe()
        if (!eventsResp.isSuccessful) {
            showError("Fehler ${eventsResp.code()}")
            return emptyList()
        }
        val events: List<Event> = eventsResp.body().orEmpty()
        if (events.isEmpty()) {
            binding.emptyText.text = "Du organisierst aktuell kein Event."
            return emptyList()
        }
        regToEventId.clear()
        val all = mutableListOf<EventRegistration>()
        for (e in events) {
            val regs = ApiModule.eventsApi.listOrganizerRegistrations(e.id)
            if (regs.isSuccessful) {
                regs.body()?.forEach { r ->
                    regToEventId[r.id] = e.id
                    all.add(r)
                }
            }
        }
        return all
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
                if (response.isSuccessful) loadRegistrations()
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
                if (response.isSuccessful) loadRegistrations()
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
