package ch.fwvraura.vorstand.ui.dispatch

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.databinding.FragmentDispatchLogBinding
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class DispatchLogFragment : Fragment() {

    private var _binding: FragmentDispatchLogBinding? = null
    private val binding get() = _binding!!
    private val viewModel: DispatchViewModel by activityViewModels()
    private lateinit var adapter: DispatchLogAdapter

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentDispatchLogBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        adapter = DispatchLogAdapter()
        binding.logRecycler.layoutManager = LinearLayoutManager(requireContext())
        binding.logRecycler.adapter = adapter

        // Filter Chips
        binding.chipAll.setOnClickListener { viewModel.loadDispatchLog(null) }
        binding.chipEmail.setOnClickListener { viewModel.loadDispatchLog("email") }
        binding.chipPost.setOnClickListener { viewModel.loadDispatchLog("letter") }

        binding.swipeRefresh.setOnRefreshListener {
            viewModel.loadDispatchLog()
        }

        binding.retryButton.setOnClickListener {
            viewModel.loadDispatchLog()
        }

        // Observe
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.dispatchLog.collectLatest { log ->
                adapter.submitList(log)
                binding.logRecycler.visibility = if (log.isEmpty()) View.GONE else View.VISIBLE
                binding.emptyState.visibility = if (log.isEmpty()) View.VISIBLE else View.GONE
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
                    viewModel.clearError()
                } else {
                    binding.errorState.visibility = View.GONE
                }
            }
        }

        viewModel.loadDispatchLog()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
