package ch.fwvraura.vorstand.ui.audit

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.databinding.FragmentAuditBinding
import kotlinx.coroutines.launch

class AuditFragment : Fragment() {

    private var _binding: FragmentAuditBinding? = null
    private val binding get() = _binding!!
    private lateinit var adapter: AuditAdapter

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentAuditBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.toolbar.setNavigationOnClickListener { findNavController().navigateUp() }

        adapter = AuditAdapter()
        binding.auditRecycler.layoutManager = LinearLayoutManager(requireContext())
        binding.auditRecycler.adapter = adapter

        binding.swipeRefresh.setOnRefreshListener { loadAuditLog() }
        binding.retryButton.setOnClickListener { loadAuditLog() }
        loadAuditLog()
    }

    private fun loadAuditLog() {
        viewLifecycleOwner.lifecycleScope.launch {
            binding.swipeRefresh.isRefreshing = true
            binding.errorState.visibility = View.GONE
            try {
                val response = ApiModule.auditApi.getAuditLog(limit = 100)
                if (response.isSuccessful) {
                    val list = response.body() ?: emptyList()
                    adapter.submitList(list)
                    binding.auditRecycler.visibility = if (list.isEmpty()) View.GONE else View.VISIBLE
                    binding.emptyState.visibility = if (list.isEmpty()) View.VISIBLE else View.GONE
                } else {
                    showError("Fehler beim Laden (${response.code()})")
                }
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            }
            binding.swipeRefresh.isRefreshing = false
        }
    }

    private fun showError(message: String) {
        binding.errorText.text = message
        binding.errorState.visibility = View.VISIBLE
        binding.auditRecycler.visibility = View.GONE
        binding.emptyState.visibility = View.GONE
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
