package ch.fwvraura.vorstand.ui.dispatch

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.lifecycleScope
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.model.EmailTemplate
import ch.fwvraura.vorstand.data.model.Member
import ch.fwvraura.vorstand.databinding.FragmentDispatchComposeBinding
import ch.fwvraura.vorstand.util.RichTextEditor
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

class DispatchComposeFragment : Fragment() {

    private var _binding: FragmentDispatchComposeBinding? = null
    private val binding get() = _binding!!
    private val viewModel: DispatchViewModel by activityViewModels()

    private var selectedTemplate: EmailTemplate? = null
    private var pdfBytes: ByteArray? = null
    private var pdfName: String? = null
    private var richTextEditor: RichTextEditor? = null

    private val pdfPickerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            result.data?.data?.let { uri ->
                try {
                    val inputStream = requireContext().contentResolver.openInputStream(uri)
                    pdfBytes = inputStream?.readBytes()
                    inputStream?.close()
                    pdfName = uri.lastPathSegment ?: "document.pdf"
                    binding.pdfFileName.text = pdfName
                } catch (e: Exception) {
                    Snackbar.make(binding.root, "PDF konnte nicht geladen werden", Snackbar.LENGTH_SHORT).show()
                }
            }
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentDispatchComposeBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        setupRichTextEditor()
        setupSendModeChips()
        setupRecipientChips()
        setupTemplateSpinner()
        setupPdfPicker()
        setupPingenCard()
        setupButtons()
        observeData()

        viewModel.loadMembers()
        viewModel.loadTemplates()
        viewModel.loadPingenDashboard()
    }

    private fun setupRichTextEditor() {
        richTextEditor = RichTextEditor(
            editText = binding.bodyInput,
            btnBold = binding.btnBold,
            btnItalic = binding.btnItalic,
            btnUnderline = binding.btnUnderline,
            btnList = binding.btnList
        )
    }

    private fun setupSendModeChips() {
        binding.sendModeChips.setOnCheckedStateChangeListener { _, checkedIds ->
            val isPostMode = checkedIds.contains(R.id.chipPostOnly)
            val isEmailOnly = checkedIds.contains(R.id.chipEmailOnly)
            binding.pdfCard.visibility = if (isPostMode) View.VISIBLE else View.GONE
            // Pingen-Karte bei Smart oder Post anzeigen (nicht bei reinem E-Mail)
            binding.pingenCard.visibility = if (!isEmailOnly) View.VISIBLE else View.GONE
            // Im reinen Post-Modus: Body-Feld und Toolbar ausblenden wenn PDF vorhanden
            val hideBody = isPostMode && pdfBytes != null
            binding.bodyLayout.visibility = if (hideBody) View.GONE else View.VISIBLE
            binding.formatToolbar.visibility = if (hideBody) View.GONE else View.VISIBLE
            updateRecipientCount()
        }
    }

    private fun setupRecipientChips() {
        binding.recipientChips.setOnCheckedStateChangeListener { _, _ ->
            updateRecipientCount()
        }
    }

    private fun setupTemplateSpinner() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.templates.collectLatest { templates ->
                val names = listOf("(Keine Vorlage)") + templates.map { it.name }
                val adapter = ArrayAdapter(requireContext(), android.R.layout.simple_dropdown_item_1line, names)
                binding.templateSpinner.setAdapter(adapter)
                binding.templateSpinner.setOnItemClickListener { _, _, position, _ ->
                    if (position == 0) {
                        selectedTemplate = null
                        binding.subjectInput.setText("")
                        richTextEditor?.setText("")
                    } else {
                        selectedTemplate = templates[position - 1]
                        binding.subjectInput.setText(selectedTemplate?.subject ?: "")
                        richTextEditor?.setText(selectedTemplate?.body)
                    }
                }
            }
        }
    }

    private fun setupPingenCard() {
        // Standardmaessig sichtbar (Smart-Modus ist vorausgewaehlt)
        binding.pingenCard.visibility = View.VISIBLE
        binding.stagingSwitch.isChecked = viewModel.staging
        binding.stagingSwitch.setOnCheckedChangeListener { _, isChecked ->
            viewModel.setStaging(isChecked)
        }
    }

    private fun setupPdfPicker() {
        binding.selectPdfButton.setOnClickListener {
            val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                type = "application/pdf"
                addCategory(Intent.CATEGORY_OPENABLE)
            }
            pdfPickerLauncher.launch(intent)
        }
    }

    private fun setupButtons() {
        binding.previewButton.setOnClickListener { showPreview() }
        binding.sendButton.setOnClickListener { confirmAndSend() }
    }

    private fun observeData() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.members.collectLatest { updateRecipientCount() }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.isLoading.collectLatest { loading ->
                binding.sendButton.isEnabled = !loading
                binding.previewButton.isEnabled = !loading
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.pingenAccount.collectLatest { account ->
                if (account != null) {
                    val balance = String.format("%.2f %s", account.balance / 100.0, account.currency)
                    val label = if (account.isStaging) {
                        getString(R.string.dispatch_staging_active)
                    } else {
                        getString(R.string.dispatch_pingen_balance)
                    }
                    binding.pingenBalance.text = "$label: $balance"
                } else {
                    binding.pingenBalance.text = ""
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.sendResult.collectLatest { result ->
                if (result != null) {
                    Snackbar.make(binding.root, result, Snackbar.LENGTH_LONG).show()
                    viewModel.clearSendResult()
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
    }

    private fun getSelectedFilter(): String? {
        return when {
            binding.chipAktiv.isChecked -> "aktiv"
            binding.chipPassiv.isChecked -> "passiv"
            binding.chipEhren.isChecked -> "ehren"
            else -> null // All
        }
    }

    private fun getFilteredMembers(): List<Member> {
        val filter = getSelectedFilter()
        val allMembers = viewModel.members.value
        return if (filter != null) {
            allMembers.filter { it.status?.lowercase() == filter }
        } else {
            allMembers
        }
    }

    private fun updateRecipientCount() {
        val members = getFilteredMembers()
        val emailCount = members.count { it.zustellungEmail == true }
        val postCount = members.count { it.zustellungPost == true }

        val isPostOnly = binding.chipPostOnly.isChecked
        val isEmailOnly = binding.chipEmailOnly.isChecked

        val text = when {
            isEmailOnly -> "$emailCount Empfänger per E-Mail"
            isPostOnly -> "$postCount Empfänger per Post"
            else -> "${members.size} Empfänger ($emailCount E-Mail, $postCount Post)"
        }
        binding.recipientCount.text = text
    }

    private fun showPreview() {
        val dialogView = layoutInflater.inflate(R.layout.dialog_dispatch_preview, null)

        val mode = when {
            binding.chipSmart.isChecked -> "Automatisch (E-Mail + Post)"
            binding.chipEmailOnly.isChecked -> "Nur E-Mail"
            binding.chipPostOnly.isChecked -> "Nur Post"
            else -> "Automatisch"
        }
        dialogView.findViewById<TextView>(R.id.previewMode)?.text = mode
        dialogView.findViewById<TextView>(R.id.previewRecipients)?.text = binding.recipientCount.text
        dialogView.findViewById<TextView>(R.id.previewSubject)?.text = binding.subjectInput.text?.toString() ?: ""
        dialogView.findViewById<TextView>(R.id.previewBody)?.text = richTextEditor?.toPlainText() ?: ""

        if (pdfBytes != null) {
            val pdfInfo = dialogView.findViewById<TextView>(R.id.previewPdf)
            pdfInfo?.visibility = View.VISIBLE
            pdfInfo?.text = "PDF: $pdfName (${pdfBytes!!.size / 1024} KB)"
        }

        MaterialAlertDialogBuilder(requireContext())
            .setView(dialogView)
            .setPositiveButton(getString(R.string.dispatch_send)) { _, _ -> executeSend() }
            .setNegativeButton(getString(R.string.cancel), null)
            .show()
    }

    private fun confirmAndSend() {
        val members = getFilteredMembers()
        if (members.isEmpty()) {
            Snackbar.make(binding.root, "Keine Empfänger ausgewählt", Snackbar.LENGTH_SHORT).show()
            return
        }

        val subject = binding.subjectInput.text?.toString()
        if (subject.isNullOrBlank() && pdfBytes == null) {
            Snackbar.make(binding.root, "Bitte Betreff eingeben", Snackbar.LENGTH_SHORT).show()
            return
        }

        MaterialAlertDialogBuilder(requireContext())
            .setTitle("Versand bestätigen")
            .setMessage("${members.size} Empfänger werden kontaktiert. Fortfahren?")
            .setPositiveButton(getString(R.string.dispatch_send)) { _, _ -> executeSend() }
            .setNegativeButton(getString(R.string.cancel), null)
            .show()
    }

    private fun executeSend() {
        val members = getFilteredMembers()
        val memberIds = members.map { it.id }
        val subject = binding.subjectInput.text?.toString()
        val body = richTextEditor?.toHtml() ?: binding.bodyInput.text?.toString()

        when {
            // Post mit PDF
            binding.chipPostOnly.isChecked && pdfBytes != null -> {
                viewModel.sendPingenBulkPdf(pdfBytes!!, subject, memberIds)
            }
            // Nur E-Mail
            binding.chipEmailOnly.isChecked -> {
                viewModel.sendBulkEmail(memberIds, selectedTemplate?.id, subject, body)
            }
            // Smart Dispatch (Automatisch)
            else -> {
                val templateGroup = selectedTemplate?.name ?: subject ?: ""
                viewModel.smartDispatch(memberIds, templateGroup)
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
