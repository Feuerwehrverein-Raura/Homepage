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
import ch.fwvraura.vorstand.data.model.Mailbox
import ch.fwvraura.vorstand.databinding.DialogMailboxFormBinding
import ch.fwvraura.vorstand.databinding.FragmentMailcowMailboxesBinding
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class MailcowMailboxesFragment : Fragment() {

    private var _binding: FragmentMailcowMailboxesBinding? = null
    private val binding get() = _binding!!
    private val viewModel: MailcowViewModel by activityViewModels()
    private lateinit var adapter: MailboxesAdapter

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentMailcowMailboxesBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        adapter = MailboxesAdapter(
            onEdit = { showMailboxDialog(it) },
            onDelete = { confirmDelete(it) }
        )
        binding.recyclerView.layoutManager = LinearLayoutManager(requireContext())
        binding.recyclerView.adapter = adapter

        binding.swipeRefresh.setOnRefreshListener {
            viewModel.loadMailboxes()
        }

        binding.retryButton.setOnClickListener {
            viewModel.loadMailboxes()
        }

        binding.fabAdd.setOnClickListener {
            showMailboxDialog(null)
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.mailboxes.collectLatest { list ->
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

        viewModel.loadMailboxes()
    }

    private fun showMailboxDialog(mailbox: Mailbox?) {
        val isEdit = mailbox != null
        val dialogBinding = DialogMailboxFormBinding.inflate(layoutInflater)

        if (isEdit) {
            val localPart = mailbox!!.username.substringBefore("@")
            dialogBinding.editLocalPart.setText(localPart)
            dialogBinding.editLocalPart.isEnabled = false
            dialogBinding.tilLocalPart.isEnabled = false
            dialogBinding.editName.setText(mailbox.name ?: "")
            dialogBinding.editQuota.setText((mailbox.quota / (1024 * 1024)).toString())
            dialogBinding.switchActive.isChecked = mailbox.active == 1
            dialogBinding.passwordHint.text = getString(R.string.mailcow_password_edit_hint)
        }

        MaterialAlertDialogBuilder(requireContext())
            .setTitle(if (isEdit) R.string.mailcow_edit_mailbox else R.string.mailcow_add_mailbox)
            .setView(dialogBinding.root)
            .setPositiveButton(R.string.save) { _, _ ->
                val localPart = dialogBinding.editLocalPart.text.toString().trim()
                val name = dialogBinding.editName.text.toString().trim()
                val password = dialogBinding.editPassword.text.toString()
                val quota = dialogBinding.editQuota.text.toString().toIntOrNull() ?: 1024
                val active = dialogBinding.switchActive.isChecked

                if (isEdit) {
                    viewModel.updateMailbox(
                        email = mailbox!!.username,
                        name = name,
                        quota = quota,
                        active = active,
                        password = password.takeIf { it.isNotBlank() }
                    )
                } else {
                    if (localPart.isBlank() || password.isBlank()) {
                        Snackbar.make(binding.root, "Benutzername und Passwort sind Pflichtfelder", Snackbar.LENGTH_SHORT).show()
                        return@setPositiveButton
                    }
                    viewModel.createMailbox(localPart, name, password, quota, active)
                }
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun confirmDelete(mailbox: Mailbox) {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle(R.string.mailcow_delete_mailbox)
            .setMessage(getString(R.string.mailcow_delete_mailbox_confirm))
            .setPositiveButton(R.string.delete) { _, _ ->
                viewModel.deleteMailbox(mailbox.username)
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
