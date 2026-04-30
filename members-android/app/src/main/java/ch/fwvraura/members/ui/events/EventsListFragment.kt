package ch.fwvraura.members.ui.events

import android.content.Intent
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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

class EventsListFragment : Fragment() {

    private var _binding: FragmentEventsBinding? = null
    private val binding get() = _binding!!

    private lateinit var adapter: EventsAdapter

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentEventsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        adapter = EventsAdapter { event -> openEventDetail(event) }
        binding.eventsRecycler.layoutManager = LinearLayoutManager(requireContext())
        binding.eventsRecycler.adapter = adapter
        binding.swipeRefresh.setOnRefreshListener { loadEvents() }
        binding.fabSubscribe.setOnClickListener { showSubscribeDialog() }
        loadEvents()
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
            .setTitle("Kalender abonnieren")
            .setMessage("Alle FWV-Anlässe als Abo in deine Kalender-App. Aktualisiert sich automatisch wenn neue Events angelegt werden.")
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
                    val all = response.body().orEmpty()
                    val now = System.currentTimeMillis()
                    val upcoming = all
                        .filter { it.status != "cancelled" }
                        .filter { isUpcoming(it.startDate, it.endDate, now) }
                        .sortedBy { it.startDate }
                    adapter.submitList(upcoming)
                    binding.emptyText.visibility = if (upcoming.isEmpty()) View.VISIBLE else View.GONE
                } else {
                    showError(getString(R.string.events_error, "HTTP ${response.code()}"))
                }
            } catch (_: CancellationException) {
                // Fragment wurde beendet bevor der Request fertig war — kein Fehler.
                throw kotlin.coroutines.cancellation.CancellationException()
            } catch (e: Exception) {
                showError(getString(R.string.events_error, e.message ?: ""))
            } finally {
                binding.progress.visibility = View.GONE
                binding.swipeRefresh.isRefreshing = false
            }
        }
    }

    private fun isUpcoming(start: String?, end: String?, nowMs: Long): Boolean {
        // Konservativ: anhand des Datums-String ohne Zeitzone vergleichen
        val ref = end ?: start ?: return true
        val isoDate = ref.substring(0, minOf(10, ref.length)) // "yyyy-MM-dd"
        return try {
            val parsed = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).parse(isoDate)
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
}
