package ch.fwvraura.vorstand.ui.registrations

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.ApproveRequest
import ch.fwvraura.vorstand.data.model.MemberRegistration
import ch.fwvraura.vorstand.data.model.RejectRequest
import ch.fwvraura.vorstand.databinding.FragmentRegistrationsBinding
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.launch

class RegistrationsFragment : Fragment() {

    private var _binding: FragmentRegistrationsBinding? = null
    private val binding get() = _binding!!
    private lateinit var adapter: RegistrationsAdapter

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentRegistrationsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.toolbar.setNavigationOnClickListener { findNavController().navigateUp() }

        adapter = RegistrationsAdapter(
            onApprove = { reg -> approveRegistration(reg) },
            onReject = { reg -> rejectRegistration(reg) }
        )
        binding.registrationsRecycler.layoutManager = LinearLayoutManager(requireContext())
        binding.registrationsRecycler.adapter = adapter

        binding.swipeRefresh.setOnRefreshListener { loadRegistrations() }
        loadRegistrations()
    }

    private fun loadRegistrations() {
        viewLifecycleOwner.lifecycleScope.launch {
            binding.swipeRefresh.isRefreshing = true
            try {
                val response = ApiModule.registrationsApi.getRegistrations(status = "pending")
                if (response.isSuccessful) {
                    adapter.submitList(response.body() ?: emptyList())
                }
            } catch (_: Exception) { }
            binding.swipeRefresh.isRefreshing = false
        }
    }

    private fun approveRegistration(reg: MemberRegistration) {
        val statuses = arrayOf("Aktiv", "Passiv")
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("${reg.fullName} genehmigen")
            .setItems(statuses) { _, which ->
                viewLifecycleOwner.lifecycleScope.launch {
                    try {
                        val response = ApiModule.registrationsApi.approve(
                            reg.id, ApproveRequest(statuses[which])
                        )
                        if (response.isSuccessful) {
                            Snackbar.make(binding.root, "Antrag genehmigt", Snackbar.LENGTH_SHORT).show()
                            loadRegistrations()
                        }
                    } catch (_: Exception) { }
                }
            }
            .show()
    }

    private fun rejectRegistration(reg: MemberRegistration) {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("${reg.fullName} ablehnen?")
            .setPositiveButton("Ablehnen") { _, _ ->
                viewLifecycleOwner.lifecycleScope.launch {
                    try {
                        val response = ApiModule.registrationsApi.reject(reg.id, RejectRequest())
                        if (response.isSuccessful) {
                            Snackbar.make(binding.root, "Antrag abgelehnt", Snackbar.LENGTH_SHORT).show()
                            loadRegistrations()
                        }
                    } catch (_: Exception) { }
                }
            }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
