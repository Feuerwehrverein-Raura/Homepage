package ch.fwvraura.vorstand.ui.dispatch

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.bottomsheet.BottomSheetDialog
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.model.EmailTemplate
import ch.fwvraura.vorstand.databinding.FragmentDispatchTemplatesBinding
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class DispatchTemplatesFragment : Fragment() {

    private var _binding: FragmentDispatchTemplatesBinding? = null
    private val binding get() = _binding!!
    private val viewModel: DispatchViewModel by activityViewModels()
    private lateinit var adapter: TemplatesAdapter

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentDispatchTemplatesBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        adapter = TemplatesAdapter { template ->
            showTemplateDetail(template)
        }
        binding.templatesRecycler.layoutManager = LinearLayoutManager(requireContext())
        binding.templatesRecycler.adapter = adapter

        binding.swipeRefresh.setOnRefreshListener {
            viewModel.loadTemplates()
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.templates.collectLatest { templates ->
                adapter.submitList(templates)
                binding.templatesRecycler.visibility = if (templates.isEmpty()) View.GONE else View.VISIBLE
                binding.emptyState.visibility = if (templates.isEmpty()) View.VISIBLE else View.GONE
                binding.swipeRefresh.isRefreshing = false
            }
        }

        viewModel.loadTemplates()
    }

    private fun showTemplateDetail(template: EmailTemplate) {
        val dialog = BottomSheetDialog(requireContext())
        val dialogView = layoutInflater.inflate(R.layout.dialog_dispatch_preview, null)

        dialogView.findViewById<android.widget.TextView>(R.id.previewMode)?.text = template.type ?: "E-Mail"
        dialogView.findViewById<android.widget.TextView>(R.id.previewRecipients)?.text = template.name
        dialogView.findViewById<android.widget.TextView>(R.id.previewSubject)?.text = template.subject ?: ""
        dialogView.findViewById<android.widget.TextView>(R.id.previewBody)?.text = template.body ?: ""

        dialog.setContentView(dialogView)
        dialog.show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
