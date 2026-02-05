package ch.fwvraura.vorstand.ui.events

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.Event
import ch.fwvraura.vorstand.data.model.EventRegistration
import ch.fwvraura.vorstand.data.model.Shift
import ch.fwvraura.vorstand.databinding.FragmentEventRegistrationsBinding
import ch.fwvraura.vorstand.util.DateUtils
import kotlinx.coroutines.launch

class EventRegistrationsFragment : Fragment() {

    private var _binding: FragmentEventRegistrationsBinding? = null
    private val binding get() = _binding!!
    private var eventId: String? = null

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentEventRegistrationsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        eventId = arguments?.getString("eventId")

        binding.toolbar.setNavigationOnClickListener { findNavController().navigateUp() }
        binding.swipeRefresh.setOnRefreshListener { loadEvent() }

        loadEvent()
    }

    private fun loadEvent() {
        viewLifecycleOwner.lifecycleScope.launch {
            binding.swipeRefresh.isRefreshing = true
            try {
                val response = ApiModule.eventsApi.getEvent(eventId!!)
                if (response.isSuccessful) {
                    val event = response.body() ?: return@launch
                    binding.toolbar.title = event.title
                    displayShifts(event)
                }
            } catch (_: Exception) { }
            binding.swipeRefresh.isRefreshing = false
        }
    }

    private fun displayShifts(event: Event) {
        binding.shiftsContainer.removeAllViews()
        val shifts = event.shifts ?: return

        for (shift in shifts) {
            val shiftView = layoutInflater.inflate(R.layout.item_shift_registrations, binding.shiftsContainer, false)
            val title = shiftView.findViewById<TextView>(R.id.shiftTitle)
            val info = shiftView.findViewById<TextView>(R.id.shiftInfo)
            val recycler = shiftView.findViewById<RecyclerView>(R.id.registrationsRecycler)

            title.text = shift.name
            val regs = shift.registrations
            val registered = regs?.approvedCount ?: regs?.approved?.size ?: 0
            val needed = shift.needed ?: 0
            info.text = "$registered / $needed | ${DateUtils.formatDate(shift.date)} ${shift.startTime ?: ""}-${shift.endTime ?: ""}"

            val allRegistrations = (regs?.approved ?: emptyList()) + (regs?.pending ?: emptyList())
            recycler.layoutManager = LinearLayoutManager(requireContext())
            recycler.adapter = ShiftRegistrationsAdapter(allRegistrations)

            binding.shiftsContainer.addView(shiftView)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
