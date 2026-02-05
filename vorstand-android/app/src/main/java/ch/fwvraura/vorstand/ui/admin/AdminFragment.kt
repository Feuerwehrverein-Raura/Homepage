package ch.fwvraura.vorstand.ui.admin

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.databinding.FragmentAdminBinding
import kotlinx.coroutines.launch

/**
 * AdminFragment - Verwaltungs-Dashboard fuer den Vorstand.
 *
 * Dieses Fragment zeigt ein Dashboard mit Navigations-Kacheln an:
 * - "Antraege"-Kachel: Navigiert zur Mitgliedschaftsantraege-Verwaltung.
 *   Zeigt einen Zaehler mit der Anzahl offener Antraege an.
 * - "Audit-Log"-Kachel: Navigiert zur Audit-Log-Uebersicht.
 *
 * Beim Oeffnen wird die Anzahl ausstehender Antraege vom Server geladen.
 */
class AdminFragment : Fragment() {

    /** Nullable Referenz auf das ViewBinding - wird in onDestroyView auf null gesetzt */
    private var _binding: FragmentAdminBinding? = null

    /** Nicht-nullable Zugriff auf das Binding (nur zwischen onCreateView und onDestroyView gueltig) */
    private val binding get() = _binding!!

    /**
     * Erstellt die View-Hierarchie des Fragments.
     * Inflated das Fragment-Layout ueber ViewBinding und gibt die Root-View zurueck.
     */
    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentAdminBinding.inflate(inflater, container, false)
        return binding.root
    }

    /**
     * Wird aufgerufen, nachdem die View erstellt wurde.
     * Richtet die Klick-Listener fuer die Dashboard-Kacheln ein und laedt
     * die Anzahl der ausstehenden Mitgliedschaftsantraege.
     */
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // Kachel "Antraege": Navigation zum RegistrationsFragment
        binding.cardRegistrations.setOnClickListener {
            findNavController().navigate(R.id.action_admin_to_registrations)
        }

        // Kachel "Audit-Log": Navigation zum AuditFragment
        binding.cardAudit.setOnClickListener {
            findNavController().navigate(R.id.action_admin_to_audit)
        }

        // Anzahl offener Antraege laden und auf der Kachel anzeigen
        loadPendingCount()
    }

    /**
     * Laedt die Anzahl der ausstehenden Mitgliedschaftsantraege vom Server.
     *
     * Fuehrt einen asynchronen API-Aufruf ueber ApiModule.registrationsApi.getPendingCount() durch.
     * Bei Erfolg: Zeigt die Anzahl als Text an (z.B. "3 offene Antraege")
     *             oder "Keine offenen Antraege" wenn der Zaehler 0 ist.
     * Bei Fehler (Exception): Setzt den Zaehler-Text auf leer (stille Fehlerbehandlung,
     *                         da der Zaehler nur eine optionale Zusatzinformation ist).
     */
    private fun loadPendingCount() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.registrationsApi.getPendingCount()
                if (response.isSuccessful) {
                    val count = response.body()?.count ?: 0
                    // Text je nach Anzahl anpassen: "X offene Antraege" oder "Keine offenen Antraege"
                    binding.registrationCount.text = if (count > 0) "$count offene Anträge" else "Keine offenen Anträge"
                }
            } catch (_: Exception) {
                // Stille Fehlerbehandlung: Zaehler-Text leeren, da nicht kritisch
                binding.registrationCount.text = ""
            }
        }
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
