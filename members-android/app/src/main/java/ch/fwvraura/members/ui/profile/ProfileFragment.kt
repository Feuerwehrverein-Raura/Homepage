package ch.fwvraura.members.ui.profile

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import ch.fwvraura.members.MembersApp
import ch.fwvraura.members.R

class ProfileFragment : Fragment() {
    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        val view = inflater.inflate(R.layout.fragment_simple_text, container, false)
        val tm = MembersApp.instance.tokenManager
        val name = tm.userName ?: tm.userEmail ?: "FWV-Mitglied"
        view.findViewById<TextView>(R.id.messageText).text =
            "Eingeloggt als $name\n\n" + getString(R.string.profile_placeholder)
        return view
    }
}
