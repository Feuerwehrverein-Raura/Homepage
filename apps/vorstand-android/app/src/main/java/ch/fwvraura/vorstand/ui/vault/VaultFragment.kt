package ch.fwvraura.vorstand.ui.vault

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
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
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
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

        // Bei fehlgeschlagenem Auto-Login automatisch den Login-Dialog anzeigen
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.showLoginDialog.collectLatest { show ->
                if (show) {
                    viewModel.loginDialogShown()
                    showLoginDialog()
                }
            }
        }
    }

    private fun showLoginDialog() {
        val dialogBinding = DialogVaultLoginBinding.inflate(layoutInflater)
        val tokenManager = (requireActivity().application as ch.fwvraura.vorstand.VorstandApp).tokenManager
        val savedEmail = tokenManager.vaultEmail ?: tokenManager.userEmail ?: ""
        dialogBinding.editEmail.setText(savedEmail)

        MaterialAlertDialogBuilder(requireContext())
            .setTitle(R.string.vault_login_title)
            .setView(dialogBinding.root)
            .setPositiveButton(R.string.vault_login_button) { _, _ ->
                val email = dialogBinding.editEmail.text.toString().trim()
                val password = dialogBinding.editPassword.text.toString()

                if (email.isBlank()) {
                    Snackbar.make(binding.root, "E-Mail ist ein Pflichtfeld", Snackbar.LENGTH_SHORT).show()
                    return@setPositiveButton
                }
                if (password.isBlank()) {
                    Snackbar.make(binding.root, "Master-Passwort ist ein Pflichtfeld", Snackbar.LENGTH_SHORT).show()
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

        val ctx = requireContext()
        val dp16 = (16 * ctx.resources.displayMetrics.density).toInt()
        val dp8 = (8 * ctx.resources.displayMetrics.density).toInt()

        val container = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp16, dp16, dp16, 0)
        }

        for ((label, value) in fields) {
            val isSecret = label == "Passwort" || label == "Sicherheitscode"

            val inputLayout = TextInputLayout(ctx, null,
                com.google.android.material.R.attr.textInputOutlinedStyle).apply {
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { bottomMargin = dp8 }
                hint = label
                if (isSecret) {
                    endIconMode = TextInputLayout.END_ICON_PASSWORD_TOGGLE
                }
            }

            val editText = TextInputEditText(inputLayout.context).apply {
                setText(value)
                isFocusable = false
                isCursorVisible = false
                if (isSecret) {
                    inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
                }
            }

            inputLayout.addView(editText)
            container.addView(inputLayout)
        }

        val scrollView = ScrollView(ctx).apply { addView(container) }

        MaterialAlertDialogBuilder(ctx)
            .setTitle(item.name)
            .setView(scrollView)
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
