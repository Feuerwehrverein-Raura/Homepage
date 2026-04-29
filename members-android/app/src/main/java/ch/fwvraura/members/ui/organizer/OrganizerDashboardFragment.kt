package ch.fwvraura.members.ui.organizer

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import ch.fwvraura.members.R

class OrganizerDashboardFragment : Fragment() {
    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        val view = inflater.inflate(R.layout.fragment_simple_text, container, false)
        view.findViewById<TextView>(R.id.messageText).text = getString(R.string.organizer_placeholder)
        return view
    }
}
