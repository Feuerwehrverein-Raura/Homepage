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
import ch.fwvraura.members.data.model.CalendarItem
import ch.fwvraura.members.data.model.Event
import ch.fwvraura.members.databinding.FragmentEventsBinding
import ch.fwvraura.members.databinding.ItemCalendarDayBinding
import com.google.android.material.snackbar.Snackbar
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
    private lateinit var calendarAdapter: CalendarItemsAdapter

    private var calendarItems: List<CalendarItem> = emptyList()
    private var itemsByDay: Map<LocalDate, List<CalendarItem>> = emptyMap()
    private var selectedDay: LocalDate? = null
    private var calendarLoaded = false
    private val monthLabelFormatter = DateTimeFormatter.ofPattern("LLLL yyyy", Locale.GERMAN)

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentEventsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        listAdapter = EventsAdapter { event -> openEventDetail(event) }
        calendarAdapter = CalendarItemsAdapter { item -> onCalendarItemClick(item) }
        binding.eventsRecycler.layoutManager = LinearLayoutManager(requireContext())
        binding.eventsRecycler.adapter = listAdapter
        binding.calendarDayEvents.layoutManager = LinearLayoutManager(requireContext())
        binding.calendarDayEvents.adapter = calendarAdapter

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

    private fun onCalendarItemClick(item: CalendarItem) {
        when (item.type) {
            "event", "board_meeting" -> item.refId?.let { id ->
                startActivity(
                    Intent(requireContext(), EventDetailActivity::class.java)
                        .putExtra(EventDetailActivity.EXTRA_EVENT_ID, id)
                )
            }
            else -> {
                val msg = item.description ?: item.subtitle ?: item.title
                Snackbar.make(binding.root, msg, Snackbar.LENGTH_LONG).show()
            }
        }
    }

    private fun switchTab(position: Int) {
        binding.swipeRefresh.visibility = if (position == 0) View.VISIBLE else View.GONE
        binding.paneCalendar.visibility = if (position == 1) View.VISIBLE else View.GONE
        if (position == 1 && !calendarLoaded) loadCalendarItems()
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
                    hasEvents = itemsByDay.containsKey(data.date)
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

        val items = itemsByDay[date].orEmpty()
        calendarAdapter.submitList(items)
        binding.calendarDayEmpty.visibility = if (items.isEmpty()) View.VISIBLE else View.GONE
        binding.calendarDayEvents.visibility = if (items.isEmpty()) View.GONE else View.VISIBLE
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
                    val now = System.currentTimeMillis()
                    val upcoming = all
                        .filter { isUpcoming(it.startDate, it.endDate, now) }
                        .sortedBy { it.startDate }
                    listAdapter.submitList(upcoming)
                    binding.emptyText.visibility = if (upcoming.isEmpty()) View.VISIBLE else View.GONE
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

    /** Laedt aggregierte Kalender-Items (events + Beitraege + Briefe) fuer den Kalender-Tab. */
    private fun loadCalendarItems() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.listCalendarItems()
                if (response.isSuccessful) {
                    calendarItems = response.body().orEmpty()
                    itemsByDay = bucketItemsByDay(calendarItems)
                    calendarLoaded = true
                    binding.calendarView.notifyCalendarChanged()
                    selectDay(selectedDay ?: LocalDate.now())
                }
            } catch (_: CancellationException) {
                throw kotlin.coroutines.cancellation.CancellationException()
            } catch (_: Exception) { /* Snackbar wuerde stoeren — Tab bleibt leer, Pull-to-refresh-aequivalent */ }
        }
    }

    private fun bucketItemsByDay(items: List<CalendarItem>): Map<LocalDate, List<CalendarItem>> {
        val map = mutableMapOf<LocalDate, MutableList<CalendarItem>>()
        for (it in items) {
            val day = parseDate(it.date) ?: continue
            map.getOrPut(day) { mutableListOf() }.add(it)
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
