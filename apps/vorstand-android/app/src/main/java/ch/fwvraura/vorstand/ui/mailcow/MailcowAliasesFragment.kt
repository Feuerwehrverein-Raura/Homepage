package ch.fwvraura.vorstand.ui.mailcow

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.model.MailAlias
import ch.fwvraura.vorstand.databinding.DialogAliasFormBinding
import ch.fwvraura.vorstand.databinding.FragmentMailcowAliasesBinding
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class MailcowAliasesFragment : Fragment() {

    private var _binding: FragmentMailcowAliasesBinding? = null
    private val binding get() = _binding!!
    private val viewModel: MailcowViewModel by activityViewModels()
    private lateinit var adapter: AliasesAdapter

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentMailcowAliasesBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        adapter = AliasesAdapter(
            onEdit = { showAliasDialog(it) },
            onDelete = { confirmDelete(it) }
        )
        binding.recyclerView.layoutManager = LinearLayoutManager(requireContext())
        binding.recyclerView.adapter = adapter

        binding.swipeRefresh.setOnRefreshListener {
            viewModel.loadAliases()
        }

        binding.retryButton.setOnClickListener {
            viewModel.loadAliases()
        }

        binding.fabAdd.setOnClickListener {
            showAliasDialog(null)
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.aliases.collectLatest { list ->
                adapter.submitList(list)
                binding.recyclerView.visibility = if (list.isEmpty()) View.GONE else View.VISIBLE
                binding.emptyState.visibility = if (list.isEmpty() && viewModel.error.value == null) View.VISIBLE else View.GONE
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
                    binding.errorText.text = error
                    binding.errorState.visibility = View.VISIBLE
                    binding.emptyState.visibility = View.GONE
                } else {
                    binding.errorState.visibility = View.GONE
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.actionResult.collectLatest { result ->
                if (result != null) {
                    Snackbar.make(binding.root, result, Snackbar.LENGTH_LONG).show()
                    viewModel.clearActionResult()
                }
            }
        }

        viewModel.loadAliases()
    }

    private fun showAliasDialog(alias: MailAlias?) {
        val isEdit = alias != null
        val dialogBinding = DialogAliasFormBinding.inflate(layoutInflater)

        if (isEdit) {
            dialogBinding.editAddress.setText(alias!!.address)
            dialogBinding.editAddress.isEnabled = false
            dialogBinding.tilAddress.isEnabled = false
            dialogBinding.editGoto.setText(alias.goto)
            dialogBinding.switchActive.isChecked = alias.active == 1
        }

        MaterialAlertDialogBuilder(requireContext())
            .setTitle(if (isEdit) R.string.mailcow_edit_alias else R.string.mailcow_add_alias)
            .setView(dialogBinding.root)
            .setPositiveButton(R.string.save) { _, _ ->
                val address = dialogBinding.editAddress.text.toString().trim()
                val goto = dialogBinding.editGoto.text.toString().trim()
                val active = dialogBinding.switchActive.isChecked

                if (isEdit) {
                    viewModel.updateAlias(
                        id = alias!!.id,
                        goto = goto,
                        active = active
                    )
                } else {
                    if (address.isBlank() || goto.isBlank()) {
                        Snackbar.make(binding.root, "Adresse und Zieladresse sind Pflichtfelder", Snackbar.LENGTH_SHORT).show()
                        return@setPositiveButton
                    }
                    viewModel.createAlias(address, goto, active)
                }
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun confirmDelete(alias: MailAlias) {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle(R.string.mailcow_delete_alias)
            .setMessage(getString(R.string.mailcow_delete_alias_confirm))
            .setPositiveButton(R.string.delete) { _, _ ->
                viewModel.deleteAlias(alias.id)
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
