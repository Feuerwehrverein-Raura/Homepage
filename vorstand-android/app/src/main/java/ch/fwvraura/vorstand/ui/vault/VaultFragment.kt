package ch.fwvraura.vorstand.ui.vault

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.model.DecryptedVaultItem
import ch.fwvraura.vorstand.databinding.DialogVaultLoginBinding
import ch.fwvraura.vorstand.databinding.FragmentVaultBinding
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class VaultFragment : Fragment() {

    private var _binding: FragmentVaultBinding? = null
    private val binding get() = _binding!!
    private val viewModel: VaultViewModel by activityViewModels()
    private lateinit var adapter: VaultAdapter

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentVaultBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.toolbar.setNavigationOnClickListener {
            findNavController().navigateUp()
        }

        // Lock/Logout menu item
        binding.toolbar.inflateMenu(R.menu.menu_vault)
        binding.toolbar.setOnMenuItemClickListener { menuItem ->
            if (menuItem.itemId == R.id.action_lock) {
                viewModel.logout()
                true
            } else false
        }

        adapter = VaultAdapter(
            onCopy = { item -> showCopyOptions(item) },
            onItemClick = { item -> showItemDetails(item) }
        )
        binding.recyclerView.layoutManager = LinearLayoutManager(requireContext())
        binding.recyclerView.adapter = adapter

        binding.swipeRefresh.setOnRefreshListener {
            viewModel.refresh()
        }

        binding.btnLogin.setOnClickListener {
            showLoginDialog()
        }

        binding.retryButton.setOnClickListener {
            viewModel.refresh()
        }

        binding.searchInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                viewModel.search(s?.toString() ?: "")
            }
        })

        // Observe states
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.isAuthenticated.collectLatest { authenticated ->
                binding.loginState.visibility = if (authenticated) View.GONE else View.VISIBLE
                binding.searchLayout.visibility = if (authenticated) View.VISIBLE else View.GONE
                binding.swipeRefresh.isEnabled = authenticated
                binding.toolbar.menu?.findItem(R.id.action_lock)?.isVisible = authenticated
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.vaultItems.collectLatest { items ->
                adapter.submitList(items)
                if (viewModel.isAuthenticated.value) {
                    binding.recyclerView.visibility = if (items.isNotEmpty()) View.VISIBLE else View.GONE
                    binding.emptyState.visibility = if (items.isEmpty() && viewModel.error.value == null && !viewModel.isLoading.value) View.VISIBLE else View.GONE
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.isLoading.collectLatest { loading ->
                binding.swipeRefresh.isRefreshing = loading
                binding.loadingIndicator.visibility = if (loading && !viewModel.isAuthenticated.value) View.VISIBLE else View.GONE
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
    }

    private fun showLoginDialog() {
        val dialogBinding = DialogVaultLoginBinding.inflate(layoutInflater)

        // Pre-fill saved email
        val tokenManager = (requireActivity().application as ch.fwvraura.vorstand.VorstandApp).tokenManager
        tokenManager.vaultEmail?.let { dialogBinding.editEmail.setText(it) }

        MaterialAlertDialogBuilder(requireContext())
            .setTitle(R.string.vault_login_title)
            .setView(dialogBinding.root)
            .setPositiveButton(R.string.vault_login_button) { _, _ ->
                val email = dialogBinding.editEmail.text.toString().trim()
                val password = dialogBinding.editPassword.text.toString()

                if (email.isBlank() || password.isBlank()) {
                    Snackbar.make(binding.root, "E-Mail und Passwort sind Pflichtfelder", Snackbar.LENGTH_SHORT).show()
                    return@setPositiveButton
                }

                viewModel.login(email, password)
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun showCopyOptions(item: DecryptedVaultItem) {
        val fields = item.copyFields
        if (fields.size == 1) {
            copyToClipboard(fields.values.first())
            return
        }

        val labels = fields.keys.toTypedArray()
        MaterialAlertDialogBuilder(requireContext())
            .setTitle(item.name)
            .setItems(labels) { _, which ->
                val value = fields[labels[which]] ?: return@setItems
                copyToClipboard(value)
            }
            .show()
    }

    private fun showItemDetails(item: DecryptedVaultItem) {
        val fields = item.copyFields
        if (fields.isEmpty()) return

        val message = fields.entries.joinToString("\n\n") { (label, value) ->
            val displayValue = if (label == "Passwort" || label == "Sicherheitscode") {
                "\u2022".repeat(value.length)
            } else {
                value
            }
            "$label:\n$displayValue"
        }

        MaterialAlertDialogBuilder(requireContext())
            .setTitle(item.name)
            .setMessage(message)
            .setPositiveButton(R.string.close, null)
            .setNeutralButton("Kopieren") { _, _ ->
                showCopyOptions(item)
            }
            .show()
    }

    private fun copyToClipboard(text: String) {
        val clipboard = requireContext().getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("vault", text))
        Snackbar.make(binding.root, R.string.vault_copied, Snackbar.LENGTH_SHORT).show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
