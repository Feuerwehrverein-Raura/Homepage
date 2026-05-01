package ch.fwvraura.vorstand.ui.mailcow

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import ch.fwvraura.vorstand.databinding.FragmentMailcowStorageBinding
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class MailcowStorageFragment : Fragment() {

    private var _binding: FragmentMailcowStorageBinding? = null
    private val binding get() = _binding!!
    private val viewModel: MailcowViewModel by activityViewModels()
    private lateinit var adapter: QuotaAdapter

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentMailcowStorageBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        adapter = QuotaAdapter()
        binding.recyclerView.layoutManager = LinearLayoutManager(requireContext())
        binding.recyclerView.adapter = adapter

        binding.swipeRefresh.setOnRefreshListener {
            viewModel.loadQuota()
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.quotaList.collectLatest { list ->
                adapter.submitList(list)
                binding.recyclerView.visibility = if (list.isEmpty()) View.GONE else View.VISIBLE
                binding.emptyState.visibility = if (list.isEmpty()) View.VISIBLE else View.GONE
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.isLoading.collectLatest { loading ->
                binding.swipeRefresh.isRefreshing = loading
            }
        }

        viewModel.loadQuota()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
