package ch.fwvraura.vorstand.ui.more

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController
import ch.fwvraura.vorstand.MainActivity
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.VorstandApp
import ch.fwvraura.vorstand.databinding.FragmentMoreBinding

/**
 * MoreFragment - "Mehr"-Tab mit App-Informationen und Logout-Funktion.
 *
 * Dieses Fragment zeigt allgemeine App-Informationen an:
 * - Die aktuelle App-Version (aus den PackageInfo des PackageManagers).
 * - Die E-Mail-Adresse des eingeloggten Benutzers (aus dem TokenManager).
 * Zusaetzlich bietet es einen Logout-Button, der die logout()-Methode
 * der MainActivity aufruft, um den Benutzer abzumelden.
 */
class MoreFragment : Fragment() {

    /** Nullable Referenz auf das ViewBinding - wird in onDestroyView auf null gesetzt */
    private var _binding: FragmentMoreBinding? = null

    /** Nicht-nullable Zugriff auf das Binding (nur zwischen onCreateView und onDestroyView gueltig) */
    private val binding get() = _binding!!

    /**
     * Erstellt die View-Hierarchie des Fragments.
     * Inflated das Fragment-Layout ueber ViewBinding und gibt die Root-View zurueck.
     */
    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentMoreBinding.inflate(inflater, container, false)
        return binding.root
    }

    /**
     * Wird aufgerufen, nachdem die View erstellt wurde.
     * Zeigt die App-Version und die E-Mail-Adresse des Benutzers an
     * und richtet den Logout-Button ein.
     */
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // App-Version aus dem PackageManager auslesen und anzeigen
        // Die Version wird aus der AndroidManifest-Konfiguration (versionName) gelesen
        try {
            val packageInfo = requireContext().packageManager.getPackageInfo(requireContext().packageName, 0)
            binding.versionText.text = "Version ${packageInfo.versionName}"
        } catch (_: Exception) { }

        // E-Mail-Adresse des eingeloggten Benutzers aus dem TokenManager holen und anzeigen
        // Der TokenManager wird ueber die globale VorstandApp-Instanz abgerufen
        val tokenManager = VorstandApp.instance.tokenManager
        binding.versionText.append("\n${tokenManager.userEmail ?: ""}")

        // E-Mail-Verwaltung (Mailcow)
        binding.cardEmail.setOnClickListener {
            findNavController().navigate(R.id.action_more_to_mailcow)
        }

        // Logout-Button: ruft die logout()-Methode der MainActivity auf,
        // die den Token loescht und zum Login-Screen zuruecknavigiert
        binding.btnLogout.setOnClickListener {
            (requireActivity() as? MainActivity)?.logout()
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
