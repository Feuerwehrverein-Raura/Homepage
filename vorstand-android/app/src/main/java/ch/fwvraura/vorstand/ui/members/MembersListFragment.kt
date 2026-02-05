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

    private fun observeData() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch {
                    viewModel.members.collect { members ->
                        adapter.submitList(members)
                    }
                }
                launch {
                    viewModel.isLoading.collect { loading ->
                        binding.swipeRefresh.isRefreshing = loading
                    }
                }
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
