package ch.fwvraura.vorstand.ui.dispatch

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import ch.fwvraura.vorstand.databinding.FragmentDispatchBinding

/**
 * DispatchFragment - Platzhalter-Fragment fuer den Nachrichten-Versand.
 *
 * Dieses Fragment ist ein Platzhalter fuer ein kuenftiges Phase-2-Feature,
 * das den Versand von Nachrichten (Dispatch) an Mitglieder ermoeglichen soll.
 * Aktuell zeigt es lediglich das zugehoerige Layout an, ohne weitere Logik.
 * Die eigentliche Funktionalitaet wird in einer spaeteren Version implementiert.
 */
class DispatchFragment : Fragment() {

    /** Nullable Referenz auf das ViewBinding - wird in onDestroyView auf null gesetzt */
    private var _binding: FragmentDispatchBinding? = null

    /** Nicht-nullable Zugriff auf das Binding (nur zwischen onCreateView und onDestroyView gueltig) */
    private val binding get() = _binding!!

    /**
     * Erstellt die View-Hierarchie des Fragments.
     * Inflated das Fragment-Layout ueber ViewBinding und gibt die Root-View zurueck.
     * Da dies ein Platzhalter ist, wird nur das Layout angezeigt (z.B. ein "Coming Soon"-Hinweis).
     */
    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentDispatchBinding.inflate(inflater, container, false)
        return binding.root
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
