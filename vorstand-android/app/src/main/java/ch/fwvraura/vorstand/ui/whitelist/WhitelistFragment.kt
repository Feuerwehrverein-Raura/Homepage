package ch.fwvraura.vorstand.ui.whitelist

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.core.view.isVisible
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.databinding.FragmentWhitelistBinding
import ch.fwvraura.vorstand.databinding.DialogAddIpBinding
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/**
 * Fragment für die IP-Whitelist-Verwaltung des Kassensystems.
 */
class WhitelistFragment : Fragment() {

    private var _binding: FragmentWhitelistBinding? = null
    private val binding get() = _binding!!

    private val viewModel: WhitelistViewModel by viewModels()
    private lateinit var adapter: WhitelistAdapter

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentWhitelistBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        setupRecyclerView()
        setupSwipeRefresh()
        setupToggle()
        setupButtons()
        observeViewModel()

        // Daten laden
        viewModel.loadAll()
    }

    private fun setupRecyclerView() {
        adapter = WhitelistAdapter { entry ->
            showDeleteConfirmation(entry.id, entry.ipAddress)
        }
        binding.recyclerView.layoutManager = LinearLayoutManager(requireContext())
        binding.recyclerView.adapter = adapter
    }

    private fun setupSwipeRefresh() {
        binding.swipeRefresh.setOnRefreshListener {
            viewModel.loadAll()
        }
    }

    private fun setupToggle() {
        binding.switchEnabled.setOnCheckedChangeListener { _, isChecked ->
            // Nur wenn der User tatsächlich geklickt hat (nicht programmatisch)
            if (binding.switchEnabled.isPressed) {
                viewModel.setEnabled(isChecked)
            }
        }
    }

    private fun setupButtons() {
        binding.btnAddMyIp.setOnClickListener {
            viewModel.addMyIp("Vorstand App")
        }

        binding.fabAdd.setOnClickListener {
            showAddIpDialog()
        }
    }

    private fun observeViewModel() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.entries.collectLatest { entries ->
                adapter.submitList(entries)
                binding.emptyState.isVisible = entries.isEmpty()
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.isEnabled.collectLatest { enabled ->
                binding.switchEnabled.isChecked = enabled
                binding.statusText.text = if (enabled) {
                    getString(R.string.whitelist_enabled)
                } else {
                    getString(R.string.whitelist_disabled)
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.myIp.collectLatest { ip ->
                binding.myIpText.text = ip ?: "..."
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.myIpStatus.collectLatest { status ->
                if (status != null) {
                    updateMyIpStatus(status.whitelisted, status.isPermanent, status.expiresAt)
                } else {
                    binding.myIpStatusIcon.setImageResource(R.drawable.ic_help)
                    binding.myIpStatusIcon.setColorFilter(
                        ContextCompat.getColor(requireContext(), R.color.text_secondary)
                    )
                    binding.myIpStatusText.text = ""
                    binding.btnAddMyIp.isVisible = true
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.isLoading.collectLatest { loading ->
                binding.swipeRefresh.isRefreshing = loading
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.error.collectLatest { error ->
                if (error != null) {
                    Snackbar.make(binding.root, error, Snackbar.LENGTH_LONG).show()
                    viewModel.clearError()
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.actionResult.collectLatest { result ->
                if (result != null) {
                    Snackbar.make(binding.root, result, Snackbar.LENGTH_SHORT).show()
                    viewModel.clearActionResult()
                }
            }
        }
    }

    private fun updateMyIpStatus(whitelisted: Boolean, isPermanent: Boolean, expiresAt: String?) {
        if (whitelisted) {
            binding.myIpStatusIcon.setImageResource(R.drawable.ic_check_circle)

            if (isPermanent) {
                binding.myIpStatusIcon.setColorFilter(
                    ContextCompat.getColor(requireContext(), R.color.success)
                )
                binding.myIpStatusText.text = getString(R.string.whitelist_status_permanent)
            } else {
                binding.myIpStatusIcon.setColorFilter(
                    ContextCompat.getColor(requireContext(), R.color.warning)
                )
                val formatted = expiresAt?.let {
                    try {
                        val expires = ZonedDateTime.parse(it)
                        val formatter = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm")
                        getString(R.string.whitelist_status_expires, expires.format(formatter))
                    } catch (e: Exception) {
                        getString(R.string.whitelist_status_allowed)
                    }
                } ?: getString(R.string.whitelist_status_allowed)
                binding.myIpStatusText.text = formatted
            }
            binding.btnAddMyIp.isVisible = !isPermanent
            binding.btnAddMyIp.text = if (isPermanent) {
                getString(R.string.whitelist_add_my_ip)
            } else {
                "Permanent freischalten"
            }
        } else {
            binding.myIpStatusIcon.setImageResource(R.drawable.ic_block)
            binding.myIpStatusIcon.setColorFilter(
                ContextCompat.getColor(requireContext(), R.color.error)
            )
            binding.myIpStatusText.text = getString(R.string.whitelist_status_blocked)
            binding.btnAddMyIp.isVisible = true
            binding.btnAddMyIp.text = getString(R.string.whitelist_add_my_ip)
        }
    }

    private fun showAddIpDialog() {
        val dialogBinding = DialogAddIpBinding.inflate(layoutInflater)

        // Eigene IP vorausfüllen
        viewModel.myIp.value?.let { ip ->
            dialogBinding.editIpAddress.setText(ip)
        }

        MaterialAlertDialogBuilder(requireContext())
            .setTitle(R.string.whitelist_add_ip)
            .setView(dialogBinding.root)
            .setPositiveButton(R.string.save) { _, _ ->
                val ip = dialogBinding.editIpAddress.text.toString().trim()
                val deviceName = dialogBinding.editDeviceName.text.toString().trim()
                    .takeIf { it.isNotEmpty() }

                if (ip.isNotEmpty()) {
                    viewModel.addIp(ip, deviceName)
                }
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun showDeleteConfirmation(id: Int, ipAddress: String) {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle(R.string.whitelist_remove)
            .setMessage(getString(R.string.whitelist_remove_confirm))
            .setPositiveButton(R.string.delete) { _, _ ->
                viewModel.removeIp(id)
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
