package ch.fwvraura.vorstand.ui.mailcow

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.databinding.FragmentMailcowDistributionBinding
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class MailcowDistributionFragment : Fragment() {

    private var _binding: FragmentMailcowDistributionBinding? = null
    private val binding get() = _binding!!
    private val viewModel: MailcowViewModel by activityViewModels()
    private lateinit var adapter: ZustellungAdapter

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentMailcowDistributionBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        adapter = ZustellungAdapter()
        binding.recyclerView.layoutManager = LinearLayoutManager(requireContext())
        binding.recyclerView.adapter = adapter

        binding.swipeRefresh.setOnRefreshListener {
            viewModel.loadZustellliste()
        }

        binding.btnCopyEmails.setOnClickListener {
            val zustellung = viewModel.zustellung.value ?: return@setOnClickListener
            val formatted = zustellung.formatted ?: zustellung.emails?.joinToString(", ") ?: return@setOnClickListener
            val clipboard = requireContext().getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("emails", formatted))
            val count = zustellung.emails?.size ?: zustellung.count
            Snackbar.make(binding.root, getString(R.string.mailcow_emails_copied, count), Snackbar.LENGTH_SHORT).show()
        }

        binding.btnSyncAlias.setOnClickListener {
            viewModel.syncAlias()
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.zustellung.collectLatest { data ->
                val members = data?.members ?: emptyList()
                adapter.submitList(members)
                binding.countText.text = getString(R.string.mailcow_zustellung_count, data?.count ?: 0)
                binding.recyclerView.visibility = if (members.isEmpty()) View.GONE else View.VISIBLE
                binding.emptyState.visibility = if (members.isEmpty()) View.VISIBLE else View.GONE
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.isLoading.collectLatest { loading ->
                binding.swipeRefresh.isRefreshing = loading
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

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.error.collectLatest { error ->
                if (error != null) {
                    Snackbar.make(binding.root, error, Snackbar.LENGTH_LONG).show()
                    viewModel.clearError()
                }
            }
        }

        viewModel.loadZustellliste()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
