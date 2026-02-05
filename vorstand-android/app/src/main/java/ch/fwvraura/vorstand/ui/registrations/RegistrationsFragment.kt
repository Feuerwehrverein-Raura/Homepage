package ch.fwvraura.vorstand.ui.registrations

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.ApproveRequest
import ch.fwvraura.vorstand.data.model.MemberRegistration
import ch.fwvraura.vorstand.data.model.RejectRequest
import ch.fwvraura.vorstand.databinding.FragmentRegistrationsBinding
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.launch

/**
 * RegistrationsFragment - Verwaltung von Mitgliedschaftsantraegen.
 *
 * Dieses Fragment zeigt eine Liste aller ausstehenden (status="pending") Mitgliedschaftsantraege an.
 * Der Vorstand kann jeden Antrag entweder genehmigen (mit Statuswahl Aktiv/Passiv)
 * oder ablehnen (mit Bestaetigungsdialog).
 * Unterstuetzt Pull-to-Refresh, Fehlerzustand mit Retry-Button und Leerzustand.
 */
class RegistrationsFragment : Fragment() {

    /** Nullable Referenz auf das ViewBinding - wird in onDestroyView auf null gesetzt */
    private var _binding: FragmentRegistrationsBinding? = null

    /** Nicht-nullable Zugriff auf das Binding (nur zwischen onCreateView und onDestroyView gueltig) */
    private val binding get() = _binding!!

    /** Adapter fuer die RecyclerView, der die Antraege mit Approve/Reject-Buttons darstellt */
    private lateinit var adapter: RegistrationsAdapter

    /**
     * Erstellt die View-Hierarchie des Fragments.
     * Inflated das Fragment-Layout ueber ViewBinding und gibt die Root-View zurueck.
     */
    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentRegistrationsBinding.inflate(inflater, container, false)
        return binding.root
    }

    /**
     * Wird aufgerufen, nachdem die View erstellt wurde.
     * Initialisiert die Toolbar-Navigation, den RegistrationsAdapter (mit Callbacks fuer
     * Genehmigung und Ablehnung), die RecyclerView, den SwipeRefresh-Listener
     * sowie den Retry-Button. Laedt anschliessend die ausstehenden Antraege.
     */
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // Zurueck-Button in der Toolbar: navigiert eine Ebene zurueck
        binding.toolbar.setNavigationOnClickListener { findNavController().navigateUp() }

        // Adapter mit Callback-Funktionen fuer Genehmigung und Ablehnung erstellen
        adapter = RegistrationsAdapter(
            onApprove = { reg -> approveRegistration(reg) },
            onReject = { reg -> rejectRegistration(reg) }
        )

        // RecyclerView mit vertikalem LinearLayoutManager und Adapter einrichten
        binding.registrationsRecycler.layoutManager = LinearLayoutManager(requireContext())
        binding.registrationsRecycler.adapter = adapter

        // Pull-to-Refresh: laedt Antraege bei Wischgeste nach unten neu
        binding.swipeRefresh.setOnRefreshListener { loadRegistrations() }

        // Retry-Button im Fehlerzustand: versucht das Laden erneut
        binding.retryButton.setOnClickListener { loadRegistrations() }

        // Initiales Laden der ausstehenden Antraege beim Oeffnen des Fragments
        loadRegistrations()
    }

    /**
     * Laedt alle ausstehenden Mitgliedschaftsantraege (status="pending") vom Server.
     *
     * Ablauf:
     * 1. Zeigt den Lade-Indikator (SwipeRefresh) an und blendet den Fehlerzustand aus.
     * 2. Fuehrt einen API-Aufruf ueber ApiModule.registrationsApi.getRegistrations() durch,
     *    gefiltert auf den Status "pending" (nur ausstehende Antraege).
     * 3. Bei Erfolg: Uebergibt die Liste an den Adapter und steuert die Sichtbarkeit
     *    von RecyclerView (Liste vorhanden) bzw. EmptyState (keine Antraege).
     * 4. Bei HTTP-Fehler: Zeigt eine Fehlermeldung mit dem HTTP-Statuscode an.
     * 5. Bei Netzwerkfehler (Exception): Zeigt eine Fehlermeldung mit der Exception-Nachricht an.
     * 6. Beendet abschliessend den Lade-Indikator.
     */
    private fun loadRegistrations() {
        viewLifecycleOwner.lifecycleScope.launch {
            binding.swipeRefresh.isRefreshing = true
            binding.errorState.visibility = View.GONE
            try {
                val response = ApiModule.registrationsApi.getRegistrations(status = "pending")
                if (response.isSuccessful) {
                    val list = response.body() ?: emptyList()
                    adapter.submitList(list)
                    // RecyclerView anzeigen wenn Antraege vorhanden, sonst Leerzustand
                    binding.registrationsRecycler.visibility = if (list.isEmpty()) View.GONE else View.VISIBLE
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
        binding.registrationsRecycler.visibility = View.GONE
        binding.emptyState.visibility = View.GONE
    }

    /**
     * Genehmigt einen Mitgliedschaftsantrag mit Statuswahl.
     *
     * Zeigt einen MaterialAlertDialog mit dem Namen des Antragstellers und den Optionen
     * "Aktiv" oder "Passiv" als Mitgliedschaftsstatus an.
     * Nach der Auswahl wird ein API-Aufruf (approve) mit dem gewaehlten Status ausgefuehrt.
     * Bei Erfolg: zeigt eine Snackbar-Bestaetigung und laedt die Liste neu.
     * Bei Fehler: zeigt eine Snackbar mit der Fehlermeldung.
     *
     * @param reg Der zu genehmigende Mitgliedschaftsantrag.
     */
    private fun approveRegistration(reg: MemberRegistration) {
        // Moegliche Mitgliedschaftsstatus zur Auswahl
        val statuses = arrayOf("Aktiv", "Passiv")
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("${reg.fullName} genehmigen")
            .setItems(statuses) { _, which ->
                // Asynchroner API-Aufruf zur Genehmigung mit dem gewaehlten Status
                viewLifecycleOwner.lifecycleScope.launch {
                    try {
                        val response = ApiModule.registrationsApi.approve(
                            reg.id, ApproveRequest(statuses[which])
                        )
                        if (response.isSuccessful) {
                            // Erfolg: Bestaetigung anzeigen und Liste aktualisieren
                            Snackbar.make(binding.root, "Antrag genehmigt", Snackbar.LENGTH_SHORT).show()
                            loadRegistrations()
                        }
                    } catch (e: Exception) {
                        // Fehler: Fehlermeldung in Snackbar anzeigen
                        Snackbar.make(binding.root, "Fehler: ${e.message}", Snackbar.LENGTH_SHORT).show()
                    }
                }
            }
            .show()
    }

    /**
     * Lehnt einen Mitgliedschaftsantrag ab, nach Bestaetigung durch den Benutzer.
     *
     * Zeigt einen Bestaetigungsdialog mit dem Namen des Antragstellers.
     * "Ablehnen" fuehrt den API-Aufruf (reject) aus.
     * "Abbrechen" schliesst den Dialog ohne Aktion.
     * Bei Erfolg: zeigt eine Snackbar-Bestaetigung und laedt die Liste neu.
     * Bei Fehler: zeigt eine Snackbar mit der Fehlermeldung.
     *
     * @param reg Der abzulehnende Mitgliedschaftsantrag.
     */
    private fun rejectRegistration(reg: MemberRegistration) {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("${reg.fullName} ablehnen?")
            .setPositiveButton("Ablehnen") { _, _ ->
                // Asynchroner API-Aufruf zur Ablehnung des Antrags
                viewLifecycleOwner.lifecycleScope.launch {
                    try {
                        val response = ApiModule.registrationsApi.reject(reg.id, RejectRequest())
                        if (response.isSuccessful) {
                            // Erfolg: Bestaetigung anzeigen und Liste aktualisieren
                            Snackbar.make(binding.root, "Antrag abgelehnt", Snackbar.LENGTH_SHORT).show()
                            loadRegistrations()
                        }
                    } catch (e: Exception) {
                        // Fehler: Fehlermeldung in Snackbar anzeigen
                        Snackbar.make(binding.root, "Fehler: ${e.message}", Snackbar.LENGTH_SHORT).show()
                    }
                }
            }
            .setNegativeButton("Abbrechen", null)
            .show()
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
