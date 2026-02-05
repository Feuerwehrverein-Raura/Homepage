package ch.fwvraura.vorstand.ui.audit

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.databinding.FragmentAuditBinding
import kotlinx.coroutines.launch

/**
 * AuditFragment - Uebersicht des Audit-Logs.
 *
 * Dieses Fragment zeigt eine scrollbare Liste (RecyclerView) aller Audit-Log-Eintraege an.
 * Es unterstuetzt Pull-to-Refresh (SwipeRefreshLayout), einen Fehlerzustand mit Retry-Button
 * und einen Leerzustand, wenn keine Eintraege vorhanden sind.
 * Maximal 100 Eintraege werden vom Server geladen.
 */
class AuditFragment : Fragment() {

    /** Nullable Referenz auf das ViewBinding - wird in onDestroyView auf null gesetzt */
    private var _binding: FragmentAuditBinding? = null

    /** Nicht-nullable Zugriff auf das Binding (nur zwischen onCreateView und onDestroyView gueltig) */
    private val binding get() = _binding!!

    /** Adapter fuer die RecyclerView, der die Audit-Eintraege darstellt */
    private lateinit var adapter: AuditAdapter

    /**
     * Erstellt die View-Hierarchie des Fragments.
     * Inflated das Fragment-Layout ueber ViewBinding und gibt die Root-View zurueck.
     */
    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentAuditBinding.inflate(inflater, container, false)
        return binding.root
    }

    /**
     * Wird aufgerufen, nachdem die View erstellt wurde.
     * Initialisiert die Toolbar-Navigation, die RecyclerView mit Adapter und LayoutManager,
     * den SwipeRefresh-Listener sowie den Retry-Button.
     * Laedt anschliessend die Audit-Log-Daten vom Server.
     */
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // Zurueck-Button in der Toolbar: navigiert eine Ebene zurueck
        binding.toolbar.setNavigationOnClickListener { findNavController().navigateUp() }

        // RecyclerView mit AuditAdapter und vertikalem LinearLayoutManager einrichten
        adapter = AuditAdapter()
        binding.auditRecycler.layoutManager = LinearLayoutManager(requireContext())
        binding.auditRecycler.adapter = adapter

        // Pull-to-Refresh: laedt Audit-Log bei Wischgeste nach unten neu
        binding.swipeRefresh.setOnRefreshListener { loadAuditLog() }

        // Retry-Button im Fehlerzustand: versucht das Laden erneut
        binding.retryButton.setOnClickListener { loadAuditLog() }

        // Initiales Laden der Audit-Log-Daten beim Oeffnen des Fragments
        loadAuditLog()
    }

    /**
     * Laedt die Audit-Log-Eintraege vom Server (maximal 100 Stueck).
     *
     * Ablauf:
     * 1. Zeigt den Lade-Indikator (SwipeRefresh) an und blendet den Fehlerzustand aus.
     * 2. Fuehrt einen API-Aufruf ueber ApiModule.auditApi.getAuditLog() durch.
     * 3. Bei Erfolg: Uebergibt die Liste an den Adapter und steuert die Sichtbarkeit
     *    von RecyclerView (Liste) bzw. EmptyState (leere Liste).
     * 4. Bei HTTP-Fehler: Zeigt eine Fehlermeldung mit dem HTTP-Statuscode an.
     * 5. Bei Netzwerkfehler (Exception): Zeigt eine Fehlermeldung mit der Exception-Nachricht an.
     * 6. Beendet abschliessend den Lade-Indikator.
     */
    private fun loadAuditLog() {
        viewLifecycleOwner.lifecycleScope.launch {
            binding.swipeRefresh.isRefreshing = true
            binding.errorState.visibility = View.GONE
            try {
                val response = ApiModule.auditApi.getAuditLog(limit = 100)
                if (response.isSuccessful) {
                    val list = response.body() ?: emptyList()
                    adapter.submitList(list)
                    // RecyclerView anzeigen wenn Eintraege vorhanden, sonst Leerzustand
                    binding.auditRecycler.visibility = if (list.isEmpty()) View.GONE else View.VISIBLE
                    binding.emptyState.visibility = if (list.isEmpty()) View.VISIBLE else View.GONE
                } else {
                    showError("Fehler beim Laden (${response.code()})")
                }
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            }
            binding.swipeRefresh.isRefreshing = false
        }
    }

    /**
     * Zeigt den Fehlerzustand an und blendet die RecyclerView sowie den Leerzustand aus.
     *
     * @param message Die anzuzeigende Fehlermeldung (z.B. HTTP-Fehlercode oder Netzwerkfehler).
     */
    private fun showError(message: String) {
        binding.errorText.text = message
        binding.errorState.visibility = View.VISIBLE
        binding.auditRecycler.visibility = View.GONE
        binding.emptyState.visibility = View.GONE
    }

    /**
     * Raeumt die Binding-Referenz auf, wenn die View zerstoert wird.
     * Verhindert Memory-Leaks, da das Fragment laenger leben kann als seine View.
     */
    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
