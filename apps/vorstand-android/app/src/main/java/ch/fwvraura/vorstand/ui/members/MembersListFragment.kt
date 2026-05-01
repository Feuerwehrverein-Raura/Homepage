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

/**
 * MembersListFragment — Mitglieder-Uebersicht
 *
 * Dieses Fragment zeigt die gesamte Mitglieder-Liste in einer RecyclerView an.
 * Oben befindet sich ein Suchfeld, darunter Filter-Chips (Alle / Aktiv / Passiv / Ehren),
 * und unten rechts ein FAB (Floating Action Button) zum Erstellen eines neuen Mitglieds.
 *
 * Fragment-Lifecycle in diesem Fragment:
 *   1. onCreateView  -> Layout wird "aufgeblasen" (inflated), _binding wird erzeugt
 *   2. onViewCreated -> View ist bereit: RecyclerView, Suchfeld, Filter etc. werden eingerichtet,
 *                       Daten werden geladen und beobachtet
 *   3. onDestroyView -> View wird zerstoert, _binding wird auf null gesetzt um Memory-Leaks zu vermeiden
 */
class MembersListFragment : Fragment() {

    /**
     * _binding: Nullable Referenz auf das View-Binding-Objekt.
     *
     * Null-Safety-Pattern fuer View Binding in Fragments:
     * - _binding ist nullable (FragmentMembersListBinding?) und wird in onDestroyView auf null gesetzt.
     *   Das ist noetig, weil die View eines Fragments zerstoert werden kann, waehrend das Fragment
     *   selbst noch existiert (z.B. bei BackStack-Navigation). Wuerde man die Referenz behalten,
     *   gaebe es einen Memory Leak, weil das Binding-Objekt die gesamte View-Hierarchie referenziert.
     *
     * - binding (ohne Unterstrich) ist ein Non-Null-Getter mit "!!" (forcierter Zugriff).
     *   Er darf NUR zwischen onCreateView und onDestroyView aufgerufen werden.
     *   Ausserhalb dieses Fensters wuerde eine NullPointerException geworfen werden.
     *
     * Zusammenfassung: _binding = nullable Backing-Field, binding = bequemer Non-Null-Zugriff.
     */
    private var _binding: FragmentMembersListBinding? = null
    private val binding get() = _binding!!

    /**
     * viewModel: Instanz des MembersViewModel.
     *
     * "by viewModels()" ist ein Kotlin-Property-Delegate, der das ViewModel automatisch
     * an den Lifecycle des Fragments bindet. Das ViewModel ueberlebt Konfigurationsaenderungen
     * wie z.B. eine Bildschirmdrehung (Screen-Rotation), d.h. die Daten gehen nicht verloren.
     */
    private val viewModel: MembersViewModel by viewModels()

    /** RecyclerView-Adapter fuer die Mitglieder-Liste. Wird in setupRecyclerView() initialisiert. */
    private lateinit var adapter: MembersAdapter

    /**
     * Flag, ob dies der erste Ladevorgang ist.
     * Beim ersten Laden wird ein zentraler Ladeindikator angezeigt;
     * bei nachfolgenden Ladevorgaengen wird nur der SwipeRefresh-Indikator benutzt.
     */
    private var isFirstLoad = true

    /**
     * onCreateView — Erster Schritt im Fragment-Lifecycle (fuer die View).
     *
     * Hier wird das XML-Layout "fragment_members_list" per View Binding in eine View umgewandelt
     * (inflated). Das Binding-Objekt wird in _binding gespeichert und die Wurzel-View zurueckgegeben.
     */
    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentMembersListBinding.inflate(inflater, container, false)
        return binding.root
    }

    /**
     * onViewCreated — Zweiter Schritt im Fragment-Lifecycle (fuer die View).
     *
     * Die View ist jetzt vollstaendig erzeugt. Hier werden alle UI-Komponenten eingerichtet:
     * RecyclerView, Suchfeld, Filter-Chips, FAB und Retry-Button. Ausserdem wird die
     * Daten-Beobachtung (observeData) gestartet und der erste Ladevorgang ausgeloest.
     */
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

    /**
     * setupRecyclerView — Initialisiert die RecyclerView fuer die Mitglieder-Liste.
     *
     * - Erstellt einen MembersAdapter mit einem Click-Listener. Beim Klick auf ein Mitglied
     *   wird zur Detail-Ansicht navigiert, wobei die Mitglieder-ID als Bundle uebergeben wird.
     * - Setzt einen LinearLayoutManager (vertikale Liste) als Layout-Manager.
     * - Registriert den SwipeRefreshLayout-Listener: Bei Pull-to-Refresh werden
     *   Mitglieder und Statistik neu geladen.
     */
    private fun setupRecyclerView() {
        adapter = MembersAdapter { member ->
            val bundle = Bundle().apply { putString("memberId", member.id) }
            findNavController().navigate(R.id.action_members_to_detail, bundle)
        }
        binding.membersRecycler.layoutManager = LinearLayoutManager(requireContext())
        binding.membersRecycler.adapter = adapter

        binding.swipeRefresh.setOnRefreshListener {
            viewModel.loadMembers()
            viewModel.loadStats()
        }
    }

    /**
     * setupSearch — Richtet das Suchfeld ein.
     *
     * Fuegt einen TextWatcher hinzu, der bei jeder Textaenderung (afterTextChanged)
     * die Mitglieder-Liste mit dem eingegebenen Suchbegriff neu laedt.
     * beforeTextChanged und onTextChanged werden nicht benoetigt, muessen aber wegen
     * des TextWatcher-Interfaces implementiert werden (leere Implementierung).
     */
    private fun setupSearch() {
        binding.searchInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                viewModel.loadMembers(search = s?.toString())
            }
        })
    }

    /**
     * setupFilters — Richtet die Filter-Chips (Alle / Aktiv / Passiv / Ehren) ein.
     *
     * Reagiert auf Aenderungen der Chip-Auswahl. Je nachdem welcher Chip ausgewaehlt ist,
     * wird der entsprechende Filter-String ("Aktiv", "Passiv", "Ehren") gesetzt.
     * Wenn kein spezifischer Chip gewaehlt ist (z.B. "Alle"), wird null uebergeben,
     * wodurch kein Filter angewendet wird und alle Mitglieder angezeigt werden.
     */
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

    /**
     * setupFab — Richtet den Floating Action Button (FAB) ein.
     *
     * Beim Klick auf den FAB wird zur Mitglieder-Formular-Ansicht navigiert,
     * um ein neues Mitglied zu erstellen (ohne memberId = Neu-Erstellung).
     */
    private fun setupFab() {
        binding.fabAddMember.setOnClickListener {
            findNavController().navigate(R.id.action_members_to_form)
        }
    }

    /**
     * setupRetry — Richtet den Retry-Button (Wiederholen-Button) ein.
     *
     * Wird angezeigt wenn ein Fehler aufgetreten ist (z.B. Netzwerkfehler).
     * Beim Klick werden Mitglieder und Statistik erneut geladen.
     */
    private fun setupRetry() {
        binding.retryButton.setOnClickListener {
            viewModel.loadMembers()
            viewModel.loadStats()
        }
    }

    /**
     * observeData — Beobachtet die reaktiven Datenströme (StateFlows) des ViewModels.
     *
     * Verwendet das "repeatOnLifecycle"-Pattern:
     * - viewLifecycleOwner.lifecycleScope.launch { ... }
     *   Startet eine Coroutine, die an den Lifecycle der View gebunden ist.
     *   Wenn die View zerstoert wird, wird die Coroutine automatisch abgebrochen.
     *
     * - repeatOnLifecycle(Lifecycle.State.STARTED)
     *   Sammelt (collected) die StateFlows NUR wenn das Fragment mindestens im STARTED-Zustand ist
     *   (d.h. sichtbar fuer den Benutzer). Wenn das Fragment in den Hintergrund geht (STOPPED),
     *   wird das Sammeln pausiert. Wenn es wieder sichtbar wird, wird es fortgesetzt.
     *   Das verhindert UI-Updates wenn das Fragment nicht sichtbar ist.
     *
     * Innerhalb von repeatOnLifecycle werden drei separate Coroutinen gestartet (launch),
     * die jeweils einen eigenen StateFlow beobachten:
     *
     * 1. members: Aktualisiert die RecyclerView-Liste und die Sichtbarkeit der Leer-Anzeige.
     * 2. isLoading: Steuert den Lade-Indikator (beim ersten Laden: zentraler Indikator,
     *    danach: SwipeRefresh-Indikator).
     * 3. error: Zeigt Fehlermeldungen an, wenn ein Fehler vorliegt und die Liste leer ist.
     *    Verbirgt die Fehlermeldung, wenn kein Fehler vorliegt.
     */
    private fun observeData() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                // Coroutine 1: Beobachtet die Mitglieder-Liste
                launch {
                    viewModel.members.collect { members ->
                        adapter.submitList(members)
                        updateVisibility(members.isEmpty())
                    }
                }
                // Coroutine 2: Beobachtet den Lade-Zustand
                launch {
                    viewModel.isLoading.collect { loading ->
                        // SwipeRefresh-Indikator nur anzeigen wenn es NICHT der erste Ladevorgang ist
                        binding.swipeRefresh.isRefreshing = loading && !isFirstLoad
                        if (loading && isFirstLoad) {
                            // Erster Ladevorgang: Zentralen Ladeindikator anzeigen,
                            // Leer- und Fehlermeldung verstecken
                            binding.loadingIndicator.visibility = View.VISIBLE
                            binding.emptyState.visibility = View.GONE
                            binding.errorState.visibility = View.GONE
                        } else if (!loading) {
                            // Laden abgeschlossen: Ladeindikator verstecken, Flag zuruecksetzen
                            binding.loadingIndicator.visibility = View.GONE
                            isFirstLoad = false
                        }
                    }
                }
                // Coroutine 3: Beobachtet Fehlermeldungen
                launch {
                    viewModel.error.collect { error ->
                        if (error != null && viewModel.members.value.isEmpty()) {
                            // Fehler vorhanden und Liste leer: Fehlermeldung anzeigen,
                            // RecyclerView und Leer-Zustand verstecken
                            binding.errorText.text = error
                            binding.errorState.visibility = View.VISIBLE
                            binding.emptyState.visibility = View.GONE
                            binding.membersRecycler.visibility = View.GONE
                        } else {
                            // Kein Fehler oder Liste hat Daten: Fehlermeldung verstecken
                            binding.errorState.visibility = View.GONE
                        }
                    }
                }
            }
        }
    }

    /**
     * updateVisibility — Aktualisiert die Sichtbarkeit von RecyclerView und Leer-Zustand.
     *
     * Wird aufgerufen wenn sich die Mitglieder-Liste aendert.
     * Zeigt die RecyclerView wenn Mitglieder vorhanden sind, oder den Leer-Zustand
     * (Empty State) wenn die Liste leer ist. Aenderungen werden nur vorgenommen,
     * wenn kein Fehler vorliegt und kein Ladevorgang laeuft.
     *
     * @param isEmpty true wenn die Mitglieder-Liste leer ist
     */
    private fun updateVisibility(isEmpty: Boolean) {
        val hasError = viewModel.error.value != null
        if (!hasError && !viewModel.isLoading.value) {
            binding.membersRecycler.visibility = if (isEmpty) View.GONE else View.VISIBLE
            binding.emptyState.visibility = if (isEmpty) View.VISIBLE else View.GONE
            binding.errorState.visibility = View.GONE
        }
    }

    /**
     * onDestroyView — Dritter und letzter Schritt im Fragment-View-Lifecycle.
     *
     * Die View wird zerstoert (z.B. bei Navigation zu einem anderen Fragment).
     * _binding wird auf null gesetzt, damit das Binding-Objekt (und die gesamte View-Hierarchie)
     * vom Garbage Collector freigegeben werden kann. Ohne diesen Schritt wuerde ein Memory Leak
     * entstehen, da das Fragment (das laenger lebt als seine View) eine Referenz auf die
     * zerstoerte View behalten wuerde.
     */
    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
