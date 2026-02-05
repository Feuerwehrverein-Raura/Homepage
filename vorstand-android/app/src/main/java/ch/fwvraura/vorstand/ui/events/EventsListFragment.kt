package ch.fwvraura.vorstand.ui.events

import android.os.Bundle
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
import ch.fwvraura.vorstand.databinding.FragmentEventsListBinding
import kotlinx.coroutines.launch

class EventsListFragment : Fragment() {

    private var _binding: FragmentEventsListBinding? = null
    private val binding get() = _binding!!
    private val viewModel: EventsViewModel by viewModels()
    private lateinit var adapter: EventsAdapter

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentEventsListBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        adapter = EventsAdapter(
            onClick = { event ->
                val bundle = Bundle().apply { putInt("eventId", event.id) }
                findNavController().navigate(R.id.action_events_to_registrations, bundle)
            },
            onEdit = { event ->
                val bundle = Bundle().apply { putInt("eventId", event.id) }
                findNavController().navigate(R.id.action_events_to_form, bundle)
            }
        )

        binding.eventsRecycler.layoutManager = LinearLayoutManager(requireContext())
        binding.eventsRecycler.adapter = adapter

        binding.swipeRefresh.setOnRefreshListener { viewModel.loadEvents() }

        binding.fabAddEvent.setOnClickListener {
            findNavController().navigate(R.id.action_events_to_form)
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch { viewModel.events.collect { adapter.submitList(it) } }
                launch { viewModel.isLoading.collect { binding.swipeRefresh.isRefreshing = it } }
            }
        }

        viewModel.loadEvents()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
