package ch.fwvraura.members.ui.events

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import ch.fwvraura.members.R
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.Event
import ch.fwvraura.members.databinding.FragmentEventsBinding
import ch.fwvraura.members.databinding.ItemCalendarDayBinding
import com.google.android.material.tabs.TabLayout
import com.kizitonwose.calendar.core.CalendarDay
import com.kizitonwose.calendar.core.DayPosition
import com.kizitonwose.calendar.view.MonthDayBinder
import com.kizitonwose.calendar.view.ViewContainer
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

class EventsListFragment : Fragment() {

    private var _binding: FragmentEventsBinding? = null
    private val binding get() = _binding!!

    private lateinit var listAdapter: EventsAdapter
    private lateinit var dayAdapter: EventsAdapter

    private var allEvents: List<Event> = emptyList()
    private var eventsByDay: Map<LocalDate, List<Event>> = emptyMap()
    private var selectedDay: LocalDate? = null
    private val monthLabelFormatter = DateTimeFormatter.ofPattern("LLLL yyyy", Locale.GERMAN)

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentEventsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        listAdapter = EventsAdapter { event -> openEventDetail(event) }
        dayAdapter = EventsAdapter { event -> openEventDetail(event) }
        binding.eventsRecycler.layoutManager = LinearLayoutManager(requireContext())
        binding.eventsRecycler.adapter = listAdapter
        binding.calendarDayEvents.layoutManager = LinearLayoutManager(requireContext())
        binding.calendarDayEvents.adapter = dayAdapter

        binding.swipeRefresh.setOnRefreshListener { loadEvents() }
        binding.fabSubscribe.setOnClickListener { showSubscribeDialog() }

        binding.eventsTabs.addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: TabLayout.Tab) { switchTab(tab.position) }
            override fun onTabUnselected(tab: TabLayout.Tab) {}
            override fun onTabReselected(tab: TabLayout.Tab) {}
        })

        setupCalendar()
        loadEvents()
    }

    private fun switchTab(position: Int) {
        binding.swipeRefresh.visibility = if (position == 0) View.VISIBLE else View.GONE
        binding.paneCalendar.visibility = if (position == 1) View.VISIBLE else View.GONE
    }

    private fun setupCalendar() {
        val today = LocalDate.now()
        val startMonth = today.minusMonths(12).let { YearMonth.from(it) }
        val endMonth = today.plusMonths(24).let { YearMonth.from(it) }
        val firstDow = DayOfWeek.MONDAY

        binding.calendarView.dayBinder = object : MonthDayBinder<DayContainer> {
            override fun create(view: View) = DayContainer(view) { day ->
                if (day.position == DayPosition.MonthDate) selectDay(day.date)
            }
            override fun bind(container: DayContainer, data: CalendarDay) {
                container.bind(
                    data,
                    isSelected = data.date == selectedDay,
                    hasEvents = eventsByDay.containsKey(data.date)
                )
            }
        }
        binding.calendarView.monthScrollListener = { month ->
            binding.monthLabel.text = month.yearMonth.atDay(1).format(monthLabelFormatter)
        }
        binding.calendarView.setup(startMonth, endMonth, firstDow)
        binding.calendarView.scrollToMonth(YearMonth.from(today))

        binding.btnPrevMonth.setOnClickListener {
            val current = binding.calendarView.findFirstVisibleMonth()?.yearMonth ?: return@setOnClickListener
            binding.calendarView.smoothScrollToMonth(current.minusMonths(1))
        }
        binding.btnNextMonth.setOnClickListener {
            val current = binding.calendarView.findFirstVisibleMonth()?.yearMonth ?: return@setOnClickListener
            binding.calendarView.smoothScrollToMonth(current.plusMonths(1))
        }
    }

    private fun selectDay(date: LocalDate) {
        val previous = selectedDay
        selectedDay = date
        previous?.let { binding.calendarView.notifyDateChanged(it) }
        binding.calendarView.notifyDateChanged(date)

        val events = eventsByDay[date].orEmpty()
        dayAdapter.submitList(events)
        binding.calendarDayEmpty.visibility = if (events.isEmpty()) View.VISIBLE else View.GONE
        binding.calendarDayEvents.visibility = if (events.isEmpty()) View.GONE else View.VISIBLE
    }

    /** Zeigt drei Optionen: in Kalender-App oeffnen, Webcal-Link oder ICS-Datei teilen. */
    private fun showSubscribeDialog() {
        val httpsUrl = "https://api.fwv-raura.ch/calendar/ics"
        val webcalUrl = "webcal://api.fwv-raura.ch/calendar/ics"
        val options = arrayOf(
            "In Kalender-App öffnen (webcal://)",
            "ICS-Link teilen / kopieren",
            "ICS-Datei im Browser öffnen"
        )
        androidx.appcompat.app.AlertDialog.Builder(requireContext())
            .setTitle("Kalender abonnieren\n\nAlle FWV-Anlässe als Abo in deine Kalender-App. Aktualisiert sich automatisch wenn neue Events angelegt werden.")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> openExternal(webcalUrl)
                    1 -> shareLink(httpsUrl)
                    2 -> openExternal(httpsUrl)
                }
            }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    private fun openExternal(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)))
        } catch (_: Exception) {
            Toast.makeText(requireContext(), "Keine App zum Öffnen gefunden", Toast.LENGTH_LONG).show()
        }
    }

    private fun shareLink(url: String) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, url)
            putExtra(Intent.EXTRA_SUBJECT, "FWV Raura Kalender-Abo")
        }
        startActivity(Intent.createChooser(intent, "Kalender-Link teilen"))
    }

    private fun loadEvents() {
        binding.progress.visibility = View.VISIBLE
        binding.emptyText.visibility = View.GONE
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.listEvents()
                if (response.isSuccessful) {
                    val all = response.body().orEmpty().filter { it.status != "cancelled" }
                    allEvents = all
                    val now = System.currentTimeMillis()
                    val upcoming = all
                        .filter { isUpcoming(it.startDate, it.endDate, now) }
                        .sortedBy { it.startDate }
                    listAdapter.submitList(upcoming)
                    binding.emptyText.visibility = if (upcoming.isEmpty()) View.VISIBLE else View.GONE

                    eventsByDay = bucketByDay(all)
                    binding.calendarView.notifyCalendarChanged()
                    selectDay(selectedDay ?: LocalDate.now())
                } else {
                    showError(getString(R.string.events_error, "HTTP ${response.code()}"))
                }
            } catch (_: CancellationException) {
                throw kotlin.coroutines.cancellation.CancellationException()
            } catch (e: Exception) {
                showError(getString(R.string.events_error, e.message ?: ""))
            } finally {
                binding.progress.visibility = View.GONE
                binding.swipeRefresh.isRefreshing = false
            }
        }
    }

    private fun bucketByDay(events: List<Event>): Map<LocalDate, List<Event>> {
        val map = mutableMapOf<LocalDate, MutableList<Event>>()
        for (e in events) {
            val start = parseDate(e.startDate) ?: continue
            val end = parseDate(e.endDate) ?: start
            var day = start
            // Mehrtaegige Events werden auf jeden Tag des Zeitraums gemarkt.
            while (!day.isAfter(end)) {
                map.getOrPut(day) { mutableListOf() }.add(e)
                day = day.plusDays(1)
            }
        }
        return map
    }

    private fun parseDate(s: String?): LocalDate? {
        if (s.isNullOrBlank()) return null
        return try {
            LocalDate.parse(s.substring(0, minOf(10, s.length)))
        } catch (_: Exception) { null }
    }

    private fun isUpcoming(start: String?, end: String?, nowMs: Long): Boolean {
        val ref = end ?: start ?: return true
        val isoDate = ref.substring(0, minOf(10, ref.length))
        return try {
            val parsed = java.text.SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(isoDate)
            parsed != null && parsed.time + (24 * 60 * 60 * 1000L) >= nowMs
        } catch (_: Exception) { true }
    }

    private fun openEventDetail(event: Event) {
        val intent = Intent(requireContext(), EventDetailActivity::class.java)
            .putExtra(EventDetailActivity.EXTRA_EVENT_ID, event.id)
        startActivity(intent)
    }

    private fun showError(msg: String) {
        Toast.makeText(requireContext(), msg, Toast.LENGTH_LONG).show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    private inner class DayContainer(view: View, val onClick: (CalendarDay) -> Unit) : ViewContainer(view) {
        private val itemBinding = ItemCalendarDayBinding.bind(view)
        private var day: CalendarDay? = null
        init {
            view.setOnClickListener { day?.let(onClick) }
        }
        fun bind(d: CalendarDay, isSelected: Boolean, hasEvents: Boolean) {
            this.day = d
            itemBinding.calendarDayText.text = d.date.dayOfMonth.toString()
            val isOtherMonth = d.position != DayPosition.MonthDate
            itemBinding.calendarDayText.setTextColor(
                when {
                    isOtherMonth -> Color.parseColor("#C4C4C4")
                    isSelected -> Color.WHITE
                    d.date == LocalDate.now() -> Color.parseColor("#C8102E")
                    else -> Color.parseColor("#1F2937")
                }
            )
            itemBinding.calendarDayText.setBackgroundColor(
                if (isSelected && !isOtherMonth) Color.parseColor("#C8102E") else Color.TRANSPARENT
            )
            itemBinding.calendarDayDot.visibility =
                if (hasEvents && !isOtherMonth) View.VISIBLE else View.GONE
        }
    }
}
