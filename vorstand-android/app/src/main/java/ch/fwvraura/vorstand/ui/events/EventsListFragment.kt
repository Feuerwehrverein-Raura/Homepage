package ch.fwvraura.vorstand.ui.events

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
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

/**
 * EventsListFragment – Uebersicht aller Events.
 *
 * Zeigt eine RecyclerView mit allen Events an. Ein FAB (Floating Action Button)
 * ermoeglicht das Erstellen eines neuen Events. Unterstuetzt Pull-to-Refresh
 * und zeigt Lade-, Leer- und Fehlerzustaende an.
 *
 * Oberhalb der Events-Liste erscheint – nur falls vorhanden – eine
 * "Vorschläge"-Sektion mit den von Mitgliedern eingereichten Event-Vorschlaegen.
 * Pro Vorschlag kann der Vorstand genehmigen, bearbeiten oder ablehnen.
 *
 * - Klick auf ein Event navigiert zu den Anmeldungen (EventRegistrationsFragment).
 * - Long-Press auf ein Event navigiert zum Bearbeitungsformular (EventFormFragment).
 */
class EventsListFragment : Fragment() {

    /** View-Binding-Referenz, wird in onDestroyView auf null gesetzt um Memory Leaks zu vermeiden */
    private var _binding: FragmentEventsListBinding? = null

    /** Sicherer Zugriff auf das Binding – wirft eine Exception wenn das Binding null ist */
    private val binding get() = _binding!!

    /** ViewModel das die Events-Liste, Ladezustand und Fehler verwaltet */
    private val viewModel: EventsViewModel by viewModels()

    /** RecyclerView-Adapter fuer die Events-Liste */
    private lateinit var adapter: EventsAdapter

    /** RecyclerView-Adapter fuer die Event-Vorschlaege (Sektion oben) */
    private lateinit var proposalsAdapter: ProposalsAdapter

    /** Flag um zwischen erstem Laden (Ladeindikator) und Refresh (SwipeRefresh) zu unterscheiden */
    private var isFirstLoad = true

    /**
     * Erstellt die View-Hierarchie des Fragments durch Inflaten des Layouts.
     */
    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentEventsListBinding.inflate(inflater, container, false)
        return binding.root
    }

    /**
     * Wird aufgerufen nachdem die View erstellt wurde.
     * Initialisiert den Adapter, setzt Listener und beobachtet die ViewModel-Flows.
     */
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // Adapter erstellen mit zwei Callbacks:
        // onClick: Navigiert zur Anmeldungsuebersicht des Events
        // onEdit: Navigiert zum Bearbeitungsformular (wird bei Long-Press ausgeloest)
        adapter = EventsAdapter(
            onClick = { event ->
                val bundle = Bundle().apply { putString("eventId", event.id) }
                findNavController().navigate(R.id.action_events_to_registrations, bundle)
            },
            onEdit = { event ->
                val bundle = Bundle().apply { putString("eventId", event.id) }
                findNavController().navigate(R.id.action_events_to_form, bundle)
            }
        )

        // RecyclerView mit LinearLayoutManager und dem Adapter konfigurieren
        binding.eventsRecycler.layoutManager = LinearLayoutManager(requireContext())
        binding.eventsRecycler.adapter = adapter

        // Vorschlags-Adapter mit drei Aktions-Callbacks erstellen:
        // onApprove: Status auf "planned" setzen (genehmigen)
        // onEdit:    Bearbeitungsformular oeffnen (gleiche Navigation wie bei Events;
        //            der Organisator-Picker ist mit dem Vorschlagenden vorbelegt)
        // onReject:  Nach Rueckfrage den Vorschlag loeschen (ablehnen)
        proposalsAdapter = ProposalsAdapter(
            onApprove = { event ->
                viewModel.approveProposal(event.id) { success ->
                    val msg = if (success) "Vorschlag genehmigt" else "Fehler beim Genehmigen"
                    Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show()
                }
            },
            onEdit = { event ->
                val bundle = Bundle().apply { putString("eventId", event.id) }
                findNavController().navigate(R.id.action_events_to_form, bundle)
            },
            onReject = { event -> confirmReject(event.id) }
        )

        // Vorschlags-RecyclerView konfigurieren (verschachtelt in der Sektion oben)
        binding.proposalsRecycler.layoutManager = LinearLayoutManager(requireContext())
        binding.proposalsRecycler.adapter = proposalsAdapter

        // Pull-to-Refresh: Laedt Events UND Vorschlaege neu wenn nach unten gewischt wird
        binding.swipeRefresh.setOnRefreshListener {
            viewModel.loadEvents()
            viewModel.loadProposals()
        }

        // Retry-Button: Wird im Fehlerzustand angezeigt und laedt die Events erneut
        binding.retryButton.setOnClickListener { viewModel.loadEvents() }

        // FAB (Floating Action Button): Navigiert zum Formular fuer ein neues Event
        binding.fabAddEvent.setOnClickListener {
            findNavController().navigate(R.id.action_events_to_form)
        }

        // StateFlow-Collectors: Beobachten die drei Zustands-Flows des ViewModels
        // (Events-Liste, Ladezustand, Fehlerzustand) und aktualisieren die UI entsprechend
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {

                // Collector 1: Events-Liste beobachten
                // Aktualisiert den Adapter und steuert die Sichtbarkeit von
                // RecyclerView, Leerzustand und Fehlerzustand
                launch {
                    viewModel.events.collect { events ->
                        adapter.submitList(events)
                        val hasError = viewModel.error.value != null
                        if (!hasError && !viewModel.isLoading.value) {
                            binding.eventsRecycler.visibility = if (events.isEmpty()) View.GONE else View.VISIBLE
                            binding.emptyState.visibility = if (events.isEmpty()) View.VISIBLE else View.GONE
                            binding.errorState.visibility = View.GONE
                        }
                    }
                }

                // Collector 2: Ladezustand beobachten
                // Beim ersten Laden wird ein zentraler Ladeindikator angezeigt,
                // bei nachfolgenden Ladevorgaengen wird SwipeRefresh verwendet
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

                // Collector 3: Fehlerzustand beobachten
                // Zeigt die Fehlermeldung nur an wenn keine Events im Cache sind
                // (bei vorhandenen Daten bleibt die Liste sichtbar trotz Fehler)
                launch {
                    viewModel.error.collect { error ->
                        if (error != null && viewModel.events.value.isEmpty()) {
                            binding.errorText.text = error
                            binding.errorState.visibility = View.VISIBLE
                            binding.emptyState.visibility = View.GONE
                            binding.eventsRecycler.visibility = View.GONE
                        } else {
                            binding.errorState.visibility = View.GONE
                        }
                    }
                }

                // Collector 4: Event-Vorschlaege beobachten
                // Aktualisiert den Vorschlags-Adapter und blendet die gesamte
                // Vorschlags-Sektion aus, wenn keine Vorschlaege vorhanden sind.
                launch {
                    viewModel.proposals.collect { proposals ->
                        proposalsAdapter.submitList(proposals)
                        binding.proposalsSection.visibility =
                            if (proposals.isEmpty()) View.GONE else View.VISIBLE
                        // Header mit Anzahl der offenen Vorschlaege
                        binding.proposalsHeader.text = "Vorschläge (${proposals.size})"
                    }
                }
            }
        }

        // Initiales Laden der Events und Vorschlaege beim Erstellen der View
        viewModel.loadEvents()
        viewModel.loadProposals()
    }

    /**
     * Zeigt eine Rueckfrage vor dem Ablehnen (Loeschen) eines Vorschlags.
     * Bei Bestaetigung wird der Vorschlag geloescht und ein Toast angezeigt.
     *
     * @param eventId Die ID des abzulehnenden Vorschlags
     */
    private fun confirmReject(eventId: String) {
        AlertDialog.Builder(requireContext())
            .setTitle("Vorschlag ablehnen")
            .setMessage("Diesen Event-Vorschlag wirklich ablehnen und löschen?")
            .setPositiveButton("Ablehnen") { _, _ ->
                viewModel.rejectProposal(eventId) { success ->
                    val msg = if (success) "Vorschlag abgelehnt" else "Fehler beim Ablehnen"
                    Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    /**
     * Raeumt das Binding auf wenn die View zerstoert wird,
     * um Memory Leaks zu verhindern.
     */
    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
