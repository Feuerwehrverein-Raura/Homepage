package ch.fwvraura.members.ui.organizer

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import ch.fwvraura.members.MembersApp
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.EventRegistration
import ch.fwvraura.members.databinding.FragmentOrganizerBinding
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.launch

/**
 * Dashboard fuer Veranstaltungs-Organisatoren — zeigt alle Anmeldungen fuer das
 * Event, das via Organisator-Login authentifiziert wurde.
 */
class OrganizerDashboardFragment : Fragment() {

    private var _binding: FragmentOrganizerBinding? = null
    private val binding get() = _binding!!

    private lateinit var adapter: RegistrationsAdapter

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

        if (MembersApp.instance.tokenManager.accountType != "organizer") {
            binding.emptyText.text = "Bitte als Organisator einloggen, um Anmeldungen zu sehen."
            binding.emptyText.visibility = View.VISIBLE
            return
        }
        loadRegistrations()
    }

    private fun loadRegistrations() {
        binding.progress.visibility = View.VISIBLE
        binding.emptyText.visibility = View.GONE
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.listMyEventRegistrations()
                if (response.isSuccessful) {
                    val regs = response.body().orEmpty()
                        .sortedBy { it.status != "pending" }
                    adapter.submitList(regs)
                    binding.emptyText.visibility = if (regs.isEmpty()) View.VISIBLE else View.GONE
                    if (regs.isEmpty()) binding.emptyText.text = "Noch keine Anmeldungen."
                } else {
                    showError("Fehler ${response.code()}")
                }
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            } finally {
                binding.progress.visibility = View.GONE
                binding.swipeRefresh.isRefreshing = false
            }
        }
    }

    private fun approve(reg: EventRegistration) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.approveMyEventRegistration(reg.id)
                if (response.isSuccessful) loadRegistrations()
                else showError("Fehler ${response.code()}")
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            }
        }
    }

    private fun reject(reg: EventRegistration) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.rejectMyEventRegistration(reg.id)
                if (response.isSuccessful) loadRegistrations()
                else showError("Fehler ${response.code()}")
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            }
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
