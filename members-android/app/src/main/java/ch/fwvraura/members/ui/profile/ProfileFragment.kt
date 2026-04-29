package ch.fwvraura.members.ui.profile

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import ch.fwvraura.members.MembersApp
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.MemberProfile
import ch.fwvraura.members.databinding.FragmentProfileBinding
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.launch

class ProfileFragment : Fragment() {

    private var _binding: FragmentProfileBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentProfileBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.swipeRefresh.setOnRefreshListener { loadProfile() }

        // Sofort die in TokenManager gespeicherten Daten anzeigen
        val tm = MembersApp.instance.tokenManager
        binding.profileName.text = tm.userName ?: tm.userEmail ?: "FWV-Mitglied"
        binding.profileEmail.text = tm.userEmail.orEmpty()

        loadProfile()
    }

    private fun loadProfile() {
        binding.profileProgress.visibility = View.VISIBLE
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.membersApi.getMe()
                if (response.isSuccessful) {
                    response.body()?.let { bind(it) }
                } else if (response.code() != 404) {
                    Snackbar.make(binding.root, "Fehler ${response.code()}", Snackbar.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Snackbar.make(binding.root, "Netzwerkfehler: ${e.message}", Snackbar.LENGTH_LONG).show()
            } finally {
                binding.profileProgress.visibility = View.GONE
                binding.swipeRefresh.isRefreshing = false
            }
        }
    }

    private fun bind(p: MemberProfile) {
        binding.profileName.text = listOfNotNull(p.vorname, p.nachname).joinToString(" ")
            .ifBlank { p.email ?: "FWV-Mitglied" }
        binding.profileFunktion.text = p.funktion.orEmpty()
        binding.profileFunktion.visibility = if (p.funktion.isNullOrBlank()) View.GONE else View.VISIBLE
        binding.profileEmail.text = p.email.orEmpty()

        bindRow(binding.rowMobile, binding.profileMobile, p.mobile)
        bindRow(binding.rowTelefon, binding.profileTelefon, p.telefon)
        val adresse = listOfNotNull(p.strasse, listOfNotNull(p.plz, p.ort).joinToString(" ").ifBlank { null })
            .joinToString("\n")
        bindRow(binding.rowAdresse, binding.profileAdresse, adresse.ifBlank { null })
        bindRow(binding.rowStatus, binding.profileStatus, p.status)
    }

    private fun bindRow(row: View, text: android.widget.TextView, value: String?) {
        if (value.isNullOrBlank()) {
            row.visibility = View.GONE
        } else {
            row.visibility = View.VISIBLE
            text.text = value
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
