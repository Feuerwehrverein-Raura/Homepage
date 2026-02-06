package ch.fwvraura.vorstand.ui.masspdf

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.databinding.FragmentMassPdfBinding
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

/**
 * Fragment fuer den Massen-PDF-Versand per Post (Pingen).
 *
 * Ermoeglicht:
 * - PDF-Datei auswaehlen
 * - Empfaenger (Mitglieder mit Post-Zustellung) auswaehlen
 * - Staging/Produktionsmodus umschalten
 * - Massenversand starten
 */
class MassPdfFragment : Fragment() {

    private var _binding: FragmentMassPdfBinding? = null
    private val binding get() = _binding!!

    private val viewModel: MassPdfViewModel by viewModels()
    private lateinit var membersAdapter: MassPdfMemberAdapter

    // PDF-Picker
    private val pdfPickerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            result.data?.data?.let { uri ->
                try {
                    val contentResolver = requireContext().contentResolver
                    val inputStream = contentResolver.openInputStream(uri)
                    val bytes = inputStream?.readBytes()
                    inputStream?.close()

                    if (bytes != null) {
                        // Dateiname extrahieren
                        val fileName = uri.lastPathSegment?.substringAfterLast('/') ?: "document.pdf"
                        viewModel.setPdf(bytes, fileName)
                    }
                } catch (e: Exception) {
                    Snackbar.make(binding.root, "Fehler beim Laden der PDF", Snackbar.LENGTH_SHORT).show()
                }
            }
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentMassPdfBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        setupToolbar()
        setupRecyclerView()
        setupClickListeners()
        observeViewModel()

        // Daten laden
        viewModel.loadPostMembers()
    }

    private fun setupToolbar() {
        binding.toolbar.setNavigationOnClickListener {
            findNavController().navigateUp()
        }
    }

    private fun setupRecyclerView() {
        membersAdapter = MassPdfMemberAdapter { memberId ->
            viewModel.toggleMemberSelection(memberId)
        }
        binding.membersRecycler.layoutManager = LinearLayoutManager(requireContext())
        binding.membersRecycler.adapter = membersAdapter
    }

    private fun setupClickListeners() {
        // Staging Switch
        binding.stagingSwitch.isChecked = viewModel.staging.value
        binding.stagingSwitch.setOnCheckedChangeListener { _, isChecked ->
            viewModel.setStaging(isChecked)
        }

        // PDF auswaehlen
        binding.selectPdfButton.setOnClickListener {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "application/pdf"
            }
            pdfPickerLauncher.launch(intent)
        }

        // Alle auswaehlen/abwaehlen
        binding.selectAllButton.setOnClickListener {
            val allSelected = viewModel.selectedMemberIds.value.size == viewModel.postMembers.value.size
            if (allSelected) {
                viewModel.deselectAllMembers()
            } else {
                viewModel.selectAllMembers()
            }
        }

        // Senden
        binding.sendButton.setOnClickListener {
            showSendConfirmation()
        }

        // SwipeRefresh
        binding.swipeRefresh.setOnRefreshListener {
            viewModel.loadPostMembers()
        }
    }

    private fun showSendConfirmation() {
        val selectedCount = viewModel.selectedMemberIds.value.size
        val staging = viewModel.staging.value
        val pdfName = viewModel.pdfFileName.value ?: "document.pdf"

        val message = buildString {
            append("Soll das PDF \"$pdfName\" an $selectedCount Empfänger gesendet werden?\n\n")
            if (staging) {
                append("STAGING-MODUS: Es werden keine echten Briefe versendet.")
            } else {
                append("PRODUKTION: Echte Briefe werden versendet!\n")
                append("Geschätzte Kosten: ca. CHF ${String.format("%.2f", selectedCount * 1.50)}")
            }
        }

        MaterialAlertDialogBuilder(requireContext())
            .setTitle("Massen-PDF versenden")
            .setMessage(message)
            .setPositiveButton("Senden") { _, _ ->
                val subject = binding.subjectInput.text?.toString()?.takeIf { it.isNotBlank() }
                viewModel.sendBulkPdf(subject)
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun observeViewModel() {
        viewLifecycleOwner.lifecycleScope.launch {
            // Mitglieder mit Auswahl-Status kombinieren
            combine(
                viewModel.postMembers,
                viewModel.selectedMemberIds
            ) { members, selectedIds ->
                members.map { member ->
                    MassPdfMemberAdapter.SelectableMember(
                        member = member,
                        isSelected = selectedIds.contains(member.id)
                    )
                }
            }.collectLatest { selectableMembers ->
                membersAdapter.submitList(selectableMembers)
                binding.membersRecycler.visibility = if (selectableMembers.isEmpty()) View.GONE else View.VISIBLE
                binding.emptyState.visibility = if (selectableMembers.isEmpty()) View.VISIBLE else View.GONE
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.selectedMemberIds.collectLatest { selectedIds ->
                val count = selectedIds.size
                val total = viewModel.postMembers.value.size
                binding.selectedCountText.text = "$count / $total"

                // Button-Text anpassen
                val allSelected = count == total && total > 0
                binding.selectAllButton.text = if (allSelected) {
                    getString(R.string.mass_pdf_deselect_all)
                } else {
                    getString(R.string.mass_pdf_select_all)
                }

                // Kosten-Hinweis aktualisieren
                updateCostHint(count)
                updateSendButtonState()
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.pdfFileName.collectLatest { fileName ->
                if (fileName != null) {
                    binding.pdfNameText.text = fileName
                    binding.pdfIcon.setColorFilter(
                        requireContext().getColor(R.color.primary)
                    )
                } else {
                    binding.pdfNameText.text = getString(R.string.mass_pdf_no_file)
                    binding.pdfIcon.setColorFilter(
                        requireContext().getColor(R.color.text_hint)
                    )
                }
                updateSendButtonState()
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.isLoading.collectLatest { loading ->
                binding.swipeRefresh.isRefreshing = loading && viewModel.pdfFileName.value == null
                binding.loadingOverlay.visibility = if (loading && viewModel.pdfFileName.value != null) {
                    View.VISIBLE
                } else {
                    View.GONE
                }
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
            viewModel.sendResult.collectLatest { result ->
                if (result != null) {
                    showResultDialog(result)
                    viewModel.clearSendResult()
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.staging.collectLatest { staging ->
                binding.stagingSwitch.isChecked = staging
                updateCostHint(viewModel.selectedMemberIds.value.size)
            }
        }
    }

    private fun updateSendButtonState() {
        val hasPdf = viewModel.pdfFileName.value != null
        val hasRecipients = viewModel.selectedMemberIds.value.isNotEmpty()
        binding.sendButton.isEnabled = hasPdf && hasRecipients
    }

    private fun updateCostHint(count: Int) {
        val staging = viewModel.staging.value
        binding.costHint.text = if (staging) {
            getString(R.string.mass_pdf_staging_hint)
        } else if (count > 0) {
            getString(R.string.mass_pdf_cost_hint, count, count * 1.50)
        } else {
            ""
        }
    }

    private fun showResultDialog(result: MassPdfViewModel.SendResult) {
        val message = buildString {
            if (result.staging) {
                append("STAGING-MODUS (keine echten Briefe)\n\n")
            }
            append("Gesamtempfänger: ${result.totalRecipients}\n")
            append("Erfolgreich: ${result.successCount}\n")
            append("Fehlgeschlagen: ${result.failedCount}")
        }

        val title = if (result.failedCount == 0) {
            "Versand erfolgreich"
        } else {
            "Versand teilweise erfolgreich"
        }

        MaterialAlertDialogBuilder(requireContext())
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton(R.string.close, null)
            .show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
