package ch.fwvraura.vorstand.ui.members

import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.databinding.FragmentMembersListBinding
import kotlinx.coroutines.launch

class MembersListFragment : Fragment() {

    private var _binding: FragmentMembersListBinding? = null
    private val binding get() = _binding!!
    private val viewModel: MembersViewModel by viewModels()
    private lateinit var adapter: MembersAdapter
    private var isFirstLoad = true

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentMembersListBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupRecyclerView()
        setupSearch()
        setupFilters()
        setupFab()
        setupRetry()
        observeData()
        viewModel.loadMembers()
        viewModel.loadStats()
    }

    private fun setupRecyclerView() {
        adapter = MembersAdapter { member ->
            val bundle = Bundle().apply { putInt("memberId", member.id) }
            findNavController().navigate(R.id.action_members_to_detail, bundle)
        }
        binding.membersRecycler.layoutManager = LinearLayoutManager(requireContext())
        binding.membersRecycler.adapter = adapter

        binding.swipeRefresh.setOnRefreshListener {
            viewModel.loadMembers()
            viewModel.loadStats()
        }
    }

    private fun setupSearch() {
        binding.searchInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                viewModel.loadMembers(search = s?.toString())
            }
        })
    }

    private fun setupFilters() {
        binding.filterChips.setOnCheckedStateChangeListener { _, checkedIds ->
            val filter = when {
                checkedIds.contains(R.id.chipAktiv) -> "Aktiv"
                checkedIds.contains(R.id.chipPassiv) -> "Passiv"
                checkedIds.contains(R.id.chipEhren) -> "Ehren"
                else -> null
            }
            viewModel.loadMembers(filter = filter)
        }
    }

    private fun setupFab() {
        binding.fabAddMember.setOnClickListener {
            findNavController().navigate(R.id.action_members_to_form)
        }
    }

    private fun setupRetry() {
        binding.retryButton.setOnClickListener {
            viewModel.loadMembers()
            viewModel.loadStats()
        }
    }

    private fun observeData() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch {
                    viewModel.members.collect { members ->
                        adapter.submitList(members)
                        updateVisibility(members.isEmpty())
                    }
                }
                launch {
                    viewModel.isLoading.collect { loading ->
                        binding.swipeRefresh.isRefreshing = loading && !isFirstLoad
                        if (loading && isFirstLoad) {
                            binding.loadingIndicator.visibility = View.VISIBLE
                            binding.emptyState.visibility = View.GONE
                            binding.errorState.visibility = View.GONE
                        } else if (!loading) {
                            binding.loadingIndicator.visibility = View.GONE
                            isFirstLoad = false
                        }
                    }
                }
                launch {
                    viewModel.error.collect { error ->
                        if (error != null && viewModel.members.value.isEmpty()) {
                            binding.errorText.text = error
                            binding.errorState.visibility = View.VISIBLE
                            binding.emptyState.visibility = View.GONE
                            binding.membersRecycler.visibility = View.GONE
                        } else {
                            binding.errorState.visibility = View.GONE
                        }
                    }
                }
            }
        }
    }

    private fun updateVisibility(isEmpty: Boolean) {
        val hasError = viewModel.error.value != null
        if (!hasError && !viewModel.isLoading.value) {
            binding.membersRecycler.visibility = if (isEmpty) View.GONE else View.VISIBLE
            binding.emptyState.visibility = if (isEmpty) View.VISIBLE else View.GONE
            binding.errorState.visibility = View.GONE
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
